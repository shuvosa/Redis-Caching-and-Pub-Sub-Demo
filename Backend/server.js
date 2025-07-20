// server.js

// Load environment variables from .env file
require('dotenv').config();

// Import necessary modules
const express = require('express'); // Web framework for Node.js
const redis = require('redis'); // Redis client for Node.js
const sqlite3 = require('sqlite3').verbose(); // SQLite database driver
const bodyParser = require('body-parser'); // Middleware to parse request bodies
const cors = require('cors'); // Middleware to enable Cross-Origin Resource Sharing
const http = require('http'); // Node.js built-in HTTP module
const { Server } = require('socket.io'); // Socket.IO for real-time, bidirectional communication

// --- Express App Setup ---
const app = express();
const server = http.createServer(app); // Create an HTTP server from the Express app
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity in this example
        methods: ["GET", "POST"]
    }
}); // Initialize Socket.IO server with CORS enabled

const PORT = process.env.PORT || 5000; // Define the port for the server

// Middleware
app.use(bodyParser.json()); // Use body-parser to parse JSON request bodies
app.use(cors()); // Enable CORS for all routes

// --- Redis Client Setup ---
// Get Redis Cloud URL from environment variables
const REDIS_CLOUD_URL = process.env.REDIS_CLOUD_URL;

// Ensure REDIS_CLOUD_URL is defined
if (!REDIS_CLOUD_URL) {
    console.error("REDIS_CLOUD_URL is not defined in environment variables or .env file.");
    console.error("Please create a .env file in the backend directory with REDIS_CLOUD_URL='your_redis_cloud_url_here'.");
    process.exit(1); // Exit the process if the URL is missing
}

// Create two Redis clients: one for standard operations (get/set) and one for pub/sub.
// A single client cannot be used for both subscribing and standard commands simultaneously.
// Now, pass the Redis Cloud URL to createClient
const redisClient = redis.createClient({ url: REDIS_CLOUD_URL }); // Client for caching operations
const redisSubscriber = redisClient.duplicate(); // Client for subscribing to channels
const redisPublisher = redisClient.duplicate(); // Client for publishing messages

// Handle Redis client connection errors
redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisSubscriber.on('error', (err) => console.error('Redis Subscriber Error:', err));
redisPublisher.on('error', (err) => console.error('Redis Publisher Error:', err));

// Connect Redis clients
async function connectRedis() {
    try {
        await redisClient.connect();
        await redisSubscriber.connect();
        await redisPublisher.connect();
        console.log('Connected to Redis Cloud successfully.');
    } catch (err) {
        console.error('Failed to connect to Redis Cloud:', err);
        process.exit(1); // Exit if Redis connection fails
    }
}
connectRedis();

// --- SQLite Database Setup ---
const db = new sqlite3.Database('./database.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('SQLite Database Error:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create a 'products' table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT
        )`, (err) => {
            if (err) {
                console.error('Error creating products table:', err.message);
            } else {
                console.log('Products table checked/created.');
            }
        });
    }
});

// --- Redis Pub/Sub Listener ---
// Subscribe the redisSubscriber client to a specific channel
redisSubscriber.subscribe('product_updates', (message, channel) => {
    console.log(`Received message on channel ${channel}: ${message}`);
    // When a message is received, emit it to all connected Socket.IO clients
    io.emit('product_updated', message);
});

// For custom publishing from frontend, also subscribe to 'custom_channel'
redisSubscriber.subscribe('custom_channel', (message, channel) => {
    console.log(`Received message on channel ${channel}: ${message}`);
    io.emit('custom_channel', message); // Emit this to the frontend
});


// --- API Endpoints ---

/**
 * @route GET /products
 * @description Fetches all products, prioritizing Redis cache.
 * If data is not in cache, it fetches from SQLite and stores in cache.
 */
app.get('/products', async (req, res) => {
    const cacheKey = 'all_products'; // Key for caching all products

    try {
        // 1. Try to fetch from Redis cache
        const cachedProducts = await redisClient.get(cacheKey);
        if (cachedProducts) {
            console.log('Products fetched from Redis cache.');
            return res.status(200).json(JSON.parse(cachedProducts));
        }

        // 2. If not in cache, fetch from SQLite database
        db.all('SELECT * FROM products', [], async (err, rows) => {
            if (err) {
                console.error('Error fetching products from SQLite:', err.message);
                return res.status(500).json({ error: 'Failed to fetch products from database' });
            }

            // 3. Store the fetched data in Redis cache with an expiry time (e.g., 1 hour = 3600 seconds)
            await redisClient.setEx(cacheKey, 3600, JSON.stringify(rows));
            console.log('Products fetched from SQLite and cached in Redis.');
            res.status(200).json(rows);
        });

    } catch (err) {
        console.error('Error in /products endpoint:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /product
 * @description Adds a new product to the SQLite database, invalidates cache,
 * and publishes an update message via Redis Pub/Sub.
 */
app.post('/product', async (req, res) => {
    const { name, description } = req.body;
    const cacheKey = 'all_products'; // Key for the cache to be invalidated

    if (!name) {
        return res.status(400).json({ error: 'Product name is required' });
    }

    try {
        // 1. Insert new product into SQLite database
        db.run('INSERT INTO products (name, description) VALUES (?, ?)', [name, description], async function(err) {
            if (err) {
                console.error('Error inserting product into SQLite:', err.message);
                return res.status(500).json({ error: 'Failed to add product to database' });
            }

            const newProductId = this.lastID; // Get the ID of the newly inserted product
            console.log(`Product added to SQLite with ID: ${newProductId}`);

            // 2. Invalidate the cache for all products
            await redisClient.del(cacheKey);
            console.log(`Cache "${cacheKey}" invalidated.`);

            // 3. Publish a message to the 'product_updates' channel
            const message = JSON.stringify({
                type: 'NEW_PRODUCT',
                payload: { id: newProductId, name, description }
            });
            await redisPublisher.publish('product_updates', message);
            console.log(`Published update to 'product_updates' channel: ${message}`);

            res.status(201).json({
                message: 'Product added successfully and cache invalidated',
                productId: newProductId
            });
        });
    } catch (err) {
        console.error('Error in /product endpoint:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /publish
 * @description Publishes a custom message to a Redis Pub/Sub channel.
 */
app.post('/publish', async (req, res) => {
    const { channel, message } = req.body;

    if (!channel || !message) {
        return res.status(400).json({ error: 'Channel and message are required' });
    }

    try {
        await redisPublisher.publish(channel, message);
        console.log(`Message "${message}" published to channel "${channel}"`);
        res.status(200).json({ message: 'Message published successfully' });
    } catch (err) {
        console.error('Error publishing message:', err);
        res.status(500).json({ error: 'Failed to publish message' });
    }
});

// --- Socket.IO connection handling ---
io.on('connection', (socket) => {
    console.log('A user connected via Socket.IO');

    socket.on('disconnect', () => {
        console.log('User disconnected from Socket.IO');
    });
});


// Start the server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Attempting to connect to Redis Cloud using REDIS_CLOUD_URL from .env file.');
});
