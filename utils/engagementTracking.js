import { Op } from 'sequelize';
import EngagementSession from '../models/EngagementSession.js';
import User from '../models/User.js';

const STREAMER_TYPES = new Set(['streamer', 'talent']);
const CHAT_IDLE_MS = parseInt(process.env.ENGAGEMENT_CHAT_IDLE_MS || '300000', 10); // 5 min

/** @returns {{ streamerId: string, memberId: string } | null} */
export async function resolveStreamerPair(userIdA, userIdB) {
  const users = await User.findAll({
    where: { id: [userIdA, userIdB] },
    attributes: ['id', 'userType'],
  });
  if (users.length < 2) return null;

  const byId = Object.fromEntries(users.map((u) => [u.id, u.userType]));
  const typeA = byId[userIdA];
  const typeB = byId[userIdB];

  if (STREAMER_TYPES.has(typeA) && typeB === 'regular') {
    return { streamerId: userIdA, memberId: userIdB };
  }
  if (STREAMER_TYPES.has(typeB) && typeA === 'regular') {
    return { streamerId: userIdB, memberId: userIdA };
  }
  return null;
}

function computeDurationSeconds(startedAt, endedAt) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  return Math.max(1, Math.floor((end - start) / 1000));
}

/** Close chat sessions idle longer than CHAT_IDLE_MS */
export async function closeStaleChatSessions() {
  const cutoff = new Date(Date.now() - CHAT_IDLE_MS);
  const stale = await EngagementSession.findAll({
    where: {
      sessionType: 'chat',
      status: 'active',
      lastActivityAt: { [Op.lt]: cutoff },
    },
  });

  for (const session of stale) {
    const endedAt = session.lastActivityAt || new Date();
    await session.update({
      status: 'completed',
      endedAt,
      durationSeconds: computeDurationSeconds(session.startedAt, endedAt),
    });
  }
  return stale.length;
}

/** Start video/voice engagement when call is accepted */
export async function startCallEngagement({ callerId, receiverId, callType, callRequestId }) {
  const pair = await resolveStreamerPair(callerId, receiverId);
  if (!pair) return null;

  const sessionType = callType === 'video' ? 'video' : 'voice';
  const now = new Date();

  return EngagementSession.create({
    streamerId: pair.streamerId,
    memberId: pair.memberId,
    sessionType,
    status: 'active',
    startedAt: now,
    lastActivityAt: now,
    callRequestId: callRequestId || null,
  });
}

/** End video/voice engagement when call ends */
export async function endCallEngagement({ userId, otherUserId, durationSeconds, callRequestId }) {
  const pair = await resolveStreamerPair(userId, otherUserId);
  if (!pair) return null;

  const where = {
    streamerId: pair.streamerId,
    memberId: pair.memberId,
    sessionType: { [Op.in]: ['video', 'voice'] },
    status: 'active',
  };
  if (callRequestId) {
    where.callRequestId = callRequestId;
  }

  const session = await EngagementSession.findOne({
    where,
    order: [['started_at', 'DESC']],
  });

  if (!session) return null;

  const endedAt = new Date();
  const duration =
    durationSeconds != null && durationSeconds >= 0
      ? Math.max(1, Math.floor(durationSeconds))
      : computeDurationSeconds(session.startedAt, endedAt);

  await session.update({
    status: 'completed',
    endedAt,
    durationSeconds: duration,
    lastActivityAt: endedAt,
  });
  return session;
}

/** Extend or start chat engagement on message activity */
export async function recordChatEngagement({ senderId, receiverId, chatId }) {
  await closeStaleChatSessions();

  const pair = await resolveStreamerPair(senderId, receiverId);
  if (!pair) return null;

  const now = new Date();
  let session = await EngagementSession.findOne({
    where: {
      streamerId: pair.streamerId,
      memberId: pair.memberId,
      sessionType: 'chat',
      status: 'active',
    },
    order: [['started_at', 'DESC']],
  });

  if (session) {
    await session.update({ lastActivityAt: now, chatId: chatId || session.chatId });
    return session;
  }

  return EngagementSession.create({
    streamerId: pair.streamerId,
    memberId: pair.memberId,
    sessionType: 'chat',
    status: 'active',
    startedAt: now,
    lastActivityAt: now,
    chatId: chatId || null,
  });
}

/** Close all active sessions when streamer disconnects */
export async function closeActiveSessionsForStreamer(streamerId) {
  await closeStaleChatSessions();

  const active = await EngagementSession.findAll({
    where: { streamerId, status: 'active' },
  });

  const now = new Date();
  for (const session of active) {
    const endPoint =
      session.sessionType === 'chat'
        ? session.lastActivityAt || now
        : now;
    await session.update({
      status: 'completed',
      endedAt: endPoint,
      durationSeconds: computeDurationSeconds(session.startedAt, endPoint),
    });
  }
  return active.length;
}

export function formatDuration(seconds) {
  if (seconds == null || seconds < 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function secondsToHours(seconds) {
  return Math.round((seconds / 3600) * 100) / 100;
}
