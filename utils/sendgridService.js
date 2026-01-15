import sgMail from '@sendgrid/mail';

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Get FROM email - must be verified in SendGrid
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_USER || 'noreply@nexdating.com';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'Nexdating Team';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const LOGO_URL = 'https://nexdatingmedia.lon1.digitaloceanspaces.com/Logo/Logo.jpeg';

/**
 * Base email template wrapper
 */
const getBaseTemplate = (content, unsubscribeUrl = null) => {
  // Logo URL – served from DigitalOcean Spaces (use absolute URL)
  const logoUrl = LOGO_URL;

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
      background: #131926; 
      color: white; 
      padding: 30px 20px; 
      text-align: center; 
    }
    .header-logo {
      max-width: 220px;
      height: auto;
      margin: 0 auto 10px auto;
      display: block;
      width: auto;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    .header h1 { margin: 0; font-size: 22px; font-weight: 500; }
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
      background: #131926; 
      color: white !important; 
      padding: 12px 30px; 
      text-decoration: none; 
      border-radius: 5px; 
      margin: 20px 0; 
      font-weight: bold;
      box-shadow: 0 4px 15px rgba(19, 25, 38, 0.3);
      transition: all 0.3s ease;
    }
    .button:hover { 
      background: #0B1220; 
      color: white !important;
      box-shadow: 0 6px 20px rgba(19, 25, 38, 0.4);
      transform: translateY(-2px);
    }
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
      border-left: 4px solid #FF6B35;
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
      color: #FF6B35;
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
      <img src="${logoUrl}" alt="Nexdating.com" class="header-logo" style="max-width: 220px; height: auto; margin: 0 auto 10px auto; display: block; width: auto;" onerror="this.style.display='none';" />
      <h1 style="margin: 10px 0 0 0; font-size: 18px; font-weight: 400;">Your next date starts here.</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p style="margin: 0 0 5px 0; color: #4B5563;">Meet awesome people</p>
      <p style="margin: 0 0 15px 0; color: #4B5563; font-weight: 600;">on <strong>Nexdating.com</strong></p>
      ${unsubscribeUrl ? `<p style="margin-top: 15px;"><a href="${unsubscribeUrl}" style="color: #FF6B35; text-decoration: none;">Manage Email Preferences</a></p>` : ''}
      <p style="margin-top: 15px; font-size: 10px; color: #999;">
        This is an automated notification from Nexdating.com
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
        `<div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #FF6B35 0%, #FF1493 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: bold;">${matchName.charAt(0).toUpperCase()}</div>`}
      <div class="profile-info">
        <h3>${matchName}${matchAge ? `, ${matchAge}` : ''}</h3>
        <p>${matchBio.substring(0, 100)}${matchBio.length > 100 ? '...' : ''}</p>
      </div>
    </div>
    
    <p>Start a conversation and see where it leads!</p>
    <a href="${profileUrl}" class="button" style="color: white !important;">View Profile</a>
    <a href="${FRONTEND_URL}/inbox" class="button" style="background: #131926; color: white !important;">Send Message</a>
  `;

  return getBaseTemplate(content, `${FRONTEND_URL}/settings/email-preferences`);
};

/**
 * Message Notification Template
 */
export const getMessageNotificationTemplate = (userName, senderData, messageContent, messageId, mediaUrl = null) => {
  const senderName = senderData.profile?.firstName || senderData.email?.split('@')[0] || 'Someone';
  const senderAge = senderData.profile?.age || '';
  const senderBio = senderData.profile?.bio || '';
  // Get first photo from photos array
  const photos = senderData.profile?.photos;
  const senderImage = (photos && Array.isArray(photos) && photos.length > 0) 
    ? (photos[0]?.url || photos[0] || '') 
    : '';
  const messagePreview = messageContent.replace(/<[^>]*>/g, '').substring(0, 100);
  // Use absolute URLs for links
  const inboxUrl = `${FRONTEND_URL}/inbox`;
  const isImage = mediaUrl && (mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) || mediaUrl.includes('image'));
  const isVideo = mediaUrl && (mediaUrl.match(/\.(mp4|mov|avi|webm)$/i) || mediaUrl.includes('video'));

  const content = `
    <div style="margin-bottom: 30px;">
      <p style="font-size: 28px; font-weight: 400; color: #333; margin: 0 0 5px 0; line-height: 1.2;">
        ${userName}, you have a
      </p>
      <p style="font-size: 28px; font-weight: 700; color: #DC2626; margin: 0 0 5px 0; line-height: 1.2;">
        new
      </p>
      <p style="font-size: 28px; font-weight: 700; color: #DC2626; margin: 0 0 30px 0; line-height: 1.2;">
        email from:
      </p>
    </div>
    
    <div style="background: white; border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
      <div style="display: flex; gap: 15px; align-items: flex-start;">
        ${senderImage ? `
          <img src="${senderImage}" alt="${senderName}" style="width: 100px; height: 100px; border-radius: 8px; object-fit: cover; flex-shrink: 0;" />
        ` : `
          <div style="width: 100px; height: 100px; border-radius: 8px; background: linear-gradient(135deg, #FF6B35 0%, #FF1493 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 40px; font-weight: bold; flex-shrink: 0;">
            ${senderName.charAt(0).toUpperCase()}
          </div>
        `}
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <h3 style="font-size: 18px; font-weight: 600; color: #2563EB; margin: 0;">
              ${senderName}${senderAge ? `, ${senderAge}` : ''}
            </h3>
            <span style="background: #10B981; color: white; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px;">
              NEW
            </span>
          </div>
          <p style="font-size: 14px; color: #4B5563; margin: 0 0 8px 0; line-height: 1.5;">
            ${senderBio ? senderBio.substring(0, 80) + (senderBio.length > 80 ? '...' : '') : messagePreview + (messageContent.length > 100 ? '...' : '')}
          </p>
          <a href="${inboxUrl}" style="color: #2563EB; text-decoration: none; font-size: 14px; font-weight: 500;">
            Read more
          </a>
        </div>
      </div>
    </div>
    
    ${mediaUrl ? `
    <div style="margin: 20px 0; text-align: center;">
      ${isImage ? `
        <img src="${mediaUrl}" alt="Attachment" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
      ` : isVideo ? `
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
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${inboxUrl}" style="display: inline-block; background: #DC2626; color: white !important; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 6px rgba(220, 38, 38, 0.2);">
        Read this email
      </a>
    </div>
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
        `<div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #FF6B35 0%, #FF1493 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: bold;">${viewerName.charAt(0).toUpperCase()}</div>`}
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
    <h2 style="color: #333; margin-top: 0;">Your Nexdating Daily Digest 📊</h2>
    <p>Hi ${userName},</p>
    <p>Here's what happened on Nexdating.com today:</p>
    
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
    <a href="${FRONTEND_URL}/dashboard" class="button" style="color: white !important;">View Dashboard</a>
    <a href="${FRONTEND_URL}/inbox" class="button" style="background: #131926; color: white !important;">Check Inbox</a>
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

    // Validate FROM email is set
    if (!FROM_EMAIL) {
      console.error('❌ SendGrid FROM_EMAIL not configured. Please set SENDGRID_FROM_EMAIL in .env');
      return { 
        success: false, 
        error: 'FROM email not configured. Please set SENDGRID_FROM_EMAIL in .env file' 
      };
    }
    
    // Validate recipient email
    if (!to || !to.includes('@')) {
      console.error('❌ Invalid recipient email:', to);
      return { 
        success: false, 
        error: `Invalid recipient email: ${to}` 
      };
    }

    // Create plain text version for better deliverability
    const plainText = textContent || htmlContent
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();

    const msg = {
      to,
      from: {
        email: FROM_EMAIL,
        name: FROM_NAME,
      },
      subject,
      html: htmlContent,
      text: plainText,
      trackingSettings: {
        clickTracking: { enable: true },
        openTracking: { enable: true },
      },
      customArgs: trackingData, // For webhook tracking
      // Add headers to improve deliverability and reduce spam
      headers: {
        'X-Entity-Ref-ID': trackingData.messageId || trackingData.userId || 'email-notification',
      },
      // Add categories for better tracking
      categories: ['notification', 'message', trackingData.notificationType || 'general'],
      // Mail settings for better deliverability
      mailSettings: {
        sandboxMode: {
          enable: false, // Set to true for testing
        },
      },
      // Remove asm if groupId is 0 (invalid) - SendGrid will add unsubscribe automatically
      // asm: {
      //   groupId: 0, // Invalid - removed
      //   groupsToDisplay: [],
      // },
    };

    const sendStartTime = Date.now();
    console.log('📧 [SendGrid] ========== SENDING EMAIL NOW ==========');
    console.log('📧 [SendGrid] Timestamp:', new Date().toISOString());
    console.log('📧 [SendGrid] Sending email from:', FROM_EMAIL, 'to:', to);
    console.log('📧 [SendGrid] Subject:', subject);
    console.log('📧 [SendGrid] FROM_NAME:', FROM_NAME);
    console.log('📧 [SendGrid] Has HTML content:', !!htmlContent);
    console.log('📧 [SendGrid] Has text content:', !!plainText);
    console.log('📧 [SendGrid] HTML content length:', htmlContent?.length || 0);
    console.log('📧 [SendGrid] Plain text length:', plainText?.length || 0);

    // Send email IMMEDIATELY - no delays, no queues, synchronous
    console.log('📧 [SendGrid] Calling sgMail.send() NOW - this is synchronous and immediate');
    const [response] = await sgMail.send(msg);
    
    const sendDuration = Date.now() - sendStartTime;
    console.log('✅ [SendGrid] Email API call completed in', sendDuration, 'ms');
    console.log('✅ [SendGrid] Email has been SUBMITTED to SendGrid for immediate delivery');
    
    console.log('✅ [SendGrid] Status Code:', response.statusCode);
    console.log('✅ [SendGrid] Status Text:', response.statusText || 'N/A');
    
    const messageId = response.headers?.['x-message-id'] || response.headers?.['X-Message-Id'] || 'unknown';
    console.log('✅ [SendGrid] Message ID:', messageId);
    console.log('✅ [SendGrid] Email should be delivered within 1-5 seconds');
    
    if (response.headers) {
      console.log('✅ [SendGrid] Response headers keys:', Object.keys(response.headers));
    }
    
    // Return immediately - email is already sent to SendGrid
    return { 
      success: true, 
      messageId: messageId,
      statusCode: response.statusCode,
      sentAt: new Date().toISOString(), // Track when email was sent
    };
  } catch (error) {
    console.error('❌ [SendGrid] Error sending email:', error);
    console.error('❌ [SendGrid] Error name:', error.name);
    console.error('❌ [SendGrid] Error message:', error.message);
    
    if (error.response) {
      console.error('❌ [SendGrid] Response status:', error.response.statusCode);
      console.error('❌ [SendGrid] Response body:', JSON.stringify(error.response.body, null, 2));
      
      // Check for sender verification error
      if (error.response.body?.errors) {
        const errors = error.response.body.errors;
        console.error('❌ [SendGrid] Errors array:', JSON.stringify(errors, null, 2));
        
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
        
        // Log all errors
        errors.forEach(err => {
          console.error(`❌ [SendGrid] Error field: ${err.field}, message: ${err.message}`);
        });
      }
    } else {
      console.error('❌ [SendGrid] No response object in error');
      console.error('❌ [SendGrid] Error stack:', error.stack);
    }
    
    return { 
      success: false, 
      error: error.message || 'Unknown error sending email',
      details: error.response?.body || 'No additional details'
    };
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
export const sendMessageNotification = async (user, senderData, messageContent, messageId, mediaUrl = null) => {
  console.log('📧 [sendMessageNotification] Starting...');
  console.log('📧 [sendMessageNotification] User email:', user.email);
  console.log('📧 [sendMessageNotification] User ID:', user.id);
  console.log('📧 [sendMessageNotification] Sender data:', senderData.email);
  
  if (!user || !user.email) {
    console.error('❌ [sendMessageNotification] User or user.email is missing');
    return { success: false, error: 'User email is required' };
  }
  
  const userName = user.profile?.firstName || user.email?.split('@')[0] || 'User';
  const senderName = senderData.profile?.firstName || senderData.email?.split('@')[0] || 'Someone';
  
  console.log('📧 [sendMessageNotification] User name:', userName);
  console.log('📧 [sendMessageNotification] Sender name:', senderName);
  console.log('📧 [sendMessageNotification] Message content length:', messageContent?.length || 0);
  console.log('📧 [sendMessageNotification] Has media:', !!mediaUrl);
  
  const htmlContent = getMessageNotificationTemplate(userName, senderData, messageContent, messageId, mediaUrl);
  const subject = `New message from ${senderName}`;
  
  console.log('📧 [sendMessageNotification] Calling sendEmail...');
  const result = await sendEmail(
    user.email,
    subject,
    htmlContent,
    null,
    { notificationType: 'new_message', userId: user.id, messageId }
  );
  
  console.log('📧 [sendMessageNotification] Result:', result);
  return result;
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
