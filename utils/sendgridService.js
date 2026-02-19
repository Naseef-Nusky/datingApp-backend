import sgMail from '@sendgrid/mail';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Get FROM email - must be verified in SendGrid
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_USER || 'noreply@vantagedating.com';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'Vantage Dating Team';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
// Logo URL for SendGrid emails (DigitalOcean Spaces); override with SENDGRID_LOGO_URL or PUBLIC_LOGO_URL if needed
const LOGO_URL = process.env.SENDGRID_LOGO_URL || process.env.PUBLIC_LOGO_URL || 'https://nexdatingmedia.lon1.digitaloceanspaces.com/Logo/logonew.png';
// Lock icon URL for attachment thumbnails in SendGrid emails (DigitalOcean Spaces)
const LOCK_ICON_URL = 'https://nexdatingmedia.lon1.digitaloceanspaces.com/Icons/lock_icon.png';
// Video thumbnail image for video attachments in SendGrid emails
const VIDEO_THUMBNAIL_URL = 'https://nexdatingmedia.lon1.digitaloceanspaces.com/Icons/video_thumbnail.png';

// Embed logo: try multiple paths; use CID attachment so it shows in all email clients
let LOGO_BASE64 = '';
const logoPaths = [
  path.join(__dirname, '..', '..', 'frontend', 'public', 'logonew.png'),
  path.join(process.cwd(), 'frontend', 'public', 'logonew.png'),
  path.join(process.cwd(), 'logonew.png'),
];
for (const logoPath of logoPaths) {
  try {
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      LOGO_BASE64 = logoBuffer.toString('base64');
      break;
    }
  } catch (e) {
    continue;
  }
}
if (!LOGO_BASE64) {
  console.warn('[SendGrid] Logo file not found at any path, emails will use URL fallback.');
}

// Lock icon for attachment thumbnails (same as in-app email composer)
let LOCK_ICON_BASE64 = '';
const lockIconPaths = [
  path.join(__dirname, '..', '..', 'frontend', 'public', 'lock_icon.png'),
  path.join(process.cwd(), 'frontend', 'public', 'lock_icon.png'),
  path.join(process.cwd(), 'lock_icon.png'),
];
for (const p of lockIconPaths) {
  try {
    if (fs.existsSync(p)) {
      LOCK_ICON_BASE64 = fs.readFileSync(p).toString('base64');
      break;
    }
  } catch (e) {
    continue;
  }
}
if (!LOCK_ICON_BASE64) {
  console.warn('[SendGrid] Lock icon file not found, attachment thumbnails will use SVG fallback.');
}

/**
 * Base email template wrapper
 */
