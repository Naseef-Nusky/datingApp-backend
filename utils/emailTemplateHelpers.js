import { getFrontendUrl, isLocalHostUrl } from './frontendUrl.js';

export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Absolute https in production (non-localhost). */
export const normalizeEmailLinkUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (
      u.protocol === 'http:' &&
      !isLocalHostUrl(raw) &&
      process.env.NODE_ENV === 'production'
    ) {
      u.protocol = 'https:';
    }
    return u.toString();
  } catch {
    return '';
  }
};

/** Web app origin for footer links — matches the login link domain when possible. */
export const getEmailSiteBaseUrl = (primaryLinkUrl = null) => {
  const normalized = normalizeEmailLinkUrl(primaryLinkUrl);
  if (normalized) {
    try {
      const u = new URL(normalized);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return `${u.protocol}//${u.host}`;
      }
    } catch {
      /* fall through */
    }
  }
  return getFrontendUrl();
};

export const emailPathLink = (baseUrl, path) => {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return normalizeEmailLinkUrl(`${base}${p}`) || `${base}${p}`;
};

/** Validate magic-link URL before putting it in email (spam filters flag broken/relative links). */
export const validateLoginLinkUrl = (loginUrl) => {
  const normalized = normalizeEmailLinkUrl(loginUrl);
  if (!normalized) return { ok: false, error: 'Missing login URL' };
  try {
    const u = new URL(normalized);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      if (!u.pathname.includes('login-callback')) {
        return { ok: false, error: 'Login URL path invalid' };
      }
      return { ok: true, url: normalized };
    }
    if (u.protocol && u.protocol.endsWith(':')) {
      // Custom app scheme (iOS) — valid but not for HTML href in all clients
      return { ok: true, url: normalized, isNativeScheme: true };
    }
    return { ok: false, error: 'Unsupported login URL protocol' };
  } catch {
    return { ok: false, error: 'Invalid login URL' };
  }
};

export const buildLoginLinkEmailContent = ({
  firstName,
  loginUrl,
  userId = '',
  appName = process.env.SMTP_FROM_NAME || process.env.SENDGRID_FROM_NAME || 'Vantage Dating',
}) => {
  const validation = validateLoginLinkUrl(loginUrl);
  if (!validation.ok) {
    throw new Error(validation.error || 'Invalid login link for email');
  }

  const safeLoginUrl = validation.url;
  const siteBase = getEmailSiteBaseUrl(safeLoginUrl);
  const logoUrl =
    process.env.EMAIL_LOGO_URL ||
    process.env.SENDGRID_LOGO_URL ||
    'https://nexdatingmedia.lon1.digitaloceanspaces.com/Logo/logonew.png';

  const safeName = escapeHtml(firstName || 'there');
  const safeApp = escapeHtml(appName);
  const hrefLogin = escapeHtml(safeLoginUrl);
  const termsUrl = escapeHtml(emailPathLink(siteBase, '/terms'));
  const privacyUrl = escapeHtml(emailPathLink(siteBase, '/privacy'));
  const refundUrl = escapeHtml(emailPathLink(siteBase, '/refund'));
  const helpUrl = escapeHtml(emailPathLink(siteBase, '/help'));
  const contactUrl = escapeHtml(emailPathLink(siteBase, '/contact'));

  const isNative = validation.isNativeScheme;
  const ctaBlock = isNative
    ? `<p style="font-size:15px;line-height:1.6;">Open this email on your phone and tap the button in the Vantage Dating app, or request a new link from the website.</p>`
    : `<p style="text-align:center;margin:24px 0;">
      <a href="${hrefLogin}" style="display:inline-block;background:#B5458F;color:#ffffff !important;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px;">Log in to ${safeApp}</a>
    </p>
    <p style="font-size:13px;color:#666;word-break:break-all;text-align:center;">
      Or copy this link into your browser:<br />
      <a href="${hrefLogin}" style="color:#5A2D8A;text-decoration:underline;">${hrefLogin}</a>
    </p>`;

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Log in to ${safeApp}</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#333333;background:#f5f5f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:24px 24px 16px;border-bottom:3px solid #E97672;">
              <img src="${escapeHtml(logoUrl)}" alt="${safeApp}" width="180" style="display:block;max-width:180px;height:auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 16px;font-size:18px;font-weight:bold;color:#1a1a1a;">Hello, ${safeName}!</p>
              <p style="margin:0 0 16px;font-size:15px;">You requested a secure login link for your ${safeApp} account.</p>
              ${ctaBlock}
              <p style="margin:16px 0 0;font-size:13px;color:#666;">This link stays active until you request a new one. If you did not request this email, you can ignore it.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px;background:#fafafa;border-top:1px solid #eeeeee;font-size:12px;color:#666666;">
              <p style="margin:0 0 8px;">${safeApp}</p>
              ${userId ? `<p style="margin:0 0 8px;">Reference: ${escapeHtml(String(userId))}</p>` : ''}
              <p style="margin:0 0 8px;">
                <a href="${termsUrl}" style="color:#5A2D8A;text-decoration:underline;">Terms of Use</a>
                &nbsp;·&nbsp;
                <a href="${privacyUrl}" style="color:#5A2D8A;text-decoration:underline;">Privacy Policy</a>
                &nbsp;·&nbsp;
                <a href="${refundUrl}" style="color:#5A2D8A;text-decoration:underline;">Refund Policy</a>
              </p>
              <p style="margin:0;">
                <a href="${helpUrl}" style="color:#5A2D8A;text-decoration:underline;">Help center</a>
                &nbsp;·&nbsp;
                <a href="${contactUrl}" style="color:#5A2D8A;text-decoration:underline;">Contact us</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textContent = isNative
    ? `Hello, ${firstName || 'there'},\n\nYou requested a login link for ${appName}. Open the Vantage Dating app on your device to complete sign-in.\n\nIf you did not request this, ignore this email.\n`
    : `Hello, ${firstName || 'there'},\n\nYou requested a login link for ${appName}.\n\nLog in here (copy into your browser if the button does not work):\n${safeLoginUrl}\n\nThis link stays active until you request a new one.\n\nIf you did not request this, ignore this email.\n\nTerms: ${emailPathLink(siteBase, '/terms')}\nPrivacy: ${emailPathLink(siteBase, '/privacy')}\nHelp: ${emailPathLink(siteBase, '/help')}\n`;

  return {
    htmlContent,
    textContent,
    subject: `Your ${appName} login link`,
    siteBase,
  };
};
