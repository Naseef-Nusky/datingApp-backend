import express from 'express';
import Gift from '../models/Gift.js';
import GiftCatalog from '../models/GiftCatalog.js';
import User from '../models/User.js';
import CreditTransaction from '../models/CreditTransaction.js';
import Notification from '../models/Notification.js';
import Profile from '../models/Profile.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/gifts/catalog
// @desc    Get gift catalog
// @access  Private
router.get('/catalog', protect, async (req, res) => {
  try {
    const gifts = await GiftCatalog.find({ isActive: true }).sort({ creditCost: 1 });
    res.json(gifts);
  } catch (error) {
    console.error('Get catalog error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/gifts/send
// @desc    Send a gift
// @access  Private
router.post('/send', protect, async (req, res) => {
  try {
    const { receiverId, giftId, message, deliveryAddress } = req.body;

    if (!receiverId || !giftId) {
      return res.status(400).json({ message: 'Receiver ID and Gift ID required' });
    }

    const giftItem = await GiftCatalog.findById(giftId);
    if (!giftItem || !giftItem.isActive) {
      return res.status(404).json({ message: 'Gift not found' });
    }

    const user = await User.findById(req.user._id);
    if (user.credits < giftItem.creditCost) {
      return res.status(400).json({ message: 'Insufficient credits' });
    }

    // Determine gift type
    const giftType = giftItem.type === 'virtual' ? 'virtual' : 'physical';

    // Deduct credits
    user.credits -= giftItem.creditCost;
    await user.save();

    // Create gift
    const gift = await Gift.create({
      sender: req.user._id,
      receiver: receiverId,
      giftType,
      giftItem: giftId,
      message,
      deliveryAddress: giftType === 'physical' ? deliveryAddress : undefined,
      creditsUsed: giftItem.creditCost,
    });

    // Record transaction
    await CreditTransaction.create({
      userId: req.user._id,
      type: 'usage',
      amount: -giftItem.creditCost,
      description: `Gift: ${giftItem.name}`,
      relatedTo: 'gift',
      relatedId: gift._id,
    });

    // If receiver is a streamer/talent, add to earnings
    const receiver = await User.findById(receiverId);
    if (receiver && (receiver.userType === 'streamer' || receiver.userType === 'talent')) {
      const receiverProfile = await Profile.findOne({ userId: receiverId });
      if (receiverProfile) {
        receiverProfile.earnings.total += giftItem.creditCost * 0.7; // 70% to streamer
        receiverProfile.earnings.fromGifts += giftItem.creditCost * 0.7;
        await receiverProfile.save();
      }
    }

    // Create notification
    await Notification.create({
      userId: receiverId,
      type: 'gift_received',
      title: 'Gift Received',
      message: `You received a ${giftItem.name}`,
      relatedId: gift._id,
      relatedType: 'gift',
    });

    res.status(201).json(gift);
  } catch (error) {
    console.error('Send gift error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/gifts/received
// @desc    Get received gifts
// @access  Private
router.get('/received', protect, async (req, res) => {
  try {
    const gifts = await Gift.find({ receiver: req.user._id })
      .populate('sender', 'email')
      .populate('giftItem')
      .sort({ createdAt: -1 });

    res.json(gifts);
  } catch (error) {
    console.error('Get received gifts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/gifts/sent
// @desc    Get sent gifts
// @access  Private
router.get('/sent', protect, async (req, res) => {
  try {
    const gifts = await Gift.find({ sender: req.user._id })
      .populate('receiver', 'email')
      .populate('giftItem')
      .sort({ createdAt: -1 });

    res.json(gifts);
  } catch (error) {
    console.error('Get sent gifts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

