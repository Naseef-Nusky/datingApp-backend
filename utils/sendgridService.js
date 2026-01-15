import sgMail from '@sendgrid/mail';

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Get FROM email - must be verified in SendGrid
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_USER || 'noreply@datingapp.com';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'Dating Team';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Base email template wrapper
 */
const getBaseTemplate = (content, unsubscribeUrl = null) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { 
      font-family: Arial, sans-serif; 
      line-height: 1.6; 
      color: #333; 
      margin: 0; 
      padding: 0; 
      background-color: #f4f4f4;
    }
    .container { 
      max-width: 600px; 
      margin: 0 auto; 
      background: white;
    }
    .header { 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
      color: white; 
      padding: 30px 20px; 
      text-align: center; 
    }
    .header h1 { margin: 0; font-size: 24px; }
    .content { 
      padding: 30px 20px; 
    }
    .footer { 
      background: #f9f9f9; 
      padding: 20px; 
      text-align: center; 
      color: #666; 
      font-size: 12px; 
      border-top: 1px solid #eee;
    }
    .button { 
      display: inline-block; 
      background: #667eea; 
      color: white; 
      padding: 12px 30px; 
      text-decoration: none; 
      border-radius: 5px; 
      margin: 20px 0; 
      font-weight: bold;
    }
    .button:hover { background: #5568d3; }
    .profile-card {
      background: #f9f9f9;
      border-radius: 10px;
      padding: 20px;
      margin: 20px 0;
      display: flex;
      align-items: center;
      gap: 15px;
    }
    .profile-image {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      object-fit: cover;
    }
    .profile-info h3 {
      margin: 0 0 5px 0;
      color: #333;
    }
    .profile-info p {
      margin: 0;
      color: #666;
      font-size: 14px;
    }
    .message-preview {
      background: white;
      border-left: 4px solid #667eea;
      padding: 15px;
      margin: 20px 0;
      border-radius: 5px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin: 20px 0;
    }
    .stat-box {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 5px;
      text-align: center;
    }
    .stat-number {
      font-size: 24px;
      font-weight: bold;
      color: #667eea;
    }
    .stat-label {
      font-size: 12px;
      color: #666;
      margin-top: 5px;
    }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .stats-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Dating.com</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>This is an automated notification from Dating.com</p>
      ${unsubscribeUrl ? `<p><a href="${unsubscribeUrl}" style="color: #667eea;">Manage Email Preferences</a></p>` : ''}
      <p style="margin-top: 10px; font-size: 10px; color: #999;">
        Dating.com, 123 Main St, City, State 12345
      </p>
    </div>
  </div>
</body>
</html>
  `;
};

/**
 * Match Notification Template
 */
export const getMatchNotificationTemplate = (userName, matchData) => {
  const matchName = matchData.profile?.firstName || matchData.email?.split('@')[0] || 'Someone';
  const matchAge = matchData.profile?.age || '';
  const matchImage = matchData.profile?.profileImage || '';
  const matchBio = matchData.profile?.bio || 'Check out their profile!';
  const profileUrl = `${FRONTEND_URL}/profile/${matchData.id}`;

  const content = `
    <h2 style="color: #333; margin-top: 0;">You have a new match! 🎉</h2>
    <p>Hi ${userName},</p>
    <p>Great news! You have a new match with <strong>${matchName}</strong>!</p>
    
    <div class="profile-card">
      ${matchImage ? `<img src="${matchImage}" alt="${matchName}" class="profile-image">` : 
        `<div style="width: 80px; height: 80px; border-radius: 50%; background: #667eea; display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: bold;">${matchName.charAt(0).toUpperCase()}</div>`}
      <div class="profile-info">
        <h3>${matchName}${matchAge ? `, ${matchAge}` : ''}</h3>
        <p>${matchBio.substring(0, 100)}${matchBio.length > 100 ? '...' : ''}</p>
      </div>
    </div>
    
    <p>Start a conversation and see where it leads!</p>
    <a href="${profileUrl}" class="button">View Profile</a>
    <a href="${FRONTEND_URL}/inbox" class="button" style="background: #764ba2;">Send Message</a>
  `;

  return getBaseTemplate(content, `${FRONTEND_URL}/settings/email-preferences`);
};

/**
 * Message Notification Template
 */
export const getMessageNotificationTemplate = (userName, senderData, messageContent, messageId) => {
  const senderName = senderData.profile?.firstName || senderData.email?.split('@')[0] || 'Someone';
  const senderImage = senderData.profile?.profileImage || '';
  const messagePreview = messageContent.replace(/<[^>]*>/g, '').substring(0, 150);
  const inboxUrl = `${FRONTEND_URL}/inbox`;
  const replyUrl = `${FRONTEND_URL}/compose-email?to=${senderData.id}&replyTo=${messageId}`;

  const content = `
    <h2 style="color: #333; margin-top: 0;">New message from ${senderName} 💬</h2>
    <p>Hi ${userName},</p>
    <p>You have received a new message from <strong>${senderName}</strong>.</p>
    
    <div class="profile-card">
      ${senderImage ? `<img src="${senderImage}" alt="${senderName}" class="profile-image">` : 
        `<div style="width: 80px; height: 80px; border-radius: 50%; background: #667eea; display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: bold;">${senderName.charAt(0).toUpperCase()}</div>`}
      <div class="profile-info">
        <h3>${senderName}</h3>
        <p>Sent you a message</p>
      </div>
    </div>
    
    <div class="message-preview">
      <p style="margin: 0; color: #666;">"${messagePreview}${messageContent.length > 150 ? '...' : ''}"</p>
    </div>
    
    <a href="${inboxUrl}" class="button">Read this email</a>
    <a href="${replyUrl}" class="button" style="background: #764ba2;">Reply</a>
  `;

  return getBaseTemplate(content, `${FRONTEND_URL}/settings/email-preferences`);
};

/**
 * Profile View Notification Template
 */
export const getProfileViewNotificationTemplate = (userName, viewerData) => {
  const viewerName = viewerData.profile?.firstName || viewerData.email?.split('@')[0] || 'Someone';
  const viewerImage = viewerData.profile?.profileImage || '';
  const profileUrl = `${FRONTEND_URL}/profile/${viewerData.id}`;

  const content = `
    <h2 style="color: #333; margin-top: 0;">Someone viewed your profile 👀</h2>
    <p>Hi ${userName},</p>
    <p><strong>${viewerName}</strong> viewed your profile recently.</p>
    
    <div class="profile-card">
      ${viewerImage ? `<img src="${viewerImage}" alt="${viewerName}" class="profile-image">` : 
        `<div style="width: 80px; height: 80px; border-radius: 50%; background: #667eea; display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: bold;">${viewerName.charAt(0).toUpperCase()}</div>`}
      <div class="profile-info">
        <h3>${viewerName}</h3>
        <p>Viewed your profile</p>
      </div>
    </div>
    
    <p>Check out their profile and see if there's a connection!</p>
    <a href="${profileUrl}" class="button">View Profile</a>
  `;

  return getBaseTemplate(content, `${FRONTEND_URL}/settings/email-preferences`);
};

/**
 * Daily Digest Template
 */
export const getDailyDigestTemplate = (userName, stats) => {
  const { newMatches = 0, newMessages = 0, profileViews = 0, unreadMessages = 0 } = stats;

  const content = `
    <h2 style="color: #333; margin-top: 0;">Your Daily Dating Digest 📊</h2>
    <p>Hi ${userName},</p>
    <p>Here's what happened on Dating.com today:</p>
    
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-number">${newMatches}</div>
        <div class="stat-label">New Matches</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${newMessages}</div>
        <div class="stat-label">New Messages</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${profileViews}</div>
        <div class="stat-label">Profile Views</div>
      </div>
    </div>
    
    ${unreadMessages > 0 ? `
      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px;">
        <p style="margin: 0; font-weight: bold;">You have ${unreadMessages} unread message${unreadMessages > 1 ? 's' : ''}!</p>
      </div>
    ` : ''}
    
    <p>Don't miss out on potential connections!</p>
    <a href="${FRONTEND_URL}/dashboard" class="button">View Dashboard</a>
    <a href="${FRONTEND_URL}/inbox" class="button" style="background: #764ba2;">Check Inbox</a>
  `;

  return getBaseTemplate(content, `${FRONTEND_URL}/settings/email-preferences`);
};

/**
 * Send email using SendGrid
 */
export const sendEmail = async (to, subject, htmlContent, textContent = null, trackingData = {}) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.warn('⚠️ SendGrid API key not configured. Email will not be sent.');
      return { success: false, error: 'SendGrid not configured' };
    }

    // Validate FROM email is set and not default
    if (!FROM_EMAIL || FROM_EMAIL === 'noreply@datingapp.com') {
      console.error('❌ SendGrid FROM_EMAIL not configured. Please set SENDGRID_FROM_EMAIL in .env');
      return { 
        success: false, 
        error: 'FROM email not configured. Please set SENDGRID_FROM_EMAIL in .env file' 
      };
    }

    const msg = {
      to,
      from: {
        email: FROM_EMAIL,
        name: FROM_NAME,
      },
      subject,
      html: htmlContent,
      text: textContent || htmlContent.replace(/<[^>]*>/g, ''),
      trackingSettings: {
        clickTracking: { enable: true },
        openTracking: { enable: true },
      },
      customArgs: trackingData, // For webhook tracking
    };

    console.log('📧 [SendGrid] Sending email from:', FROM_EMAIL, 'to:', to);

    const [response] = await sgMail.send(msg);
    
    console.log('✅ Email sent successfully:', response.headers['x-message-id']);
    return { 
      success: true, 
      messageId: response.headers['x-message-id'],
      statusCode: response.statusCode,
    };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    if (error.response) {
      console.error('SendGrid error details:', error.response.body);
      
      // Check for sender verification error
      if (error.response.body?.errors) {
        const errors = error.response.body.errors;
        const fromError = errors.find(e => e.field === 'from');
        if (fromError) {
          const errorMsg = `❌ SENDER NOT VERIFIED: ${fromError.message}\n` +
            `📧 FROM Email: ${FROM_EMAIL}\n` +
            `🔗 Verify at: https://app.sendgrid.com/settings/sender_auth/senders/new\n` +
            `📖 Guide: See SENDGRID_VERIFICATION_STEPS.md`;
          console.error(errorMsg);
          return { 
            success: false, 
            error: `Sender email "${FROM_EMAIL}" is not verified in SendGrid. Please verify it first.`,
            helpUrl: 'https://app.sendgrid.com/settings/sender_auth/senders/new',
            details: fromError.message
          };
        }
      }
    }
    return { success: false, error: error.message };
  }
};

