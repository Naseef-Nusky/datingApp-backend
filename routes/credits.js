import express from 'express';
import Stripe from 'stripe';
import User from '../models/User.js';
import CreditTransaction from '../models/CreditTransaction.js';
import SystemSetting from '../models/SystemSetting.js';
import { protect } from '../middleware/auth.js';
import { getCreditSettings, DEFAULT_REFILL_PACKS } from '../utils/creditSettings.js';

const STRIPE_PRICES_KEY = 'stripe.credit_pack_prices';
const STRIPE_REFILL_PRICES_KEY = 'stripe.refill_pack_prices';

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' }) : null;

// Keys returned for the upgrade subscription modal (public, no auth)
const SUBSCRIPTION_MODAL_KEYS = [
  'subscriptionModalTitle', 'subscriptionStep1Title', 'subscriptionStep2Title',
  'subscriptionPacks', 'subscriptionBonuses', 'subscriptionCostLinkText', 'subscriptionDisclaimer',
];

// Subscription plans (fallback when CRM pack has no credits)
const SUBSCRIPTION_PLANS = {
  free: { credits: 0, price: 0 },
  basic: { credits: 100, price: 9.99 },
  premium: { credits: 500, price: 29.99 },
  vip: { credits: 1500, price: 79.99 },
};

