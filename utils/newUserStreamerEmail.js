import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { User, Profile, NewUserStreamerEmail } from '../models/index.js';
import { getSiteSettings } from './siteSettings.js';
import { excludeDummyUsersEmailWhere, isDummyUserEmail } from './dummyUser.js';
import { sendStreamerReadyToChatEmail } from './emailService.js';
import { getFrontendUrl } from './frontendUrl.js';

const DEFAULT_DELAY_MINUTES = parseInt(process.env.NEW_USER_STREAMER_EMAIL_DELAY_MINUTES || '2', 10);

/** DB may have been created before streamer_user_id was nullable — fix on startup. */
export const ensureNewUserStreamerEmailSchema = async () => {
  try {
    await sequelize.query(`
      ALTER TABLE new_user_streamer_emails
      ALTER COLUMN streamer_user_id DROP NOT NULL;
    `);
  } catch (err) {
    const msg = err?.message || '';
    if (!/does not exist|already/i.test(msg)) {
      console.warn('[newUserStreamerEmail] schema ensure:', msg);
    }
  }
};

const RETRY_WHEN_OFFLINE_MINUTES = parseInt(
  process.env.NEW_USER_STREAMER_EMAIL_RETRY_MINUTES || '15',
  10
);

const marketingEmailsPaused = () =>
  process.env.ENABLE_NEW_USER_STREAMER_EMAIL === 'false' ||
  process.env.ENABLE_NEW_USER_STREAMER_EMAIL === '0' ||
  process.env.PAUSE_MARKETING_EMAILS === 'true' ||
  process.env.PAUSE_MARKETING_EMAILS === '1';

export const getNewUserStreamerEmailSettings = async () => {
  const site = await getSiteSettings();
  return {
    enabled: !marketingEmailsPaused() && site.enableNewUserStreamerEmail !== false,
    delayMinutes:
      Number.isFinite(Number(site.newUserStreamerEmailDelayMinutes)) &&
      Number(site.newUserStreamerEmailDelayMinutes) > 0
        ? Number(site.newUserStreamerEmailDelayMinutes)
        : DEFAULT_DELAY_MINUTES,
  };
};

const getPrimaryPhotoUrl = (profile) => {
  const first = Array.isArray(profile?.photos) ? profile.photos[0] : null;
  if (!first) return null;
  if (typeof first === 'string') {
    return first.startsWith('http') ? first : null;
  }
  if (typeof first === 'object' && first?.url) {
    const url = String(first.url);
    return url.startsWith('http') ? url : null;
  }
  return null;
};

const normalizeGender = (value) => {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'man' || v === 'm') return 'male';
  if (v === 'woman' || v === 'f') return 'female';
  if (v === 'male' || v === 'female' || v === 'other') return v;
  return null;
};

/** Genders of streamers to feature — matches member preferences.lookingFor, else opposite of member gender. */
const targetStreamerGendersForMember = (memberProfile) => {
  const lookingFor = memberProfile?.preferences?.lookingFor;
  if (lookingFor != null && String(lookingFor).trim() !== '') {
    const lf = normalizeGender(lookingFor);
    if (lf === 'male' || lf === 'female') return [lf];
    if (lf === 'both' || lf === 'all') return ['male', 'female'];
  }
  const memberGender = normalizeGender(memberProfile?.gender);
  if (memberGender === 'male') return ['female'];
  if (memberGender === 'female') return ['male'];
  return ['male', 'female'];
};

const shuffle = (arr) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const toStreamerPayload = (streamer, frontendUrl) => ({
  id: streamer.id,
  firstName: streamer.profile?.firstName || streamer.email?.split('@')[0] || 'Someone',
  age: streamer.profile?.age ?? null,
  photoUrl: getPrimaryPhotoUrl(streamer.profile),
  chatUrl: `${frontendUrl}/profile/${streamer.id}`,
  isOnline: Boolean(streamer.profile?.isOnline),
});

/** All active streamers/talent matching the new member's seeking preference (online listed first). */
export const pickStreamersForWelcomeEmail = async (memberProfile) => {
  const targetGenders = targetStreamerGendersForMember(memberProfile);

  const streamers = await User.findAll({
    where: {
      userType: { [Op.in]: ['streamer', 'talent'] },
      isActive: true,
      isAdminCreated: true,
      ...excludeDummyUsersEmailWhere(),
    },
    include: [
      {
        model: Profile,
        as: 'profile',
        required: true,
        attributes: ['firstName', 'lastName', 'photos', 'isOnline', 'gender', 'age', 'location'],
      },
    ],
    attributes: ['id', 'email', 'userType'],
  });

  const eligible = streamers.filter((s) => {
    if (!s.email || isDummyUserEmail(s.email)) return false;
    const sg = normalizeGender(s.profile?.gender);
    if (!sg) return false;
    return targetGenders.includes(sg);
  });

  if (!eligible.length) {
    console.warn(
      `[newUserStreamerEmail] No streamers for target genders [${targetGenders.join(', ')}]`
    );
    return [];
  }

  const byName = (a, b) =>
    String(a.profile?.firstName || '').localeCompare(String(b.profile?.firstName || ''), undefined, {
      sensitivity: 'base',
    });

  const online = eligible.filter((s) => s.profile?.isOnline).sort(byName);
  const offline = eligible.filter((s) => !s.profile?.isOnline).sort(byName);
  const ordered = [...online, ...offline];
  if (!online.length) {
    console.warn(
      '[newUserStreamerEmail] No online streamer matching preference; including offline streamers'
    );
  }

  console.log(
    `[newUserStreamerEmail] Including all ${ordered.length} matching streamer(s) in welcome email`
  );
  return ordered;
};

