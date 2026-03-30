// server.js - MAIN SERVER FILE
// This is where everything starts!

// ==========================================
// STEP 1: Import Required Packages
// ==========================================

const express = require('express');        // Web framework
const mongoose = require('mongoose');      // MongoDB tool
const cors = require('cors');             // Allows Flutter to connect
const dotenv = require('dotenv');         // Loads .env file

// ==========================================
// STEP 2: Load Environment Variables
// ==========================================

dotenv.config(); // Reads .env file and loads variables

// ==========================================
// STEP 3: Create Express App
// ==========================================

const app = express(); // This is your server!

// ==========================================
// STEP 4: Middleware (runs before routes)
// ==========================================

// Only allow requests from the Flutter app's known origins
const allowedOrigins = [
  'https://nestoric-backend.onrender.com',
  'http://localhost:3000',
  'http://localhost:8080',
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow mobile app (no origin) and known origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parse JSON data from requests
app.use(express.json());

// Parse form data (for file uploads)
app.use(express.urlencoded({ extended: true }));

// ==========================================
// STEP 5: Connect to MongoDB
// ==========================================

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB!');
    console.log('📊 Database:', mongoose.connection.name);
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    console.error('💡 Make sure your MONGODB_URI in .env is correct!');
    process.exit(1); // Stop server if can't connect
  });

// ==========================================
// STEP 6: Test Route
// ==========================================

// Health check only — intentionally reveals nothing
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// ==========================================
// STEP 7: Import and Connect Routes
// ==========================================

// Import routes ONLY if files exist
let authRoutes, requestRoutes, userRoutes, uploadRoutes;

try {
  authRoutes = require('./routes/auth');
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.log('⚠️  Auth routes not found - skipping');
}

// Add this with your other route imports
try {
  const chatRoutes = require('./routes/chat');
  app.use('/api/chat', chatRoutes);
  console.log('✅ Chat routes loaded');
} catch (error) {
  console.log('⚠️  Chat routes not found - skipping');
}

try {
  requestRoutes = require('./routes/requests');
  console.log('✅ Request routes loaded');
} catch (error) {
  console.log('⚠️  Request routes not found - skipping');
}

try {
  userRoutes = require('./routes/users');
  console.log('✅ User routes loaded');
} catch (error) {
  console.log('⚠️  User routes not found - skipping');
}

try {
  uploadRoutes = require('./routes/upload');
  console.log('✅ Upload routes loaded');
} catch (error) {
  console.log('⚠️  Upload routes not found - skipping');
}

// ✅ NEW: Service Pricing routes
try {
  const pricingRoutes = require('./routes/pricing');
  const ServicePricing = require('./models/ServicePricing');
  const PlanTier = require('./models/PlanTier');
  app.use('/api/pricing', pricingRoutes);
  ServicePricing.seedDefaults(); // Auto-seeds default prices if DB is empty
  PlanTier.seedDefaults();       // Auto-seeds plan tiers if DB is empty
  console.log('✅ Pricing routes loaded');
} catch (error) {
  console.log('⚠️  Pricing routes not found - skipping:', error.message);
}

// ✅ Notification routes
try {
  const notificationRoutes = require('./routes/notifications');
  app.use('/api/notifications', notificationRoutes);
  console.log('✅ Notification routes loaded');
} catch (error) {
  console.log('⚠️  Notification routes not found - skipping:', error.message);
}

// Connect routes if they exist
if (authRoutes) {
  app.use('/api/auth', authRoutes);
}

if (requestRoutes) {
  app.use('/api/requests', requestRoutes);
}

if (userRoutes) {
  app.use('/api/users', userRoutes);
}

if (uploadRoutes) {
  app.use('/api/upload', uploadRoutes);
}

// ==========================================
// STEP 8: Error Handling
// ==========================================

// Catch all 404 errors (when route not found)
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.url}`
  });
});

// Catch all other errors — never expose internal details in production
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd ? 'Something went wrong. Please try again.' : err.message,
  });
});

// ==========================================
// STEP 9: Start Server
// ==========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║   🚀 SERVER IS RUNNING!                ║
  ╠════════════════════════════════════════╣
  ║   📍 Local:    http://localhost:${PORT}   ║
  ║   📡 API:      http://localhost:${PORT}/api ║
  ║   📊 Database: MongoDB Atlas           ║
  ║   ☁️  Storage:  Cloudinary              ║
  ╚════════════════════════════════════════╝
  `);
  console.log('✅ Server started successfully!');
  console.log('📝 Test it: Open http://localhost:' + PORT + ' in browser\n');
});

// ==========================================
// STEP 10: Graceful Shutdown
// ==========================================

// When server stops, close MongoDB connection
process.on('SIGTERM', async () => {
  console.log('Closing MongoDB connection...');
  await mongoose.connection.close();
  process.exit(0);
});

// Export for testing
module.exports = app;