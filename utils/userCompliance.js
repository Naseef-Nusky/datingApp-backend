import User from '../models/User.js';

const STAFF_USER_TYPES = new Set(['admin', 'superadmin', 'moderator', 'viewer']);

function isElevatedParticipant(u) {
  if (!u) return false;
  if (STAFF_USER_TYPES.has(u.userType)) return true;
  if (u.userType === 'streamer' || u.userType === 'talent') return true;
  if (u.subscriptionPlan && u.subscriptionPlan !== 'free') return true;
  if (u.vipActive === true) return true;
  if (u.isFreeUser === false) return true;
  return false;
}

/**
 * Blocks direct free-member ↔ free-member messaging and gifting when neither side
 * is on a paid plan, VIP, staff, or streamer/talent.
 */
export async function checkFreeToFreeRestriction(senderId, receiverId) {
  const [sender, receiver] = await Promise.all([
    User.findByPk(senderId, {
      attributes: ['id', 'userType', 'subscriptionPlan', 'vipActive', 'isFreeUser'],
    }),
    User.findByPk(receiverId, {
      attributes: ['id', 'userType', 'subscriptionPlan', 'vipActive', 'isFreeUser'],
    }),
  ]);

  if (!sender || !receiver) {
    return { allowed: false, message: 'User not found' };
  }

  if (isElevatedParticipant(sender) || isElevatedParticipant(receiver)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    message:
      'Free members can only message or send gifts to subscribers, VIP members, or creators. Upgrade your plan to continue.',
  };
}

/**
 * Aligns persisted verification fields with time-based expiry before auth responses.
 */
export async function ensureVerificationStateForUser(user) {
  if (!user?.id) return;

  const now = new Date();
  let dirty = false;

  const expired =
    user.verificationStatus === 'verified' &&
    user.verificationExpiresAt &&
    new Date(user.verificationExpiresAt) < now;

  if (expired) {
    user.isVerified = false;
    user.verificationStatus = 'reverify_required';
    user.reverifyRequiredAt = user.reverifyRequiredAt || now;
    dirty = true;
  }

  const stillValidVerified =
    user.verificationStatus === 'verified' &&
    (!user.verificationExpiresAt || new Date(user.verificationExpiresAt) >= now);

  if (stillValidVerified && user.isVerified === false) {
    user.isVerified = true;
    if (!user.verifiedAt) user.verifiedAt = now;
    dirty = true;
  }

  if (dirty) {
    await user.save();
  }
}

export async function markUserVerified(user, options = {}) {
  const provider = options.provider ?? null;
  const now = new Date();
  user.isVerified = true;
  user.verificationStatus = 'verified';
  user.verificationProvider = provider;
  user.verifiedAt = user.verifiedAt || now;
  user.reverifyRequiredAt = null;
  await user.save();
}

export async function markUserUnverified(user, reason) {
  user.isVerified = false;
  if (reason === 'manual_unverify') {
    user.verificationStatus = 'pending';
    user.verifiedAt = null;
    user.verificationExpiresAt = null;
    user.verificationProvider = null;
  }
  await user.save();
}
