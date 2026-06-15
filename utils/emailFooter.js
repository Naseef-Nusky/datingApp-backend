const normalizeSiteUrl = (url) =>
  String(url || process.env.FRONTEND_URL || 'https://vantagedating.com').replace(/\/$/, '');

const brandName = () =>
  (process.env.SENDGRID_FROM_NAME || process.env.SMTP_FROM_NAME || 'Vantage Dating')
    .replace(/\s+Team$/i, '')
    .trim() || 'Vantage Dating';

const supportEmail = () =>
  process.env.SUPPORT_EMAIL || process.env.SENDGRID_REPLY_TO || 'support@vantagedating.com';

/** Vantage logo theme — matches app `gradient-vantage` */
export const BRAND_THEME = {
  purple: '#5A2D8A',
  magenta: '#B5458F',
  coral: '#E97672',
  gradient: 'linear-gradient(to right, #5A2D8A, #B5458F, #E97672)',
};

/** Bulletproof CTA button for email clients (Outlook + Gmail) */
export const renderBrandEmailButton = (href, label) => `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 20px auto;">
        <tr>
          <td align="center" bgcolor="${BRAND_THEME.purple}" style="border-radius: 8px; background-color: ${BRAND_THEME.purple}; background-image: ${BRAND_THEME.gradient};">
            <a href="${href}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: Arial, sans-serif; font-size: 16px; font-weight: 700; color: #ffffff !important; text-decoration: none; border-radius: 8px; line-height: 1.2;">${label}</a>
          </td>
        </tr>
      </table>`;

/** Standard HTML block for email bottom section */
export const getEmailBrandFooterHtml = (siteUrl = null) => {
  const brand = brandName();
  const url = normalizeSiteUrl(siteUrl);
  const support = supportEmail();
  return `
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #666; line-height: 1.6;">
        <p style="margin: 0 0 4px 0; font-weight: 600; color: #374151;">${brand}</p>
        <p style="margin: 0 0 4px 0;"><a href="${url}" style="color: #5A2D8A; text-decoration: none;">${url}</a></p>
        <p style="margin: 0;">Support: <a href="mailto:${support}" style="color: #5A2D8A; text-decoration: none;">${support}</a></p>
      </div>`;
};

/** Plain-text footer lines */
export const getEmailBrandFooterText = (siteUrl = null) => {
  const brand = brandName();
  const url = normalizeSiteUrl(siteUrl);
  const support = supportEmail();
  return `${brand}\n${url}\nSupport: ${support}`;
};

/** Minimal footer for login emails — no extra links (one CTA in the body is enough) */
export const getLoginEmailFooterHtml = () => {
  const brand = brandName();
  const support = supportEmail();
  return `
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #666; line-height: 1.6;">
        <p style="margin: 0 0 4px 0; font-weight: 600; color: #374151;">${brand}</p>
        <p style="margin: 0;">${support}</p>
      </div>`;
};

export const getLoginEmailFooterText = () => {
  const brand = brandName();
  const support = supportEmail();
  return `${brand}\n${support}`;
};
