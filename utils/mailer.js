// utils/mailer.js — Email via Brevo (formerly Sendinblue) HTTP API
// Brevo's free tier (300 emails/day) sends to ANY email without domain verification.
// Uses Node's built-in https — no extra npm package needed.

const https = require('https');

/**
 * Send a verification email via Brevo's Transactional Email API.
 * @param {string} to    - Recipient email address
 * @param {string} token - Raw verification token
 */
async function sendVerificationEmail(to, token) {
  const baseUrl = process.env.BACKEND_URL || 'https://nestoric-backend.onrender.com';
  const verifyUrl = `${baseUrl}/api/auth/verify-email/${token}`;

  const payload = JSON.stringify({
    sender: {
      name: 'Nestoric',
      email: process.env.EMAIL_USER, // your Gmail — Brevo lets you use any sender
    },
    to: [{ email: to }],
    subject: 'Verify your Nestoric account',
    htmlContent: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
          .container { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
          .header { background: linear-gradient(135deg, #6C63FF, #9C93FF); padding: 40px 32px; text-align: center; }
          .header h1 { color: #fff; margin: 0; font-size: 28px; font-weight: 800; }
          .header p  { color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 15px; }
          .body { padding: 36px 32px; }
          .body p { color: #444; font-size: 15px; line-height: 1.6; margin: 0 0 20px; }
          .btn { display: inline-block; background: #6C63FF; color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 15px; }
          .footer { padding: 20px 32px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
          .note { background: #f8f7ff; border: 1px solid #e0ddff; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #666; margin-top: 24px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Nestoric</h1>
            <p>Digital Services Platform</p>
          </div>
          <div class="body">
            <p>Hi there 👋</p>
            <p>Thanks for signing up! Tap the button below to verify your email and activate your account.</p>
            <p style="text-align:center; margin: 32px 0;">
              <a class="btn" href="${verifyUrl}">Verify my email</a>
            </p>
            <div class="note">
              ⏳ This link expires in <strong>24 hours</strong>. If you didn't sign up, ignore this email.
            </div>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} Nestoric. All rights reserved.<br/>
            <small>If the button doesn't work: ${verifyUrl}</small>
          </div>
        </div>
      </body>
      </html>
    `,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('[Brevo] Email sent successfully, messageId:', JSON.parse(body).messageId);
          resolve();
        } else {
          const errMsg = `Brevo API error ${res.statusCode}: ${body}`;
          console.error('[Brevo] Error:', errMsg);
          reject(new Error(errMsg));
        }
      });
    });

    req.on('error', (err) => {
      console.error('[Brevo] Request error:', err.message);
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy(new Error('Brevo request timed out after 10s'));
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { sendVerificationEmail };
