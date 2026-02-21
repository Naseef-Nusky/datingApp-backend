import { Op } from 'sequelize';
import { User, Profile } from '../models/index.js';
import CreditTransaction from '../models/CreditTransaction.js';
import { getCreditSettings } from './creditSettings.js';

const VIP_DAYS = 30;

async function getVipCreditsRequired() {
  const settings = await getCreditSettings();
  const n = settings.vipCreditsRequired;
  return typeof n === 'number' && n >= 0 ? n : 160;
}

/**
 * Sum of credits spent (usage, amount < 0) in the last 30 days for a user.
 * @param {string} userId
 * @returns {Promise<{ total: number, oldestAt: Date | null }>}
 */
export async function getCreditsSpentLast30Days(userId) {
  const since = new Date();
  since.setDate(since.getDate() - VIP_DAYS);

  const transactions = await CreditTransaction.findAll({
    where: {
      userId,
      type: 'usage',
      amount: { [Op.lt]: 0 },
      createdAt: { [Op.gte]: since },
    },
    attributes: ['amount', 'createdAt'],
    order: [['createdAt', 'ASC']],
  });

  const total = transactions.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  const oldestAt = transactions.length > 0 ? transactions[0].createdAt : null;
  return { total, oldestAt };
}

/**
 * Set VIP status on user based on Premium + required credits in last 30 days.
 * Same threshold is used for new VIP and for VIP renewal (all members).
 * VIP lasts 30 days from now when granted; renewal is re-checked on each spend or cron.
 */
export async function recalculateVipStatus(userId) {
  const user = await User.findByPk(userId, {
    attributes: ['id', 'subscriptionPlan', 'vipActive', 'vipExpiresAt'],
  });
  if (!user) return;

  const creditsRequired = await getVipCreditsRequired();
  const premiumActive = user.subscriptionPlan === 'premium' || user.subscriptionPlan === 'vip';
  const { total } = await getCreditsSpentLast30Days(userId);

  if (premiumActive && total >= creditsRequired) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + VIP_DAYS);
    await user.update({
      vipActive: true,
      vipExpiresAt: expiresAt,
    });
  } else {
    await user.update({
      vipActive: false,
      vipExpiresAt: null,
    });
  }
}

/**
 * After a user spends credits: update totalCreditsSpent, lastCreditSpentAt, and recalc VIP.
 * Call this after every CreditTransaction.create with type 'usage' and negative amount.
 * @param {string} userId
 * @param {number} creditsSpent positive number (e.g. 10)
 */
export async function updateUserSpendAndVip(userId, creditsSpent) {
  if (!userId || creditsSpent <= 0) return;
  const user = await User.findByPk(userId, {
    attributes: ['id', 'totalCreditsSpent', 'lastCreditSpentAt'],
  });
  if (!user) return;

  const now = new Date();
  const newTotal = (user.totalCreditsSpent || 0) + creditsSpent;
  await user.update({
    totalCreditsSpent: newTotal,
    lastCreditSpentAt: now,
  });
  await recalculateVipStatus(userId);
}

/**
 * Get progress for the VIP UI: credits in last 30 days, remaining, deadline.
 * Uses CRM-configured vipCreditsRequired for both qualifying and renewing VIP.
 */
export async function getVipProgress(userId) {
  const user = await User.findByPk(userId, {
    attributes: ['id', 'subscriptionPlan', 'vipActive', 'vipExpiresAt', 'totalCreditsSpent'],
    include: [{ model: Profile, as: 'profile', attributes: ['firstName'], required: false }],
  });
  if (!user) return null;

  const creditsRequired = await getVipCreditsRequired();
  const premiumActive = user.subscriptionPlan === 'premium' || user.subscriptionPlan === 'vip';
  const { total: creditsSpentLast30Days, oldestAt } = await getCreditsSpentLast30Days(userId);

  let remainingToVip = Math.max(0, creditsRequired - creditsSpentLast30Days);
  let deadlineDate = null;
  if (oldestAt) {
    deadlineDate = new Date(oldestAt);
    deadlineDate.setDate(deadlineDate.getDate() + VIP_DAYS);
  } else {
    deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + VIP_DAYS);
  }

  return {
    premiumActive,
    vipActive: !!user.vipActive,
    vipExpiresAt: user.vipExpiresAt || null,
    creditsSpentLast30Days,
    creditsRequired,
    remainingToVip,
    deadlineDate: deadlineDate.toISOString().slice(0, 10),
    firstName: user.profile?.firstName || null,
    totalCreditsSpent: user.totalCreditsSpent ?? 0,
  };
}
