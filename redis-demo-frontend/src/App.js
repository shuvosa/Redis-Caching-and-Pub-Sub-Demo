// src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client'; // Import Socket.IO client library

// Backend server URL
const API_URL = 'http://localhost:5000';

// Establish Socket.IO connection
const socket = io(API_URL, {
  reconnection: true, // Enable reconnection
  reconnectionAttempts: Infinity, // Unlimited reconnection attempts
  reconnectionDelay: 1000, // Wait 1 second before retrying
  timeout: 20000, // Connection timeout
  transports: ['websocket'] // <-- ADD THIS LINE to explicitly force WebSocket
});

function App() {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductDescription, setNewProductDescription] = useState('');
  const [publishMessageChannel, setPublishMessageChannel] = useState('custom_channel');
  const [publishMessageContent, setPublishMessageContent] = useState('');
  const [receivedMessages, setReceivedMessages] = useState([]);
  const [statusMessage, setStatusMessage] = useState('');

  // Function to fetch products from the backend
  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    setStatusMessage('Fetching products...');
    console.log('Frontend: Initiating fetch products call to backend.');
    try {
      const response = await fetch(`${API_URL}/products`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setProducts(data);
      setStatusMessage('Products loaded successfully.');
      console.log('Frontend: Products fetched successfully:', data);
    } catch (error) {
      console.error('Frontend: Error fetching products:', error);
      setStatusMessage(`Error fetching products: ${error.message}. Make sure backend is running and Redis is connected.`);
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  // useEffect hook to handle Socket.IO connections and message listeners
  useEffect(() => {
    // Initial fetch of products when component mounts
    fetchProducts();

    console.log('Frontend Socket.IO: Attempting to connect...'); // Added debug log

    socket.on('connect', () => {
      console.log('Frontend Socket.IO: SUCCESSFULLY Connected!'); // Stronger debug log
      setStatusMessage('Connected to real-time updates.');
    });

    socket.on('disconnect', () => {
      console.log('Frontend Socket.IO: Disconnected!');
      setStatusMessage('Disconnected from real-time updates. Reconnecting...');
    });

    socket.on('connect_error', (err) => {
      console.error('Frontend Socket.IO: CONNECTION ERROR:', err.message, err); // More verbose error log
      setStatusMessage(`Socket.IO connection error: ${err.message}. Backend might be down or blocked.`);
    });

    // Listener for 'product_updated' events from the backend (via Redis Pub/Sub)
    socket.on('product_updated', (message) => {
      console.log('Frontend Socket.IO: Received "product_updated" message:', message);
      try {
        const parsedMessage = JSON.parse(message);
        setReceivedMessages(prevMessages => [
          ...prevMessages,
          `Product Update: ${JSON.stringify(parsedMessage.payload)} (Type: ${parsedMessage.type})`
        ]);
        console.log('Frontend: Added product update message to receivedMessages.');
        // Re-fetch products to show the latest state, demonstrating cache invalidation
        fetchProducts();
        console.log('Frontend: Triggered fetchProducts due to product_updated event.');
      } catch (e) {
        console.error('Frontend: Failed to parse product update message:', e);
        setReceivedMessages(prevMessages => [
          ...prevMessages,
          `Received raw message (parse error): ${message}`
        ]);
      }
    });

    // Listener for general messages on the 'custom_channel' (demonstrates custom pub/sub)
    socket.on('custom_channel', (message) => {
        console.log('Frontend Socket.IO: Received "custom_channel" message:', message);
        setReceivedMessages(prevMessages => [...prevMessages, `Custom Message: ${message}`]);
        console.log('Frontend: Added custom message to receivedMessages.');
    });

    // Clean up Socket.IO listeners on component unmount
    return () => {
      console.log('Frontend Socket.IO: Cleaning up listeners and disconnecting.');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('product_updated');
      socket.off('custom_channel');
      socket.disconnect();
    };
  }, [fetchProducts]);

  // Handler for adding a new product
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newProductName) {
      setStatusMessage('Product name cannot be empty.');
      return;
    }

    setStatusMessage('Adding product...');
    console.log('Frontend: Sending add product request to backend.');
    try {
      const response = await fetch(`${API_URL}/product`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newProductName, description: newProductDescription }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setStatusMessage(`Product added: ${data.message}. Cache should be invalidated.`);
      console.log('Frontend: Product add response:', data);
      setNewProductName('');
      setNewProductDescription('');
    } catch (error) {
      console.error('Frontend: Error adding product:', error);
      setStatusMessage(`Error adding product: ${error.message}`);
    }
  };

  // Handler for publishing a custom message
  const handlePublishMessage = async (e) => {
    e.preventDefault();
    if (!publishMessageChannel || !publishMessageContent) {
      setStatusMessage('Channel and message content cannot be empty.');
      return;
    }

    setStatusMessage(`Publishing to channel "${publishMessageChannel}"...`);
    console.log('Frontend: Sending publish message request to backend. Content:', publishMessageContent);
    try {
      const response = await fetch(`${API_URL}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel: publishMessageChannel, message: publishMessageContent }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setStatusMessage(`Message published: ${data.message}`);
      console.log('Frontend: Publish message response:', data);
      setPublishMessageContent('');
    } catch (error) {
      console.error('Frontend: Error publishing message:', error);
      setStatusMessage(`Error publishing message: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8 font-sans flex flex-col items-center justify-center">
      <div className="max-w-4xl w-full bg-white rounded-xl shadow-2xl p-8 space-y-8">
        <h1 className="text-4xl font-extrabold text-center text-indigo-800 mb-8">
          Redis Caching & Pub/Sub Demo
        </h1>

        {statusMessage && (
          <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 rounded mb-4" role="alert">
            <p className="font-bold">Status:</p>
            <p>{statusMessage}</p>
          </div>
        )}

        {/* Product Management Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-gray-50 p-6 rounded-lg shadow-inner">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Add New Product</h2>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div>
                <label htmlFor="productName" className="block text-sm font-medium text-gray-700">Product Name:</label>
                <input
                  type="text"
                  id="productName"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="e.g., Laptop Pro"
                  required
                />
              </div>
              <div>
                <label htmlFor="productDescription" className="block text-sm font-medium text-gray-700">Description:</label>
                <textarea
                  id="productDescription"
                  value={newProductDescription}
                  onChange={(e) => setNewProductDescription(e.target.value)}
                  rows="3"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="A powerful new laptop with advanced features."
                ></textarea>
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md shadow-lg transition duration-300 ease-in-out transform hover:scale-105"
              >
                Add Product & Invalidate Cache
              </button>
            </form>
          </div>

          <div className="bg-gray-50 p-6 rounded-lg shadow-inner">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Products List (from Cache/DB)</h2>
            <button
              onClick={fetchProducts}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md shadow-lg mb-4 transition duration-300 ease-in-out transform hover:scale-105"
              disabled={loadingProducts}
            >
              {loadingProducts ? 'Loading...' : 'Refresh Products'}
            </button>
            {products.length === 0 && !loadingProducts ? (
                  <p className="text-gray-600 text-center">No products found. Add some!</p>
                ) : (
                  <ul className="space-y-3 max-h-60 overflow-y-auto pr-2">
                    {products.map((product) => (
                      <li key={product.id} className="bg-white p-3 rounded-md shadow-sm border border-gray-200">
                        <p className="text-lg font-medium text-indigo-700">{product.name}</p>
                        <p className="text-gray-600 text-sm">{product.description || 'No description'}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Pub/Sub Section */}
            <div className="bg-gray-50 p-6 rounded-lg shadow-inner mt-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Redis Pub/Sub Messaging</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-xl font-medium text-gray-700 mb-3">Publish Message</h3>
                  <form onSubmit={handlePublishMessage} className="space-y-4">
                    <div>
                      <label htmlFor="channelName" className="block text-sm font-medium text-gray-700">Channel:</label>
                      <input
                        type="text"
                        id="channelName"
                        value={publishMessageChannel}
                        onChange={(e) => setPublishMessageChannel(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="e.g., alerts"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="messageContent" className="block text-sm font-medium text-gray-700">Message:</label>
                      <input
                        type="text"
                        id="messageContent"
                        value={publishMessageContent}
                        onChange={(e) => setPublishMessageContent(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="e.g., Server maintenance at 2 AM!"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md shadow-lg transition duration-300 ease-in-out transform hover:scale-105"
                    >
                      Publish Message
                    </button>
                  </form>
                </div>

                <div>
                  <h3 className="text-xl font-medium text-gray-700 mb-3">Received Messages</h3>
                  <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200 min-h-[120px] max-h-60 overflow-y-auto">
                    {receivedMessages.length === 0 ? (
                      <p className="text-gray-600">No messages received yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {receivedMessages.map((msg, index) => (
                          <li key={index} className="text-sm text-gray-800 bg-blue-50 p-2 rounded-md border border-blue-200">
                            {msg}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    export default App;
