import express from 'express';
import { Op } from 'sequelize';
import { protect } from '../middleware/auth.js';
import { getVipProgress } from '../utils/vip.js';
import { User, Profile } from '../models/index.js';

const router = express.Router();

// @route   GET /api/vip/free-profiles
// @desc    List free user profiles for "How to unlock VIP" section (spend credits on these users)
// @access  Private
router.get('/free-profiles', protect, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 12;
    const users = await User.findAll({
      where: {
        id: { [Op.ne]: req.user.id },
        userType: { [Op.notIn]: ['superadmin', 'admin', 'moderator', 'viewer'] },
        isActive: true,
        subscriptionPlan: 'free',
      },
      include: [
        {
          model: Profile,
          as: 'profile',
          attributes: ['firstName', 'lastName', 'photos'],
          required: true,
        },
      ],
      attributes: ['id'],
      limit: Math.min(limit, 24),
      order: [['createdAt', 'DESC']],
    });

    const profiles = users.map((u) => {
      const photoUrl = u.profile?.photos?.[0]?.url || null;
      const firstName = u.profile?.firstName || 'User';
      const lastName = u.profile?.lastName || '';
      return {
        id: u.id,
        firstName,
        lastName: lastName.trim() ? lastName : null,
        photoUrl,
      };
    });

    res.json({ profiles });
  } catch (error) {
    console.error('VIP free-profiles error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/vip/progress
// @desc    Get current user's VIP progress (credits in last 30 days, remaining, deadline)
// @access  Private
router.get('/progress', protect, async (req, res) => {
  try {
    const progress = await getVipProgress(req.user.id);
    if (!progress) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(progress);
  } catch (error) {
    console.error('VIP progress error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
