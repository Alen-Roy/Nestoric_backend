// models/Request.js - REQUEST MODEL
// Defines service request structure

const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  // Client who made the request
  clientId: {
    type: mongoose.Schema.Types.ObjectId,  // Reference to User
    ref: 'User',                           // Links to User model
    required: true
  },

  clientName: {
    type: String,
    required: true
  },

  clientAvatar: {
    type: String,
    default: null
  },

  // Services requested (array of strings)
  services: [{
    type: String,
    required: true
  }],

  // Project description
  description: {
    type: String,
    required: true,
    minlength: 20
  },

  // Request status
  status: {
    type: String,
    enum: ['pending', 'assigned', 'in_progress', 'completed'],
    default: 'pending'
  },

  // Assigned worker (optional)
  assignedWorkerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  assignedWorkerName: {
    type: String,
    default: null
  },

  // Deadline
  deadline: {
    type: Date,
    default: null
  },

  // Uploaded files (array of URLs)
  uploadedFiles: [{
    type: String
  }],

  // Worker notes
  note: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
requestSchema.index({ clientId: 1 });
requestSchema.index({ assignedWorkerId: 1 });
requestSchema.index({ status: 1 });
requestSchema.index({ createdAt: -1 }); // Sort by newest first

const Request = mongoose.model('Request', requestSchema);

module.exports = Request;