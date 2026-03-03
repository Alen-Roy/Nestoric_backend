// models/PlanTier.js
// Admin-configurable pricing tiers (Basic / Standard / Premium)
// These 3 documents are seeded once and then edited by admin — never deleted.

const mongoose = require('mongoose');

const planTierSchema = new mongoose.Schema({
    tierId: {
        type: String,
        required: true,
        unique: true,
        enum: ['basic', 'standard', 'premium'],
    },
    label: {
        type: String,
        required: true,
    },
    emoji: {
        type: String,
        required: true,
    },
    multiplier: {
        type: Number,
        required: true,
        min: 0.1,
    },
    color: {
        type: String,
        required: true, // hex color string, e.g. '#68D391'
    },
    perks: {
        type: [String],
        default: [],
    },
}, {
    timestamps: true,
});

const PlanTier = mongoose.model('PlanTier', planTierSchema);

// ── Seed defaults if collection is empty ──────────
const DEFAULT_TIERS = [
    {
        tierId: 'basic',
        label: 'Basic',
        emoji: '🌱',
        multiplier: 1.0,
        color: '#68D391',
        perks: ['Standard queue', '7-day delivery', 'Email updates'],
    },
    {
        tierId: 'standard',
        label: 'Standard',
        emoji: '⚡',
        multiplier: 1.5,
        color: '#63B3ED',
        perks: ['Priority queue', '3–4 day delivery', 'Chat support'],
    },
    {
        tierId: 'premium',
        label: 'Premium',
        emoji: '👑',
        multiplier: 2.5,
        color: '#8B7FD5',
        perks: ['Dedicated worker', '1–2 day express', '24/7 support'],
    },
];

PlanTier.seedDefaults = async () => {
    const count = await PlanTier.countDocuments();
    if (count === 0) {
        await PlanTier.insertMany(DEFAULT_TIERS);
        console.log('✅ Default plan tiers seeded');
    }
};

module.exports = PlanTier;