const getBaseTemplate = (content, unsubscribeUrl = null) => {
  // Use logo URL (DigitalOcean Spaces) so it loads reliably in email clients
  const logoSrc = LOGO_URL;

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
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0 auto;"><tr><td align="center" style="padding: 0 0 10px 0;">
        <img src="${logoSrc}" alt="Vantage Dating" class="header-logo" width="220" height="auto" style="max-width: 220px; height: auto; display: block; width: auto; border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic;" />
      </td></tr></table>
      <h1 style="margin: 10px 0 0 0; font-size: 18px; font-weight: 400;">Your next date starts here.</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p style="margin: 0 0 5px 0; color: #4B5563;">Meet awesome people</p>
      <p style="margin: 0 0 15px 0; color: #4B5563; font-weight: 600;">on <strong>Vantage Dating</strong></p>
      ${unsubscribeUrl ? `<p style="margin-top: 15px;"><a href="${unsubscribeUrl}" style="color: #FF6B35; text-decoration: none;">Manage Email Preferences</a></p>` : ''}
      <p style="margin-top: 15px; font-size: 10px; color: #999;">
        This is an automated notification from Vantage Dating
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
 * @param {Object} opts - { attachments, creditCosts, senderId, frontendUrl } - frontendUrl overrides FRONTEND_URL so email links use correct origin/port
 */
export const getMessageNotificationTemplate = (userName, senderData, messageContent, messageId, mediaUrl = null, opts = {}) => {
  const baseUrl = (opts.frontendUrl || FRONTEND_URL || '').replace(/\/$/, '') || 'http://localhost:3000';
  const senderName = senderData.profile?.firstName || senderData.email?.split('@')[0] || 'Someone';
  const senderAge = senderData.profile?.age || '';
  const senderBio = senderData.profile?.bio || '';
  const photos = senderData.profile?.photos;
  const senderImage = (photos && Array.isArray(photos) && photos.length > 0) 
    ? (photos[0]?.url || photos[0] || '') 
    : '';
  const messagePreview = (messageContent || '').replace(/<[^>]*>/g, '').substring(0, 100);
  const inboxUrl = `${baseUrl}/inbox`;
  const inboxUrlWithMessage = messageId ? `${baseUrl}/inbox?messageId=${encodeURIComponent(messageId)}` : inboxUrl;
  const profileUrl = opts.senderId ? `${baseUrl}/profile/${opts.senderId}` : inboxUrl;
  // Normalize attachments (may be array or JSON string from DB)
  let attachments = opts.attachments;
  if (!Array.isArray(attachments)) {
    if (typeof attachments === 'string') {
      try {
        attachments = JSON.parse(attachments) || [];
      } catch (_) {
        attachments = [];
      }
    } else {
      attachments = [];
    }
  }
  const photoCost = opts.creditCosts?.photoViewCredits ?? 15;
  const videoCost = opts.creditCosts?.videoViewCredits ?? opts.creditCosts?.photoViewCredits ?? 15;
  const voiceCost = opts.creditCosts?.voiceMessageCredits ?? 10;
  const hasPhotos = attachments.some((a) => a.type === 'photo');
  const hasVideos = attachments.some((a) => a.type === 'video');
  const hasVoice = attachments.some((a) => a.type === 'voice');
  const attachmentLabelParts = [hasPhotos && 'photos', hasVideos && 'videos', hasVoice && 'voice messages'].filter(Boolean);
  const attachmentSectionTitle = attachmentLabelParts.length
    ? 'Attached ' + attachmentLabelParts.join(', ').replace(/, ([^,]*)$/, ' and $1') + ':'
    : 'Attachments:';

  const content = `
    <div style="margin-bottom: 30px;">
      <p style="font-size: 26px; font-weight: 400; color: #333; margin: 0 0 30px 0; line-height: 1.3;">
        ${userName}, you have a <strong style="color: #DC2626; font-weight: 700;">new</strong> <strong style="color: #DC2626; font-weight: 700;">email</strong> from:
      </p>
    </div>
    
    <div style="background: white; border: 1px solid #E5E7EB; border-radius: 12px; padding: 20px; margin-bottom: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      <div style="display: flex; gap: 15px; align-items: flex-start;">
        ${senderImage ? `
          <img src="${senderImage}" alt="${senderName}" style="width: 100px; height: 100px; border-radius: 12px; object-fit: cover; flex-shrink: 0;" />
        ` : `
          <div style="width: 100px; height: 100px; border-radius: 12px; background: linear-gradient(135deg, #FF6B35 0%, #FF1493 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 40px; font-weight: bold; flex-shrink: 0;">
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
            ${senderBio ? senderBio.substring(0, 80) + (senderBio.length > 80 ? '...' : '') : messagePreview + ((messageContent || '').replace(/<[^>]*>/g, '').length > 100 ? '...' : '')}
          </p>
          <a href="${inboxUrl}" style="color: #2563EB; text-decoration: underline; font-size: 14px; font-weight: 500;">
            Read more
          </a>
          ${opts.senderId ? `<br/><a href="${profileUrl}" style="color: #2563EB; text-decoration: underline; font-size: 14px; font-weight: 500;">Open profile</a>` : ''}
        </div>
      </div>
    </div>
    
    ${attachments.length > 0 ? `
    <div style="margin-bottom: 16px;">
    <p style="font-size: 16px; font-weight: 600; color: #333; margin: 0 0 12px 0;">${attachmentSectionTitle}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 0;"><tr>
      ${attachments.map((a) => {
        const isPhoto = a.type === 'photo' && a.url;
        const isVideo = a.type === 'video';
        const isVoice = a.type === 'voice';
        const videoThumbUrl = isVideo && (a.thumbnailUrl || a.thumbnail_url || a.posterUrl);
        const videoBgUrl = isVideo ? (videoThumbUrl || VIDEO_THUMBNAIL_URL) : '';
        const hasImageBg = (isPhoto && a.url) || (isVideo && videoBgUrl);
        const imageUrl = isPhoto ? (a.url || '') : videoBgUrl;
        const safeImageUrl = (imageUrl || '').replace(/'/g, '%27');
        const bgColor = isPhoto ? '#ffffff' : (isVideo ? '#e5e7eb' : '#e5e7eb');
        const bgStyle = hasImageBg && safeImageUrl
          ? `background-image: linear-gradient(rgba(255,255,255,0.7), rgba(255,255,255,0.7)), url('${safeImageUrl}'); background-size: cover; background-position: center; background-color: ${bgColor}; filter: blur(6px); -webkit-filter: blur(6px);`
          : `background-color: ${bgColor};`;
        const playIcon = isVoice ? '<span style="font-size: 20px; color: #6b7280; line-height: 1;">&#9654;</span>' : '';
        return `<td style="padding: 4px; vertical-align: top;"><a href="${inboxUrlWithMessage}" style="text-decoration: none; display: block;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 72px; height: 72px; border: 1px solid #D1D5DB; border-radius: 8px; ${bgStyle}"><tr><td align="center" style="vertical-align: middle; padding: 0;">${playIcon}<img src="${LOCK_ICON_URL}" width="28" height="28" alt="" style="display: block; border: 0; margin: 4px auto 0 auto;" /></td></tr></table></a></td>`;
      }).join('')}
    </tr></table>
    </div>
    ${hasPhotos ? `<p style="font-size: 13px; color: #6B7280; margin: 0 0 4px 0;">Viewing photo is billed at ${photoCost} Credits</p>` : ''}
    ${hasVideos ? `<p style="font-size: 13px; color: #6B7280; margin: 0 0 4px 0;">Viewing video is billed at ${videoCost} Credits</p>` : ''}
    ${hasVoice ? `<p style="font-size: 13px; color: #6B7280; margin: 0 0 16px 0;">Listening voice messages is billed at ${voiceCost} Credits</p>` : ''}
    ` : ''}
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${inboxUrlWithMessage}" style="display: inline-block; background: #DC2626; color: white !important; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 6px rgba(220, 38, 38, 0.2);">
        Read for FREE
      </a>
    </div>
  `;

  return getBaseTemplate(content, `${baseUrl}/settings/email-preferences`);
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
    <h2 style="color: #333; margin-top: 0;">Your Vantage Dating Daily Digest 📊</h2>
    <p>Hi ${userName},</p>
    <p>Here's what happened on Vantage Dating today:</p>
    
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
 * "X is now online!" notification email (like dating.com – profile card, Chat Now, virtual gifts banner)
 */
export const getOnlineNotificationTemplate = (onlineUserData) => {
  const name = onlineUserData.profile?.firstName
    ? `${onlineUserData.profile.firstName}${onlineUserData.profile.lastName ? ' ' + onlineUserData.profile.lastName : ''}`
    : onlineUserData.email?.split('@')[0] || 'Someone';
  const photos = onlineUserData.profile?.photos;
  const profileImage = (photos && Array.isArray(photos) && photos.length > 0)
    ? (photos[0]?.url || photos[0] || '')
    : onlineUserData.profile?.profileImage || '';
  const chatUrl = `${FRONTEND_URL}/inbox`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #fff; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { padding: 24px 20px 16px; text-align: left; border-bottom: 3px solid #DC2626; }
    .header-logo { max-width: 180px; height: auto; display: block; }
    .main-heading { font-size: 26px; font-weight: 700; color: #111; margin: 24px 20px 20px; line-height: 1.3; }
    .profile-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 0 20px 24px; display: flex; gap: 20px; align-items: center; }
    .profile-img { width: 120px; height: 140px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
    .profile-placeholder { width: 120px; height: 140px; border-radius: 8px; background: linear-gradient(135deg, #FF6B35 0%, #FF1493 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 48px; font-weight: bold; flex-shrink: 0; }
    .profile-name { font-size: 18px; font-weight: 600; color: #2563EB; margin: 0 0 4px 0; }
    .profile-status { font-size: 14px; color: #4B5563; margin: 0 0 16px 0; }
    .btn-chat { display: inline-block; background: #DC2626; color: white !important; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; }
    .banner { background: #DC2626; border-radius: 12px; margin: 0 20px 24px; padding: 24px; display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
    .banner-text { color: white; font-size: 22px; font-weight: 700; margin: 0 0 12px 0; }
    .btn-gifts { display: inline-block; background: white; color: #111 !important; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
    .footer { text-align: center; padding: 20px; color: #6B7280; font-size: 13px; }
    .footer strong { color: #374151; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${LOGO_URL}" alt="Vantage Dating" class="header-logo" width="180" height="auto" style="max-width: 180px; height: auto; display: block; border: 0;" />
    </div>
    <h1 class="main-heading">${name} is now online!</h1>
    <div class="profile-card">
      ${profileImage
        ? `<img src="${profileImage}" alt="${name}" class="profile-img" />`
        : `<div class="profile-placeholder">${name.charAt(0).toUpperCase()}</div>`}
      <div>
        <p class="profile-name">${name}</p>
        <p class="profile-status">recently went online</p>
        <a href="${chatUrl}" class="btn-chat">Chat Now</a>
      </div>
    </div>
    <div class="banner">
      <div>
        <p class="banner-text">Show your devotion...</p>
        <a href="${chatUrl}" class="btn-gifts">Send virtual gifts</a>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0;">Meet awesome people</p>
      <p style="margin: 4px 0 0 0;"><strong>on Dating.com</strong></p>
    </div>
  </div>
</body>
</html>
  `;
};

/**
 * Send "X is now online" email to a recipient (contact of the user who came online)
 */
export const sendOnlineNotification = async (recipientEmail, onlineUserData) => {
  const name = onlineUserData.profile?.firstName
    ? `${onlineUserData.profile.firstName}${onlineUserData.profile.lastName ? ' ' + onlineUserData.profile.lastName : ''}`
    : onlineUserData.email?.split('@')[0] || 'Someone';
  const subject = `${name} is now online!`;
  const htmlContent = getOnlineNotificationTemplate(onlineUserData);
  const result = await sendEmail(
    recipientEmail,
    subject,
    htmlContent,
    null,
    { notificationType: 'user_online', onlineUserId: onlineUserData.id }
  );
  if (!result.success && (result.error || '').toLowerCase().includes('not configured')) {
    try {
      const { sendEmail: sendEmailSmtp } = await import('./emailService.js');
      return await sendEmailSmtp(recipientEmail, subject, htmlContent);
    } catch (e) {
      return result;
    }
  }
  return result;
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
 * @param {Object} opts - optional { attachments, creditCosts: { photoViewCredits, voiceMessageCredits }, senderId }
 */
export const sendMessageNotification = async (user, senderData, messageContent, messageId, mediaUrl = null, opts = {}) => {
  if (!user || !user.email) {
    return { success: false, error: 'User email is required' };
  }
  const userName = user.profile?.firstName || user.email?.split('@')[0] || 'User';
  const senderName = senderData.profile?.firstName || senderData.email?.split('@')[0] || 'Someone';
  const htmlContent = getMessageNotificationTemplate(userName, senderData, messageContent, messageId, mediaUrl, opts);
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
  sendOnlineNotification,
};
