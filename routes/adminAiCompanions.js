import express from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import {
  User,
  Profile,
  AiCompanionPersona,
  AiCallbackRequest,
  AiGiftEvent,
  GiftCatalog,
} from '../models/index.js';
import { protect, admin } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

const requireFullAdmin = [protect, admin];

/** List AI companions */
router.get('/', ...requireFullAdmin, async (req, res) => {
  try {
    const rows = await User.findAll({
      where: { isAiCompanion: true },
      include: [
        { model: Profile, as: 'profile' },
        { model: AiCompanionPersona, as: 'aiPersona' },
      ],
      order: [['createdAt', 'DESC']],
    });
    res.json({
      companions: rows.map((u) => ({
        id: u.id,
        email: u.email,
        isActive: u.isActive,
        profile: u.profile,
        persona: u.aiPersona,
      })),
    });
  } catch (e) {
    console.error('List AI companions error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

/** Create AI companion (streamer-type + persona) */
router.post(
  '/',
  ...requireFullAdmin,
  [
    body('firstName').trim().notEmpty(),
    body('gender').isIn(['male', 'female', 'other']),
    body('age').isInt({ min: 18, max: 99 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const {
        firstName,
        lastName = '',
        gender,
        age,
        bio = '',
        interests = [],
        hometown = '',
        photos = [],
        characterBrief = '',
        humourStyle = 'light',
        messageLength = 'medium',
        emojiUse = 'light',
        conversationHabits = '',
        favouriteGiftIds = [],
        giftPreferencesNotes = '',
        giftSuggestMinHours = 72,
        giftSuggestMinActiveDays = 2,
        displayLabel = '',
        systemPromptExtra = '',
        welcomeEnabled = true,
        isActive = true,
      } = req.body;

      const email = `ai.companion.${uuidv4().slice(0, 8)}@vantagedating.internal`;
      const password = `AiComp!${uuidv4()}`;

      const user = await User.create({
        email,
        password,
        userType: 'streamer',
        isAiCompanion: true,
        isAdminCreated: true,
        isActive: Boolean(isActive),
        registrationComplete: true,
        isVerified: true,
        verificationStatus: 'verified',
        isFreeUser: false,
      });

      const profile = await Profile.create({
        userId: user.id,
        firstName,
        lastName,
        gender,
        age: parseInt(age, 10),
        bio,
        interests: Array.isArray(interests) ? interests : [],
        photos: Array.isArray(photos) ? photos : [],
        location: hometown ? { city: hometown } : {},
        preferences: {
          seeking: gender === 'male' ? 'female' : 'male',
        },
        isOnline: true,
        lastSeen: new Date(),
      });

      const persona = await AiCompanionPersona.create({
        userId: user.id,
        displayLabel: displayLabel || `${firstName} – AI companion`,
        characterBrief: characterBrief || bio || `${firstName} is a warm AI companion.`,
        humourStyle,
        messageLength,
        emojiUse,
        conversationHabits,
        favouriteGiftIds: Array.isArray(favouriteGiftIds) ? favouriteGiftIds : [],
        giftPreferencesNotes,
        giftSuggestMinHours: parseInt(giftSuggestMinHours, 10) || 72,
        giftSuggestMinActiveDays: parseInt(giftSuggestMinActiveDays, 10) || 2,
        welcomeEnabled: Boolean(welcomeEnabled),
        isActive: Boolean(isActive),
        systemPromptExtra,
      });

      res.status(201).json({ user: { id: user.id, email }, profile, persona });
    } catch (e) {
      console.error('Create AI companion error:', e);
      res.status(500).json({ message: 'Server error', error: e.message });
    }
  }
);

/** Update persona + profile basics + active flags */
router.put('/:id', ...requireFullAdmin, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      include: [
        { model: Profile, as: 'profile' },
        { model: AiCompanionPersona, as: 'aiPersona' },
      ],
    });
    if (!user?.isAiCompanion) return res.status(404).json({ message: 'AI companion not found' });

    const {
      isActive,
      firstName,
      lastName,
      age,
      bio,
      interests,
      photos,
      hometown,
      characterBrief,
      humourStyle,
      messageLength,
      emojiUse,
      conversationHabits,
      favouriteGiftIds,
      giftPreferencesNotes,
      giftSuggestMinHours,
      giftSuggestMinActiveDays,
      displayLabel,
      systemPromptExtra,
      welcomeEnabled,
    } = req.body;

    if (typeof isActive === 'boolean') {
      await user.update({ isActive });
      if (user.aiPersona) await user.aiPersona.update({ isActive });
    }

    if (user.profile) {
      const p = {};
      if (firstName != null) p.firstName = firstName;
      if (lastName != null) p.lastName = lastName;
      if (age != null) p.age = parseInt(age, 10);
      if (bio != null) p.bio = bio;
      if (interests != null) p.interests = interests;
      if (photos != null) p.photos = photos;
      if (hometown != null) p.location = { ...(user.profile.location || {}), city: hometown };
      if (Object.keys(p).length) await user.profile.update(p);
    }

    if (user.aiPersona) {
      const a = {};
      if (characterBrief != null) a.characterBrief = characterBrief;
      if (humourStyle != null) a.humourStyle = humourStyle;
      if (messageLength != null) a.messageLength = messageLength;
      if (emojiUse != null) a.emojiUse = emojiUse;
      if (conversationHabits != null) a.conversationHabits = conversationHabits;
      if (favouriteGiftIds != null) a.favouriteGiftIds = favouriteGiftIds;
      if (giftPreferencesNotes != null) a.giftPreferencesNotes = giftPreferencesNotes;
      if (giftSuggestMinHours != null) a.giftSuggestMinHours = parseInt(giftSuggestMinHours, 10);
      if (giftSuggestMinActiveDays != null) {
        a.giftSuggestMinActiveDays = parseInt(giftSuggestMinActiveDays, 10);
      }
      if (displayLabel != null) a.displayLabel = displayLabel;
      if (systemPromptExtra != null) a.systemPromptExtra = systemPromptExtra;
      if (typeof welcomeEnabled === 'boolean') a.welcomeEnabled = welcomeEnabled;
      if (Object.keys(a).length) await user.aiPersona.update(a);
    }

    const refreshed = await User.findByPk(user.id, {
      include: [
        { model: Profile, as: 'profile' },
        { model: AiCompanionPersona, as: 'aiPersona' },
      ],
    });
    res.json({
      id: refreshed.id,
      isActive: refreshed.isActive,
      profile: refreshed.profile,
      persona: refreshed.aiPersona,
    });
  } catch (e) {
    console.error('Update AI companion error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

/** Callback queue */
router.get('/callbacks', ...requireFullAdmin, async (req, res) => {
  try {
    const status = req.query.status || 'open';
    const where = status === 'all' ? {} : { status };
    const rows = await AiCallbackRequest.findAll({
      where,
      include: [
        {
          model: User,
          as: 'member',
          attributes: ['id', 'email'],
          include: [{ model: Profile, as: 'profile', attributes: ['firstName', 'age'] }],
        },
        {
          model: User,
          as: 'companion',
          attributes: ['id', 'email'],
          include: [{ model: Profile, as: 'profile', attributes: ['firstName'] }],
        },
      ],
      order: [['created_at', 'DESC']],
      limit: 200,
    });
    res.json({ callbacks: rows });
  } catch (e) {
    console.error('List AI callbacks error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

router.patch('/callbacks/:id', ...requireFullAdmin, async (req, res) => {
  try {
    const row = await AiCallbackRequest.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Not found' });
    const { status, staffNotes } = req.body;
    const updates = {};
    if (status && ['open', 'accepted', 'completed', 'cancelled'].includes(status)) {
      updates.status = status;
      if (status === 'accepted') updates.reviewedAt = new Date();
      if (status === 'completed') updates.completedAt = new Date();
    }
    if (staffNotes != null) updates.staffNotes = staffNotes;
    await row.update(updates);
    res.json(row);
  } catch (e) {
    console.error('Update AI callback error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

/** Gift events log */
router.get('/gift-events', ...requireFullAdmin, async (req, res) => {
  try {
    const rows = await AiGiftEvent.findAll({
      order: [['created_at', 'DESC']],
      limit: 200,
      include: [{ model: GiftCatalog, as: 'gift', attributes: ['id', 'name', 'creditCost'] }],
    });
    res.json({ events: rows });
  } catch (e) {
    console.error('AI gift events error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

/** Active catalog for favourite gift picker */
router.get('/gift-catalog', ...requireFullAdmin, async (req, res) => {
  try {
    const gifts = await GiftCatalog.findAll({
      where: { isActive: true, type: { [Op.in]: ['virtual', 'both'] } },
      order: [['name', 'ASC']],
    });
    res.json(gifts);
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
