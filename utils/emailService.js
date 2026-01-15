import nodemailer from 'nodemailer';

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
      from: `"${process.env.SMTP_FROM_NAME || 'Dating App'}" <${process.env.SMTP_USER}>`,
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
export const sendEmailNotification = async (recipient, sender, messageContent, messageType = 'email') => {
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
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .message-box { background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${messageType === 'email' ? '📧 New Email' : '💬 New Message'}</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>You have received a ${messageType === 'email' ? 'new email' : 'new message'} from <strong>${senderName}</strong>.</p>
          <div class="message-box">
            <p>${messageContent}</p>
          </div>
          <p>Log in to your account to read and reply.</p>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/inbox" class="button">View Message</a>
        </div>
        <div class="footer">
          <p>This is an automated notification from Dating App.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail(recipient.email, subject, htmlContent);
};

export default { sendEmail, sendEmailNotification };
