// routes/users.js - USER MANAGEMENT ROUTES
// Worker management, statistics

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Request = require('../models/Request');

const router = express.Router();

// Auth middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Admin check
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ==========================================
// GET WORKER STATS - NEW ENDPOINT
// ==========================================
router.get('/worker-stats', authenticateToken, async (req, res) => {
  try {
    // Only workers can access this
    if (req.user.role !== 'worker') {
      return res.status(403).json({ 
        success: false,
        error: 'Worker access only' 
      });
    }

    // Count tasks by status
    const totalTasks = await Request.countDocuments({ 
      assignedWorkerId: req.user.userId 
    });
    
    const assigned = await Request.countDocuments({ 
      assignedWorkerId: req.user.userId, 
      status: 'assigned' 
    });
    
    const inProgress = await Request.countDocuments({ 
      assignedWorkerId: req.user.userId, 
      status: 'in_progress' 
    });
    
    const completed = await Request.countDocuments({ 
      assignedWorkerId: req.user.userId, 
      status: 'completed' 
    });

    // Get worker profile for rating
    const worker = await User.findById(req.user.userId);
    const rating = worker?.workerProfile?.rating || 0;

    res.json({
      success: true,
      stats: {
        totalTasks,
        assigned,
        inProgress,
        completed,
        rating
      }
    });

  } catch (error) {
    console.error('Get worker stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get worker stats' 
    });
  }
});

// ==========================================
// GET CLIENT STATS - NEW ENDPOINT
// ==========================================
router.get('/client-stats', authenticateToken, async (req, res) => {
  try {
    // Only clients can access this
    if (req.user.role !== 'client') {
      return res.status(403).json({ 
        success: false,
        error: 'Client access only' 
      });
    }

    // Count requests by status
    const totalRequests = await Request.countDocuments({ 
      clientId: req.user.userId 
    });
    
    const pending = await Request.countDocuments({ 
      clientId: req.user.userId, 
      status: 'pending' 
    });
    
    const inProgress = await Request.countDocuments({ 
      clientId: req.user.userId, 
      status: 'in_progress' 
    });
    
    const completed = await Request.countDocuments({ 
      clientId: req.user.userId, 
      status: 'completed' 
    });

    res.json({
      success: true,
      stats: {
        totalRequests,
        pending,
        inProgress,
        completed
      }
    });

  } catch (error) {
    console.error('Get client stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get client stats' 
    });
  }
});

// ==========================================
// GET ALL WORKERS
// ==========================================
router.get('/workers', authenticateToken, async (req, res) => {
  try {
    const workers = await User.find({ role: 'worker' })
      .select('-password');

    res.json({ 
      success: true,
      workers 
    });

  } catch (error) {
    console.error('Get workers error:', error);
    res.status(500).json({ error: 'Failed to get workers' });
  }
});

// ==========================================
// CREATE WORKER (Admin only)
// ==========================================
router.post('/workers', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { email, password, fullName, skills, phone } = req.body;

    // Check if email exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create worker
    const worker = await User.create({
      email,
      password: hashedPassword,
      fullName,
      role: 'worker',
      workerProfile: {
        skills: skills || [],
        phone,
        isAvailable: true
      }
    });

    res.status(201).json({
      message: 'Worker created successfully',
      worker: {
        id: worker._id,
        email: worker.email,
        fullName: worker.fullName,
        workerProfile: worker.workerProfile
      }
    });

  } catch (error) {
    console.error('Create worker error:', error);
    res.status(500).json({ error: 'Failed to create worker' });
  }
});

// ==========================================
// UPDATE WORKER (Admin only)
// ==========================================
router.put('/workers/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { skills, isAvailable, phone } = req.body;

    const updateData = {};
    if (skills) updateData['workerProfile.skills'] = skills;
    if (isAvailable !== undefined) updateData['workerProfile.isAvailable'] = isAvailable;
    if (phone) updateData['workerProfile.phone'] = phone;

    const worker = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).select('-password');

    res.json({
      message: 'Worker updated successfully',
      worker
    });

  } catch (error) {
    console.error('Update worker error:', error);
    res.status(500).json({ error: 'Failed to update worker' });
  }
});

// ==========================================
// DELETE WORKER (Admin only)
// ==========================================
router.delete('/workers/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Worker deleted successfully' });

  } catch (error) {
    console.error('Delete worker error:', error);
    res.status(500).json({ error: 'Failed to delete worker' });
  }
});

// ==========================================
// GET STATISTICS - Dashboard stats (ADMIN)
// ==========================================
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    let stats = {};

    if (req.user.role === 'admin') {
      // Admin stats
      const totalRequests = await Request.countDocuments();
      const pending = await Request.countDocuments({ status: 'pending' });
      const inProgress = await Request.countDocuments({ status: 'in_progress' });
      const completed = await Request.countDocuments({ status: 'completed' });
      const workers = await User.countDocuments({ role: 'worker' });

      stats = { totalRequests, pending, inProgress, completed, workers };

    } else if (req.user.role === 'worker') {
      // Worker stats
      const total = await Request.countDocuments({ 
        assignedWorkerId: req.user.userId 
      });
      const assigned = await Request.countDocuments({ 
        assignedWorkerId: req.user.userId, 
        status: 'assigned' 
      });
      const inProgress = await Request.countDocuments({ 
        assignedWorkerId: req.user.userId, 
        status: 'in_progress' 
      });
      const completed = await Request.countDocuments({ 
        assignedWorkerId: req.user.userId, 
        status: 'completed' 
      });

      stats = { total, assigned, inProgress, completed };

    } else {
      // Client stats
      const total = await Request.countDocuments({ 
        clientId: req.user.userId 
      });
      const pending = await Request.countDocuments({ 
        clientId: req.user.userId, 
        status: 'pending' 
      });
      const inProgress = await Request.countDocuments({ 
        clientId: req.user.userId, 
        status: 'in_progress' 
      });
      const completed = await Request.countDocuments({ 
        clientId: req.user.userId, 
        status: 'completed' 
      });

      stats = { total, pending, inProgress, completed };
    }

    res.json({ stats });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

module.exports = router;