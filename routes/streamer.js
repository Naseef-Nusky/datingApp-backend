import express from 'express';
import Profile from '../models/Profile.js';
import { protect, streamer, admin } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/streamer/earnings
// @desc    Get streamer earnings
// @access  Private (Streamer only)
router.get('/earnings', protect, streamer, async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user._id });
    
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    res.json({
      earnings: profile.earnings,
      payoutRequests: profile.payoutRequests,
    });
  } catch (error) {
    console.error('Get earnings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/streamer/payout-request
// @desc    Request payout
// @access  Private (Streamer only)
router.post('/payout-request', protect, streamer, async (req, res) => {
  try {
    const { amount } = req.body;
    const profile = await Profile.findOne({ userId: req.user._id });
    
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    if (amount > profile.earnings.total - profile.earnings.pendingPayout) {
      return res.status(400).json({ message: 'Insufficient earnings' });
    }

    profile.payoutRequests.push({
      amount,
      status: 'pending',
      requestedAt: new Date(),
    });

    profile.earnings.pendingPayout += amount;
    await profile.save();

    res.json({ message: 'Payout request submitted', request: profile.payoutRequests[profile.payoutRequests.length - 1] });
  } catch (error) {
    console.error('Payout request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/streamer/payout-request/:requestId/approve
// @desc    Approve payout request (Admin only)
// @access  Private (Admin only)
router.put('/payout-request/:requestId/approve', protect, admin, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { streamerId } = req.body;

    const profile = await Profile.findOne({ userId: streamerId });
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    const request = profile.payoutRequests.id(requestId);
    if (!request) {
      return res.status(404).json({ message: 'Payout request not found' });
    }

    request.status = 'approved';
    request.processedAt = new Date();
    profile.earnings.pendingPayout -= request.amount;
    profile.earnings.total -= request.amount;

    await profile.save();

    res.json({ message: 'Payout approved', request });
  } catch (error) {
    console.error('Approve payout error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;





