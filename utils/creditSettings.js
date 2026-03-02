import SystemSetting from '../models/SystemSetting.js';

const SETTINGS_KEY = 'credit.settings';

// Default subscription modal (Upgrade modal) – editable from CRM
const DEFAULT_SUBSCRIPTION_MODAL = {
  subscriptionModalTitle: 'Subscribe to a Monthly Credit Pack & Date FREELY!',
  subscriptionStep1Title: '1. Choose Monthly Credit Pack Size:',
  subscriptionStep2Title: '2. Get Bonuses:',
  subscriptionPacks: [
    { plan: 'basic', creditsLabel: '150 Credits/Mo', wasPrice: '69', price: '19.99', save: 'SAVE 66%' },
    { plan: 'premium', creditsLabel: '600 Credits/Mo', wasPrice: '179', price: '149', save: 'SAVE 16%' },
    { plan: 'vip', creditsLabel: '1500 Credits/Mo', wasPrice: '369', price: '299', save: 'SAVE 16%' },
  ],
  subscriptionBonuses: [
    { iconType: 'infinity', iconBg: 'bg-blue-500', bold: 'Free Communication', rest: ' with all members, except Free Users' },
    { iconType: 'coins', iconBg: 'bg-amber-500', bold: 'Get Credits Each Month', rest: ' to spend on gifts and communication' },
    { iconType: 'comment', iconBg: 'bg-teal-500', bold: 'Read All Messages', rest: ' you receive in chat' },
    { iconType: 'paperplane', iconBg: 'bg-red-500', bold: "Let's Mingle", rest: ' to reach out to members with one message.' },
  ],
  subscriptionCostLinkText: 'Click here to see the cost of services.',
  subscriptionDisclaimer: '*1st month discounted: starting from the 2nd month you will be charged 49.99 USD.',
};

// Default one-time refill credit packs (refill popup) – editable from CRM
export const DEFAULT_REFILL_PACKS = [
  {
    id: 'p20',
    credits: 20,
    price: 16,
    saveLabel: 'SAVE 20%',
    badge: 'BESTSELLER',
    imageUrl: '',
  },
  {
    id: 'p50',
    credits: 50,
    price: 39,
    saveLabel: 'SAVE 17%',
    badge: '',
    imageUrl: '',
  },
  {
    id: 'p160',
    credits: 160,
    price: 99,
    saveLabel: 'SAVE 16%',
    badge: '',
    imageUrl: '',
  },
  {
    id: 'p1000',
    credits: 1000,
    price: 480,
    saveLabel: 'SAVE 16%',
    badge: 'BEST VALUE',
    imageUrl: '',
  },
];

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
  // One-time refill credit packs for refill popup
  refillPacks: DEFAULT_REFILL_PACKS,
  ...DEFAULT_SUBSCRIPTION_MODAL,
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

