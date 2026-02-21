import SystemSetting from '../models/SystemSetting.js';

const SETTINGS_KEY = 'credit.settings';

// Default credit configuration used when no CRM settings are stored yet
export const DEFAULT_CREDIT_SETTINGS = {
  // Cost per regular chat message (text / media) in credits
  chatMessage: 0,
  // Cost per started minute of voice call in credits
  voiceCallPerMinute: 0,
  // Cost per started minute of video call in credits
  videoCallPerMinute: 0,
  // Cost to view one photo attachment in email (unlock)
  photoViewCredits: 15,
  // Cost to view one video attachment in email (unlock)
  videoViewCredits: 15,
  // Cost to listen to one voice message attachment in email (unlock)
  voiceMessageCredits: 10,
  // Credits required in last 30 days to qualify for or renew VIP (used for all users including existing VIP)
  vipCreditsRequired: 160,
};

export const getCreditSettings = async () => {
  try {
    const setting = await SystemSetting.findOne({ where: { key: SETTINGS_KEY } });
    if (!setting || !setting.value || typeof setting.value !== 'object') {
      return { ...DEFAULT_CREDIT_SETTINGS };
    }
    return {
      ...DEFAULT_CREDIT_SETTINGS,
      ...setting.value,
    };
  } catch (error) {
    console.error('Error loading credit settings, using defaults:', error.message);
    return { ...DEFAULT_CREDIT_SETTINGS };
  }
};

export const updateCreditSettings = async (partialSettings) => {
  const current = await getCreditSettings();
  const merged = {
    ...current,
    ...partialSettings,
  };

  await SystemSetting.upsert({
    key: SETTINGS_KEY,
    value: merged,
  });

  return merged;
};

