import User from '../models/User.js';
import { getCreditSettings } from './creditSettings.js';

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
