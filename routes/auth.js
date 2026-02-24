// routes/auth.js - AUTHENTICATION ROUTES
// Handles signup, login, google sign-in, get profile

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const admin = require('firebase-admin');

const router = express.Router();

// ==========================================
// FIREBASE ADMIN - Initialized once
// ==========================================
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Replace escaped newlines that can appear in .env strings
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

// ==========================================
// GOOGLE SIGN-IN — Verify Firebase ID token
// and create/login user in our own DB
// ==========================================
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'Firebase ID token is required' });
    }

    // 1. Verify the token with Firebase Admin
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired Google token' });
    }

    const { uid, email, name, picture } = decodedToken;

    if (!email) {
      return res.status(400).json({ error: 'Google account must have an email' });
    }

    // 2. Find existing user or create a new one
    let user = await User.findOne({ $or: [{ googleId: uid }, { email }] });

    if (user) {
      // User exists — update Google info if needed
      if (!user.googleId) {
        user.googleId = uid;
        user.authProvider = 'google';
        if (!user.avatarUrl && picture) user.avatarUrl = picture;
        await user.save();
      }
    } else {
      // New user — create them (no password needed)
      user = await User.create({
        email,
        fullName: name || email.split('@')[0],
        avatarUrl: picture || null,
        googleId: uid,
        authProvider: 'google',
        role: 'client',
      });
    }

    // 3. Issue our own JWT (same format as regular login)
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Google sign-in successful',
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        phone: user.phone || null,
        workerProfile: user.workerProfile,
      },
      token,
    });

  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Failed to authenticate with Google' });
  }
});

// ==========================================
// SIGNUP - Create new user account
// ==========================================
router.post('/signup', async (req, res) => {
  try {
    // Get data from Flutter app
    const { email, password, fullName, phone } = req.body;

    // STEP 1: Validate input
    if (!email || !password || !fullName) {
      return res.status(400).json({
        error: 'Please provide email, password, and full name'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters'
      });
    }

    // STEP 2: Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        error: 'Email already registered'
      });
    }

    // STEP 3: Encrypt password (NEVER store plain passwords!)
    const hashedPassword = await bcrypt.hash(password, 10);

    // STEP 4: Create new user in database
    const user = await User.create({
      email,
      password: hashedPassword,
      fullName,
      phone: phone || null,
      role: 'client' // Default role
    });

    // STEP 5: Create JWT token (like a ticket that proves you're logged in)
    const token = jwt.sign(
      {
        userId: user._id,      // MongoDB auto-generated ID
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,  // Secret key from .env
      { expiresIn: '90d' }     // Token valid for 30 days
    );

    // STEP 6: Send response back to Flutter
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        phone: user.phone || null,
      },
      token
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ==========================================
// LOGIN - Authenticate existing user
// ==========================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // STEP 1: Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Please provide email and password'
      });
    }

    // STEP 2: Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    // STEP 3: Check if password is correct
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    // STEP 4: Create JWT token
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // STEP 5: Send response
    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        phone: user.phone || null,
        workerProfile: user.workerProfile
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// ==========================================
// MIDDLEWARE - Verify JWT Token
// ==========================================
const authenticateToken = (req, res, next) => {
  // Get token from header
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach user info to request
    next(); // Continue to next function
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==========================================
// GET PROFILE - Get current user info
// ==========================================
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Get user from database (without password)
    const user = await User.findById(req.user.userId).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// ==========================================
// UPDATE PROFILE - Update user information
// ==========================================
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { fullName, avatarUrl, phone } = req.body;

    // Build update object
    const updateData = {};
    if (fullName) updateData.fullName = fullName;
    if (avatarUrl) updateData.avatarUrl = avatarUrl;
    if (phone !== undefined) updateData.phone = phone;

    // Update user
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updateData,
      { new: true } // Return updated document
    ).select('-password');

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        phone: user.phone || null,
        workerProfile: user.workerProfile,
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ==========================================
// CHANGE PASSWORD
// ==========================================
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Please provide current and new password'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: 'New password must be at least 6 characters'
      });
    }

    // Get user with password
    const user = await User.findById(req.user.userId);

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Export router
module.exports = router;

// ==========================================
// HOW TO USE THESE ROUTES IN FLUTTER:
// ==========================================
//
// 1. SIGNUP:
//    POST http://localhost:3000/api/auth/signup
//    Body: { "email": "...", "password": "...", "fullName": "..." }
//    Response: { "user": {...}, "token": "..." }
//
// 2. LOGIN:
//    POST http://localhost:3000/api/auth/login
//    Body: { "email": "...", "password": "..." }
//    Response: { "user": {...}, "token": "..." }
//
// 3. GET PROFILE:
//    GET http://localhost:3000/api/auth/me
//    Headers: { "Authorization": "Bearer YOUR_TOKEN" }
//    Response: { "user": {...} }
//
// 4. UPDATE PROFILE:
//    PUT http://localhost:3000/api/auth/profile
//    Headers: { "Authorization": "Bearer YOUR_TOKEN" }
//    Body: { "fullName": "...", "avatarUrl": "..." }
//
// ==========================================