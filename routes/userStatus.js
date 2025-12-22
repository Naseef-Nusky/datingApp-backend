import express from 'express';
import { protect } from '../middleware/auth.js';
import Profile from '../models/Profile.js';

const router = express.Router();

// @route   GET /api/user/status
// @desc    Get user's current status
// @access  Private
router.get('/status', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ where: { userId: req.user.id } });
    
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    res.json({
      status: profile.todayStatus || null,
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/user/status
// @desc    Update user's "Today I am" status
// @access  Private
router.post('/status', protect, async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ['serious', 'penpal', 'romantic', 'flirty', 'naughty'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const profile = await Profile.findOne({ where: { userId: req.user.id } });
    
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    profile.todayStatus = status || null;
    await profile.save();

    res.json({
      message: 'Status updated',
      status: profile.todayStatus,
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

