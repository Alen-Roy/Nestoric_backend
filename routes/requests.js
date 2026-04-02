// routes/requests.js - REQUEST MANAGEMENT ROUTES
// Create, read, update requests + chat messages

const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // built-in Node.js — no install needed
const Request = require('../models/Request');
const Message = require('../models/Message');
const User = require('../models/User');
const ServicePricing = require('../models/ServicePricing');
const PlanTier = require('../models/PlanTier');

const router = express.Router();
const { notify } = require('../utils/fcm');

// ==========================================
// RAZORPAY PAYMENT VERIFICATION HELPER
// ==========================================
function verifyRazorpayPayment(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RAZORPAY_KEY_SECRET is not set in environment variables');
    }
    console.warn('⚠️  RAZORPAY_KEY_SECRET not set — skipping verification (dev only)');
    return true;
  }

  const body = orderId + '|' + paymentId;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return expectedSignature === signature;
}

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
// GET WORKER'S ASSIGNED TASKS
// ==========================================
router.get('/my-tasks', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'worker') {
      return res.status(403).json({ success: false, error: 'Worker access only' });
    }

    const tasks = await Request.find({ assignedWorkerId: req.user.userId })
      .sort({ createdAt: -1 });

    res.json({ success: true, tasks, count: tasks.length });
  } catch (error) {
    console.error('Get my tasks error:', error);
    res.status(500).json({ success: false, error: 'Failed to get tasks' });
  }
});

// ==========================================
// GET CLIENT'S REQUESTS
// ==========================================
router.get('/my-requests', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'client') {
      return res.status(403).json({ success: false, error: 'Client access only' });
    }

    const requests = await Request.find({ clientId: req.user.userId })
      .sort({ createdAt: -1 });

    res.json({ success: true, requests, count: requests.length });
  } catch (error) {
    console.error('Get my requests error:', error);
    res.status(500).json({ success: false, error: 'Failed to get requests' });
  }
});

// ==========================================
// UPDATE TASK STATUS (Worker)
// ✅ FIX: now notifies the client on every status change
// ==========================================
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status, note } = req.body;

    const validStatuses = ['assigned', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    if (request.assignedWorkerId?.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, error: 'Not assigned to this task' });
    }

    const oldStatus = request.status;
    request.status = status;
    if (note) request.note = note;
    await request.save();

    // ── ✅ Notify client about status change ──────────────────────────────
    if (status !== oldStatus) {
      try {
        const statusLabels = {
          assigned:    'Assigned',
          in_progress: 'In Progress',
          completed:   'Completed ✅',
        };
        const svcStr = (request.services || []).slice(0, 2).join(', ');
        const client = await User.findById(request.clientId).select('_id fcmToken').lean();
        if (client) {
          await notify({
            userId:   client._id,
            title:    `Request ${statusLabels[status] || status}`,
            body:     `Your request for ${svcStr} is now ${statusLabels[status] || status}.`,
            type:     status === 'completed' ? 'request_completed' : 'status_updated',
            data:     { requestId: request._id.toString(), status },
            fcmToken: client.fcmToken,
          });
        }
      } catch (notifErr) {
        console.warn('Notify error (non-fatal):', notifErr.message);
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    res.json({ success: true, message: 'Status updated successfully', request });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

// ==========================================
// UPDATE TASK NOTE (Worker)
// ==========================================
router.put('/:id/note', authenticateToken, async (req, res) => {
  try {
    const { note } = req.body;

    if (!note || note.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Note cannot be empty' });
    }

    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    if (request.assignedWorkerId?.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, error: 'Not assigned to this task' });
    }

    request.note = note.trim();
    await request.save();

    res.json({ success: true, message: 'Note updated successfully', request });
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ success: false, error: 'Failed to update note' });
  }
});

