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
    const user = await User.findByPk(req.user.id, { attributes: ['credits', 'subscriptionPlan', 'subscriptionExpires', 'monthlyCreditRefill'] });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      credits: user.credits ?? 0,
      subscriptionPlan: user.subscriptionPlan,
      subscriptionExpires: user.subscriptionExpires,
      monthlyCreditRefill: user.monthlyCreditRefill ?? 0,
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
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    const { count, rows: transactions } = await CreditTransaction.findAndCountAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    res.json({
      transactions,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit),
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

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const planDetails = SUBSCRIPTION_PLANS[plan];

    const expires = new Date();
    expires.setMonth(expires.getMonth() + 1);

    await user.update({
      subscriptionPlan: plan,
      monthlyCreditRefill: planDetails.credits,
      subscriptionExpires: expires,
      credits: (user.credits || 0) + planDetails.credits,
    });

    await CreditTransaction.create({
      userId: req.user.id,
      type: 'subscription',
      amount: planDetails.credits,
      description: `Subscription: ${plan}`,
      relatedTo: 'subscription',
    });

    const updated = await User.findByPk(req.user.id, { attributes: ['credits', 'subscriptionPlan'] });
    res.json({
      message: 'Subscription activated',
      subscriptionPlan: updated.subscriptionPlan,
      creditsAdded: planDetails.credits,
      totalCredits: updated.credits ?? 0,
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
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await user.update({
      subscriptionPlan: 'free',
      monthlyCreditRefill: 0,
      subscriptionExpires: null,
    });
    res.json({ message: 'Subscription cancelled' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/credits/purchase
// @desc    Purchase credits directly (or refill pack: amount = credits to add)
// @access  Private
router.post('/purchase', protect, async (req, res) => {
  try {
    const amount = parseInt(req.body.amount, 10);
    const paymentMethod = req.body.paymentMethod || 'refill';

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const newCredits = (user.credits || 0) + amount;
    await user.update({ credits: newCredits });

    await CreditTransaction.create({
      userId: req.user.id,
      type: 'purchase',
      amount,
      description: `Credit purchase via ${paymentMethod}`,
      relatedTo: 'other',
    });

    res.json({
      message: 'Credits purchased',
      creditsAdded: amount,
      totalCredits: newCredits,
    });
  } catch (error) {
    console.error('Purchase credits error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;













