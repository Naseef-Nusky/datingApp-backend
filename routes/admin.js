import express from 'express';
import { body, validationResult } from 'express-validator';
import { User, Profile, Report } from '../models/index.js';
import { protect, admin, superadmin } from '../middleware/auth.js';
import { Op } from 'sequelize';
import bcrypt from 'bcryptjs';

const router = express.Router();

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
    body('password').isLength({ min: 6 }),
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
        password, // Will be hashed by User model hooks
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
// @desc    Get all regular users
// @access  Superadmin or Viewer
router.get('/users', protect, admin, async (req, res) => {
  try {
    const { filter } = req.query;

    let whereClause = {
      userType: {
        [Op.notIn]: ['superadmin', 'admin', 'moderator', 'viewer'], // Exclude admin users
      },
    };

    // Apply filters
    if (filter === 'active') {
      whereClause.isActive = true;
    } else if (filter === 'inactive') {
      whereClause.isActive = false;
    } else if (filter === 'verified') {
      whereClause.isVerified = true;
    } else if (filter === 'unverified') {
      whereClause.isVerified = false;
    }

    const users = await User.findAll({
      where: whereClause,
      include: [
        {
          model: Profile,
          as: 'profile',
          attributes: ['firstName', 'lastName', 'age', 'gender', 'photos'],
        },
      ],
      attributes: ['id', 'email', 'userType', 'isActive', 'isVerified', 'createdAt', 'lastLogin', 'credits'],
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
    body('password').isLength({ min: 6 }),
    body('firstName').trim().notEmpty(),
    body('age').isInt({ min: 18 }),
    body('gender').isIn(['male', 'female', 'other']),
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

      const { email, password, firstName, lastName, age, gender } = req.body;

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
        password, // Will be hashed by User model hooks
        userType: 'regular',
        isVerified: true,
        isActive: true,
      });

      // Create profile
      const profile = await Profile.create({
        userId: user.id,
        firstName: firstName.trim(),
        lastName: lastName?.trim() || '',
        age: parseInt(age),
        gender: gender,
      });

      res.status(201).json({
        message: 'User created successfully',
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
      });
    } catch (error) {
      console.error('Error creating user:', error);
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
    // If Report model doesn't exist or has issues, return default values
    res.json({
      totalReports: 0,
      pendingReports: 0,
    });
  }
});

export default router;