// Parse credits number from CRM creditsLabel (e.g. "150 Credits/Mo" -> 150)
function parseCreditsFromLabel(creditsLabel) {
  if (!creditsLabel) return null;
  const match = String(creditsLabel).match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// Get credits for a plan: CRM pack config overrides SUBSCRIPTION_PLANS
function getCreditsForPlan(plan, packConfig) {
  const parsed = parseCreditsFromLabel(packConfig?.creditsLabel);
  if (parsed != null && parsed > 0) return parsed;
  const planDetails = SUBSCRIPTION_PLANS[plan];
  return planDetails?.credits ?? 0;
}

// Get or create Stripe Price for a plan – reuse if amount and label match, else create new (avoids many products in Dashboard)
async function getOrCreateStripePrice(plan, displayLabel, credits, amountCents) {
  const setting = await SystemSetting.findByPk(STRIPE_PRICES_KEY);
  const stored = (setting?.value && setting.value[plan]) || {};
  const { priceId, amountCents: storedAmount, displayLabel: storedLabel } = stored;

  if (priceId && storedAmount === amountCents && storedLabel === displayLabel) {
    try {
      const price = await stripe.prices.retrieve(priceId);
      if (price.unit_amount === amountCents && price.currency === 'usd') {
        return priceId;
      }
    } catch {
      // Price deleted or invalid, create new
    }
  }

  const product = await stripe.products.create({
    name: displayLabel,
    description: `${credits} credits per month`,
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: amountCents,
  });

  const updated = { ...(setting?.value || {}), [plan]: { priceId: price.id, amountCents, displayLabel } };
  await SystemSetting.upsert({ key: STRIPE_PRICES_KEY, value: updated });
  return price.id;
}

// Get or create Stripe Price for a refill pack – reuse if amount and label match, else create new
async function getOrCreateStripeRefillPrice(packId, displayLabel, credits, amountCents) {
  const key = STRIPE_REFILL_PRICES_KEY;
  const setting = await SystemSetting.findByPk(key);
  const stored = (setting?.value && setting.value[packId]) || {};
  const { priceId, amountCents: storedAmount, displayLabel: storedLabel } = stored;

  if (priceId && storedAmount === amountCents && storedLabel === displayLabel) {
    try {
      const price = await stripe.prices.retrieve(priceId);
      if (price.unit_amount === amountCents && price.currency === 'usd') {
        return priceId;
      }
    } catch {
      // Price deleted or invalid, create new
    }
  }

  const product = await stripe.products.create({
    name: displayLabel,
    description: `${credits} one-time credits`,
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: amountCents,
  });

  const updated = { ...(setting?.value || {}), [packId]: { priceId: price.id, amountCents, displayLabel } };
  await SystemSetting.upsert({ key, value: updated });
  return price.id;
}

// @route   GET /api/credits/subscription-modal
// @desc    Get subscription modal content (title, packs, bonuses, footer) – editable from CRM
// @access  Public
router.get('/subscription-modal', async (req, res) => {
  try {
    const settings = await getCreditSettings();
    const modal = {};
    SUBSCRIPTION_MODAL_KEYS.forEach((key) => {
      if (settings[key] !== undefined) modal[key] = settings[key];
    });
    res.json(modal);
  } catch (error) {
    console.error('Get subscription modal error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/credits/refill-packs
// @desc    Get one-time refill credit packs for refill popup – editable from CRM
// @access  Private (user must be logged in to see refill packs)
router.get('/refill-packs', protect, async (req, res) => {
  try {
    const settings = await getCreditSettings();
    const packs = Array.isArray(settings.refillPacks) && settings.refillPacks.length
      ? settings.refillPacks
      : DEFAULT_REFILL_PACKS;
    res.json({ packs });
  } catch (error) {
    console.error('Get refill packs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/credits/refill-checkout-session
// @desc    Create Stripe Checkout Session for one-time refill pack purchase
// @access  Private
router.post('/refill-checkout-session', protect, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env' });
    }
    const { packId } = req.body;
    if (!packId) {
      return res.status(400).json({ message: 'Missing refill pack id' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.userType === 'streamer' || user.userType === 'talent') {
      return res.status(403).json({ message: 'Streamers cannot purchase credits' });
    }

    const settings = await getCreditSettings();
    const packs = Array.isArray(settings.refillPacks) && settings.refillPacks.length
      ? settings.refillPacks
      : DEFAULT_REFILL_PACKS;
    const pack = packs.find((p) => String(p.id || '') === String(packId));
    if (!pack) {
      return res.status(400).json({ message: 'Invalid refill pack' });
    }

    const credits = parseInt(pack.credits, 10) || 0;
    if (!credits || credits <= 0) {
      return res.status(400).json({ message: 'Invalid credits for this pack' });
    }
    const priceUsd = pack.price != null ? parseFloat(String(pack.price).replace(/[^0-9.]/g, '')) : 0;
    const amountCents = Math.round((priceUsd || 0) * 100);
    if (amountCents < 50) {
      return res.status(400).json({ message: 'Invalid price for this pack' });
    }

    const displayLabel = `${credits} Credits`;
    const priceId = await getOrCreateStripeRefillPrice(String(pack.id || packId), displayLabel, credits, amountCents);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${frontendUrl}/dashboard?refill=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/dashboard?refill=cancelled`,
      client_reference_id: String(req.user.id),
      metadata: {
        userId: String(req.user.id),
        type: 'refill',
        packId: String(pack.id || packId),
        credits: String(credits),
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Create refill checkout session error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

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

// Helper: grant subscription to a user (used by direct subscribe, confirm-payment, and Stripe webhook)
// creditsOverride: when set (e.g. from Stripe metadata), use instead of SUBSCRIPTION_PLANS
async function grantSubscription(userId, plan, creditsOverride) {
  const planDetails = SUBSCRIPTION_PLANS[plan];
  if (!planDetails) return null;
  const credits = creditsOverride != null && creditsOverride > 0 ? creditsOverride : planDetails.credits;
  const user = await User.findByPk(userId);
  if (!user) return null;
  const expires = new Date();
  expires.setMonth(expires.getMonth() + 1);
  await user.update({
    subscriptionPlan: plan,
    monthlyCreditRefill: credits,
    subscriptionExpires: expires,
    credits: (user.credits || 0) + credits,
  });
  await CreditTransaction.create({
    userId,
    type: 'subscription',
    amount: credits,
    description: `Subscription: ${plan}`,
    relatedTo: 'subscription',
  });
  return { ...planDetails, credits };
}

// @route   POST /api/credits/create-checkout-session
// @desc    Create Stripe Checkout Session for upgrade (monthly credit pack). Redirects user to Stripe to pay.
// @access  Private
router.post('/create-checkout-session', protect, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env' });
    }
    const { plan } = req.body;
    if (!SUBSCRIPTION_PLANS[plan]) {
      return res.status(400).json({ message: 'Invalid subscription plan' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.userType === 'streamer' || user.userType === 'talent') {
      return res.status(403).json({ message: 'Streamers do not need subscriptions' });
    }

    const planDetails = SUBSCRIPTION_PLANS[plan];
    const settings = await getCreditSettings();
    const packs = settings.subscriptionPacks || [];
    const packConfig = packs.find((p) => p.plan === plan);
    const priceUsd = packConfig?.price != null ? parseFloat(String(packConfig.price).replace(/[^0-9.]/g, '')) : planDetails.price;
    const amountCents = Math.round((priceUsd || 0) * 100);
    if (amountCents < 50) {
      return res.status(400).json({ message: 'Invalid price for this plan' });
    }

    const credits = getCreditsForPlan(plan, packConfig);
    const displayLabel = packConfig?.creditsLabel?.trim() || `${credits} Credits/Mo`;
    const priceId = await getOrCreateStripePrice(plan, displayLabel, credits, amountCents);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${frontendUrl}/dashboard?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/dashboard?upgrade=cancelled`,
      client_reference_id: String(req.user.id),
      metadata: {
        userId: String(req.user.id),
        plan,
        credits: String(credits),
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   POST /api/credits/confirm-payment
// @desc    After Stripe redirect: verify session with Stripe (secret key only) and grant subscription. No webhook needed.
// @access  Private
router.post('/confirm-payment', protect, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ message: 'Stripe is not configured' });
    }
    const { session_id: sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ message: 'Missing session_id' });
    }
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ message: 'Payment not completed' });
    }
    const userId = session.metadata?.userId || session.client_reference_id;
    if (String(userId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Session does not belong to this user' });
    }
    const plan = session.metadata?.plan;
    if (!plan || !SUBSCRIPTION_PLANS[plan]) {
      return res.status(400).json({ message: 'Invalid session plan' });
    }
    const creditsOverride = session.metadata?.credits ? parseInt(session.metadata.credits, 10) : undefined;
    const fulfilled = await SystemSetting.findByPk('stripe.fulfilled_sessions');
    const ids = (fulfilled?.value && fulfilled.value.sessionIds) || [];
    if (ids.includes(sessionId)) {
      const updated = await User.findByPk(req.user.id, { attributes: ['credits', 'subscriptionPlan'] });
      return res.json({ message: 'Already applied', subscriptionPlan: updated?.subscriptionPlan, totalCredits: updated?.credits ?? 0 });
    }
    await grantSubscription(req.user.id, plan, creditsOverride);
    await SystemSetting.upsert({
      key: 'stripe.fulfilled_sessions',
      value: { sessionIds: [...ids.slice(-999), sessionId] },
    });
    const updated = await User.findByPk(req.user.id, { attributes: ['credits', 'subscriptionPlan'] });
    res.json({
      message: 'Subscription activated',
      subscriptionPlan: updated.subscriptionPlan,
      totalCredits: updated.credits ?? 0,
    });
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   POST /api/credits/confirm-refill-payment
// @desc    After Stripe redirect: verify session with Stripe and add one-time refill credits (no subscription)
// @access  Private
router.post('/confirm-refill-payment', protect, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ message: 'Stripe is not configured' });
    }
    const { session_id: sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ message: 'Missing session_id' });
    }
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ message: 'Payment not completed' });
    }
    const userId = session.metadata?.userId || session.client_reference_id;
    if (String(userId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Session does not belong to this user' });
    }
    if (session.metadata?.type !== 'refill') {
      return res.status(400).json({ message: 'Not a refill session' });
    }
    const credits = session.metadata?.credits ? parseInt(session.metadata.credits, 10) : 0;
    if (!credits || credits <= 0) {
      return res.status(400).json({ message: 'Invalid credits in session' });
    }

    const fulfilled = await SystemSetting.findByPk('stripe.refill_fulfilled_sessions');
    const ids = (fulfilled?.value && fulfilled.value.sessionIds) || [];
    if (ids.includes(sessionId)) {
      const updated = await User.findByPk(req.user.id, { attributes: ['credits'] });
      return res.json({
        message: 'Already applied',
        totalCredits: updated?.credits ?? 0,
        creditsAdded: 0,
      });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const newCredits = (user.credits || 0) + credits;
    await user.update({ credits: newCredits });
    await CreditTransaction.create({
      userId: req.user.id,
      type: 'purchase',
      amount: credits,
      description: 'Credit refill via Stripe',
      relatedTo: 'other',
    });
    await SystemSetting.upsert({
      key: 'stripe.refill_fulfilled_sessions',
      value: { sessionIds: [...ids.slice(-999), sessionId] },
    });

    res.json({
      message: 'Refill credits added',
      creditsAdded: credits,
      totalCredits: newCredits,
    });
  } catch (error) {
    console.error('Confirm refill payment error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   POST /api/credits/subscribe
// @desc    Subscribe to a plan. When Stripe is configured, credits are only granted via Stripe webhook after payment – this endpoint does nothing.
// @access  Private
router.post('/subscribe', protect, async (req, res) => {
  try {
    if (stripe) {
      return res.status(400).json({
        message: 'Subscription requires payment. Please use the upgrade flow to complete payment with Stripe.',
      });
    }
    const { plan } = req.body;
    if (!SUBSCRIPTION_PLANS[plan]) {
      return res.status(400).json({ message: 'Invalid subscription plan' });
    }
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.userType === 'streamer' || user.userType === 'talent') {
      return res.status(403).json({ message: 'Streamers do not need subscriptions' });
    }
    const settings = await getCreditSettings();
    const packs = settings.subscriptionPacks || [];
    const packConfig = packs.find((p) => p.plan === plan);
    const creditsOverride = getCreditsForPlan(plan, packConfig);
    const planDetails = await grantSubscription(req.user.id, plan, creditsOverride);
    if (!planDetails) return res.status(500).json({ message: 'Failed to grant subscription' });
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

// Stripe webhook handler (must be used with express.raw for body). Export for use in server.js.
export async function handleStripeWebhook(req, res) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send('Stripe webhook not configured');
  }
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }
  const session = event.data.object;
  const userId = session.metadata?.userId || session.client_reference_id;
  const plan = session.metadata?.plan;
  if (!userId || !plan || !SUBSCRIPTION_PLANS[plan]) {
    console.error('Stripe webhook: missing or invalid metadata');
    return res.status(400).json({ received: false });
  }
  const creditsOverride = session.metadata?.credits ? parseInt(session.metadata.credits, 10) : undefined;
  try {
    await grantSubscription(userId, plan, creditsOverride);
    console.log(`Stripe: subscription granted for user ${userId} plan ${plan}`);
  } catch (err) {
    console.error('Stripe webhook grant error:', err);
    return res.status(500).json({ received: false });
  }
  res.json({ received: true });
}

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

    // Block streamers/talents from using direct credit purchase/refill
    if (user.userType === 'streamer' || user.userType === 'talent') {
      return res.status(403).json({ message: 'Streamers cannot purchase credits' });
    }
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













