import express from 'express';
import User from '../models/User.js';
import CreditTransaction from '../models/CreditTransaction.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Subscription plans
const SUBSCRIPTION_PLANS = {
  free: { credits: 0, price: 0 },
  basic: { credits: 100, price: 9.99 },
  premium: { credits: 500, price: 29.99 },
  vip: { credits: 1500, price: 79.99 },
};

// @route   GET /api/credits/balance
// @desc    Get credit balance
// @access  Private
router.get('/balance', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      credits: user.credits,
      subscriptionPlan: user.subscriptionPlan,
      subscriptionExpires: user.subscriptionExpires,
      monthlyCreditRefill: user.monthlyCreditRefill,
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/credits/transactions
// @desc    Get credit transactions
// @access  Private
router.get('/transactions', protect, async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const transactions = await CreditTransaction.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await CreditTransaction.countDocuments({ userId: req.user._id });

    res.json({
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/credits/subscribe
// @desc    Subscribe to a plan
// @access  Private
router.post('/subscribe', protect, async (req, res) => {
  try {
    const { plan } = req.body;

    if (!SUBSCRIPTION_PLANS[plan]) {
      return res.status(400).json({ message: 'Invalid subscription plan' });
    }

    const user = await User.findById(req.user._id);
    const planDetails = SUBSCRIPTION_PLANS[plan];

    // Set subscription
    user.subscriptionPlan = plan;
    user.monthlyCreditRefill = planDetails.credits;
    user.subscriptionExpires = new Date();
    user.subscriptionExpires.setMonth(user.subscriptionExpires.getMonth() + 1);

    // Add initial credits
    user.credits += planDetails.credits;

    await user.save();

    // Record transaction
    await CreditTransaction.create({
      userId: req.user._id,
      type: 'subscription',
      amount: planDetails.credits,
      description: `Subscription: ${plan}`,
      relatedTo: 'subscription',
    });

    res.json({
      message: 'Subscription activated',
      subscriptionPlan: user.subscriptionPlan,
      creditsAdded: planDetails.credits,
      totalCredits: user.credits,
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/credits/cancel-subscription
// @desc    Cancel subscription
// @access  Private
router.post('/cancel-subscription', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.subscriptionPlan = 'free';
    user.monthlyCreditRefill = 0;
    user.subscriptionExpires = null;
    await user.save();

    res.json({ message: 'Subscription cancelled' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/credits/purchase
// @desc    Purchase credits directly
// @access  Private
router.post('/purchase', protect, async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    // In production, integrate with payment gateway (Stripe, PayPal, etc.)
    // For now, just add credits
    const user = await User.findById(req.user._id);
    user.credits += amount;
    await user.save();

    // Record transaction
    await CreditTransaction.create({
      userId: req.user._id,
      type: 'purchase',
      amount,
      description: `Credit purchase via ${paymentMethod}`,
      relatedTo: 'other',
    });

    res.json({
      message: 'Credits purchased',
      creditsAdded: amount,
      totalCredits: user.credits,
    });
  } catch (error) {
    console.error('Purchase credits error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;












