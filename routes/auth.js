// routes/auth.js - AUTHENTICATION ROUTES
// Handles signup, login, google sign-in, get profile

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const admin = require('firebase-admin');
const { sendVerificationEmail } = require('../utils/mailer');

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
      // New Google user — already verified since Google verified their email
      user = await User.create({
        email,
        fullName: name || email.split('@')[0],
        avatarUrl: picture || null,
        googleId: uid,
        authProvider: 'google',
        role: 'client',
        isEmailVerified: true, // Google handles email verification
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
    const { email, password, fullName, phone } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Please provide email, password, and full name' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if a real user already exists with this email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const rawToken = crypto.randomBytes(32).toString('hex');

    // Store in PendingRegistration — NOT creating a User yet
    await PendingRegistration.findOneAndUpdate(
      { email },
      {
        email,
        passwordHash: hashedPassword,
        fullName,
        phone: phone || null,
        token: rawToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      { upsert: true, new: true }
    );

    // Send verification email
    console.log(`[Signup] Sending verification email to: ${email}`);
    try {
      await sendVerificationEmail(email, rawToken);
      console.log(`[Signup] Verification email sent successfully to: ${email}`);
    } catch (mailErr) {
      console.error('[Signup] RESEND ERROR:', JSON.stringify(mailErr, null, 2));
      // Still respond with requiresVerification so user stays on the right screen
      // They can use the resend button
    }

    res.status(201).json({
      requiresVerification: true,
      message: 'Please check your email to verify your account.',
      email,
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to register. Please try again.' });
  }
});

// ==========================================
// LOGIN - Authenticate existing user
// ==========================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide email and password' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Block login for unverified email/password accounts
    if (!user.isEmailVerified && user.authProvider !== 'google') {
      return res.status(403).json({
        error: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before logging in.',
        email: user.email,
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Login successful',
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
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// ==========================================
// CHECK VERIFICATION STATUS (polling)
// Called by the Flutter app every few seconds while waiting.
// Returns a JWT when the user has verified their email.
// ==========================================
router.get('/check-verification', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ verified: false });

    const user = await User.findOne({ email, isEmailVerified: true });
    if (!user) return res.json({ verified: false });

    // Issue a JWT so the app can log in automatically
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      verified: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        phone: user.phone || null,
        workerProfile: user.workerProfile,
      },
    });
  } catch (error) {
    console.error('Check verification error:', error);
    res.status(500).json({ verified: false });
  }
});

// ==========================================
// VERIFY EMAIL — user clicks link in email
// ==========================================
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Look up the pending registration by token
    const pending = await PendingRegistration.findOne({ token }).select('+token');

    if (!pending || pending.expiresAt < new Date()) {
      if (pending) await PendingRegistration.deleteOne({ _id: pending._id });
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2 style="color:#e53e3e">&#10060; Invalid or expired link</h2>
          <p>This verification link has expired. Please register again in the Nestoric app.</p>
        </body></html>
      `);
    }

    // Check if a user was already created (double-click protection)
    const existingUser = await User.findOne({ email: pending.email });
    if (existingUser) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      return res.send(`
        <html><body style="font-family:-apple-system,sans-serif;text-align:center;padding:60px;background:#f5f5f5">
          <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:48px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
            <div style="font-size:56px;margin-bottom:16px">&#9989;</div>
            <h2 style="color:#38a169;margin:0 0 12px">Already verified!</h2>
            <p style="color:#555;line-height:1.6">Your account is active. Open the app and sign in.</p>
          </div>
        </body></html>
      `);
    }

    // Create the real User now that email is verified
    await User.create({
      email: pending.email,
      password: pending.passwordHash,
      fullName: pending.fullName,
      phone: pending.phone || null,
      role: 'client',
      isEmailVerified: true,
    });

    // Delete the pending record
    await PendingRegistration.deleteOne({ _id: pending._id });

    res.send(`
      <html><body style="font-family:-apple-system,sans-serif;text-align:center;padding:60px;background:#f5f5f5">
        <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:48px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="font-size:56px;margin-bottom:16px">&#9989;</div>
          <h2 style="color:#38a169;margin:0 0 12px">Email verified!</h2>
          <p style="color:#555;line-height:1.6">Your Nestoric account is now active.<br/>Open the app and sign in to continue.</p>
        </div>
      </body></html>
    `);

  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).send('<h2>Something went wrong. Please try again.</h2>');
  }
});

// ==========================================
// RESEND VERIFICATION EMAIL
// ==========================================
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Check if user already exists and is verified
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already verified. Please sign in.' });
    }

    // Look up pending registration
    const pending = await PendingRegistration.findOne({ email });
    if (!pending) {
      return res.status(404).json({ error: 'No pending registration found. Please register again.' });
    }

    // Generate a new token and update
    const rawToken = crypto.randomBytes(32).toString('hex');
    pending.token = rawToken;
    pending.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pending.save();

    console.log(`[Resend] Sending verification email to: ${email}`);
    await sendVerificationEmail(email, rawToken);
    console.log(`[Resend] Verification email sent successfully to: ${email}`);

    res.json({ message: 'Verification email resent successfully.' });

  } catch (error) {
    console.error('[Resend] Error:', JSON.stringify(error, null, 2));
    res.status(500).json({ error: 'Failed to resend verification email' });
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