// ==========================================
// CREATE REQUEST (Client)
// ✅ FIX: now also sends payment_received notification to admins
// ==========================================
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      services,
      description,
      deadline,
      paymentId,
      razorpayOrderId,
      razorpaySignature,
      amountPaid,
      plan,
    } = req.body;

    if (!services || services.length === 0) {
      return res.status(400).json({ error: 'Please select at least one service' });
    }

    if (!description || description.length < 20) {
      return res.status(400).json({ error: 'Description must be at least 20 characters' });
    }

    if (!paymentId) {
      return res.status(400).json({ error: 'Payment is required to submit a request' });
    }

    if (!razorpayOrderId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        error: 'Payment verification data is missing. Please try again.',
      });
    }

    const isValid = verifyRazorpayPayment(razorpayOrderId, paymentId, razorpaySignature);
    if (!isValid) {
      console.warn(`⚠️  Invalid Razorpay signature for paymentId: ${paymentId}`);
      return res.status(400).json({
        success: false,
        error: 'Payment verification failed. Please contact support.',
      });
    }

    // ── Server-side price validation ────────────────────────────────────
    let expectedAmount = 0;
    try {
      const pricingDocs = await ServicePricing.find({
        serviceName: { $in: services },
        isActive: true,
      });
      const baseTotal = pricingDocs.reduce((sum, p) => sum + (p.price || 0), 0);

      const selectedPlan = plan || 'basic';
      const tierDoc = await PlanTier.findOne({ tierId: selectedPlan.toLowerCase() });
      const multiplier = tierDoc ? tierDoc.multiplier : 1;

      const subtotal = baseTotal * multiplier;
      const gst = subtotal * 0.18;
      expectedAmount = Math.round(subtotal + gst);
    } catch (pricingErr) {
      console.error('Price calculation error:', pricingErr);
    }

    if (expectedAmount > 0 && amountPaid) {
      const diff = Math.abs(expectedAmount - amountPaid);
      if (diff > 100) {
        console.warn(
          `⚠️  Amount mismatch: expected ₹${expectedAmount}, got ₹${amountPaid} (diff: ₹${diff})`
        );
        return res.status(400).json({
          success: false,
          error: 'Payment amount does not match the expected price. Please try again.',
        });
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    const user = await User.findById(req.user.userId);
    const finalAmount = expectedAmount > 0 ? expectedAmount : (amountPaid || 0);

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
      amountPaid: finalAmount,
      paymentStatus: 'paid',
      plan: plan || 'basic',
    });

    // ── Notify admins: new request created ──────────────────────────────
    try {
      const admins = await User.find({ role: 'admin' }).select('_id fcmToken').lean();
      for (const admin of admins) {
        await notify({
          userId:   admin._id,
          title:    '📋 New Service Request',
          body:     `${user.fullName} submitted a request for ${services.slice(0, 2).join(', ')}${services.length > 2 ? '…' : ''}`,
          type:     'request_created',
          data:     { requestId: request._id.toString() },
          fcmToken: admin.fcmToken,
        });
      }
    } catch (notifErr) {
      console.warn('Request created notification error (non-fatal):', notifErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────

    // ── ✅ Notify admins: payment received ────────────────────────────────
    try {
      const admins = await User.find({ role: 'admin' }).select('_id fcmToken').lean();
      for (const admin of admins) {
        await notify({
          userId:   admin._id,
          title:    '💰 Payment Received',
          body:     `${user.fullName} paid ₹${finalAmount} for ${services.slice(0, 2).join(', ')}${services.length > 2 ? '…' : ''}`,
          type:     'payment_received',
          data:     { requestId: request._id.toString(), amount: String(finalAmount) },
          fcmToken: admin.fcmToken,
        });
      }
    } catch (notifErr) {
      console.warn('Payment received notification error (non-fatal):', notifErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────

    res.status(201).json({
      success: true,
      message: 'Request created successfully',
      request,
    });
  } catch (error) {
    console.error('Create request error:', error);
    res.status(500).json({ success: false, error: 'Failed to create request' });
  }
});

// ==========================================
// GET ALL REQUESTS (role-based)
// ==========================================
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'admin') {
      query = {};
    } else if (req.user.role === 'worker') {
      query = { assignedWorkerId: req.user.userId };
    } else {
      query = { clientId: req.user.userId };
    }

    const requests = await Request.find(query).sort({ createdAt: -1 });

    res.json({ success: true, requests, count: requests.length });
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ success: false, error: 'Failed to get requests' });
  }
});

// ==========================================
// GET SINGLE REQUEST
// ==========================================
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    const hasAccess =
      req.user.role === 'admin' ||
      request.clientId.toString() === req.user.userId ||
      request.assignedWorkerId?.toString() === req.user.userId;

    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, request });
  } catch (error) {
    console.error('Get request error:', error);
    res.status(500).json({ success: false, error: 'Failed to get request' });
  }
});

