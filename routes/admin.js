import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { body, validationResult } from 'express-validator';
import {
  User,
  Profile,
  Report,
  WishlistCategory,
  WishlistProduct,
  GiftCatalog,
  Gift,
  Notification,
  PresentCategory,
  Chat,
  Message,
  Match,
  ChatRequest,
  CallRequest,
  Story,
  CreditTransaction,
  Block,
} from '../models/index.js';
import { protect, admin, superadmin } from '../middleware/auth.js';
import { Op } from 'sequelize';
import bcrypt from 'bcryptjs';
import { uploadToSpaces, deleteFromSpaces } from '../utils/spacesUpload.js';
import { getCreditSettings, updateCreditSettings } from '../utils/creditSettings.js';
import { sendLoginLinkEmail } from '../utils/emailService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const sendCrmCreatedUserLoginLink = async (userId, email, firstName) => {
  try {
    const normalizedEmail = String(email || '').toLowerCase().trim();
    if (!normalizedEmail) {
      return { sent: false, error: 'Missing email' };
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    await User.update(
      { loginLinkToken: hashedToken, loginLinkExpires: null },
      { where: { id: userId } }
    );

    const loginUrl = `${frontendUrl}/auth/login-callback?token=${rawToken}`;
    const displayName = firstName || normalizedEmail.split('@')[0] || 'User';
    const emailResult = await sendLoginLinkEmail(normalizedEmail, displayName, loginUrl, userId);

    if (!emailResult.success) {
      if (process.env.NODE_ENV !== 'production' && emailResult.error === 'SMTP not configured') {
        console.log('\n📧 [DEV][CRM] SMTP not configured — use this login link:');
        console.log(loginUrl);
        console.log('');
        return { sent: false, error: emailResult.error, devLoginLink: loginUrl };
      }
      return { sent: false, error: emailResult.error || 'Email send failed' };
    }

    return { sent: true };
  } catch (error) {
    return { sent: false, error: error.message || 'Login email flow failed' };
  }
};

// Multer for product/gift images: memory for Spaces, disk fallback
const wishlistStorage = multer.memoryStorage();
const wishlistUpload = multer({
  storage: wishlistStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});
const giftImageUpload = wishlistUpload; // same config, folder set in saveGiftImage

// Multer for admin profile photo upload (memory for Spaces)
const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});

// ============================================
// Admin Users Routes (for managing admin accounts)
// ============================================

