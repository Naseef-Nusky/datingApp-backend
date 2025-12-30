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

    // Credit check removed - gifts are now free
    const user = await User.findById(req.user._id);

    // Determine gift type
    const giftType = giftItem.type === 'virtual' ? 'virtual' : 'physical';

    // Create gift
    const gift = await Gift.create({
      sender: req.user._id,
      receiver: receiverId,
      giftType,
      giftItem: giftId,
      message,
      deliveryAddress: giftType === 'physical' ? deliveryAddress : undefined,
      creditsUsed: 0, // Gifts are now free
    });

    // Credit transaction removed - gifts are now free

    // Earnings removed - gifts are now free

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




