import express from 'express';
import Report from '../models/Report.js';
import Block from '../models/Block.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/safety/report
// @desc    Report a user or content
// @access  Private
router.post('/report', protect, async (req, res) => {
  try {
    const { reportedUserId, reportedContent, reason, description } = req.body;

    if (!reportedUserId || !reason) {
      return res.status(400).json({ message: 'Reported user ID and reason required' });
    }

    if (reportedUserId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot report yourself' });
    }

    const report = await Report.create({
      reporter: req.user._id,
      reportedUser: reportedUserId,
      reportedContent: reportedContent || 'profile',
      reason,
      description,
    });

    res.status(201).json({ message: 'Report submitted', report });
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/safety/block
// @desc    Block a user
// @access  Private
router.post('/block', protect, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID required' });
    }

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot block yourself' });
    }

    const block = await Block.findOneAndUpdate(
      { blocker: req.user._id, blocked: userId },
      { blocker: req.user._id, blocked: userId },
      { upsert: true, new: true }
    );

    res.json({ message: 'User blocked', block });
  } catch (error) {
    console.error('Block error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/safety/block/:userId
// @desc    Unblock a user
// @access  Private
router.delete('/block/:userId', protect, async (req, res) => {
  try {
    await Block.findOneAndDelete({
      blocker: req.user._id,
      blocked: req.params.userId,
    });

    res.json({ message: 'User unblocked' });
  } catch (error) {
    console.error('Unblock error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/safety/blocked
// @desc    Get blocked users
// @access  Private
router.get('/blocked', protect, async (req, res) => {
  try {
    const blocks = await Block.find({ blocker: req.user._id })
      .populate('blocked', 'email')
      .sort({ createdAt: -1 });

    res.json(blocks);
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;








