import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { User, Profile, NewUserStreamerEmail } from '../models/index.js';
import { getSiteSettings } from './siteSettings.js';
import { excludeDummyUsersEmailWhere, isDummyUserEmail } from './dummyUser.js';
import { sendStreamerReadyToChatEmail } from './emailService.js';

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

export const getNewUserStreamerEmailSettings = async () => {
  const site = await getSiteSettings();
  return {
    enabled: site.enableNewUserStreamerEmail !== false,
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

/** Real streamers only (userType streamer, not talent/dummy seeds). Prefer online. */
const pickRandomStreamerForWelcomeEmail = async () => {
  const streamers = await User.findAll({
    where: {
      userType: 'streamer',
      isActive: true,
      ...excludeDummyUsersEmailWhere(),
    },
    include: [
      {
        model: Profile,
        as: 'profile',
        required: true,
        attributes: ['firstName', 'lastName', 'photos', 'isOnline'],
      },
    ],
    attributes: ['id', 'email', 'userType'],
  });

  const eligible = streamers.filter((s) => s.email && !isDummyUserEmail(s.email));
  if (!eligible.length) return null;

  const online = eligible.filter((s) => s.profile?.isOnline);
  const pool = online.length > 0 ? online : eligible;
  if (online.length === 0) {
    console.warn(
      '[newUserStreamerEmail] No online streamer; using random active streamer for welcome email'
    );
  }
  return pool[Math.floor(Math.random() * pool.length)];
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

      const streamer = await pickRandomStreamerForWelcomeEmail();
      if (!streamer) {
        row.sendAt = new Date(Date.now() + RETRY_WHEN_OFFLINE_MINUTES * 60 * 1000);
        row.error = 'no_streamer_available_retry';
        await row.save();
        console.warn(
          `[newUserStreamerEmail] No active streamer for user ${row.newUserId}; retry at ${row.sendAt.toISOString()}`
        );
        continue;
      }

      row.streamerUserId = streamer.id;

      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
      const recipientName = newUser.profile?.firstName || newUser.email.split('@')[0] || 'there';
      const streamerPayload = {
        id: streamer.id,
        firstName: streamer.profile?.firstName || streamer.email?.split('@')[0] || 'Someone',
        photoUrl: getPrimaryPhotoUrl(streamer.profile),
      };
      const chatUrl = `${frontendUrl}/profile/${streamer.id}`;

      const result = await sendStreamerReadyToChatEmail(
        newUser.email,
        recipientName,
        streamerPayload,
        chatUrl
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
