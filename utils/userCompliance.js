import { Op } from 'sequelize';
import User from '../models/User.js';
import Profile from '../models/Profile.js';

export const VERIFICATION_VALIDITY_DAYS = 180;
const FREE_USER_INACTIVE_DAYS = 30;

const STAFF_USER_TYPES = new Set(['admin', 'superadmin', 'moderator', 'viewer']);

export const getVerificationExpiryDate = (fromDate = new Date()) => {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + VERIFICATION_VALIDITY_DAYS);
  return d;
};

export const markUserVerified = async (user, options = {}) => {
  const now = options.now || new Date();
  user.isVerified = true;
  user.verificationStatus = 'verified';
  user.verifiedAt = now;
  user.verificationExpiresAt = getVerificationExpiryDate(now);
  user.reverifyRequiredAt = null;
  if (options.provider) user.verificationProvider = options.provider;
  await user.save();
  return user;
};

export const markUserUnverified = async (user, reason = 'manual_unverify') => {
  user.isVerified = false;
  if (reason === 'expired') {
    user.verificationStatus = 'reverify_required';
    user.reverifyRequiredAt = user.reverifyRequiredAt || new Date();
  } else if (reason === 'manual_unverify') {
    user.verificationStatus = 'pending';
    user.verifiedAt = null;
    user.verificationExpiresAt = null;
    user.verificationProvider = null;
    user.reverifyRequiredAt = new Date();
  } else {
    user.verificationStatus = 'pending';
    user.reverifyRequiredAt = new Date();
  }
  await user.save();
  return user;
};

/** Aligns persisted verification fields with expiry and repairs inconsistent verified flags before auth/API use. */
export const ensureVerificationStateForUser = async (user) => {
  if (!user) return user;

  const now = new Date();

  if (user.isVerified && user.verificationExpiresAt && new Date(user.verificationExpiresAt) <= now) {
    await markUserUnverified(user, 'expired');
    return user;
  }

  const stillValidVerified =
    user.verificationStatus === 'verified' &&
    (!user.verificationExpiresAt || new Date(user.verificationExpiresAt) >= now);

  if (stillValidVerified && user.isVerified === false) {
    user.isVerified = true;
    if (!user.verifiedAt) user.verifiedAt = now;
    await user.save();
  }

  return user;
};

function isElevatedParticipant(u) {
  if (!u) return false;
  if (u.userType === 'streamer' || u.userType === 'talent') return true;
  if (u.subscriptionPlan && u.subscriptionPlan !== 'free') return true;
  if (u.vipActive === true) return true;
  if (u.isFreeUser === false) return true;
  return false;
}

/**
 * Blocks staff from member messaging endpoints; blocks free ↔ free messaging/gifting unless
 * a participant is subscribed, VIP, or a creator (streamer/talent).
 */
export const checkFreeToFreeRestriction = async (senderId, receiverId) => {
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

  if (STAFF_USER_TYPES.has(sender.userType) || STAFF_USER_TYPES.has(receiver.userType)) {
    return { allowed: false, message: 'Admin communication is restricted via this endpoint' };
  }

  if (isElevatedParticipant(sender) || isElevatedParticipant(receiver)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    message:
      'Free members can only message or send gifts to subscribers, VIP members, or creators. Upgrade your plan to continue.',
  };
};

export const enforceFreeUserEligibilitySweep = async () => {
  const users = await User.findAll({
    where: { isFreeUser: true },
    include: [{ model: Profile, as: 'profile', attributes: ['id', 'photos', 'bio'], required: false }],
    attributes: ['id', 'isFreeUser', 'isVerified', 'isActive', 'lastLogin'],
  });

  const inactiveBefore = new Date();
  inactiveBefore.setDate(inactiveBefore.getDate() - FREE_USER_INACTIVE_DAYS);

  let downgraded = 0;
  for (const user of users) {
    const hasRecentActivity = user.lastLogin && new Date(user.lastLogin) >= inactiveBefore;
    const hasProfilePhoto = Array.isArray(user.profile?.photos) && user.profile.photos.length > 0;
    const hasBio = typeof user.profile?.bio === 'string' && user.profile.bio.trim().length >= 20;
    const eligible = user.isVerified && user.isActive && hasRecentActivity && hasProfilePhoto && hasBio;

    if (!eligible) {
      user.isFreeUser = false;
      await user.save();
      downgraded += 1;
    }
  }

  return { scanned: users.length, downgraded };
};

export const expireVerificationSweep = async () => {
  const now = new Date();
  const users = await User.findAll({
    where: {
      isVerified: true,
      verificationExpiresAt: { [Op.not]: null, [Op.lt]: now },
    },
  });

  for (const user of users) {
    await markUserUnverified(user, 'expired');
  }

  return { expired: users.length };
};
