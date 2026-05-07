import { Op } from 'sequelize';
import User from '../models/User.js';
import Profile from '../models/Profile.js';

export const VERIFICATION_VALIDITY_DAYS = 180;
const FREE_USER_INACTIVE_DAYS = 30;

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
  user.verificationStatus = reason === 'expired' ? 'reverify_required' : 'pending';
  user.reverifyRequiredAt = new Date();
  await user.save();
  return user;
};

export const ensureVerificationStateForUser = async (user) => {
  if (!user) return user;
  if (!user.isVerified) return user;
  if (!user.verificationExpiresAt) return user;
  if (new Date(user.verificationExpiresAt) > new Date()) return user;
  await markUserUnverified(user, 'expired');
  return user;
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

export const checkFreeToFreeRestriction = async (senderId, receiverId) => {
  const users = await User.findAll({
    where: { id: { [Op.in]: [senderId, receiverId] } },
    attributes: ['id', 'isFreeUser', 'userType'],
  });
  if (users.length !== 2) {
    return { allowed: false, message: 'User not found' };
  }
  const [a, b] = users;
  const isParticipantAdmin = ['superadmin', 'admin', 'moderator', 'viewer'].includes(a.userType) || ['superadmin', 'admin', 'moderator', 'viewer'].includes(b.userType);
  if (isParticipantAdmin) return { allowed: false, message: 'Admin communication is restricted via this endpoint' };

  if (a.isFreeUser && b.isFreeUser) {
    return {
      allowed: false,
      message: 'Free Users cannot contact other Free Users. Contact a Paying Member instead.',
    };
  }
  return { allowed: true };
};
