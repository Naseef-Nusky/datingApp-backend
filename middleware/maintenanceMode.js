import { getSiteSettings } from '../utils/siteSettings.js';

const EXACT_PATHS = new Set(['/api/health', '/api/mobile/health']);

/** POST-only paths allowed during maintenance (CRM admin login). */
const MAINTENANCE_AUTH_ALLOW = new Set(['/api/auth/admin-login']);

/**
 * Block member-facing API when maintenanceMode is on. CRM (/api/admin) and health always pass.
 */
export const enforceApiMaintenanceMode = async (req, res, next) => {
  const raw = req.originalUrl || '';
  const path = raw.split('?')[0];

  if (!path.startsWith('/api')) {
    return next();
  }

  if (EXACT_PATHS.has(path)) {
    return next();
  }

  if (path.startsWith('/api/admin')) {
    return next();
  }

  if (path === '/api/auth/site-status' || path === '/api/mobile/auth/site-status') {
    return next();
  }

  if (req.method === 'POST' && MAINTENANCE_AUTH_ALLOW.has(path)) {
    return next();
  }

  try {
    const site = await getSiteSettings();
    if (!site.maintenanceMode) {
      return next();
    }

    return res.status(503).json({
      code: 'MAINTENANCE',
      message:
        site.maintenanceMessage ||
        'We are performing scheduled maintenance. Please try again shortly.',
      maintenanceMode: true,
    });
  } catch (e) {
    console.error('enforceApiMaintenanceMode:', e);
    return next();
  }
};
