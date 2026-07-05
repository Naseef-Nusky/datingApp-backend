import { Op } from 'sequelize';
import { User, Profile, Compatibility } from '../models/index.js';
import {
  normalizeUserPair,
  buildProfileSnapshot,
  computeHeuristicCompatibility,
  getSharedInterestLabels,
} from './compatibilityService.js';
import { sendMobileCompatibleMatchesEmail } from './emailService.js';
import {
  isMobileAppUser,
  markCompatibilityEmailSent,
  topMatchesChanged,
  hoursSince,
} from './mobileAppUser.js';
import { isDummyUserEmail } from './dummyUser.js';

/** 0 = no minimum; email always uses top N by score (default 3). Set MOBILE_COMPAT_EMAIL_MIN_SCORE to filter. */
const DEFAULT_MIN_SCORE = parseInt(process.env.MOBILE_COMPAT_EMAIL_MIN_SCORE || '0', 10);
const DEFAULT_MAX_MATCHES = parseInt(process.env.MOBILE_COMPAT_EMAIL_MAX_MATCHES || '3', 10);
const DEFAULT_CANDIDATE_LIMIT = parseInt(process.env.MOBILE_COMPAT_EMAIL_CANDIDATES || '60', 10);
/** Minimum hours between emails per user (hourly job still only sends when top 3 changed). */
const EMAIL_MIN_HOURS = parseFloat(process.env.MOBILE_COMPAT_EMAIL_MIN_HOURS || '1');

function getPrimaryPhotoUrl(profile) {
  const first = Array.isArray(profile?.photos) ? profile.photos[0] : null;
  if (!first) return null;
  if (typeof first === 'string') return first.startsWith('http') ? first : null;
  if (typeof first === 'object' && first?.url) {
    const url = String(first.url);
    return url.startsWith('http') ? url : null;
  }
  return null;
}

async function scorePair(viewerId, viewerSnapshot, otherProfile) {
  const otherUserId = String(otherProfile.userId);
  const [userLowId, userHighId] = normalizeUserPair(viewerId, otherUserId);
  const cached = await Compatibility.findOne({ where: { userLowId, userHighId } });

  const otherSnapshot = buildProfileSnapshot(otherProfile);
  if (!otherSnapshot) return null;

  if (cached) {
    return {
      userId: otherUserId,
      firstName: otherProfile.firstName,
      age: otherProfile.age,
      photoUrl: getPrimaryPhotoUrl(otherProfile),
      score: cached.score,
      sharedInterests: getSharedInterestLabels(
        viewerSnapshot,
        otherSnapshot,
        3
      ),
      strengths: Array.isArray(cached.strengths) ? cached.strengths : [],
    };
  }

  const heuristic = computeHeuristicCompatibility(viewerSnapshot, otherSnapshot);
  const shared = getSharedInterestLabels(viewerSnapshot, otherSnapshot, 3);

  return {
    userId: otherUserId,
    firstName: otherProfile.firstName,
    age: otherProfile.age,
    photoUrl: getPrimaryPhotoUrl(otherProfile),
    score: heuristic.score,
    sharedInterests: shared.length ? shared : heuristic.strengths.slice(0, 3),
    strengths: heuristic.strengths,
  };
}

/**
 * Find top compatible profiles for a viewer (heuristic + cached AI scores).
 */
export async function findTopCompatibleMatches(
  viewerId,
  { minScore = DEFAULT_MIN_SCORE, limit = DEFAULT_MAX_MATCHES, candidateLimit = DEFAULT_CANDIDATE_LIMIT } = {}
) {
  const viewerProfile = await Profile.findOne({ where: { userId: viewerId } });
  let viewerSnapshot = buildProfileSnapshot(viewerProfile);
  if (!viewerSnapshot) {
    viewerSnapshot = { firstName: 'You', interests: [], age: null, relationshipGoal: null };
  }

  const where = {
    userId: { [Op.ne]: viewerId },
  };

  if (viewerProfile?.preferences?.lookingFor) {
    const raw = String(viewerProfile.preferences.lookingFor).toLowerCase();
    const g = raw === 'man' ? 'male' : raw === 'woman' ? 'female' : raw;
    if (g === 'male' || g === 'female') where.gender = g;
  } else if (viewerProfile?.gender === 'male') {
    where.gender = 'female';
  } else if (viewerProfile?.gender === 'female') {
    where.gender = 'male';
  }

  const candidates = await Profile.findAll({
    where,
    limit: candidateLimit,
    order: [['updatedAt', 'DESC']],
  });

  const scored = [];
  for (const candidate of candidates) {
    const row = await scorePair(viewerId, viewerSnapshot, candidate);
    if (row) scored.push(row);
  }

  scored.sort((a, b) => b.score - a.score);
  const eligible = minScore > 0 ? scored.filter((row) => row.score >= minScore) : scored;
  return eligible.slice(0, limit);
}

