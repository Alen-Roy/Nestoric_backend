// routes/chat.js - CHAT/MESSAGING ROUTES
// Real-time messaging between clients and workers

const express = require('express');
const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const Request = require('../models/Request');
const User = require('../models/User');

const router = express.Router();

// ==========================================
// MIDDLEWARE - Verify Token
// ==========================================
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==========================================
// GET MESSAGES FOR A REQUEST
// ==========================================
router.get('/:requestId/messages', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;

    // Check if user has access to this request
    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    const hasAccess =
      req.user.role === 'admin' ||
      request.clientId.toString() === req.user.userId ||
      request.assignedWorkerId?.toString() === req.user.userId;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get all messages for this request
    const messages = await Message.find({ requestId })
      .sort({ timestamp: 1 }); // Oldest first

    res.json({
      success: true,
      messages
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get messages'
    });
  }
});

// ==========================================
// SEND MESSAGE
// ==========================================
router.post('/:requestId/messages', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message cannot be empty'
      });
    }

    // Check if user has access to this request
    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    const hasAccess =
      req.user.role === 'admin' ||
      request.clientId.toString() === req.user.userId ||
      request.assignedWorkerId?.toString() === req.user.userId;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get user info
    const user = await User.findById(req.user.userId);

    // Create message
    const newMessage = await Message.create({
      requestId,
      senderId: user._id,
      senderName: user.fullName,
      senderRole: req.user.role,
      message: message.trim(),
      timestamp: new Date(),
      isRead: false,
      fileUrl: req.body.fileUrl || null,
      fileName: req.body.fileName || null,
      fileType: req.body.fileType || null
    });

    res.status(201).json({
      success: true,
      message: newMessage
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});

// ==========================================
// MARK MESSAGES AS READ
// ==========================================
router.put('/:requestId/read', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;

    // Mark all messages in this request as read (except user's own)
    await Message.updateMany(
      {
        requestId,
        senderId: { $ne: req.user.userId },
        isRead: false
      },
      {
        isRead: true
      }
    );

    res.json({
      success: true,
      message: 'Messages marked as read'
    });

  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark messages as read'
    });
  }
});

// ==========================================
// GET UNREAD MESSAGE COUNT
// ==========================================
router.get('/:requestId/unread', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;

    // Count unread messages (not sent by current user)
    const count = await Message.countDocuments({
      requestId,
      senderId: { $ne: req.user.userId },
      isRead: false
    });

    res.json({
      success: true,
      count
    });

  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get unread count'
    });
  }
});

module.exports = router;