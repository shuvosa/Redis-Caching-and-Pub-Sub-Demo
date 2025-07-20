# Redis Caching and Pub/Sub Demo

This project demonstrates the integration of Redis for caching and pub/sub messaging in a full-stack application. The backend is built with Node.js and Express, using SQLite for persistent storage and Redis for caching and real-time messaging. The frontend is a React application that interacts with the backend via REST APIs and receives real-time updates through Socket.IO.
Features

Product Management: Add products to the database, with automatic cache invalidation in Redis.
Caching: Products are cached in Redis to reduce database load, with cache invalidation on updates.
Real-time Updates: Uses Redis pub/sub to notify the frontend of product changes via Socket.IO.
Custom Messaging: Publish and subscribe to custom Redis channels directly from the frontend.

# Technologies Used

Backend: Node.js, Express, Redis, SQLite, Socket.IO
Frontend: React, Socket.IO-client

# Setup Instructions
```
Clone the repository:
git clone https://github.com/shuvosa/Redis-Caching-and-Pub-Sub-Demo.git
cd your-repo-name
```

# Install dependencies:

For the backend:
cd backend
```
npm install
```

For the frontend (assumed to be in a frontend directory with its own package.json):
cd frontend
```
npm install
```



Set up Redis:

You need a Redis instance. Use Redis Cloud for a free tier or run a local Redis server.
If using Redis Cloud, create an account and obtain the connection URL.


Configure .env file:

In the backend directory, create a .env file with:
```
REDIS_CLOUD_URL=your_redis_cloud_url_here
```

Replace your_redis_cloud_url_here with your Redis connection URL.



Run the backend:

In the backend directory:
```
npm start
```

The server will run on http://localhost:5000.



Run the frontend:

In the frontend directory:
```
npm start
```

The React app will run on http://localhost:3000.




# Usage

Add a Product:

Open the frontend in your browser.
In the "Add New Product" section, enter a product name and description.
Click "Add Product & Invalidate Cache".
The product is added to SQLite, the Redis cache is invalidated, and a pub/sub message triggers a real-time update.


Refresh Products:

Click "Refresh Products" to manually fetch the product list.
The list updates automatically via Socket.IO when products are added.


Publish Custom Messages:
```
In the "Publish Message" section, enter a channel name (e.g., custom_channel) and message.
Click "Publish Message".
The message appears in "Received Messages" if subscribed to the channel.

```

#How Caching Works

The backend checks Redis for cached products under the key all_products.
If cached, it returns the data directly.
If not cached, it fetches from SQLite, caches the result in Redis with a 1-hour TTL, and returns it.
Adding a product invalidates the cache, ensuring fresh data on the next fetch.

#How Pub/Sub Works

Adding a product publishes a message to the product_updates Redis channel.
The backend subscribes to this channel and relays messages to Socket.IO clients.
The frontend updates the product list in real-time upon receiving these events.
Custom messages can be published to channels like custom_channel and displayed on the frontend.

#Contributing
Contributions are welcome! Please open an issue or submit a pull request for improvements or bug fixes.