/**
 * Queue a delayed email to a new regular user, sent as if from a random streamer.
 */
export const scheduleNewUserStreamerEmail = async (user, profile = null) => {
  try {
    if (!user?.id || user.userType !== 'regular') return { scheduled: false, reason: 'not_regular' };

    const { enabled, delayMinutes } = await getNewUserStreamerEmailSettings();
    if (!enabled) return { scheduled: false, reason: 'disabled' };

    const existing = await NewUserStreamerEmail.findOne({
      where: { newUserId: user.id, status: 'pending' },
    });
    if (existing) return { scheduled: false, reason: 'already_queued' };

    const sendAt = new Date(Date.now() + delayMinutes * 60 * 1000);
    await NewUserStreamerEmail.create({
      newUserId: user.id,
      streamerUserId: null,
      sendAt,
      status: 'pending',
    });

    console.log(
      `[newUserStreamerEmail] Queued for user ${user.id} at ${sendAt.toISOString()} (online streamer chosen at send time)`
    );
    return { scheduled: true, sendAt };
  } catch (err) {
    console.error('[newUserStreamerEmail] schedule error:', err.message);
    return { scheduled: false, reason: 'error', error: err.message };
  }
};

export const processDueNewUserStreamerEmails = async () => {
  const { enabled } = await getNewUserStreamerEmailSettings();
  if (!enabled) return { processed: 0 };

  const now = new Date();
  const due = await NewUserStreamerEmail.findAll({
    where: {
      status: 'pending',
      sendAt: { [Op.lte]: now },
    },
    limit: 25,
    order: [['send_at', 'ASC']],
  });

  let sent = 0;
  let failed = 0;

  for (const row of due) {
    try {
      const newUser = await User.findByPk(row.newUserId, {
        include: [{ model: Profile, as: 'profile', required: false }],
      });

      if (!newUser?.email || !newUser.isActive || newUser.userType !== 'regular') {
        row.status = 'skipped';
        row.error = 'new_user_ineligible';
        await row.save();
        continue;
      }

      const memberProfile = newUser.profile || {};
      const streamers = await pickStreamersForWelcomeEmail(memberProfile);
      if (!streamers.length) {
        row.sendAt = new Date(Date.now() + RETRY_WHEN_OFFLINE_MINUTES * 60 * 1000);
        row.error = 'no_streamer_available_retry';
        await row.save();
        console.warn(
          `[newUserStreamerEmail] No matching streamer for user ${row.newUserId}; retry at ${row.sendAt.toISOString()}`
        );
        continue;
      }

      row.streamerUserId = streamers[0].id;

      const frontendUrl = getFrontendUrl();
      const recipientName = memberProfile.firstName || newUser.email.split('@')[0] || 'there';
      const streamerPayloads = streamers.map((s) => toStreamerPayload(s, frontendUrl));
      const dashboardUrl = `${frontendUrl}/dashboard`;

      const result = await sendStreamerReadyToChatEmail(
        newUser.email,
        recipientName,
        streamerPayloads,
        dashboardUrl
      );

      if (!result?.success) {
        row.status = 'failed';
        row.error = result?.error || 'send_failed';
        await row.save();
        failed += 1;
        continue;
      }

      row.status = 'sent';
      row.sentAt = new Date();
      row.error = null;
      await row.save();
      sent += 1;
    } catch (err) {
      row.status = 'failed';
      row.error = err.message;
      await row.save();
      failed += 1;
      console.error('[newUserStreamerEmail] send error:', err.message);
    }
  }

  if (sent || failed) {
    console.log(`[newUserStreamerEmail] Processed due: sent=${sent}, failed=${failed}`);
  }
  return { processed: due.length, sent, failed };
};

/** Send welcome email immediately (admin/test). Returns { sent, count, streamerNames }. */
export const sendNewUserStreamerWelcomeEmailNow = async (userId) => {
  const newUser = await User.findByPk(userId, {
    include: [{ model: Profile, as: 'profile', required: false }],
  });
  if (!newUser?.email || newUser.userType !== 'regular') {
    return { sent: false, reason: 'not_regular_or_no_email' };
  }

  const memberProfile = newUser.profile || {};
  const streamers = await pickStreamersForWelcomeEmail(memberProfile);
  if (!streamers.length) {
    return { sent: false, reason: 'no_matching_streamers', count: 0 };
  }

  const frontendUrl = getFrontendUrl();
  const recipientName = memberProfile.firstName || newUser.email.split('@')[0] || 'there';
  const streamerPayloads = streamers.map((s) => toStreamerPayload(s, frontendUrl));
  const dashboardUrl = `${frontendUrl}/dashboard`;

  const result = await sendStreamerReadyToChatEmail(
    newUser.email,
    recipientName,
    streamerPayloads,
    dashboardUrl
  );

  return {
    sent: Boolean(result?.success),
    count: streamers.length,
    streamerNames: streamers.map((s) => s.profile?.firstName).filter(Boolean),
    error: result?.error,
  };
};

export const startNewUserStreamerEmailScheduler = () => {
  const intervalMs = Math.max(
    60_000,
    parseInt(process.env.NEW_USER_STREAMER_EMAIL_POLL_MS || '120000', 10)
  );

  ensureNewUserStreamerEmailSchema().catch((err) =>
    console.warn('[newUserStreamerEmail] schema ensure failed:', err.message)
  );

  const tick = () => {
    processDueNewUserStreamerEmails().catch((err) =>
      console.error('[newUserStreamerEmail] scheduler tick:', err.message)
    );
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  console.log(
    `✅ New-user streamer email scheduler started (every ${Math.round(intervalMs / 1000)}s, default delay ${DEFAULT_DELAY_MINUTES} min)`
  );
  return timer;
};
