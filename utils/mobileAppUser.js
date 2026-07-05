import { User } from '../models/index.js';
import { getIosAppLoginScheme, getMobileAppWebBase } from './universalLinks.js';

export function isMobileAppUser(user) {
  const mobile = user?.settings?.mobileApp;
  return !!(mobile?.active || mobile?.lastSeenAt);
}

/** Mark user as active on the mobile app (Capacitor / iOS). */
export async function touchMobileAppUser(userId) {
  if (!userId) return;
  try {
    const user = await User.findByPk(userId);
    if (!user) return;
    const settings = { ...(user.settings || {}) };
    settings.mobileApp = {
      ...(settings.mobileApp || {}),
      active: true,
      lastSeenAt: new Date().toISOString(),
    };
    user.settings = settings;
    await user.save({ fields: ['settings'] });
  } catch (err) {
    console.warn('[mobileAppUser] touch failed:', err.message);
  }
}

export async function markCompatibilityEmailSent(userId, matches = []) {
  if (!userId) return;
  try {
    const user = await User.findByPk(userId);
    if (!user) return;
    const settings = { ...(user.settings || {}) };
    settings.mobileApp = {
      ...(settings.mobileApp || {}),
      lastCompatibilityEmailAt: new Date().toISOString(),
      lastCompatibilityEmailMatchIds: matches.map((m) => String(m.userId)),
    };
    user.settings = settings;
    await user.save({ fields: ['settings'] });
  } catch (err) {
    console.warn('[mobileAppUser] markCompatibilityEmailSent failed:', err.message);
  }
}

/** True when current top matches differ from the last emailed set (order matters). */
export function topMatchesChanged(lastIds, currentMatches) {
  const current = (currentMatches || []).map((m) => String(m.userId));
  const previous = Array.isArray(lastIds) ? lastIds.map(String) : [];
  if (!previous.length) return current.length > 0;
  if (previous.length !== current.length) return true;
  return previous.some((id, i) => id !== current[i]);
}

export function hoursSince(isoDate) {
  if (!isoDate) return Infinity;
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return Infinity;
  return (Date.now() - then) / (1000 * 60 * 60);
}

export function daysSince(isoDate) {
  if (!isoDate) return Infinity;
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return Infinity;
  return (Date.now() - then) / (1000 * 60 * 60 * 24);
}

export function getMobileAppLinks(path = '/dashboard') {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const webBase = getMobileAppWebBase();
  const webLink = webBase ? `${webBase}/${cleanPath || 'dashboard'}` : null;

  const rawScheme = getIosAppLoginScheme();
  const appLink = `${rawScheme}://${cleanPath || 'dashboard'}`;

  return {
    appLink,
    webLink,
    /** Prefer https Universal Link when configured (opens app if installed). */
    primaryLink: webLink || appLink,
  };
}
