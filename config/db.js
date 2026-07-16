const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

let gfsBucket;
let gridFSBucket;

/**
 * Establishes a connection to the MongoDB database and initializes GridFS
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s
      socketTimeoutMS: 45000, // Close sockets after 45s
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Initialize GridFS Bucket for file uploads
    const db = conn.connection.db;
    gridFSBucket = new GridFSBucket(db, {
      bucketName: 'uploads' // Collection name for files
    });
    
    // Store reference for use in other parts of the app
    gfsBucket = gridFSBucket;
    
    console.log('✅ GridFS initialized successfully');

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected successfully');
    });

    return conn;
  } catch (error) {
    console.error(`❌ Error connecting to MongoDB: ${error.message}`);
    // Don't exit immediately - allow for retry logic
    throw error;
  }
};

// Helper function to get GridFS bucket
const getGridFSBucket = () => {
  if (!gridFSBucket) {
    throw new Error('GridFS not initialized. Call connectDB() first.');
  }
  return gridFSBucket;
};

// Helper function to get GFS bucket (legacy compatibility)
const getGFS = () => {
  if (!gfsBucket) {
    throw new Error('GridFS not initialized. Call connectDB() first.');
  }
  return gfsBucket;
};

module.exports = {
  connectDB,
  getGridFSBucket,
  getGFS
};