const normalizeSiteUrl = (url) =>
  String(url || process.env.FRONTEND_URL || 'https://vantagedating.com').replace(/\/$/, '');

const brandName = () =>
  (process.env.SENDGRID_FROM_NAME || process.env.SMTP_FROM_NAME || 'Vantage Dating')
    .replace(/\s+Team$/i, '')
    .trim() || 'Vantage Dating';

const supportEmail = () =>
  process.env.SUPPORT_EMAIL || process.env.SENDGRID_REPLY_TO || 'support@vantagedating.com';

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
