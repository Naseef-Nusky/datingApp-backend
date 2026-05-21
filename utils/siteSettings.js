import SystemSetting from '../models/SystemSetting.js';

const SETTINGS_KEY = 'site.settings';

export const DEFAULT_SITE_SETTINGS = {
  siteName: 'Vantage Dating',
  maintenanceMode: false,
  allowRegistrations: true,
  maxUploadSize: 10,
  enableNotifications: true,
  maintenanceMessage: '',
  /** After a new member registers, queue an email from a random streamer ("ready to chat"). */
  enableNewUserStreamerEmail: true,
  /** Minutes to wait before sending (default 2). */
  newUserStreamerEmailDelayMinutes: 2,
};

let cache = { value: null, at: 0 };
const TTL_MS = 3000;

export const invalidateSiteSettingsCache = () => {
  cache = { value: null, at: 0 };
};

/**
 * Site-wide flags (maintenance, registration, etc.). Cached briefly to limit DB reads.
 */
export const getSiteSettings = async () => {
  const now = Date.now();
  if (cache.value && now - cache.at < TTL_MS) {
    return cache.value;
  }
  try {
    const row = await SystemSetting.findOne({ where: { key: SETTINGS_KEY } });
    const merged = {
      ...DEFAULT_SITE_SETTINGS,
      ...(row?.value && typeof row.value === 'object' ? row.value : {}),
    };
    delete merged.requireEmailVerification;
    cache = { value: merged, at: now };
    return merged;
  } catch (e) {
    console.error('getSiteSettings error:', e.message);
    return { ...DEFAULT_SITE_SETTINGS };
  }
};

export const updateSiteSettings = async (partial) => {
  const current = await getSiteSettings();
  const merged = {
    ...current,
    ...partial,
  };
  delete merged.requireEmailVerification;
  await SystemSetting.upsert({
    key: SETTINGS_KEY,
    value: merged,
  });
  invalidateSiteSettingsCache();
  return merged;
};
