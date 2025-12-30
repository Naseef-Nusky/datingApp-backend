import express from 'express';
import Match from '../models/Match.js';
import Profile from '../models/Profile.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/matches/like/:userId
// @desc    Like a profile
// @access  Private
router.post('/like/:userId', protect, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    
    if (targetUserId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot like yourself' });
    }

    // Find or create match
    let match = await Match.findOne({
      $or: [
        { user1: req.user._id, user2: targetUserId },
        { user1: targetUserId, user2: req.user._id },
      ],
    });

    if (!match) {
      match = await Match.create({
        user1: req.user._id,
        user2: targetUserId,
        user1Liked: req.user._id.toString() === match?.user1?.toString(),
        user2Liked: false,
      });
    }

    // Update like status
    if (match.user1.toString() === req.user._id.toString()) {
      match.user1Liked = true;
    } else {
      match.user2Liked = true;
    }

    // Check for mutual match
    if (match.user1Liked && match.user2Liked && !match.isMutual) {
      match.isMutual = true;
      match.matchedAt = new Date();
    }

    await match.save();

    res.json({
      message: 'Profile liked',
      isMutual: match.isMutual,
      match,
    });
  } catch (error) {
    console.error('Like profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/matches/pass/:userId
// @desc    Pass on a profile
// @access  Private
router.post('/pass/:userId', protect, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    
    // Remove any existing match
    await Match.findOneAndDelete({
      $or: [
        { user1: req.user._id, user2: targetUserId },
        { user1: targetUserId, user2: req.user._id },
      ],
    });

    res.json({ message: 'Profile passed' });
  } catch (error) {
    console.error('Pass profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/matches
// @desc    Get all matches
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const matches = await Match.find({
      $or: [{ user1: req.user._id }, { user2: req.user._id }],
      isMutual: true,
    })
      .populate('user1', 'email')
      .populate('user2', 'email')
      .sort({ matchedAt: -1 });

    // Get profile details for matches
    const matchesWithProfiles = await Promise.all(
      matches.map(async (match) => {
        const otherUserId =
          match.user1.toString() === req.user._id.toString()
            ? match.user2
            : match.user1;
        const profile = await Profile.findOne({ userId: otherUserId });
        return {
          match,
          profile,
        };
      })
    );

    res.json(matchesWithProfiles);
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/matches/recommended
// @desc    Get recommended profiles
// @access  Private
router.get('/recommended', protect, async (req, res) => {
  try {
    const currentProfile = await Profile.findOne({ userId: req.user._id });
    if (!currentProfile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    // Get already matched/liked users
    const existingMatches = await Match.find({
      $or: [{ user1: req.user._id }, { user2: req.user._id }],
    });
    const excludedUserIds = [
      req.user._id,
      ...existingMatches.map((m) =>
        m.user1.toString() === req.user._id.toString() ? m.user2 : m.user1
      ),
    ];

    // Find similar profiles based on interests and location
    const query = {
      userId: { $nin: excludedUserIds },
    };

    if (currentProfile.preferences?.lookingFor) {
      if (currentProfile.preferences.lookingFor === 'male') {
        query.gender = 'male';
      } else if (currentProfile.preferences.lookingFor === 'female') {
        query.gender = 'female';
      }
    }

    if (currentProfile.preferences?.ageRange) {
      query.age = {
        $gte: currentProfile.preferences.ageRange.min,
        $lte: currentProfile.preferences.ageRange.max,
      };
    }

    // If location exists, prioritize same city/country
    if (currentProfile.location?.city) {
      query.$or = [
        { 'location.city': currentProfile.location.city },
        { 'location.country': currentProfile.location.country },
      ];
    }

    const recommended = await Profile.find(query)
      .populate('userId', 'email userType')
      .limit(20)
      .sort({ createdAt: -1 });

    res.json(recommended);
  } catch (error) {
    console.error('Get recommended error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;






