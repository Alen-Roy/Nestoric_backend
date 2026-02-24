// utils/mailer.js — Email sending via Resend (HTTP API — works on Render)
// Render blocks outbound SMTP ports (465, 587), so we use Resend's REST API instead.

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send a verification email using Resend's HTTP API.
 * IMPORTANT: Resend SDK never throws — it returns { data, error }.
 * We must manually check the error field and throw so callers see failures.
 *
 * @param {string} to    - Recipient email address
 * @param {string} token - Raw verification token
 */
async function sendVerificationEmail(to, token) {
  const baseUrl = process.env.BACKEND_URL || 'https://nestoric-backend.onrender.com';
  const verifyUrl = `${baseUrl}/api/auth/verify-email/${token}`;

  const { data, error } = await resend.emails.send({
    from: 'Nestoric <onboarding@resend.dev>',  // Use resend.dev until you add your own domain
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

  // Resend SDK never throws — we must check the error field manually
  if (error) {
    console.error('[Resend] API returned error:', JSON.stringify(error, null, 2));
    throw new Error(error.message || 'Failed to send email via Resend');
  }

  console.log('[Resend] Email sent, id:', data?.id);
}

module.exports = { sendVerificationEmail };
