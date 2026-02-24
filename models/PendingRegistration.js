// models/PendingRegistration.js
// Temporary storage for registrations awaiting email verification.
// The actual User record is only created AFTER the email link is clicked.

const mongoose = require('mongoose');

const pendingRegistrationSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    passwordHash: {
        type: String,
        required: true,
    },
    fullName: {
        type: String,
        required: true,
        trim: true,
    },
    phone: {
        type: String,
        default: null,
    },
    token: {
        type: String,
        required: true,
        select: false,
    },
    // Automatically delete after 24 hours (MongoDB TTL index)
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
        index: { expires: 0 }, // TTL index — MongoDB deletes the doc when expiresAt is reached
    },
}, { timestamps: true });

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);
