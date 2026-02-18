// models/Message.js - MESSAGE MODEL
// Defines chat message structure

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Request this message belongs to
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: true
  },

  // Sender information
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  senderName: {
    type: String,
    required: true
  },

  senderRole: {
    type: String,
    enum: ['client', 'worker', 'admin'],
    required: true
  },

  // Message content
  message: {
    type: String,
    required: true,
    trim: true
  },

  // File attachment (optional)
  fileUrl: {
    type: String,
    default: null
  },
  fileName: {
    type: String,
    default: null
  },
  fileType: {
    type: String, // 'image', 'document', etc.
    default: null
  },

  // Message timestamp
  timestamp: {
    type: Date,
    default: Date.now
  },

  // Read status
  isRead: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for faster queries
messageSchema.index({ requestId: 1, timestamp: 1 });
messageSchema.index({ requestId: 1, isRead: 1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;