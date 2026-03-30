// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: { type: String, required: true },
  body:  { type: String, required: true },
  type: {
    type: String,
    enum: [
      'request_created',   // admin gets this when client submits
      'request_assigned',  // worker gets this when admin assigns
      'status_updated',    // client gets this when worker/admin changes status
      'request_completed', // client gets this when marked complete
      'new_message',       // user gets this on new chat message
      'payment_received',  // admin gets this when client pays
    ],
    default: 'status_updated',
  },
  data: { type: Object, default: {} }, // arbitrary payload (requestId, etc.)
  isRead: { type: Boolean, default: false, index: true },
}, { timestamps: true });

// Expire notifications older than 30 days automatically
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Notification', notificationSchema);
