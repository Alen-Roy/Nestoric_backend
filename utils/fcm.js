// utils/fcm.js — Firebase Cloud Messaging helper
// Uses the Firebase Admin SDK (already in Firebase project) to send push
// notifications. Falls back silently if the SDK is not configured.

let admin = null;

function getAdmin() {
  if (admin) return admin;
  try {
    admin = require('firebase-admin');
    if (!admin.apps.length) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

      if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
        console.warn('⚠️  FCM: Firebase Admin env vars missing — push notifications disabled.');
        admin = null;
        return null;
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey,
        }),
      });
    }
    return admin;
  } catch (e) {
    console.warn('⚠️  FCM: firebase-admin not installed —', e.message);
    admin = null;
    return null;
  }
}

/**
 * Send a push notification to a single FCM token.
 * Silently ignores errors so the main request flow is never blocked.
 *
 * @param {string}  fcmToken  - Device token saved on login
 * @param {string}  title     - Notification title
 * @param {string}  body      - Notification body text
 * @param {object}  data      - Extra key-value payload (all values must be strings)
 */
async function sendPush(fcmToken, title, body, data = {}) {
  if (!fcmToken) return;
  const a = getAdmin();
  if (!a) return;

  // Convert all data values to strings (FCM requirement)
  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = String(v);
  }

  try {
    await a.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channelId: 'nexify_default',
          sound: 'default',
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    });
  } catch (err) {
    // Token might be stale — log but don't crash
    console.warn(`FCM send failed for token …${fcmToken.slice(-8)}: ${err.message}`);
    // If the token is invalid, clear it from the DB
    if (
      err.code === 'messaging/registration-token-not-registered' ||
      err.code === 'messaging/invalid-registration-token'
    ) {
      try {
        const User = require('../models/User');
        await User.updateOne({ fcmToken }, { $unset: { fcmToken: '' } });
      } catch (_) {}
    }
  }
}

/**
 * Create a DB notification record AND send a push if the user has a token.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} opts.type
 * @param {object} opts.data
 * @param {string} [opts.fcmToken]
 */
async function notify({ userId, title, body, type = 'status_updated', data = {}, fcmToken }) {
  // 1. Always save to DB (in-app notification history)
  try {
    const Notification = require('../models/Notification');
    await Notification.create({ userId, title, body, type, data });
  } catch (e) {
    console.error('Failed to save notification:', e.message);
  }

  // 2. Send push if we have a token
  if (fcmToken) {
    await sendPush(fcmToken, title, body, { type, ...data });
  }
}

module.exports = { notify, sendPush };