// @route   GET /api/admin/admins
// @desc    Get all admin users (superadmin, admin, moderator, viewer)
// @access  Admin only
router.get('/admins', protect, admin, async (req, res) => {
  try {
    const adminRoles = ['superadmin', 'admin', 'moderator', 'viewer'];
    const admins = await User.findAll({
      where: {
        userType: {
          [Op.in]: adminRoles,
        },
      },
      include: [
        {
          model: Profile,
          as: 'profile',
          attributes: ['firstName', 'lastName', 'age', 'gender'],
          required: false, // Left join - include users even without profile
        },
      ],
      attributes: ['id', 'email', 'userType', 'isActive', 'isVerified', 'createdAt', 'lastLogin'],
      order: [['createdAt', 'DESC']],
    });

    // Format response to handle cases where profile might be null
    const formattedAdmins = admins.map(admin => ({
      id: admin.id,
      email: admin.email,
      userType: admin.userType,
      isActive: admin.isActive,
      isVerified: admin.isVerified,
      createdAt: admin.createdAt,
      lastLogin: admin.lastLogin,
      profile: admin.profile ? {
        firstName: admin.profile.firstName,
        lastName: admin.profile.lastName,
        age: admin.profile.age,
        gender: admin.profile.gender,
      } : null,
    }));

    res.json({ admins: formattedAdmins });
  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/admin/admins
// @desc    Create a new admin user
// @access  Superadmin only
router.post(
  '/admins',
  protect,
  superadmin,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').optional().isLength({ min: 6 }),
    body('firstName').trim().notEmpty(),
    body('role').isIn(['superadmin', 'admin', 'moderator', 'viewer']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, firstName, lastName, role } = req.body;
      const passwordToSet = (password && typeof password === 'string' && password.trim().length >= 6)
        ? password.trim()
        : crypto.randomBytes(24).toString('hex');

      // Check if user already exists
      const existingUser = await User.findOne({
        where: {
          email: email.toLowerCase().trim(),
        },
      });

      if (existingUser) {
        return res.status(400).json({ message: 'Email address already registered' });
      }

      // Create admin user
      const adminUser = await User.create({
        email: email.toLowerCase().trim(),
        password: passwordToSet, // Will be hashed by User model hooks
        userType: role || 'admin',
        isVerified: true,
        isActive: true,
      });

      // Create profile
      await Profile.create({
        userId: adminUser.id,
        firstName: firstName.trim(),
        lastName: lastName?.trim() || '',
        age: 30,
        gender: 'other',
        bio: 'Administrator',
      });

      res.status(201).json({
        message: 'Admin user created successfully',
        admin: {
          id: adminUser.id,
          email: adminUser.email,
          userType: adminUser.userType,
        },
      });
    } catch (error) {
      console.error('Error creating admin user:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   PUT /api/admin/admins/:id
// @desc    Update an admin user
// @access  Superadmin only
router.put(
  '/admins/:id',
  protect,
  superadmin,
  [
    body('email').optional().isEmail().normalizeEmail(),
    body('password').optional().isLength({ min: 6 }),
    body('firstName').optional().trim().notEmpty(),
    body('role').optional().isIn(['superadmin', 'admin', 'moderator', 'viewer']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { email, password, firstName, lastName, role } = req.body;

      const adminUser = await User.findByPk(id, {
        include: [{ model: Profile, as: 'profile' }],
      });

      if (!adminUser) {
        return res.status(404).json({ message: 'Admin user not found' });
      }

      // Check if user is an admin type
      const adminRoles = ['superadmin', 'admin', 'moderator', 'viewer'];
      if (!adminRoles.includes(adminUser.userType)) {
        return res.status(400).json({ message: 'User is not an admin' });
      }

      // Update user fields
      if (email) adminUser.email = email.toLowerCase().trim();
      if (password) adminUser.password = password; // Will be hashed by User model hooks
      if (role) adminUser.userType = role;

      await adminUser.save();

      // Update profile if provided
      if (adminUser.profile) {
        if (firstName) adminUser.profile.firstName = firstName.trim();
        if (lastName !== undefined) adminUser.profile.lastName = lastName?.trim() || '';
        await adminUser.profile.save();
      } else if (firstName) {
        // Create profile if it doesn't exist
        await Profile.create({
          userId: adminUser.id,
          firstName: firstName.trim(),
          lastName: lastName?.trim() || '',
          age: 30,
          gender: 'other',
          bio: 'Administrator',
        });
      }

      res.json({
        message: 'Admin user updated successfully',
        admin: {
          id: adminUser.id,
          email: adminUser.email,
          userType: adminUser.userType,
        },
      });
    } catch (error) {
      console.error('Error updating admin user:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   DELETE /api/admin/admins/:id
// @desc    Delete an admin user
// @access  Superadmin only
router.delete('/admins/:id', protect, superadmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (req.user.id === id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const adminUser = await User.findByPk(id);

    if (!adminUser) {
      return res.status(404).json({ message: 'Admin user not found' });
    }

    // Check if user is an admin type
    const adminRoles = ['superadmin', 'admin', 'moderator', 'viewer'];
    if (!adminRoles.includes(adminUser.userType)) {
      return res.status(400).json({ message: 'User is not an admin' });
    }

    // Delete profile first (if exists)
    await Profile.destroy({ where: { userId: id } });

    // Delete user
    await adminUser.destroy();

    res.json({ message: 'Admin user deleted successfully' });
  } catch (error) {
    console.error('Error deleting admin user:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ============================================
// Regular Users Routes (for managing regular users)
// ============================================

// @route   GET /api/admin/users
// @desc    Get users. type: all|real|streamers. filter: all|active|inactive|verified|unverified|neverSpent|noSpend7d|noSpend30d
// @access  Superadmin or Viewer
router.get('/users', protect, admin, async (req, res) => {
  try {
    const { filter, type } = req.query;

    const andParts = [];
    andParts.push({
      userType: type === 'streamers'
        ? { [Op.in]: ['streamer', 'talent'] }
        : type === 'real'
          ? 'regular'
          : { [Op.notIn]: ['superadmin', 'admin', 'moderator', 'viewer'] },
    });
    if (filter === 'active') {
      andParts.push({ isActive: true });
    } else if (filter === 'inactive') {
      andParts.push({ isActive: false });
    } else if (filter === 'verified') {
      andParts.push({ isVerified: true });
    } else if (filter === 'unverified') {
      andParts.push({ isVerified: false });
    } else if (filter === 'neverSpent') {
      andParts.push({
        [Op.or]: [
          { totalCreditsSpent: 0 },
          { totalCreditsSpent: null },
        ],
      });
    } else if (filter === 'noSpend7d') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      andParts.push({
        [Op.or]: [
          { lastCreditSpentAt: null },
          { lastCreditSpentAt: { [Op.lt]: sevenDaysAgo } },
        ],
      });
    } else if (filter === 'noSpend30d') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      andParts.push({
        [Op.or]: [
          { lastCreditSpentAt: null },
          { lastCreditSpentAt: { [Op.lt]: thirtyDaysAgo } },
        ],
      });
    }

    const whereClause = andParts.length > 1 ? { [Op.and]: andParts } : andParts[0];

    const users = await User.findAll({
      where: whereClause,
      include: [
        {
          model: Profile,
          as: 'profile',
          attributes: ['firstName', 'lastName', 'age', 'gender', 'photos', 'isOnline', 'lastSeen'],
        },
      ],
      attributes: [
        'id', 'email', 'userType', 'isActive', 'isVerified', 'createdAt', 'lastLogin', 'credits',
        'totalCreditsSpent', 'lastCreditSpentAt', 'vipActive', 'vipExpiresAt', 'subscriptionPlan',
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/admin/users
// @desc    Create a new regular user
// @access  Superadmin or Viewer
router.post(
  '/users',
  protect,
  admin,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').optional().isLength({ min: 6 }),
    body('firstName').trim().notEmpty(),
    body('age').isInt({ min: 18 }),
    body('gender').isIn(['male', 'female', 'other']),
    body('seeking').optional().isIn(['male', 'female', 'both']),
  ],
  async (req, res) => {
    try {
      // Check if user has permission (superadmin or viewer)
      if (req.user.userType !== 'superadmin' && req.user.userType !== 'viewer') {
        return res.status(403).json({ message: 'You do not have permission to create users' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, firstName, lastName, age, gender, seeking, hometown, bio, interests, idealPartner } = req.body;
      const passwordToSet = (password && typeof password === 'string' && password.trim().length >= 6)
        ? password.trim()
        : crypto.randomBytes(24).toString('hex');

      // Check if user already exists
      const existingUser = await User.findOne({
        where: {
          email: email.toLowerCase().trim(),
        },
      });

      if (existingUser) {
        return res.status(400).json({ message: 'Email address already registered' });
      }

      // Create user
      const user = await User.create({
        email: email.toLowerCase().trim(),
        password: passwordToSet, // Will be hashed by User model hooks
        userType: 'regular',
        isVerified: true,
        isActive: true,
        isAdminCreated: true,
        registrationComplete: true,
      });

      const city = typeof hometown === 'string' ? (hometown.split(',')[0] || '').trim() : '';
      const country = typeof hometown === 'string' ? (hometown.split(',')[1] || '').trim() : '';

      // Create profile
      const profile = await Profile.create({
        userId: user.id,
        firstName: firstName.trim(),
        lastName: lastName?.trim() || '',
        age: parseInt(age),
        gender: gender,
        bio: typeof bio === 'string' ? bio : '',
        interests: Array.isArray(interests) ? interests : [],
        location: { city, country },
        preferences: {
          lookingFor: seeking || 'both',
          description: typeof idealPartner === 'string' ? idealPartner : '',
        },
      });

      const loginEmail = await sendCrmCreatedUserLoginLink(user.id, user.email, profile.firstName);

      res.status(201).json({
        message: loginEmail.sent
          ? 'User created successfully. Login email sent.'
          : 'User created successfully, but login email could not be sent.',
        user: {
          id: user.id,
          email: user.email,
          userType: user.userType,
        },
        profile: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          age: profile.age,
        },
        loginEmailSent: loginEmail.sent,
        loginEmailError: loginEmail.sent ? null : loginEmail.error,
        ...(loginEmail.devLoginLink ? { _devLoginLink: loginEmail.devLoginLink } : {}),
      });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   POST /api/admin/streamers
// @desc    Create a new streamer (talent) user from CRM
// @access  Superadmin or Viewer
router.post(
  '/streamers',
  protect,
  admin,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').optional().isLength({ min: 6 }),
    body('firstName').trim().notEmpty(),
    body('age').optional().isInt({ min: 18 }),
    body('gender').optional().isIn(['male', 'female', 'other']),
    body('seeking').optional().isIn(['male', 'female', 'both']),
  ],
  async (req, res) => {
    try {
      if (req.user.userType !== 'superadmin' && req.user.userType !== 'viewer') {
        return res.status(403).json({ message: 'You do not have permission to create streamers' });
      }
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      const { email, password, firstName, lastName, age, gender, seeking, hometown, bio, interests, idealPartner } = req.body;
      const passwordToSet = (password && typeof password === 'string' && password.trim().length >= 6)
        ? password.trim()
        : crypto.randomBytes(24).toString('hex');
      const existingUser = await User.findOne({
        where: { email: email.toLowerCase().trim() },
      });
      if (existingUser) {
        return res.status(400).json({ message: 'Email address already registered' });
      }
      const user = await User.create({
        email: email.toLowerCase().trim(),
        password: passwordToSet,
        userType: 'streamer',
        isVerified: true,
        isActive: true,
        isAdminCreated: true,
        registrationComplete: true,
      });

      const city = typeof hometown === 'string' ? (hometown.split(',')[0] || '').trim() : '';
      const country = typeof hometown === 'string' ? (hometown.split(',')[1] || '').trim() : '';
      const profile = await Profile.create({
        userId: user.id,
        firstName: firstName.trim(),
        lastName: (lastName && String(lastName).trim()) || '',
        age: age != null ? parseInt(age, 10) : 18,
        gender: gender || 'other',
        bio: typeof bio === 'string' ? bio : '',
        interests: Array.isArray(interests) ? interests : [],
        location: { city, country },
        preferences: {
          lookingFor: seeking || 'both',
          description: typeof idealPartner === 'string' ? idealPartner : '',
        },
      });

      const loginEmail = await sendCrmCreatedUserLoginLink(user.id, user.email, profile.firstName);

      res.status(201).json({
        message: loginEmail.sent
          ? 'Streamer created successfully. Login email sent.'
          : 'Streamer created successfully, but login email could not be sent.',
        user: {
          id: user.id,
          email: user.email,
          userType: user.userType,
        },
        profile: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          age: profile.age,
        },
        loginEmailSent: loginEmail.sent,
        loginEmailError: loginEmail.sent ? null : loginEmail.error,
        ...(loginEmail.devLoginLink ? { _devLoginLink: loginEmail.devLoginLink } : {}),
      });
    } catch (error) {
      console.error('Error creating streamer:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   PUT /api/admin/users/:id/toggle-active
// @desc    Toggle user active status
// @access  Superadmin only
router.put('/users/:id/toggle-active', protect, superadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent toggling admin users
    const adminRoles = ['superadmin', 'admin', 'moderator', 'viewer'];
    if (adminRoles.includes(user.userType)) {
      return res.status(400).json({ message: 'Cannot toggle status of admin users' });
    }

    user.isActive = isActive !== undefined ? isActive : !user.isActive;
    await user.save();

    res.json({
      message: 'User status updated successfully',
      user: {
        id: user.id,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/admin/users/:id/toggle-verified
// @desc    Toggle user verified status
// @access  Superadmin only
router.put('/users/:id/toggle-verified', protect, superadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isVerified } = req.body;

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent toggling admin users
    const adminRoles = ['superadmin', 'admin', 'moderator', 'viewer'];
    if (adminRoles.includes(user.userType)) {
      return res.status(400).json({ message: 'Cannot toggle verification of admin users' });
    }

    user.isVerified = isVerified !== undefined ? isVerified : !user.isVerified;
    await user.save();

    res.json({
      message: 'User verification status updated successfully',
      user: {
        id: user.id,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error('Error toggling user verification:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/admin/users/:id
// @desc    Permanently delete a non-admin user (real user or streamer) and their profile
// @access  Superadmin only
router.delete('/users/:id', protect, superadmin, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Never allow deleting admin/superadmin/moderator/viewer with this endpoint
    const adminRoles = ['superadmin', 'admin', 'moderator', 'viewer'];
    if (adminRoles.includes(user.userType)) {
      return res.status(400).json({ message: 'Cannot delete admin users via this endpoint' });
    }

    // Clean up all related data that references this user to satisfy foreign keys
    // Messages where user is sender or receiver
    await Message.destroy({
      where: {
        [Op.or]: [{ sender: id }, { receiver: id }],
      },
    });

    // Chat requests where user is sender or receiver
    await ChatRequest.destroy({
      where: {
        [Op.or]: [{ senderId: id }, { receiverId: id }],
      },
    });

    // Call requests where user is caller or receiver
    await CallRequest.destroy({
      where: {
        [Op.or]: [{ callerId: id }, { receiverId: id }],
      },
    });

    // Gifts sent or received by this user
    await Gift.destroy({
      where: {
        [Op.or]: [{ sender: id }, { receiver: id }],
      },
    });

    // Credit transactions for this user
    await CreditTransaction.destroy({
      where: { userId: id },
    });

    // Notifications for this user
    await Notification.destroy({
      where: { userId: id },
    });

    // Reports where user is reporter or reported
    await Report.destroy({
      where: {
        [Op.or]: [{ reporter: id }, { reportedUser: id }],
      },
    });

    // Blocks involving this user
    await Block.destroy({
      where: {
        [Op.or]: [{ blocker: id }, { blocked: id }],
      },
    });

    // Matches involving this user
    await Match.destroy({
      where: {
        [Op.or]: [{ user1: id }, { user2: id }],
      },
    });

    // Stories created by this user
    await Story.destroy({
      where: { userId: id },
    });

    // Chats where this user participates
    await Chat.destroy({
      where: {
        [Op.or]: [{ user1Id: id }, { user2Id: id }],
      },
    });

    // Delete profile last (if exists)
    await Profile.destroy({ where: { userId: id } });

    // Finally delete the user record (hard delete)
    await user.destroy();

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/admin/profiles/:userId/photo
// @desc    Upload profile photo for a user (CRM create user flow)
// @access  Admin only
router.post(
  '/profiles/:userId/photo',
  protect,
  admin,
  profilePhotoUpload.single('photo'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      const userId = req.params.userId;
      if (!userId) {
        return res.status(400).json({ message: 'Invalid user ID' });
      }
      const profile = await Profile.findOne({ where: { userId } });
      if (!profile) {
        return res.status(404).json({ message: 'Profile not found' });
      }
      const photoUrl = await uploadToSpaces(
        req.file.buffer,
        req.file.mimetype,
        'profiles/photos',
        req.file.originalname
      );
      const photos = Array.isArray(profile.photos) ? [...profile.photos] : [];
      if (photos.length > 0 && photos[0]?.url && photos[0].url.includes('digitaloceanspaces.com')) {
        try {
          await deleteFromSpaces(photos[0].url);
        } catch (e) {
          // continue
        }
      }
      const newPhoto = {
        url: photoUrl,
        isPublic: true,
        uploadedAt: new Date().toISOString(),
      };
      if (photos.length > 0) photos[0] = newPhoto;
      else photos.push(newPhoto);
      await profile.update({ photos });
      res.json({ message: 'Photo uploaded successfully', photo: { url: photoUrl }, photos });
    } catch (error) {
      console.error('Admin profile photo upload error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   DELETE /api/admin/profiles/:userId/photo
// @desc    Delete profile photo (first/main photo) for a user
// @access  Admin only
router.delete('/profiles/:userId/photo', protect, admin, async (req, res) => {
  try {
    const userId = req.params.userId;
    const profile = await Profile.findOne({ where: { userId } });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    const photos = Array.isArray(profile.photos) ? [...profile.photos] : [];
    if (photos.length === 0) return res.json({ message: 'No photo to delete', photos: [] });
    const first = photos[0];
    if (first?.url && first.url.includes('digitaloceanspaces.com')) {
      try { await deleteFromSpaces(first.url); } catch (e) { /* ignore */ }
    }
    const updated = photos.slice(1);
    await profile.update({ photos: updated });
    res.json({ message: 'Photo deleted', photos: updated });
  } catch (error) {
    console.error('Admin delete profile photo error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/admin/profiles/:userId/online
// @desc    Set profile online status (for CRM: show user as online/offline)
// @access  Admin only
router.put('/profiles/:userId/online', protect, admin, async (req, res) => {
  try {
    const userId = req.params.userId;
    const { isOnline } = req.body;
    const profile = await Profile.findOne({ where: { userId } });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    const value = isOnline === true || isOnline === 'true';
    await profile.update({
      isOnline: value,
      lastSeen: value ? new Date() : profile.lastSeen,
    });
    await profile.reload();
    res.json({ message: 'Online status updated', isOnline: profile.isOnline, lastSeen: profile.lastSeen });
  } catch (error) {
    console.error('Admin set online error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/admin/profiles/:userId
// @desc    Update profile data (CRM edit streamer profile)
// @access  Admin only
router.put('/profiles/:userId', protect, admin, async (req, res) => {
  try {
    const userId = req.params.userId;
    const { firstName, lastName, age, gender, bio, location } = req.body;
    const profile = await Profile.findOne({ where: { userId } });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    const updates = {};
    if (firstName != null) updates.firstName = String(firstName).trim();
    if (lastName != null) updates.lastName = String(lastName || '').trim();
    if (age != null) updates.age = parseInt(age, 10) || 18;
    if (gender != null && ['male', 'female', 'other'].includes(gender)) updates.gender = gender;
    if (bio != null) updates.bio = String(bio).trim().slice(0, 1000);
    if (location != null && typeof location === 'object') {
      updates.location = {
        ...(profile.location || {}),
        city: location.city != null ? String(location.city).trim() : (profile.location?.city),
        country: location.country != null ? String(location.country).trim() : (profile.location?.country),
      };
    }
    await profile.update(updates);
    await profile.reload();
    res.json({ message: 'Profile updated', profile });
  } catch (error) {
    console.error('Admin update profile error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ============================================
// Admin: View all conversations (monitor users & streamers)
// ============================================

// @route   GET /api/admin/conversations
// @desc    List all chats/conversations. Admin can view and track everything.
// @access  Admin only
router.get('/conversations', protect, admin, async (req, res) => {
  try {
    const { type } = req.query; // optional: 'real', 'streamers', or omit for all
    const chats = await Chat.findAll({
      include: [
        {
          model: User,
          as: 'user1Data',
          attributes: ['id', 'email', 'userType'],
          include: [{ model: Profile, as: 'profile', attributes: ['firstName', 'lastName', 'photos'] }],
        },
        {
          model: User,
          as: 'user2Data',
          attributes: ['id', 'email', 'userType'],
          include: [{ model: Profile, as: 'profile', attributes: ['firstName', 'lastName', 'photos'] }],
        },
      ],
      order: [['lastMessageAt', 'DESC']],
    });
    let list = chats.map((c) => ({
      id: c.id,
      user1Id: c.user1Id,
      user2Id: c.user2Id,
      user1: c.user1Data ? { id: c.user1Data.id, email: c.user1Data.email, userType: c.user1Data.userType, profile: c.user1Data.profile } : null,
      user2: c.user2Data ? { id: c.user2Data.id, email: c.user2Data.email, userType: c.user2Data.userType, profile: c.user2Data.profile } : null,
      lastMessageAt: c.lastMessageAt,
      lastMessage: c.lastMessage,
      unreadCountUser1: c.unreadCountUser1,
      unreadCountUser2: c.unreadCountUser2,
    }));
    if (type === 'real') {
      list = list.filter((c) => (c.user1?.userType === 'regular') && (c.user2?.userType === 'regular'));
    } else if (type === 'streamers') {
      list = list.filter((c) =>
        ['streamer', 'talent'].includes(c.user1?.userType) || ['streamer', 'talent'].includes(c.user2?.userType)
      );
    }

    // Hide conversations where either side is superadmin (internal/system use only)
    list = list.filter(
      (c) => c.user1?.userType !== 'superadmin' && c.user2?.userType !== 'superadmin'
    );
    res.json({ conversations: list });
  } catch (error) {
    console.error('Admin conversations error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/admin/conversations/:chatId/messages
// @desc    Get full message history for a chat. Admin read-only watch.
// @access  Admin only
router.get('/conversations/:chatId/messages', protect, admin, async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findByPk(chatId, {
      include: [
        { model: User, as: 'user1Data', attributes: ['id', 'email', 'userType'], include: [{ model: Profile, as: 'profile', attributes: ['firstName', 'lastName', 'photos'] }] },
        { model: User, as: 'user2Data', attributes: ['id', 'email', 'userType'], include: [{ model: Profile, as: 'profile', attributes: ['firstName', 'lastName', 'photos'] }] },
      ],
    });
    if (!chat) return res.status(404).json({ message: 'Conversation not found' });
    let messages = await Message.findAll({
      where: { chatId, isDeleted: false },
      include: [
        { model: User, as: 'senderData', attributes: ['id', 'email', 'userType'], include: [{ model: Profile, as: 'profile', attributes: ['firstName', 'lastName'] }] },
        { model: User, as: 'receiverData', attributes: ['id', 'email', 'userType'], include: [{ model: Profile, as: 'profile', attributes: ['firstName', 'lastName'] }] },
      ],
      // Use raw DB column name because Message model uses created_at
      order: [['created_at', 'ASC']],
    });

    // Hide system add/remove-contact messages from CRM conversation view
    messages = messages.filter((m) => {
      const raw = (m.content || '').toLowerCase().trim();
      if (!raw) return true;
      if (raw.includes('added you to my contacts') || raw.includes('removed you from my contacts')) {
        return false;
      }
      return true;
    });
    res.json({
      chat: {
        id: chat.id,
        user1: chat.user1Data,
        user2: chat.user2Data,
      },
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        receiver: m.receiver,
        senderData: m.senderData,
        receiverData: m.receiverData,
        content: m.content,
        mediaUrl: m.mediaUrl,
        messageType: m.messageType,
        isRead: m.isRead,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error('Admin conversation messages error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ============================================
// Stats Routes
// ============================================

// @route   GET /api/admin/users/stats
// @desc    Get user statistics
// @access  Admin only
router.get('/users/stats', protect, admin, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalUsers = await User.count({
      where: {
        userType: {
          [Op.notIn]: ['superadmin', 'admin', 'moderator', 'viewer'],
        },
      },
    });

    const activeUsers = await User.count({
      where: {
        userType: {
          [Op.notIn]: ['superadmin', 'admin', 'moderator', 'viewer'],
        },
        isActive: true,
      },
    });

    const verifiedUsers = await User.count({
      where: {
        userType: {
          [Op.notIn]: ['superadmin', 'admin', 'moderator', 'viewer'],
        },
        isVerified: true,
      },
    });

    const newUsersToday = await User.count({
      where: {
        userType: {
          [Op.notIn]: ['superadmin', 'admin', 'moderator', 'viewer'],
        },
        createdAt: {
          [Op.gte]: today,
        },
      },
    });

    res.json({
      totalUsers,
      activeUsers,
      verifiedUsers,
      newUsersToday,
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/admin/reports/stats
// @desc    Get reports statistics
// @access  Admin only
router.get('/reports/stats', protect, admin, async (req, res) => {
  try {
    const totalReports = await Report.count();
    const pendingReports = await Report.count({
      where: {
        status: 'pending',
      },
    });

    res.json({
      totalReports,
      pendingReports,
    });
  } catch (error) {
    console.error('Error fetching report stats:', error);
    res.json({
      totalReports: 0,
      pendingReports: 0,
    });
  }
});

// ============================================
// Wishlist Categories (for CRM category + product management)
// ============================================

router.get('/wishlist-categories', protect, admin, async (req, res) => {
  try {
    const categories = await WishlistCategory.findAll({
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
    });
    res.json({ categories });
  } catch (error) {
    console.error('Error fetching wishlist categories:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post(
  '/wishlist-categories',
  protect,
  admin,
  [body('name').trim().notEmpty(), body('slug').trim().notEmpty()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { name, slug, sortOrder } = req.body;
      const cat = await WishlistCategory.create({
        name: name.trim(),
        slug: (slug || name).trim().toLowerCase().replace(/\s+/g, '-'),
        sortOrder: sortOrder != null ? parseInt(sortOrder, 10) : 0,
      });
      res.status(201).json({ category: cat });
    } catch (error) {
      console.error('Error creating wishlist category:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

router.put(
  '/wishlist-categories/:id',
  protect,
  admin,
  [body('name').optional().trim().notEmpty(), body('slug').optional().trim().notEmpty()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const cat = await WishlistCategory.findByPk(req.params.id);
      if (!cat) return res.status(404).json({ message: 'Category not found' });
      if (req.body.name) cat.name = req.body.name.trim();
      if (req.body.slug) cat.slug = req.body.slug.trim().toLowerCase().replace(/\s+/g, '-');
      if (req.body.sortOrder != null) cat.sortOrder = parseInt(req.body.sortOrder, 10);
      if (req.body.isActive != null) cat.isActive = !!req.body.isActive;
      await cat.save();
      res.json({ category: cat });
    } catch (error) {
      console.error('Error updating wishlist category:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

router.delete('/wishlist-categories/:id', protect, admin, async (req, res) => {
  try {
    const cat = await WishlistCategory.findByPk(req.params.id);
    if (!cat) return res.status(404).json({ message: 'Category not found' });
    await WishlistProduct.destroy({ where: { categoryId: cat.id } });
    await cat.destroy();
    res.json({ message: 'Category deleted' });
  } catch (error) {
    console.error('Error deleting wishlist category:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ============================================
// Wishlist Products (with image upload)
// ============================================

router.get('/wishlist-products', protect, admin, async (req, res) => {
  try {
    const { categoryId } = req.query;
    const where = {};
    if (categoryId) where.categoryId = categoryId;
    const products = await WishlistProduct.findAll({
      where,
      include: [{ model: WishlistCategory, as: 'category', attributes: ['id', 'name', 'slug'] }],
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
    });
    res.json({ products });
  } catch (error) {
    console.error('Error fetching wishlist products:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * Upload wishlist product image to DigitalOcean Spaces (folder: wishlist/).
 * When DO_SPACES_* env vars are set, always uses Spaces. Falls back to local disk only when Spaces is not configured.
 */
async function saveProductImage(req, file) {
  if (!file || !file.buffer) return null;

  const spacesConfigured = !!(
    process.env.DO_SPACES_ENDPOINT &&
    process.env.DO_SPACES_KEY &&
    process.env.DO_SPACES_SECRET &&
    process.env.DO_SPACES_NAME
  );

  if (spacesConfigured) {
    // Always save wishlist product images in DigitalOcean Spaces under wishlist/ folder
    const url = await uploadToSpaces(file.buffer, file.mimetype, 'wishlist', file.originalname || '');
    return url;
  }

  // Fallback to local uploads/wishlist only when Spaces is not configured
  const ext = (file.originalname || '').split('.').pop() || 'jpg';
  const filename = `${uuidv4()}.${ext}`;
  const dir = path.join(__dirname, '..', 'uploads', 'wishlist');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  const base = req.protocol + '://' + req.get('host');
  return `${base}/uploads/wishlist/${filename}`;
}

/** Save gift catalog image to Spaces (folder: gifts/) or local uploads/gifts */
async function saveGiftImage(req, file) {
  if (!file || !file.buffer) return null;
  const spacesConfigured = !!(
    process.env.DO_SPACES_ENDPOINT &&
    process.env.DO_SPACES_KEY &&
    process.env.DO_SPACES_SECRET &&
    process.env.DO_SPACES_NAME
  );
  if (spacesConfigured) {
    return await uploadToSpaces(file.buffer, file.mimetype, 'gifts', file.originalname || '');
  }
  const ext = (file.originalname || '').split('.').pop() || 'jpg';
  const filename = `${uuidv4()}.${ext}`;
  const dir = path.join(__dirname, '..', 'uploads', 'gifts');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  const base = req.protocol + '://' + req.get('host');
  return `${base}/uploads/gifts/${filename}`;
}

/** Save present category image to Spaces (folder: present-categories/) or local uploads/present-categories */
async function saveCategoryImage(req, file) {
  if (!file || !file.buffer) return null;
  const spacesConfigured = !!(
    process.env.DO_SPACES_ENDPOINT &&
    process.env.DO_SPACES_KEY &&
    process.env.DO_SPACES_SECRET &&
    process.env.DO_SPACES_NAME
  );
  if (spacesConfigured) {
    return await uploadToSpaces(file.buffer, file.mimetype, 'present-categories', file.originalname || '');
  }
  const ext = (file.originalname || '').split('.').pop() || 'jpg';
  const filename = `${uuidv4()}.${ext}`;
  const dir = path.join(__dirname, '..', 'uploads', 'present-categories');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  const base = req.protocol + '://' + req.get('host');
  return `${base}/uploads/present-categories/${filename}`;
}

// ============================================
// Virtual Gifts (Gift Catalog) – admin CRUD
// ============================================

router.get('/gift-catalog', protect, admin, async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === '1';
    const gifts = await GiftCatalog.findAll({
      where: includeInactive ? {} : { isActive: true },
      order: [['creditCost', 'ASC'], ['name', 'ASC']],
    });
    res.json({ gifts });
  } catch (error) {
    console.error('Error fetching gift catalog:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post(
  '/gift-catalog',
  protect,
  admin,
  giftImageUpload.single('image'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('category').trim().notEmpty().withMessage('Category is required'),
    body('type').optional().isIn(['virtual', 'physical', 'both']),
    body('creditCost').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { name, description, category, type, creditCost, isActive } = req.body;
      let imageUrl = (req.body.imageUrl && req.body.imageUrl.trim()) || null;
      if (req.file) {
        const url = await saveGiftImage(req, req.file);
        if (url) imageUrl = url;
      }
      const gift = await GiftCatalog.create({
        name: name.trim(),
        description: (description || '').trim() || null,
        category: category || 'other',
        type: type || 'virtual',
        imageUrl,
        creditCost: creditCost != null ? parseInt(creditCost, 10) : 0,
        isActive: isActive !== undefined ? !!isActive : true,
      });
      res.status(201).json({ gift });
    } catch (error) {
      console.error('Error creating gift:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

router.put(
  '/gift-catalog/:id',
  protect,
  admin,
  giftImageUpload.single('image'),
  [
    body('name').optional().trim().notEmpty(),
    body('category').optional().trim().notEmpty(),
    body('type').optional().isIn(['virtual', 'physical', 'both']),
    body('creditCost').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const gift = await GiftCatalog.findByPk(req.params.id);
      if (!gift) return res.status(404).json({ message: 'Gift not found' });
      if (req.body.name) gift.name = req.body.name.trim();
      if (req.body.description !== undefined) gift.description = (req.body.description || '').trim() || null;
      if (req.body.category) gift.category = req.body.category;
      if (req.body.type) gift.type = req.body.type;
      if (req.body.creditCost != null) gift.creditCost = parseInt(req.body.creditCost, 10);
      if (req.body.isActive !== undefined) gift.isActive = !!req.body.isActive;
      if (req.file) {
        const url = await saveGiftImage(req, req.file);
        if (url) gift.imageUrl = url;
      } else if (req.body.imageUrl !== undefined) {
        gift.imageUrl = (req.body.imageUrl || '').trim() || null;
      }
      await gift.save();
      res.json({ gift });
    } catch (error) {
      console.error('Error updating gift:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Do NOT use destroy() – gift_catalogs is referenced by gifts table (sent gift history).
// Soft delete only: set isActive = false so it disappears from catalog but history stays valid.
router.delete('/gift-catalog/:id', protect, admin, async (req, res) => {
  try {
    const gift = await GiftCatalog.findByPk(req.params.id);
    if (!gift) return res.status(404).json({ message: 'Gift not found' });
    gift.set('isActive', false);
    await gift.save();
    res.json({ message: 'Gift removed from catalog' });
  } catch (error) {
    console.error('Error deleting gift:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ============================================
// Gift Orders (physical presents)
// ============================================

// @route   GET /api/admin/gift-orders
// @desc    List physical gift orders (presents) for delivery handling
// @access  Admin
router.get('/gift-orders', protect, admin, async (req, res) => {
  try {
    const { status } = req.query;
    const where = { giftType: 'physical' };
    const allowedStatuses = ['pending', 'processing', 'delivered', 'cancelled'];
    if (status && allowedStatuses.includes(status)) {
      where.deliveryStatus = status;
    }

    const orders = await Gift.findAll({
      where,
      include: [
        {
          model: User,
          as: 'senderData',
          attributes: ['id', 'email'],
          include: [
            {
              model: Profile,
              as: 'profile',
              attributes: ['firstName', 'lastName', 'age', 'gender', 'location'],
            },
          ],
        },
        {
          model: User,
          as: 'receiverData',
          attributes: ['id', 'email'],
          include: [
            {
              model: Profile,
              as: 'profile',
              attributes: ['firstName', 'lastName', 'age', 'gender', 'location'],
            },
          ],
        },
        {
          model: GiftCatalog,
          as: 'giftItemData',
          attributes: ['id', 'name', 'imageUrl', 'creditCost', 'category', 'type'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({ orders });
  } catch (error) {
    console.error('Error fetching gift orders:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/admin/gift-orders/:id/status
// @desc    Update delivery status / address for a physical gift order
// @access  Admin
router.put(
  '/gift-orders/:id/status',
  protect,
  admin,
  [
    body('deliveryStatus')
      .optional()
      .isIn(['pending', 'processing', 'delivered', 'cancelled']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const gift = await Gift.findByPk(req.params.id, {
        include: [{ model: GiftCatalog, as: 'giftItemData', attributes: ['id', 'name'] }],
      });
      if (!gift) return res.status(404).json({ message: 'Order not found' });
      if (gift.giftType !== 'physical') {
        return res.status(400).json({ message: 'Only physical presents can be updated via this endpoint' });
      }

      const { deliveryStatus, deliveryAddress } = req.body;

      if (deliveryStatus) {
        gift.deliveryStatus = deliveryStatus;
        if (deliveryStatus === 'delivered') {
          gift.isDelivered = true;
          gift.deliveredAt = new Date();
        } else if (deliveryStatus === 'pending') {
          gift.isDelivered = false;
          gift.deliveredAt = null;
        }
      }

      if (deliveryAddress !== undefined) {
        // Allow either JSON object or JSON string
        if (typeof deliveryAddress === 'string') {
          try {
            gift.deliveryAddress = JSON.parse(deliveryAddress);
          } catch {
            gift.deliveryAddress = { raw: deliveryAddress };
          }
        } else {
          gift.deliveryAddress = deliveryAddress;
        }
      }

      await gift.save();

      // Notify receiver about status change
      if (deliveryStatus) {
        const title = 'Present delivery update';
        const giftName = gift.giftItemData?.name || 'your present';
        const prettyStatus = deliveryStatus.charAt(0).toUpperCase() + deliveryStatus.slice(1);
        await Notification.create({
          userId: gift.receiver,
          type: 'system',
          title,
          message: `${giftName} is now ${prettyStatus.toLowerCase()}.`,
          relatedId: gift.id,
          relatedType: 'gift',
        });
      }

      const updated = await Gift.findByPk(gift.id, {
        include: [
          { model: User, as: 'senderData', attributes: ['id', 'email'] },
          { model: User, as: 'receiverData', attributes: ['id', 'email'] },
          { model: GiftCatalog, as: 'giftItemData', attributes: ['id', 'name', 'imageUrl', 'creditCost', 'category', 'type'] },
        ],
      });

      res.json({ order: updated });
    } catch (error) {
      console.error('Error updating gift order status:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// ============================================
// Wishlist (categories & products)
// ============================================

router.post(
  '/wishlist-products',
  protect,
  admin,
  wishlistUpload.single('image'),
  [
    body('name').trim().notEmpty(),
    body('categoryId').trim().notEmpty().isUUID(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { name, description, categoryId, sortOrder } = req.body;
      const category = await WishlistCategory.findByPk(categoryId);
      if (!category) return res.status(400).json({ message: 'Category not found' });
      let imageUrl = (req.body.imageUrl && req.body.imageUrl.trim()) || null;
      if (req.file) {
        const url = await saveProductImage(req, req.file);
        if (url) imageUrl = url;
      }
      const product = await WishlistProduct.create({
        name: name.trim(),
        description: (description || '').trim() || null,
        categoryId,
        imageUrl,
        sortOrder: sortOrder != null ? parseInt(sortOrder, 10) : 0,
      });
      const withCategory = await WishlistProduct.findByPk(product.id, {
        include: [{ model: WishlistCategory, as: 'category', attributes: ['id', 'name', 'slug'] }],
      });
      res.status(201).json({ product: withCategory });
    } catch (error) {
      console.error('Error creating wishlist product:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// ============================================
// Present Categories (for physical presents)
// ============================================

// @route   GET /api/admin/present-categories
// @desc    Get all present categories
// @access  Admin
router.get('/present-categories', protect, admin, async (req, res) => {
  try {
    const categories = await PresentCategory.findAll({
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
    });
    res.json({ categories });
  } catch (error) {
    console.error('Error fetching present categories:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/admin/present-categories
// @desc    Create a new present category (optional image)
// @access  Admin
router.post(
  '/present-categories',
  protect,
  admin,
  wishlistUpload.single('image'),
  [
    body('name').trim().notEmpty(),
    body('slug').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { name, slug, sortOrder } = req.body;
      const finalSlug = (slug || name).toLowerCase().replace(/\s+/g, '-');

      const existing = await PresentCategory.findOne({ where: { slug: finalSlug } });
      if (existing) {
        return res.status(400).json({ message: 'Slug already in use' });
      }

      let imageUrl = (req.body.imageUrl && req.body.imageUrl.trim()) || null;
      if (req.file) {
        const url = await saveCategoryImage(req, req.file);
        if (url) imageUrl = url;
      }

      const category = await PresentCategory.create({
        name: name.trim(),
        slug: finalSlug,
        imageUrl,
        sortOrder: sortOrder != null ? parseInt(sortOrder, 10) : 0,
      });

      res.status(201).json({ category });
    } catch (error) {
      console.error('Error creating present category:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   PUT /api/admin/present-categories/:id
// @desc    Update a present category (optional image)
// @access  Admin
router.put(
  '/present-categories/:id',
  protect,
  admin,
  wishlistUpload.single('image'),
  [
    body('name').optional().trim().notEmpty(),
    body('slug').optional().trim().notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const category = await PresentCategory.findByPk(req.params.id);
      if (!category) return res.status(404).json({ message: 'Category not found' });

      const { name, slug, sortOrder, isActive } = req.body;
      if (name) category.name = name.trim();
      if (slug) category.slug = slug.trim().toLowerCase().replace(/\s+/g, '-');
      if (sortOrder != null) category.sortOrder = parseInt(sortOrder, 10) || 0;
      if (isActive !== undefined) category.isActive = !!isActive;

      if (req.file) {
        const url = await saveCategoryImage(req, req.file);
        if (url) category.imageUrl = url;
      } else if (req.body.imageUrl !== undefined) {
        category.imageUrl = (req.body.imageUrl || '').trim() || null;
      }

      await category.save();
      res.json({ category });
    } catch (error) {
      console.error('Error updating present category:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   DELETE /api/admin/present-categories/:id
// @desc    Delete a present category (only if not used by any present)
// @access  Admin
router.delete('/present-categories/:id', protect, admin, async (req, res) => {
  try {
    const category = await PresentCategory.findByPk(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    // Prevent delete if any present uses this category name
    const inUseCount = await GiftCatalog.count({ where: { category: category.name } });
    if (inUseCount > 0) {
      return res.status(400).json({
        message: 'Cannot delete category while presents are using it.',
      });
    }

    await category.destroy();
    res.json({ message: 'Category deleted' });
  } catch (error) {
    console.error('Error deleting present category:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put(
  '/wishlist-products/:id',
  protect,
  admin,
  wishlistUpload.single('image'),
  [
    body('name').optional().trim().notEmpty(),
    body('categoryId').optional().trim().isUUID(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const product = await WishlistProduct.findByPk(req.params.id, {
        include: [{ model: WishlistCategory, as: 'category' }],
      });
      if (!product) return res.status(404).json({ message: 'Product not found' });
      if (req.body.name) product.name = req.body.name.trim();
      if (req.body.description !== undefined) product.description = (req.body.description || '').trim() || null;
      if (req.body.categoryId) {
        const cat = await WishlistCategory.findByPk(req.body.categoryId);
        if (!cat) return res.status(400).json({ message: 'Category not found' });
        product.categoryId = req.body.categoryId;
      }
      if (req.body.sortOrder != null) product.sortOrder = parseInt(req.body.sortOrder, 10);
      if (req.body.isActive != null) product.isActive = !!req.body.isActive;
      if (req.file) {
        const url = await saveProductImage(req, req.file);
        if (url) product.imageUrl = url;
      } else if (req.body.imageUrl !== undefined) {
        product.imageUrl = (req.body.imageUrl || '').trim() || null;
      }
      await product.save();
      const updated = await WishlistProduct.findByPk(product.id, {
        include: [{ model: WishlistCategory, as: 'category', attributes: ['id', 'name', 'slug'] }],
      });
      res.json({ product: updated });
    } catch (error) {
      console.error('Error updating wishlist product:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

router.delete('/wishlist-products/:id', protect, admin, async (req, res) => {
  try {
    const product = await WishlistProduct.findByPk(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    await product.destroy();
    res.json({ message: 'Product deleted' });
  } catch (error) {
    console.error('Error deleting wishlist product:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ============================================
// Credit Settings (chat, voice, video) - managed via CRM
// ============================================

// @route   GET /api/admin/credit-settings
// @desc    Get current credit costs for chat messages and calls
// @access  Admin
router.get('/credit-settings', protect, admin, async (req, res) => {
  try {
    const settings = await getCreditSettings();
    res.json({ settings });
  } catch (error) {
    console.error('Error fetching credit settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/admin/credit-settings
// @desc    Update credit costs for chat messages and calls
// @access  Admin
router.put(
  '/credit-settings',
  protect,
  admin,
  [
    body('chatMessage').optional().isInt({ min: 0 }).withMessage('chatMessage must be a non-negative integer'),
    body('voiceCallPerMinute').optional().isInt({ min: 0 }).withMessage('voiceCallPerMinute must be a non-negative integer'),
    body('videoCallPerMinute').optional().isInt({ min: 0 }).withMessage('videoCallPerMinute must be a non-negative integer'),
    body('photoViewCredits').optional().isInt({ min: 0 }).withMessage('photoViewCredits must be a non-negative integer'),
    body('videoViewCredits').optional().isInt({ min: 0 }).withMessage('videoViewCredits must be a non-negative integer'),
    body('voiceMessageCredits').optional().isInt({ min: 0 }).withMessage('voiceMessageCredits must be a non-negative integer'),
    body('vipCreditsRequired').optional().isInt({ min: 1 }).withMessage('vipCreditsRequired must be a positive integer'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const partial = {};
      if (req.body.chatMessage != null) {
        partial.chatMessage = parseInt(req.body.chatMessage, 10) || 0;
      }
      if (req.body.voiceCallPerMinute != null) {
        partial.voiceCallPerMinute = parseInt(req.body.voiceCallPerMinute, 10) || 0;
      }
      if (req.body.videoCallPerMinute != null) {
        partial.videoCallPerMinute = parseInt(req.body.videoCallPerMinute, 10) || 0;
      }
      if (req.body.photoViewCredits != null) {
        partial.photoViewCredits = parseInt(req.body.photoViewCredits, 10) || 0;
      }
      if (req.body.videoViewCredits != null) {
        partial.videoViewCredits = parseInt(req.body.videoViewCredits, 10) || 0;
      }
      if (req.body.voiceMessageCredits != null) {
        partial.voiceMessageCredits = parseInt(req.body.voiceMessageCredits, 10) || 0;
      }
      if (req.body.vipCreditsRequired != null) {
        partial.vipCreditsRequired = Math.max(1, parseInt(req.body.vipCreditsRequired, 10) || 160);
      }

      const settings = await updateCreditSettings(partial);
      res.json({ settings });
    } catch (error) {
      console.error('Error updating credit settings:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

export default router;
