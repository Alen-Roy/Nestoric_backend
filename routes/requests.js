// routes/requests.js - REQUEST MANAGEMENT ROUTES
// Create, read, update requests + chat messages

const express = require('express');
const jwt = require('jsonwebtoken');
const Request = require('../models/Request');
const Message = require('../models/Message');
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
// GET WORKER'S ASSIGNED TASKS - NEW ENDPOINT
// ==========================================
router.get('/my-tasks', authenticateToken, async (req, res) => {
  try {
    // Only workers can access this
    if (req.user.role !== 'worker') {
      return res.status(403).json({
        success: false,
        error: 'Worker access only'
      });
    }

    // Get all requests assigned to this worker
    const tasks = await Request.find({
      assignedWorkerId: req.user.userId
    })
      .sort({ createdAt: -1 }); // Newest first

    res.json({
      success: true,
      tasks,
      count: tasks.length
    });

  } catch (error) {
    console.error('Get my tasks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tasks'
    });
  }
});

// ==========================================
// GET CLIENT'S REQUESTS - NEW ENDPOINT
// ==========================================
router.get('/my-requests', authenticateToken, async (req, res) => {
  try {
    // Only clients can access this
    if (req.user.role !== 'client') {
      return res.status(403).json({
        success: false,
        error: 'Client access only'
      });
    }

    // Get all requests made by this client
    const requests = await Request.find({
      clientId: req.user.userId
    })
      .sort({ createdAt: -1 }); // Newest first

    res.json({
      success: true,
      requests,
      count: requests.length
    });

  } catch (error) {
    console.error('Get my requests error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get requests'
    });
  }
});

// ==========================================
// UPDATE TASK STATUS - NEW ENDPOINT
// ==========================================
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status, note } = req.body;

    // Validate status
    const validStatuses = ['assigned', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    // Check if worker is assigned to this task
    if (request.assignedWorkerId?.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Not assigned to this task'
      });
    }

    // Update status
    request.status = status;
    if (note) request.note = note;

    await request.save();

    res.json({
      success: true,
      message: 'Status updated successfully',
      request
    });

  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update status'
    });
  }
});

// ==========================================
// UPDATE TASK NOTE - NEW ENDPOINT
// ==========================================
router.put('/:id/note', authenticateToken, async (req, res) => {
  try {
    const { note } = req.body;

    if (!note || note.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Note cannot be empty'
      });
    }

    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    // Check if worker is assigned to this task
    if (request.assignedWorkerId?.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Not assigned to this task'
      });
    }

    // Update note
    request.note = note.trim();
    await request.save();

    res.json({
      success: true,
      message: 'Note updated successfully',
      request
    });

  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update note'
    });
  }
});

// ==========================================
// CREATE REQUEST - Client creates new request
// ==========================================
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { services, description, deadline, paymentId, amountPaid, plan } = req.body;

    // Validate
    if (!services || services.length === 0) {
      return res.status(400).json({ error: 'Please select at least one service' });
    }

    if (!description || description.length < 20) {
      return res.status(400).json({ error: 'Description must be at least 20 characters' });
    }

    // Require payment confirmation before submitting
    if (!paymentId) {
      return res.status(400).json({ error: 'Payment is required to submit a request' });
    }

    // Get user info
    const user = await User.findById(req.user.userId);

    // Create request
    const request = await Request.create({
      clientId: user._id,
      clientName: user.fullName,
      clientAvatar: user.avatarUrl,
      services,
      description,
      deadline: deadline || null,
      status: 'pending',
      uploadedFiles: req.body.uploadedFiles || [],
      paymentId,
      amountPaid: amountPaid || 0,
      paymentStatus: 'paid',
      plan: plan || 'basic'
    });

    res.status(201).json({
      success: true,
      message: 'Request created successfully',
      request
    });

  } catch (error) {
    console.error('Create request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create request'
    });
  }
});

// ==========================================
// GET ALL REQUESTS - Based on user role
// ==========================================
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = {};

    // Filter based on role
    if (req.user.role === 'admin') {
      // Admin sees ALL requests
      query = {};
    } else if (req.user.role === 'worker') {
      // Worker sees only assigned requests
      query = { assignedWorkerId: req.user.userId };
    } else {
      // Client sees only their requests
      query = { clientId: req.user.userId };
    }

    // Get requests (sorted by newest first)
    const requests = await Request.find(query)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      requests,
      count: requests.length
    });

  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get requests'
    });
  }
});

// ==========================================
// GET SINGLE REQUEST with messages
// ==========================================
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    // Get request
    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    // Check if user has access
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

    res.json({
      success: true,
      request
    });

  } catch (error) {
    console.error('Get request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get request'
    });
  }
});

// ==========================================
// UPDATE REQUEST - Status, notes, files
// ==========================================
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { status, note, uploadedFiles, assignedWorkerId } = req.body;

    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    // Check permissions
    const canUpdate =
      req.user.role === 'admin' ||
      request.assignedWorkerId?.toString() === req.user.userId;

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Build update object
    const updateData = {};
    if (status) updateData.status = status;
    if (note !== undefined) updateData.note = note;
    if (uploadedFiles) updateData.uploadedFiles = uploadedFiles;

    // Admin can assign workers
    if (req.user.role === 'admin' && assignedWorkerId) {
      const worker = await User.findById(assignedWorkerId);
      if (worker) {
        updateData.assignedWorkerId = assignedWorkerId;
        updateData.assignedWorkerName = worker.fullName;
        updateData.status = 'assigned';
      }
    }

    // Update request
    const updatedRequest = await Request.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json({
      success: true,
      message: 'Request updated successfully',
      request: updatedRequest
    });

  } catch (error) {
    console.error('Update request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update request'
    });
  }
});

// ==========================================
// DELETE REQUEST (Admin or Client)
// ==========================================
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    // Only admin or request owner can delete
    const canDelete =
      req.user.role === 'admin' ||
      request.clientId.toString() === req.user.userId;

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    await Request.findByIdAndDelete(req.params.id);

    // Also delete associated messages
    try {
      await Message.deleteMany({ requestId: req.params.id });
    } catch (e) {
      console.log('No Message model or error deleting messages');
    }

    res.json({
      success: true,
      message: 'Request deleted successfully'
    });

  } catch (error) {
    console.error('Delete request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete request'
    });
  }
});

// ==========================================
// SEND MESSAGE - Add message to request
// ==========================================
router.post('/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { message, fileUrl, fileName, fileType } = req.body;

    // Allow message to be empty IF there is a file
    if ((!message || message.trim().length === 0) && !fileUrl) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    // Get user info
    const user = await User.findById(req.user.userId);

    // Create message
    const newMessage = await Message.create({
      requestId: req.params.id,
      senderId: user._id,
      senderName: user.fullName,
      senderRole: req.user.role, // Added senderRole to be explicit
      message: message ? message.trim() : '', // Changed 'text' to 'message'
      fileUrl: fileUrl || null,
      fileName: fileName || null,
      fileType: fileType || null,
      isRead: false
    });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message: ' + error.message
    });
  }
});

// ==========================================
// GET MESSAGES - Get all messages for a request
// ==========================================
router.get('/:id/messages', authenticateToken, async (req, res) => {
  try {
    const messages = await Message.find({ requestId: req.params.id })
      .sort({ createdAt: 1 }); // Oldest first

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

module.exports = router;