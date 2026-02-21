// routes/pricing.js
// Admin-controlled service pricing endpoints

const express = require('express');
const jwt = require('jsonwebtoken');
const ServicePricing = require('../models/ServicePricing');

const router = express.Router();

// ── Auth middleware ──────────────────────────────
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

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only' });
  }
  next();
};

// ════════════════════════════════════════════════
// GET /api/pricing  — public, used by payment page
// ════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const prices = await ServicePricing.find({ isActive: true }).sort({ serviceName: 1 });
    res.json({ success: true, prices });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch prices' });
  }
});

// ════════════════════════════════════════════════
// GET /api/pricing/all  — admin only, includes inactive
// ════════════════════════════════════════════════
router.get('/all', authenticateToken, adminOnly, async (req, res) => {
  try {
    const prices = await ServicePricing.find().sort({ serviceName: 1 });
    res.json({ success: true, prices });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch prices' });
  }
});

// ════════════════════════════════════════════════
// PUT /api/pricing/:id  — admin updates one price
// ════════════════════════════════════════════════
router.put('/:id', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { price, isActive } = req.body;

    if (price !== undefined && (isNaN(price) || price < 0)) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    const update = {};
    if (price !== undefined) update.price = price;
    if (isActive !== undefined) update.isActive = isActive;

    const updated = await ServicePricing.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Service not found' });

    res.json({ success: true, pricing: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update price' });
  }
});

// ════════════════════════════════════════════════
// POST /api/pricing  — admin adds a new service
// ════════════════════════════════════════════════
router.post('/', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { serviceName, price } = req.body;

    if (!serviceName || !serviceName.trim()) {
      return res.status(400).json({ error: 'Service name is required' });
    }
    if (price === undefined || isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'Valid price is required' });
    }

    const existing = await ServicePricing.findOne({ serviceName: serviceName.trim() });
    if (existing) {
      return res.status(400).json({ error: 'Service already exists' });
    }

    const pricing = await ServicePricing.create({
      serviceName: serviceName.trim(),
      price,
    });

    res.status(201).json({ success: true, pricing });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create service' });
  }
});

// ════════════════════════════════════════════════
// DELETE /api/pricing/:id  — admin removes a service
// ════════════════════════════════════════════════
router.delete('/:id', authenticateToken, adminOnly, async (req, res) => {
  try {
    await ServicePricing.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Service deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete service' });
  }
});

module.exports = router;