// ==========================================
// UPDATE REQUEST (Admin general update)
// — status change, worker assignment, notes
// ==========================================
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { status, note, uploadedFiles, assignedWorkerId } = req.body;

    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    const canUpdate =
      req.user.role === 'admin' ||
      request.assignedWorkerId?.toString() === req.user.userId;

    if (!canUpdate) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (note !== undefined) updateData.note = note;
    if (uploadedFiles) updateData.uploadedFiles = uploadedFiles;

    if (req.user.role === 'admin' && assignedWorkerId) {
      const worker = await User.findById(assignedWorkerId);
      if (worker) {
        updateData.assignedWorkerId  = assignedWorkerId;
        updateData.assignedWorkerName = worker.fullName;
        updateData.status = 'assigned';
      }
    }

    const oldStatus   = request.status;
    const oldAssigned = request.assignedWorkerId?.toString();

    const updatedRequest = await Request.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    // ── Push notifications ──────────────────────────────────────────────
    try {
      const statusLabels = {
        pending:     'Pending',
        assigned:    'Assigned',
        in_progress: 'In Progress',
        completed:   'Completed ✅',
        cancelled:   'Cancelled',
      };
      const svcStr = (updatedRequest.services || []).slice(0, 2).join(', ');

      // Notify client when status changes
      if (updateData.status && updateData.status !== oldStatus) {
        const client = await User.findById(updatedRequest.clientId).select('_id fcmToken').lean();
        if (client) {
          await notify({
            userId:   client._id,
            title:    `Request ${statusLabels[updateData.status] || updateData.status}`,
            body:     `Your request for ${svcStr} is now ${statusLabels[updateData.status] || updateData.status}.`,
            type:     updateData.status === 'completed' ? 'request_completed' : 'status_updated',
            data:     { requestId: updatedRequest._id.toString(), status: updateData.status },
            fcmToken: client.fcmToken,
          });
        }
      }

      // Notify worker when newly assigned
      if (updateData.assignedWorkerId && updateData.assignedWorkerId !== oldAssigned) {
        const worker = await User.findById(updateData.assignedWorkerId).select('_id fcmToken').lean();
        if (worker) {
          await notify({
            userId:   worker._id,
            title:    '🔧 New Task Assigned',
            body:     `You've been assigned a request for ${svcStr}.`,
            type:     'request_assigned',
            data:     { requestId: updatedRequest._id.toString() },
            fcmToken: worker.fcmToken,
          });
        }
      }
    } catch (notifErr) {
      console.warn('Notification error (non-fatal):', notifErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────

    res.json({ success: true, message: 'Request updated successfully', request: updatedRequest });
  } catch (error) {
    console.error('Update request error:', error);
    res.status(500).json({ success: false, error: 'Failed to update request' });
  }
});

// ==========================================
// DELETE REQUEST (Admin or Client)
// ==========================================
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    const canDelete =
      req.user.role === 'admin' ||
      request.clientId.toString() === req.user.userId;

    if (!canDelete) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await Request.findByIdAndDelete(req.params.id);

    try {
      await Message.deleteMany({ requestId: req.params.id });
    } catch (e) {
      console.log('Error deleting messages for request:', e.message);
    }

    res.json({ success: true, message: 'Request deleted successfully' });
  } catch (error) {
    console.error('Delete request error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete request' });
  }
});

// ==========================================
// SEND MESSAGE (via request route)
// ✅ FIX: now notifies all other participants
// ==========================================
router.post('/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { message, fileUrl, fileName, fileType } = req.body;

    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const userId           = req.user.userId;
    const isClient         = request.clientId.toString() === userId;
    const isAssignedWorker = request.assignedWorkerId && request.assignedWorkerId.toString() === userId;
    const isAdminRole      = req.user.role === 'admin';

    if (!isClient && !isAssignedWorker && !isAdminRole) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if ((!message || message.trim().length === 0) && !fileUrl) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    const user = await User.findById(req.user.userId);

    const newMessage = await Message.create({
      requestId:  req.params.id,
      senderId:   user._id,
      senderName: user.fullName,
      senderRole: req.user.role,
      message:    message ? message.trim() : '',
      fileUrl:    fileUrl  || null,
      fileName:   fileName || null,
      fileType:   fileType || null,
      isRead:     false,
    });

    // ── ✅ Notify all other participants ──────────────────────────────────
    try {
      const participantIds = [
        request.clientId?.toString(),
        request.assignedWorkerId?.toString(),
      ].filter(Boolean);

      const admins = await User.find({ role: 'admin' }).select('_id').lean();
      for (const a of admins) participantIds.push(a._id.toString());

      const uniqueOthers = [...new Set(participantIds)].filter((id) => id !== userId);

      const msgPreview = message && message.trim().length > 0
        ? (message.trim().length > 60 ? message.trim().slice(0, 57) + '…' : message.trim())
        : `📎 ${fileName || 'File'} shared`;

      for (const otherId of uniqueOthers) {
        const other = await User.findById(otherId).select('_id fcmToken').lean();
        if (other) {
          await notify({
            userId:   other._id,
            title:    `💬 New message from ${user.fullName}`,
            body:     msgPreview,
            type:     'new_message',
            data:     { requestId: req.params.id },
            fcmToken: other.fcmToken,
          });
        }
      }
    } catch (notifErr) {
      console.warn('Chat notification error (non-fatal):', notifErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────

    res.status(201).json({ success: true, message: 'Message sent successfully', data: newMessage });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, error: 'Failed to send message: ' + error.message });
  }
});

// ==========================================
// GET MESSAGES for a request
// ==========================================
router.get('/:id/messages', authenticateToken, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const userId           = req.user.userId;
    const isClient         = request.clientId.toString() === userId;
    const isAssignedWorker = request.assignedWorkerId && request.assignedWorkerId.toString() === userId;
    const isAdminRole      = req.user.role === 'admin';

    if (!isClient && !isAssignedWorker && !isAdminRole) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await Message.find({ requestId: req.params.id })
      .sort({ createdAt: 1 });

    res.json({ success: true, messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, error: 'Failed to get messages' });
  }
});

module.exports = router;