const LOCAL_FRONTEND_DEFAULT = 'http://localhost:3000';

const normalizeUrl = (url) => String(url || '').replace(/\/$/, '');

const isLocalHostname = (hostname) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';

/** True if URL points at this machine (local dev). */
export const isLocalHostUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    const { hostname } = new URL(url);
    return isLocalHostname(hostname);
  } catch {
    return false;
  }
};

/** Backend running locally (localhost API) → use local frontend links in emails. */
export const isLocalDevEnvironment = () => {
  if (process.env.NODE_ENV === 'development') return true;
  const backend = process.env.BACKEND_URL || '';
  if (backend && isLocalHostUrl(backend)) return true;
  return false;
};

const originFromRequest = (req) => {
  if (!req) return null;
  const raw = req.get('Origin') || req.get('Referer');
  if (!raw || !isLocalHostUrl(raw)) return null;
  try {
    const u = new URL(raw);
    return normalizeUrl(`${u.protocol}//${u.host}`);
  } catch {
    return null;
  }
};

/**
 * Frontend base URL for email links, OAuth redirects, etc.
 * - Local dev (BACKEND_URL=localhost or NODE_ENV=development): LOCAL_FRONTEND_URL or http://localhost:3000
 * - Production: FRONTEND_URL (e.g. https://vantagedating.com)
 * - When req Origin is localhost, prefer that (correct Vite port).
 */
export const getFrontendUrl = (req = null) => {
  const fromReq = originFromRequest(req);
  if (fromReq) return fromReq;

  if (isLocalDevEnvironment()) {
    return normalizeUrl(process.env.LOCAL_FRONTEND_URL || LOCAL_FRONTEND_DEFAULT);
  }

  return normalizeUrl(process.env.FRONTEND_URL || 'https://vantagedating.com');
};

/**
 * Base URL for links inside outbound email.
 * Local dev (NODE_ENV=development or BACKEND_URL=localhost) → LOCAL_FRONTEND_URL.
 * Production → FRONTEND_URL / EMAIL_FRONTEND_URL.
 */
export const getEmailFrontendUrl = (req = null) => {
  if (isLocalDevEnvironment()) {
    return getFrontendUrl(req);
  }
  if (process.env.EMAIL_FORCE_LOCAL_LINKS === 'true' || process.env.EMAIL_FORCE_LOCAL_LINKS === '1') {
    return getFrontendUrl(req);
  }
  const explicit = normalizeUrl(process.env.EMAIL_FRONTEND_URL || '');
  if (explicit && !isLocalHostUrl(explicit)) return explicit;
  const production = normalizeUrl(process.env.FRONTEND_URL || '');
  if (production && !isLocalHostUrl(production)) return production;
  return getFrontendUrl(req);
};

export default getFrontendUrl;
