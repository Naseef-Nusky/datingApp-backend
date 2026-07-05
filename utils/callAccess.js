import User from '../models/User.js';
import { getCreditSettings, getChatMessageCost, getEmailSendCost, getMingleCost } from './creditSettings.js';

export function hasActiveSubscription(user) {
  if (!user) return false;
  const plan = user.subscriptionPlan;
  if (!plan || plan === 'free') return false;

  const now = new Date();
  if (user.subscriptionEndsAt) {
    return new Date(user.subscriptionEndsAt) > now;
  }
  const expires = user.subscriptionExpires;
  if (!expires) return true;
  return new Date(expires) > now;
}

export function getCallCostPerMinute(settings, callType) {
  const raw =
    callType === 'video' ? settings.videoCallPerMinute : settings.voiceCallPerMinute;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {import('../models/User.js').default | string} userOrId
 * @param {'video'|'voice'} callType
 */
export async function checkCanStartCall(userOrId, callType) {
  const user =
    typeof userOrId === 'object' && userOrId?.id
      ? userOrId
      : await User.findByPk(userOrId, {
          attributes: [
            'id',
            'userType',
            'credits',
            'subscriptionPlan',
            'subscriptionExpires',
            'subscriptionEndsAt',
          ],
        });

  if (!user) {
    return { allowed: false, code: 'USER_NOT_FOUND', message: 'User not found' };
  }

  if (user.userType === 'streamer' || user.userType === 'talent') {
    return { allowed: true, waived: true, balance: user.credits || 0 };
  }

  const normalizedType = callType === 'voice' ? 'voice' : 'video';
  const settings = await getCreditSettings();
  const costPerMinute = getCallCostPerMinute(settings, normalizedType);

  if (costPerMinute <= 0) {
    return { allowed: true, costPerMinute: 0, balance: user.credits || 0 };
  }

  if (!hasActiveSubscription(user)) {
    return {
      allowed: false,
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Upgrade your plan to start video and audio calls.',
      costPerMinute,
      balance: user.credits || 0,
    };
  }

  const balance = user.credits || 0;
  if (balance < costPerMinute) {
    return {
      allowed: false,
      code: 'INSUFFICIENT_CREDITS',
      message: 'Insufficient credits',
      required: costPerMinute,
      balance,
      costPerMinute,
    };
  }

  return { allowed: true, costPerMinute, balance };
}

async function loadUserForAccess(userOrId) {
  return typeof userOrId === 'object' && userOrId?.id
    ? userOrId
    : await User.findByPk(userOrId, {
        attributes: [
          'id',
          'userType',
          'credits',
          'subscriptionPlan',
          'subscriptionExpires',
          'subscriptionEndsAt',
        ],
      });
}

/**
 * @param {import('../models/User.js').default | string} userOrId
 */
export async function checkCanSendChat(userOrId) {
  const user = await loadUserForAccess(userOrId);
  if (!user) {
    return { allowed: false, code: 'USER_NOT_FOUND', message: 'User not found' };
  }

  if (user.userType === 'streamer' || user.userType === 'talent') {
    return { allowed: true, waived: true, balance: user.credits || 0 };
  }

  const costPerMessage = await getChatMessageCost();
  if (costPerMessage <= 0) {
    return { allowed: true, costPerMessage: 0, balance: user.credits || 0 };
  }

  if (!hasActiveSubscription(user)) {
    return {
      allowed: false,
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Upgrade your plan to send chat messages.',
      costPerMessage,
      balance: user.credits || 0,
    };
  }

  const balance = user.credits || 0;
  if (balance < costPerMessage) {
    return {
      allowed: false,
      code: 'INSUFFICIENT_CREDITS',
      message: 'Insufficient credits',
      required: costPerMessage,
      balance,
      costPerMessage,
    };
  }

  return { allowed: true, costPerMessage, balance };
}

/**
 * @param {import('../models/User.js').default | string} userOrId
 */
export async function checkCanSendEmail(userOrId) {
  const user = await loadUserForAccess(userOrId);
  if (!user) {
    return { allowed: false, code: 'USER_NOT_FOUND', message: 'User not found' };
  }

  if (user.userType === 'streamer' || user.userType === 'talent') {
    return { allowed: true, waived: true, balance: user.credits || 0 };
  }

  const emailCost = await getEmailSendCost();
  if (emailCost <= 0) {
    return { allowed: true, emailCost: 0, balance: user.credits || 0 };
  }

  if (!hasActiveSubscription(user)) {
    return {
      allowed: false,
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Upgrade your plan to send emails.',
      emailCost,
      balance: user.credits || 0,
    };
  }

  const balance = user.credits || 0;
  if (balance < emailCost) {
    return {
      allowed: false,
      code: 'INSUFFICIENT_CREDITS',
      message: 'Insufficient credits',
      required: emailCost,
      balance,
      emailCost,
    };
  }

  return { allowed: true, emailCost, balance };
}

/**
 * @param {import('../models/User.js').default | string} userOrId
 */
export async function checkCanSendMingle(userOrId) {
  const user = await loadUserForAccess(userOrId);
  if (!user) {
    return { allowed: false, code: 'USER_NOT_FOUND', message: 'User not found' };
  }

  if (user.userType === 'streamer' || user.userType === 'talent') {
    return { allowed: true, waived: true, balance: user.credits || 0 };
  }

  const mingleCost = await getMingleCost();
  if (mingleCost <= 0) {
    return { allowed: true, mingleCost: 0, balance: user.credits || 0 };
  }

  if (!hasActiveSubscription(user)) {
    return {
      allowed: false,
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Upgrade your plan to use Let\'s Mingle.',
      mingleCost,
      balance: user.credits || 0,
    };
  }

  const balance = user.credits || 0;
  if (balance < mingleCost) {
    return {
      allowed: false,
      code: 'INSUFFICIENT_CREDITS',
      message: 'Insufficient credits',
      required: mingleCost,
      balance,
      mingleCost,
    };
  }

  return { allowed: true, mingleCost, balance };
}
