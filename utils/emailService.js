import nodemailer from 'nodemailer';

// Logo URL for email templates (hosted on CDN so it loads reliably in email clients)
const EMAIL_LOGO_URL = process.env.EMAIL_LOGO_URL || 'https://nexdatingmedia.lon1.digitaloceanspaces.com/Logo/logonew.png';

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send email to actual email address
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML email content
 * @param {string} textContent - Plain text email content (optional)
 * @param {Array} attachments - Array of attachment objects (optional)
 * @returns {Promise} - Nodemailer send result
 */
export const sendEmail = async (to, subject, htmlContent, textContent = null, attachments = []) => {
  try {
    // Verify transporter configuration
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('⚠️ SMTP configuration missing. Email will not be sent.');
      return { success: false, error: 'SMTP not configured' };
    }

    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'Vantage Dating'}" <${process.env.SMTP_USER}>`,
      to: to,
      subject: subject,
      html: htmlContent,
      text: textContent || htmlContent.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      attachments: attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send email notification about new message
 * @param {Object} recipient - User object with email and profile
 * @param {Object} sender - User object with email and profile
 * @param {string} messageContent - Message content
 * @param {string} messageType - Type of message (email, text, etc.)
 * @returns {Promise}
 */
export const sendEmailNotification = async (recipient, sender, messageContent, messageType = 'email', mediaUrl = null) => {
  const senderName = sender.profile?.firstName 
    ? `${sender.profile.firstName}${sender.profile.lastName ? ' ' + sender.profile.lastName : ''}`
    : sender.email?.split('@')[0] || 'Someone';

  const subject = messageType === 'email' 
    ? `New email from ${senderName}`
    : `New message from ${senderName}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #FF6B35 0%, #FF1493 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .message-box { background: white; padding: 20px; border-left: 4px solid #FF6B35; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        .button { display: inline-block; background: #131926; color: white !important; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; font-weight: bold; box-shadow: 0 4px 15px rgba(19, 25, 38, 0.3); transition: all 0.3s ease; }
        .button:hover { background: #0B1220; color: white !important; box-shadow: 0 6px 20px rgba(19, 25, 38, 0.4); transform: translateY(-2px); }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="${EMAIL_LOGO_URL}" alt="Vantage Dating" style="max-width: 200px; height: auto; margin-bottom: 10px;" />
          <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">Your next date starts here.</p>
          <h1 style="margin-top: 15px;">${messageType === 'email' ? '📧 New Email' : '💬 New Message'}</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>You have received a ${messageType === 'email' ? 'new email' : 'new message'} from <strong>${senderName}</strong>.</p>
          <div class="message-box">
            <p>${messageContent}</p>
          </div>
          ${mediaUrl ? `
          <div style="margin: 20px 0; text-align: center;">
            ${mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) || mediaUrl.includes('image') ? `
              <img src="${mediaUrl}" alt="Attachment" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
            ` : mediaUrl.match(/\.(mp4|mov|avi|webm)$/i) || mediaUrl.includes('video') ? `
              <video src="${mediaUrl}" controls style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                Your browser does not support the video tag.
              </video>
            ` : `
              <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; border: 2px dashed #FF6B35;">
                <p style="margin: 0; color: #666;">📎 Attachment included</p>
                <a href="${mediaUrl}" style="color: #FF6B35; text-decoration: none; font-weight: bold; display: inline-block; margin-top: 10px;">Download Attachment</a>
              </div>
            `}
          </div>
          ` : ''}
          <p>Log in to your account to read and reply.</p>
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/inbox" class="button" style="text-decoration: none;">View Message</a>
          </div>
        </div>
        <div class="footer">
          <p>This is an automated notification from Vantage Dating.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail(recipient.email, subject, htmlContent);
};

/**
 * Send magic login link email (email-based login)
 * @param {string} to - Recipient email
 * @param {string} firstName - Display name (e.g. from email or profile)
 * @param {string} loginUrl - Full URL to click to log in
 * @param {string} userId - User ID for footer
 */
export const sendLoginLinkEmail = async (to, firstName, loginUrl, userId = '') => {
  const appName = process.env.SMTP_FROM_NAME || 'Vantage Dating';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const logoUrl = EMAIL_LOGO_URL;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 3px solid #E97672; padding-bottom: 15px; margin-bottom: 20px; }
    .logo { max-width: 180px; height: auto; }
    .login-link { color: #5A2D8A; text-decoration: none; }
    .button { display: inline-block; background: linear-gradient(to right, #5A2D8A, #B5458F, #E97672); color: #fff !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
    .footer a { color: #5A2D8A; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${logoUrl}" alt="${appName}" class="logo" />
    </div>
    <p style="font-size: 18px; font-weight: bold;">Hello, ${firstName}!</p>
    <p>You have requested a login link to access your ${appName} account.</p>
    <p>Please follow your <a href="${loginUrl}" class="login-link">link to log in</a>.</p>
    <p style="text-align: center;">
      <a href="${loginUrl}" class="button">Continue and Log in</a>
    </p>
    <p style="font-size: 12px; color: #666;">If you didn't request this, you can ignore this email.</p>
    <div class="footer">
      <p>If you would like to hear about bonuses and special offers, please add this address to your contacts.</p>
      <p>Your ID: ${userId || '—'}</p>
      <p><a href="${frontendUrl}/terms">Terms</a> · <a href="${frontendUrl}/terms#privacy">Privacy Policy</a> · <a href="${frontendUrl}/terms#refund">Refund and Cancellation Policy</a></p>
      <p><a href="${frontendUrl}/terms#unsubscribe">Unsubscribe here</a></p>
    </div>
  </div>
</body>
</html>
  `;

  return await sendEmail(to, `Log in to ${appName}`, htmlContent);
};

export default { sendEmail, sendEmailNotification, sendLoginLinkEmail };