export async function sendMobileUserCompatibilityEmail(user, { force = false } = {}) {
  const prefs = user.emailPreferences || {};
  if (prefs.mobileCompatibleMatches === false) {
    return { skipped: true, reason: 'opt-out' };
  }

  if (!isMobileAppUser(user)) {
    return { skipped: true, reason: 'not-mobile-user' };
  }

  if (isDummyUserEmail(user.email)) {
    return { skipped: true, reason: 'dummy-user' };
  }

  const matches = await findTopCompatibleMatches(user.id);
  if (!matches.length) {
    return { skipped: true, reason: 'no-matches' };
  }

  if (!force) {
    const lastIds = user.settings?.mobileApp?.lastCompatibilityEmailMatchIds;
    if (!topMatchesChanged(lastIds, matches)) {
      return { skipped: true, reason: 'same-top-matches' };
    }

    const lastSent = user.settings?.mobileApp?.lastCompatibilityEmailAt;
    if (lastSent && hoursSince(lastSent) < EMAIL_MIN_HOURS) {
      return { skipped: true, reason: 'min-interval' };
    }
  }

  const recipientName =
    user.settings?.firstName ||
    (await Profile.findOne({ where: { userId: user.id }, attributes: ['firstName'] }))?.firstName ||
    user.email?.split('@')[0] ||
    'there';

  const result = await sendMobileCompatibleMatchesEmail(user.email, recipientName, matches);
  if (result?.success) {
    await markCompatibilityEmailSent(user.id, matches);
    return { sent: true, matchCount: matches.length, matchIds: matches.map((m) => m.userId) };
  }
  return { skipped: true, reason: 'send-failed', error: result?.error };
}

export async function runMobileCompatibilityEmailJob() {
  if (process.env.PAUSE_MARKETING_EMAILS === 'true') {
    console.log('[mobileCompatEmail] Skipped — PAUSE_MARKETING_EMAILS=true');
    return;
  }
  if (process.env.ENABLE_MOBILE_COMPATIBILITY_EMAIL === 'false') {
    console.log('[mobileCompatEmail] Skipped — ENABLE_MOBILE_COMPATIBILITY_EMAIL=false');
    return;
  }

  console.log('[mobileCompatEmail] Starting job…');
  const users = await User.findAll({
    where: {
      isActive: true,
      userType: 'regular',
    },
    attributes: ['id', 'email', 'settings', 'emailPreferences'],
  });

  const mobileUsers = users.filter(isMobileAppUser);
  console.log(`[mobileCompatEmail] ${mobileUsers.length} mobile app user(s)`);

  let sent = 0;
  let skipped = 0;

  for (const user of mobileUsers) {
    try {
      const outcome = await sendMobileUserCompatibilityEmail(user);
      if (outcome.sent) sent += 1;
      else skipped += 1;
    } catch (err) {
      console.error(`[mobileCompatEmail] User ${user.id}:`, err.message);
      skipped += 1;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[mobileCompatEmail] Done — sent=${sent}, skipped=${skipped}`);
}

export async function triggerMobileCompatibilityEmail(userId, options = {}) {
  const user = await User.findByPk(userId, {
    attributes: ['id', 'email', 'settings', 'emailPreferences', 'userType', 'isActive'],
  });
  if (!user) throw new Error('User not found');
  return sendMobileUserCompatibilityEmail(user, options);
}
