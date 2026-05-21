import { Op } from 'sequelize';
import CrmEvent from '../models/CrmEvent.js';
import Profile from '../models/Profile.js';

/** Name only for CRM bell — never expose email in API/UI. */
export function crmEventDisplayName(event) {
  let raw = String(event?.message || '').trim();

  if (!raw || raw.includes('@')) {
    const fromTitle = String(event?.title || '')
      .replace(/^(User added in CRM|New registration|New user added):\s*/i, '')
      .trim();
    raw = fromTitle || raw;
  }

  raw = raw.replace(/\s*\([^)]*@[^)]*\)/g, '').trim();
  raw = raw.replace(/\s*\S+@\S+\.\S+/g, '').trim();
  raw = raw.replace(/\s*(was created by staff|signed up on the app)\.?$/i, '').trim();

  if (raw.includes('@')) {
    const beforeParen = raw.split('(')[0].trim();
    raw = beforeParen && !beforeParen.includes('@') ? beforeParen : '';
  }

  return raw || 'Member';
}

export function sanitizeCrmEventForClient(event) {
  const json = event?.toJSON ? event.toJSON() : { ...event };
  return {
    id: json.id,
    eventType: json.eventType,
    userId: json.userId,
    title: 'New user added',
    message: crmEventDisplayName(json),
    readAt: json.readAt,
    createdAt: json.createdAt,
  };
}

export async function recordCrmNewUserEvent(user, options = {}) {
  if (!user?.id) return null;

  const source = options.source || 'registration';

  let profile = options.profile;
  if (!profile) {
    profile = await Profile.findOne({
      where: { userId: user.id },
      attributes: ['firstName', 'lastName'],
    });
  }

  const name =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || 'New member';

  const title = 'New user added';
  const message = name;

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentDuplicate = await CrmEvent.findOne({
      where: {
        eventType: 'new_user',
        userId: user.id,
        createdAt: { [Op.gte]: since },
      },
      attributes: ['id'],
    });
    if (recentDuplicate) return recentDuplicate;

    return await CrmEvent.create({
      eventType: 'new_user',
      userId: user.id,
      title,
      message,
      payload: {
        source,
        userId: user.id,
      },
    });
  } catch (err) {
    console.error('recordCrmNewUserEvent error:', err.message);
    return null;
  }
}
