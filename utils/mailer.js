// utils/mailer.js — Nodemailer transport for sending verification emails

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Send a verification email to a newly registered user.
 * @param {string} to  - Recipient email address
 * @param {string} token - The raw verification token
 */
async function sendVerificationEmail(to, token) {
    const verifyUrl = `${process.env.BACKEND_URL || 'https://nestoric-backend.onrender.com'}/api/auth/verify-email/${token}`;

    const mailOptions = {
        from: `"Nestoric" <${process.env.EMAIL_USER}>`,
        to,
        subject: 'Verify your Nestoric account',
        html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
          .container { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
          .header { background: linear-gradient(135deg, #6C63FF, #9C93FF); padding: 40px 32px; text-align: center; }
          .header h1 { color: #fff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
          .header p  { color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 15px; }
          .body { padding: 36px 32px; }
          .body p { color: #444; font-size: 15px; line-height: 1.6; margin: 0 0 20px; }
          .btn { display: inline-block; background: #6C63FF; color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 15px; }
          .footer { padding: 20px 32px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
          .expires { background: #f8f7ff; border: 1px solid #e0ddff; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #666; margin-top: 24px; }
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
            <p>Thanks for signing up! Tap the button below to verify your email address and activate your account.</p>
            <p style="text-align:center; margin: 32px 0;">
              <a class="btn" href="${verifyUrl}">Verify my email</a>
            </p>
            <div class="expires">
              ⏳ This link expires in <strong>24 hours</strong>. If you didn't create an account, you can safely ignore this email.
            </div>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} Nestoric. All rights reserved.<br/>
            <small>If the button doesn't work, paste this link in your browser:<br/>${verifyUrl}</small>
          </div>
        </div>
      </body>
      </html>
    `,
    };

    await transporter.sendMail(mailOptions);
}

module.exports = { sendVerificationEmail };
