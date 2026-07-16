const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const path = require("path");
const { connectDB, getGridFSBucket } = require("./config/db");
const User = require('./models/userModel');
const CommunityBubble = require('./models/communityBubbleModel');
const { getGridCellId } = require('./utils/locationUtils');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 4500;

// =============================================
// 1. MIDDLEWARE CONFIGURATION
// =============================================

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Parse cookies
app.use(cookieParser());

// Serve static files (optional)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =============================================
// 2. CORS CONFIGURATION
// =============================================

const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
].filter(Boolean);

// Dynamic check to allow Vercel domains (production & previews)
const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (origin.endsWith('.vercel.app')) return true;
  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options(/(.*)/, cors(corsOptions));

// =============================================
// 3. REQUEST LOGGING (Development only)
// =============================================

if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    if (req.file) {
      console.log(`📎 File: ${req.file.originalname} (${req.file.size} bytes)`);
    }
    if (req.body && Object.keys(req.body).length > 0) {
      // Don't log passwords
      const sanitizedBody = { ...req.body };
      if (sanitizedBody.password) sanitizedBody.password = '********';
      console.log('📦 Body:', sanitizedBody);
    }
    next();
  });
}

// =============================================
// 4. ROUTES
// =============================================

// Import routes
const authRoutes = require("./routes/authRoutes");
const communityRoutes = require("./routes/communityBubbleRoutes");
const userRoutes = require("./routes/userRoutes");
const { errorHandler } = require("./middleware/errorMiddleware");

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/user", userRoutes);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    message: `Route ${req.originalUrl} not found`
  });
});

// =============================================
// 5. ERROR HANDLING
// =============================================

// Apply the custom error handler (must be last)
app.use(errorHandler);

/**
 * Seeds the database with initial data, like a default bubble.
 */
const seedInitialData = async () => {
  try {
    // 1. Find or create a "System" user to own default bubbles
    const systemUserEmail = 'system@bubble.app';
    let systemUser = await User.findOne({ email: systemUserEmail });

    if (!systemUser) {
      console.log('🌱 Creating System user...');
      systemUser = await User.create({
        username: 'System',
        email: systemUserEmail,
        // This password is for a non-interactive account.
        password: `system_password_${new Date().getTime()}`,
        publicKey: 'system_public_key',
      });
      console.log(`✅ System user created with ID: ${systemUser._id}`);
    }

    // 2. Find or create the "Genesis Bubble" at coordinates (0, 0)
    const genesisCoords = { lat: 0, lon: 0 };
    const gridId = getGridCellId(genesisCoords.lat, genesisCoords.lon);

    const genesisBubbleExists = await CommunityBubble.findOne({ gridId });

    if (!genesisBubbleExists) {
      console.log('🌱 Creating Genesis Bubble...');
      await CommunityBubble.create({
        name: 'Genesis Bubble',
        description: 'The first bubble. Welcome to the network!',
        isPublic: true,
        isDefault: true,
        creator: systemUser._id,
        location: {
          type: 'Point',
          coordinates: [genesisCoords.lon, genesisCoords.lat],
        },
        gridId: gridId,
        tags: ['genesis', 'default', 'welcome'],
      });
      console.log(`✅ Genesis Bubble created for grid cell: ${gridId}`);
    } else {
      console.log('✅ Genesis Bubble already exists.');
    }
  } catch (error) {
    console.error('❌ Error during initial data seeding:', error);
    // Do not block server start for seeding errors
  }
};

// =============================================
// 6. DATABASE CONNECTION & SERVER START
// =============================================

const http = require('http');
const { Server } = require('socket.io');
const { initializeSocket } = require('./initSocket');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

initializeSocket(io);


/**
 * Start the server
 */
const startServer = async () => {
  try {
    await connectDB();
    await seedInitialData();
    
    try {
      getGridFSBucket();
      console.log('✅ GridFS is ready for file uploads');
    } catch (error) {
      console.warn('⚠️ GridFS not initialized:', error.message);
    }

    server.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📡 Client URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
      console.log(`🔗 API URL: http://localhost:${port}/api`);
    });

    const gracefulShutdown = (signal) => {
      console.log(`\n⚠️ Received ${signal}, shutting down gracefully...`);
      
      io.close(() => {
        console.log('✅ Socket.io server closed');
        server.close(async () => {
          console.log('✅ HTTP server closed');
          
          try {
            await mongoose.connection.close();
            console.log('✅ MongoDB connection closed');
          } catch (error) {
            console.error('❌ Error closing MongoDB connection:', error);
          }
          
          process.exit(0);
        });
      });

      setTimeout(() => {
        console.error('❌ Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

// =============================================
// 7. UNHANDLED EXCEPTION HANDLING
// =============================================

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
  // Don't exit in development for better debugging
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit in development for better debugging
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// =============================================
// 8. EXPORTS FOR TESTING
// =============================================

module.exports = { app };