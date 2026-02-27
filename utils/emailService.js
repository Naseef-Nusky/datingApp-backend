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

/**
 * Send notification when someone's profile is viewed.
 * This does NOT require an existing contact – any profile view can trigger it.
 * @param {string} to - Recipient email
 * @param {string} recipientName - Display name for greeting
 * @param {string} profileUrl - URL to open the recipient's profile/dashboard
 */
export const sendProfileViewNotificationEmail = async (to, recipientName, profileUrl) => {
  const appName = process.env.SMTP_FROM_NAME || 'Vantage Dating';
  const logoUrl = EMAIL_LOGO_URL;

  const safeName = recipientName || 'there';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 18px rgba(0,0,0,0.08); }
    .header { padding: 20px 24px 12px; border-bottom: 3px solid #E97672; }
    .logo { max-width: 160px; height: auto; }
    .content { padding: 22px 24px 28px; }
    h1 { margin: 0 0 12px; font-size: 26px; color: #1f2933; }
    p { margin: 0 0 12px; font-size: 15px; line-height: 1.6; }
    .cta {
      display: inline-block;
      margin-top: 18px;
      background: linear-gradient(to right, #5A2D8A, #B5458F, #E97672);
      color: #fff !important;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 15px;
    }
    .footer { padding: 18px 24px 22px; font-size: 12px; color: #8a8a8a; background: #f9fafb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${logoUrl}" alt="${appName}" class="logo" />
    </div>
    <div class="content">
      <h1>Someone just viewed your profile</h1>
      <p>Hi ${safeName},</p>
      <p>Your profile on ${appName} recently received a new visit. This is a great time to log in, update your details, or reach out to new matches.</p>
      <p>Staying active helps you appear more often in searches and recommendations, so don&apos;t miss the chance to connect.</p>
      <a class="cta" href="${profileUrl}">Open my profile</a>
    </div>
    <div class="footer">
      <p>This automatic notification was sent because a member viewed your profile on ${appName}.</p>
    </div>
  </div>
</body>
</html>
  `;

  return await sendEmail(
    to,
    'Your profile just got a new view',
    htmlContent,
    `Hi ${safeName}, someone just viewed your profile on ${appName}. Open your profile: ${profileUrl}`
  );
};

/**
 * Send "See Who Viewed Your Profile!" email when 4 new profiles have viewed.
 * @param {string} to - Recipient email
 * @param {string} recipientName - Display name for greeting (e.g. "tinki")
 * @param {Array<{ id: string, name: string, age?: number, photoUrl?: string, profileUrl: string }>} viewers - Up to 4 viewers
 */
export const sendProfileViewsBatchEmail = async (to, recipientName, viewers) => {
  const appName = process.env.SMTP_FROM_NAME || 'Vantage Dating';
  const logoUrl = EMAIL_LOGO_URL;
  const safeName = recipientName || 'there';
  const list = (viewers || []).slice(0, 4);

  const profileCards = list
    .map(
      (v) => `
    <div class="profile-card">
      <div class="profile-photo">
        <img src="${v.photoUrl || ''}" alt="${v.name || 'Profile'}" />
      </div>
      <p class="profile-name">${v.name || 'Someone'}${v.age != null ? `, ${v.age}` : ''}</p>
      <a class="profile-cta" href="${v.profileUrl || '#'}">View profile</a>
    </div>`
    )
    .join('');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; }
    .header { padding: 20px 24px 14px; border-bottom: 2px solid #e55b6a; }
    .logo { max-width: 140px; height: auto; display: block; }
    .content { padding: 24px 24px 28px; }
    h1 { margin: 0 0 16px; color: #1a1a1a; font-size: 26px; line-height: 1.2; font-weight: bold; }
    .greet { margin: 0 0 12px; font-size: 15px; }
    .intro { margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #444; }
    .profiles { display: table; width: 100%; border-collapse: separate; border-spacing: 12px 0; }
    .profile-card { display: table-cell; width: 25%; vertical-align: top; text-align: center; }
    .profile-photo { width: 100%; aspect-ratio: 1; overflow: hidden; border-radius: 8px; background: #e8e8e8; margin-bottom: 10px; }
    .profile-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .profile-name { margin: 0 0 10px; font-size: 14px; font-weight: 600; color: #333; }
    .profile-cta {
      display: inline-block;
      background: #d91d36;
      color: #fff !important;
      text-decoration: none;
      font-size: 12px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 6px;
    }
    .footer { padding: 16px 24px; background: #ebebeb; color: #777; font-size: 11px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${logoUrl}" alt="${appName}" class="logo" />
    </div>
    <div class="content">
      <h1>See Who Viewed Your Profile!</h1>
      <p class="greet">Hi ${safeName}!</p>
      <p class="intro">
        See who recently viewed your profile on ${appName}. Get in touch and see if they&apos;re interested now they&apos;ve seen your photos and read your details. Take the lead and ask them to chat!
      </p>
      <div class="profiles">${profileCards}</div>
    </div>
    <div class="footer">
      This notification was sent because members viewed your profile on ${appName}.
    </div>
  </div>
</body>
</html>
  `;

  return await sendEmail(
    to,
    'See Who Viewed Your Profile!',
    htmlContent,
    `Hi ${safeName}, ${list.length} people recently viewed your profile on ${appName}. View their profiles in the email.`
  );
};

/**
 * Send "X has added you to favorites/contacts" email when someone adds the recipient to contacts.
 * @param {string} to - Recipient email
 * @param {string} recipientName - Recipient display name
 * @param {Object} adder - { id, name, age?, photoUrl, profileUrl }
 */
export const sendAddedToContactsEmail = async (to, recipientName, adder) => {
  const appName = process.env.SMTP_FROM_NAME || 'Vantage Dating';
  const logoUrl = EMAIL_LOGO_URL;
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const adderName = adder?.name || 'Someone';
  const photoUrl = adder?.photoUrl || `${frontendUrl}/profile.png`;
  const profileUrl = adder?.profileUrl || `${frontendUrl}/profile/${adder?.id || ''}`;
  const ageStr = adder?.age != null ? `, ${adder.age}` : '';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; }
    .header { padding: 16px 24px; border-bottom: 2px solid #e55b6a; display: flex; align-items: center; justify-content: space-between; }
    .logo { max-width: 120px; height: auto; }
    .unsub { font-size: 12px; color: #666; }
    .content { padding: 24px 24px 28px; }
    .headline { margin: 0 0 8px; font-size: 24px; font-weight: bold; color: #2c2c2c; }
    .headline .highlight { color: #d91d36; }
    .subline { margin: 0 0 20px; font-size: 15px; color: #555; }
    .profile-card { border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; max-width: 280px; margin: 0 auto; }
    .profile-photo { width: 100%; aspect-ratio: 1; overflow: hidden; background: #e8e8e8; }
    .profile-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .profile-info { padding: 16px; text-align: center; }
    .profile-name { margin: 0 0 12px; font-size: 18px; font-weight: bold; color: #333; }
    .profile-cta { display: inline-block; background: #d91d36; color: #fff !important; text-decoration: none; font-weight: 600; font-size: 14px; padding: 10px 24px; border-radius: 6px; }
    .footer { padding: 14px 24px; background: #f0f0f0; color: #777; font-size: 11px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${logoUrl}" alt="${appName}" class="logo" />
      <span class="unsub">Unsubscribe here.</span>
    </div>
    <div class="content">
      <p class="headline">${adderName} has <span class="highlight">added you to favorites.</span></p>
      <p class="subline">Take the lead and chat first!</p>
      <div class="profile-card">
        <div class="profile-photo">
          <img src="${photoUrl}" alt="${adderName}" />
        </div>
        <div class="profile-info">
          <p class="profile-name">${adderName}${ageStr}</p>
          <a class="profile-cta" href="${profileUrl}">View profile</a>
        </div>
      </div>
    </div>
    <div class="footer">
      This notification was sent because someone added you to their contacts on ${appName}.
    </div>
  </div>
</body>
</html>
  `;

  return await sendEmail(
    to,
    `${adderName} has added you to favorites. 💕`,
    htmlContent,
    `Hi ${recipientName || ''}, ${adderName} has added you to favorites. View profile: ${profileUrl}`
  );
};

/**
 * Send "user came online" notification email to existing contacts.
 * @param {string} to - Recipient email
 * @param {string} recipientName - Recipient display name
 * @param {Object} onlineUser - { id, firstName, photoUrl }
 * @param {string} chatUrl - URL to open profile/chat
 */
export const sendUserOnlineNotificationEmail = async (to, recipientName, onlineUser, chatUrl) => {
  const appName = process.env.SMTP_FROM_NAME || 'Vantage Dating';
  const logoUrl = EMAIL_LOGO_URL;
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const onlineName = onlineUser?.firstName || 'Someone';
  const photoUrl = onlineUser?.photoUrl || `${frontendUrl}/profile.png`;
  const giftBannerUrl = process.env.EMAIL_GIFT_BANNER_URL || '';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #f5f5f5; }
    .top-bar { height: 6px; background: #c5e0f0; }
    .header { padding: 20px 24px 14px; background: #fff; border-bottom: 3px solid #e55b6a; }
    .logo { max-width: 140px; height: auto; display: block; }
    .content { padding: 24px 24px 28px; background: #fff; }
    h1 { margin: 0 0 20px; color: #2c2c2c; font-size: 28px; line-height: 1.2; font-weight: bold; }
    .online-card {
      background: #fff;
      border: 1px solid #d8d8d8;
      border-radius: 12px;
      overflow: hidden;
      display: table;
      width: 100%;
      margin-bottom: 20px;
    }
    .online-photo { display: table-cell; width: 40%; vertical-align: middle; background: #e8e8e8; }
    .online-photo img { width: 100%; height: 100%; display: block; object-fit: cover; min-height: 180px; }
    .online-info { display: table-cell; width: 60%; vertical-align: middle; padding: 20px 24px; }
    .name { margin: 0 0 8px; font-size: 22px; line-height: 1.2; color: #0056d6; font-weight: 600; }
    .sub { margin: 0 0 16px; color: #333; font-size: 14px; line-height: 1.3; }
    .cta {
      display: inline-block;
      background: #d91d36;
      color: #fff !important;
      text-decoration: none;
      font-weight: 700;
      font-size: 16px;
      line-height: 1;
      padding: 12px 28px;
      border-radius: 6px;
      white-space: nowrap;
    }
    .meet { margin: 0 0 4px; color: #666; font-size: 14px; }
    .meet strong { color: #333; }
    .gift-banner { margin: 18px auto 0; border-radius: 12px; overflow: hidden; display: block; width: 92%; max-width: 520px; }
    .gift-banner img { width: 100%; display: block; }
    .footer { padding: 18px 24px 24px; background: #ebebeb; color: #777; font-size: 12px; }
    .footer a { color: #0056d6; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="top-bar"></div>
    <div class="header">
      <img src="${logoUrl}" alt="${appName}" class="logo" />
    </div>
    <div class="content">
      <h1>${onlineName} is now online!</h1>
      <div class="online-card">
        <div class="online-photo">
          <img src="${photoUrl}" alt="${onlineName}" />
        </div>
        <div class="online-info">
          <p class="name">${onlineName}</p>
          <p class="sub">recently went online</p>
          <a class="cta" href="${chatUrl}">Chat Now</a>
        </div>
      </div>
      <p class="meet">Meet awesome people <strong>on ${appName}</strong></p>
      ${giftBannerUrl ? `<div class="gift-banner"><img src="${giftBannerUrl}" alt="Share virtual gifts" /></div>` : ''}
    </div>
    <div class="footer">
      If you would like to hear about bonuses, discounts and special offers from ${appName}, please add this address to your contacts list.
    </div>
  </div>
</body>
</html>
  `;

  return await sendEmail(
    to,
    `${onlineName} is now online`,
    htmlContent,
    `Hi ${recipientName || ''}, ${onlineName} is now online. Open chat: ${chatUrl}`
  );
};

export default {
  sendEmail,
  sendEmailNotification,
  sendLoginLinkEmail,
  sendUserOnlineNotificationEmail,
  sendProfileViewNotificationEmail,
  sendProfileViewsBatchEmail,
  sendAddedToContactsEmail,
};
