import express from 'express';
import { Op } from 'sequelize';
import { User } from '../models/index.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Shape helper to build a safe settings object with defaults
const buildSettingsPayload = (user) => {
  const baseSettings = user.settings || {};
  const sound = baseSettings.sound || {};
  const concierge = baseSettings.concierge || {};
  const phone = baseSettings.phone || null;

  const emailPrefs = user.emailPreferences || {};

  return {
    email: user.email,
    language: baseSettings.language || 'en',
    sound: {
      myContacts: sound.myContacts !== false,
      chatRequests: sound.chatRequests !== false,
      repeatUntilRead: !!sound.repeatUntilRead,
    },
    phone: phone || null,
    concierge: {
      mode: concierge.mode || 'all', // 'all', 'week', 'two-weeks', 'month'
    },
    emailNotifications: {
      newMessageInChat: emailPrefs.newMessages !== false,
      // Extra fields are optional, default to true if undefined
      newMessageFromContactInChat:
        emailPrefs.newMessageFromContactInChat !== false,
      newEmailFromUser: emailPrefs.newEmailFromUser !== false,
      newEmailFromContact:
        emailPrefs.newEmailFromContact !== false,
      bonusCredits: emailPrefs.bonusCredits !== false,
      activityDigest: emailPrefs.dailyDigest !== false,
    },
    manageAccount: (baseSettings.manageAccount || {}),
  };
};

// GET /api/settings - get current user's settings
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json(buildSettingsPayload(user));
  } catch (error) {
    console.error('Get settings error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/settings - update current user's settings
router.put('/', protect, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const {
      email,
      language,
      sound,
      phone,
      concierge,
      emailNotifications,
      manageAccountOption,
    } = req.body || {};

    // Update email (if changed)
    if (email && email.toLowerCase().trim() !== user.email.toLowerCase()) {
      const normalizedEmail = email.toLowerCase().trim();
      const existing = await User.findOne({
        where: {
          email: { [Op.iLike]: normalizedEmail },
          id: { [Op.ne]: user.id },
        },
      });
      if (existing) {
        return res
          .status(400)
          .json({ message: 'Email address already registered', field: 'email' });
      }
      user.email = normalizedEmail;
    }

    // Merge settings JSON
    const currentSettings = user.settings || {};

    if (language) {
      currentSettings.language = language;
    }

    if (sound && typeof sound === 'object') {
      currentSettings.sound = {
        ...(currentSettings.sound || {}),
        ...sound,
      };
    }

    if (phone && typeof phone === 'object') {
      currentSettings.phone = {
        countryCode: phone.countryCode || '+44',
        number: phone.number || '',
      };
    }

    if (concierge && typeof concierge === 'object') {
      currentSettings.concierge = {
        ...(currentSettings.concierge || {}),
        mode: concierge.mode || 'all',
      };
    }

    if (manageAccountOption) {
      currentSettings.manageAccount = {
        ...(currentSettings.manageAccount || {}),
        lastChoice: manageAccountOption,
        updatedAt: new Date().toISOString(),
      };

      // Implement only non-destructive manage-account actions here for now.
      // For "turn-off-email", we disable all email notifications below.
    }

    user.settings = currentSettings;

    // Merge email notification preferences
    if (emailNotifications && typeof emailNotifications === 'object') {
      const prefs = user.emailPreferences || {};

      if (typeof emailNotifications.newMessageInChat === 'boolean') {
        prefs.newMessages = emailNotifications.newMessageInChat;
      }
      if (typeof emailNotifications.newMessageFromContactInChat === 'boolean') {
        prefs.newMessageFromContactInChat =
          emailNotifications.newMessageFromContactInChat;
      }
      if (typeof emailNotifications.newEmailFromUser === 'boolean') {
        prefs.newEmailFromUser = emailNotifications.newEmailFromUser;
      }
      if (typeof emailNotifications.newEmailFromContact === 'boolean') {
        prefs.newEmailFromContact = emailNotifications.newEmailFromContact;
      }
      if (typeof emailNotifications.bonusCredits === 'boolean') {
        prefs.bonusCredits = emailNotifications.bonusCredits;
      }
      if (typeof emailNotifications.activityDigest === 'boolean') {
        prefs.dailyDigest = emailNotifications.activityDigest;
      }

      user.emailPreferences = prefs;
    }

    // Special-case manage-account action: "turn-off-email"
    if (manageAccountOption === 'turn-off-email') {
      const prefs = user.emailPreferences || {};
      prefs.newMatches = false;
      prefs.newMessages = false;
      prefs.profileViews = false;
      prefs.dailyDigest = false;
      prefs.promotional = false;
      user.emailPreferences = prefs;
    }

    await user.save();

    return res.json({
      success: true,
      settings: buildSettingsPayload(user),
    });
  } catch (error) {
    console.error('Update settings error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;

