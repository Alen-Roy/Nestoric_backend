// routes/notifications.js
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Notification = require('../models/Notification');

const router = express.Router();

// ── Auth middleware ──────────────────────────────────────────────────────────
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// POST /api/notifications/register-token
// Save / update the device FCM token for this user
// ════════════════════════════════════════════════════════════════════════════
router.post('/register-token', authenticateToken, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ error: 'fcmToken is required' });

    await User.findByIdAndUpdate(req.user.userId, { fcmToken });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to register token' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/notifications
// List notifications for the authenticated user (newest first, max 50)
// ════════════════════════════════════════════════════════════════════════════
router.get('/', authenticateToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = await Notification.countDocuments({
      userId: req.user.userId,
      isRead: false,
    });

    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PUT /api/notifications/read-all
// Mark all notifications as read for the authenticated user
// ════════════════════════════════════════════════════════════════════════════
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.userId, isRead: false },
      { $set: { isRead: true } },
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to mark as read' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PUT /api/notifications/:id/read
// Mark a single notification as read
// ════════════════════════════════════════════════════════════════════════════
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { $set: { isRead: true } },
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to mark as read' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// DELETE /api/notifications/:id
// Delete a single notification
// ════════════════════════════════════════════════════════════════════════════
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete notification' });
  }
});

module.exports = router;
