// utils/fcm.js — Firebase Cloud Messaging via firebase-admin
'use strict';

let _adminApp = null;          // the initialized FirebaseApp (not the module)
let _initAttempted = false;    // only try once per process lifecycle

function getApp() {
  if (_adminApp) return _adminApp;
  if (_initAttempted) return null;   // already failed — don't retry every call
  _initAttempted = true;

  try {
    const admin = require('firebase-admin');

    // Parse private key — dotenv may leave literal "\n" sequences
    const rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
    const privateKey = rawKey
      .replace(/^"|"$/g, '')          // strip surrounding quotes if any
      .replace(/\\n/g, '\n');         // convert escaped newlines

    if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
      console.warn('⚠️  FCM: Missing Firebase Admin env vars — push notifications disabled.');
      console.warn('   Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
      return null;
    }

    // Reuse an existing app (handles hot-reload in dev)
    if (admin.apps.length > 0) {
      _adminApp = admin.apps[0];
      console.log('✅ FCM: Reusing existing Firebase Admin app');
      return _adminApp;
    }

    _adminApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });

    console.log('✅ FCM: Firebase Admin SDK initialized');
    return _adminApp;

  } catch (err) {
    console.error('❌ FCM: Failed to initialize Firebase Admin SDK:', err.message);
    console.error('   Make sure firebase-admin is in package.json and installed (npm install)');
    return null;
  }
}

/**
 * Send a push notification to one FCM device token.
 * Never throws — errors are logged and silently swallowed.
 */
async function sendPush(fcmToken, title, body, data = {}) {
  if (!fcmToken || !fcmToken.trim()) return;

  const app = getApp();
  if (!app) return;

  // FCM requires all data values to be strings
  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null) stringData[k] = String(v);
  }

  try {
    const admin = require('firebase-admin');
    await admin.messaging(app).send({
      token: fcmToken,
      notification: { title, body },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channelId: 'nexify_default',
          sound:     'default',
          defaultVibrateTimings: true,
          notificationCount: 1,
        },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            badge: 1,
            'content-available': 1,
          },
        },
      },
    });

    console.log(`📤 Push sent → …${fcmToken.slice(-10)}: "${title}"`);

  } catch (err) {
    console.warn(`⚠️  FCM send failed (…${fcmToken.slice(-10)}): ${err.message}`);

    // Stale token — remove from DB so we don't keep trying
    if (
      err.code === 'messaging/registration-token-not-registered' ||
      err.code === 'messaging/invalid-registration-token' ||
      err.code === 'messaging/invalid-argument'
    ) {
      try {
        const User = require('../models/User');
        await User.updateOne({ fcmToken }, { $unset: { fcmToken: '' } });
        console.log('   Stale FCM token removed from DB.');
      } catch (_) {}
    }
  }
}

/**
 * Save a notification to the DB and optionally push it to the device.
 *
 * @param {object} opts
 * @param {string|ObjectId} opts.userId   — recipient user _id
 * @param {string}          opts.title    — notification title
 * @param {string}          opts.body     — notification body
 * @param {string}          [opts.type]   — one of the type enum values
 * @param {object}          [opts.data]   — extra payload (all values stringified for push)
 * @param {string}          [opts.fcmToken] — device token; skip push if omitted/null
 */
async function notify({ userId, title, body, type = 'status_updated', data = {}, fcmToken }) {
  // Always persist to DB so in-app notification list works even without push
  try {
    const Notification = require('../models/Notification');
    await Notification.create({ userId, title, body, type, data });
  } catch (err) {
    console.error('Failed to save notification to DB:', err.message);
  }

  // Attempt push (non-blocking — never awaited at call sites that don't care)
  if (fcmToken) {
    await sendPush(fcmToken, title, body, { type, ...data });
  }
}

module.exports = { notify, sendPush };
