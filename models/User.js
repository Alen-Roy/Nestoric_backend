// models/User.js - USER MODEL
// Defines how user data is structured in MongoDB

const mongoose = require('mongoose');

// ==========================================
// USER SCHEMA (Blueprint for user data)
// ==========================================

const userSchema = new mongoose.Schema({
  // Email (must be unique)
  email: {
    type: String,           // Data type
    required: true,         // Cannot be empty
    unique: true,           // No duplicate emails
    lowercase: true,        // Convert to lowercase
    trim: true              // Remove spaces
  },

  // Password (encrypted) — optional for Google sign-in users
  password: {
    type: String,
    required: false,
    minlength: 6
  },

  // Google OAuth fields
  googleId: {
    type: String,
    default: null,
    sparse: true   // Allows multiple null values in unique index
  },

  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },

  // Full name
  fullName: {
    type: String,
    required: true,
    trim: true
  },

  // User role (client, worker, or admin)
  role: {
    type: String,
    enum: ['client', 'worker', 'admin'], // Only these values allowed
    default: 'client'                     // Default is client
  },

  // Profile picture URL (optional)
  avatarUrl: {
    type: String,
    default: null
  },

  // Phone number (for Razorpay pre-fill)
  phone: {
    type: String,
    default: null,
    trim: true
  },

  // Email verification
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    default: null,
    select: false  // Never returned in queries unless explicitly requested
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  },

  // Password Reset
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },

  // Worker-specific fields (only for workers)
  workerProfile: {
    skills: [{
      type: String           // Array of skills
    }],
    activeProjects: {
      type: Number,
      default: 0
    },
    completedProjects: {
      type: Number,
      default: 0
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,               // Minimum 0
      max: 5                // Maximum 5
    },
    isAvailable: {
      type: Boolean,
      default: true
    },
    phone: {
      type: String,
      default: null
    }
  }
}, {
  // Automatically add createdAt and updatedAt
  timestamps: true
});

// ==========================================
// INDEXES (Make searches faster)
// ==========================================

userSchema.index({ email: 1 });        // Search by email
userSchema.index({ role: 1 });         // Search by role

// ==========================================
// METHODS (Functions you can use)
// ==========================================

// Remove password when converting to JSON
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;  // Don't send password to client!
  return user;
};

// ==========================================
// CREATE AND EXPORT MODEL
// ==========================================

const User = mongoose.model('User', userSchema);

module.exports = User;

// ==========================================
// HOW MONGODB STORES THIS:
// ==========================================
// 
// In MongoDB, a user document looks like this:
// {
//   "_id": "507f1f77bcf86cd799439011",
//   "email": "john@example.com",
//   "password": "$2a$10$encrypted_password_here",
//   "fullName": "John Smith",
//   "role": "client",
//   "avatarUrl": "https://cloudinary.com/image.jpg",
//   "workerProfile": {
//     "skills": ["Mobile App", "Web Development"],
//     "activeProjects": 2,
//     "completedProjects": 15,
//     "rating": 4.8,
//     "isAvailable": true,
//     "phone": "+1234567890"
//   },
//   "createdAt": "2024-01-15T10:30:00.000Z",
//   "updatedAt": "2024-01-15T10:30:00.000Z"
// }
//
// MongoDB stores data in JSON-like format - much simpler than SQL tables!
// ==========================================