// models/ServicePricing.js
// Stores admin-configurable prices for each service

const mongoose = require('mongoose');

const servicePricingSchema = new mongoose.Schema({
  serviceName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  isActive: {
    type: Boolean,
    default: true, // admin can hide a service by setting false
  },
}, {
  timestamps: true,
});

const ServicePricing = mongoose.model('ServicePricing', servicePricingSchema);

// ── Seed default prices if collection is empty ──
const DEFAULT_PRICES = [
  { serviceName: 'Mobile App Development', price: 4999 },
  { serviceName: 'Web Development',        price: 3999 },
  { serviceName: 'UI/UX Design',           price: 2499 },
  { serviceName: 'Cloud Solutions',        price: 3499 },
  { serviceName: 'DevOps',                 price: 2999 },
  { serviceName: 'Database Design',        price: 1999 },
  { serviceName: 'API Development',        price: 2499 },
  { serviceName: 'E-commerce',             price: 3499 },
  { serviceName: 'Digital Marketing',      price: 1499 },
  { serviceName: 'SEO Optimization',       price:  999 },
];

ServicePricing.seedDefaults = async () => {
  const count = await ServicePricing.countDocuments();
  if (count === 0) {
    await ServicePricing.insertMany(DEFAULT_PRICES);
    console.log('✅ Default service prices seeded');
  }
};

module.exports = ServicePricing;