/**
 * Send match notification email
 */
export const sendMatchNotification = async (user, matchData) => {
  const userName = user.profile?.firstName || user.email?.split('@')[0] || 'User';
  const htmlContent = getMatchNotificationTemplate(userName, matchData);
  const subject = `You have a new match with ${matchData.profile?.firstName || 'Someone'}!`;
  
  return await sendEmail(
    user.email,
    subject,
    htmlContent,
    null,
    { notificationType: 'new_match', userId: user.id, matchId: matchData.id }
  );
};

/**
 * Send message notification email
 */
export const sendMessageNotification = async (user, senderData, messageContent, messageId) => {
  const userName = user.profile?.firstName || user.email?.split('@')[0] || 'User';
  const senderName = senderData.profile?.firstName || senderData.email?.split('@')[0] || 'Someone';
  const htmlContent = getMessageNotificationTemplate(userName, senderData, messageContent, messageId);
  const subject = `New message from ${senderName}`;
  
  return await sendEmail(
    user.email,
    subject,
    htmlContent,
    null,
    { notificationType: 'new_message', userId: user.id, messageId }
  );
};

/**
 * Send profile view notification email
 */
export const sendProfileViewNotification = async (user, viewerData) => {
  const userName = user.profile?.firstName || user.email?.split('@')[0] || 'User';
  const htmlContent = getProfileViewNotificationTemplate(userName, viewerData);
  const subject = 'Someone viewed your profile';
  
  return await sendEmail(
    user.email,
    subject,
    htmlContent,
    null,
    { notificationType: 'profile_view', userId: user.id, viewerId: viewerData.id }
  );
};

/**
 * Send daily digest email
 */
export const sendDailyDigest = async (user, stats) => {
  const userName = user.profile?.firstName || user.email?.split('@')[0] || 'User';
  const htmlContent = getDailyDigestTemplate(userName, stats);
  const subject = 'Your Daily Dating Digest';
  
  return await sendEmail(
    user.email,
    subject,
    htmlContent,
    null,
    { notificationType: 'daily_digest', userId: user.id }
  );
};

export default {
  sendEmail,
  sendMatchNotification,
  sendMessageNotification,
  sendProfileViewNotification,
  sendDailyDigest,
};
