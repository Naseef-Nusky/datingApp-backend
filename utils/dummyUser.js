import { Op } from 'sequelize';

/**
 * Seeded demo users from import scripts, e.g. dummy15_kendra@example.com.
 * They are userType "regular" but must not appear to streamers/talent.
 */
export function isDummyUserEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.trim().toLowerCase();
  if (e.startsWith('dummy') && e.endsWith('@example.com')) return true;
  // Test/seed streamer accounts (e.g. dummy.briar@dating.com, dummy.zara@streamer.com)
  if (e.startsWith('dummy')) return true;
  if (e.endsWith('@streamer.com')) return true;
  return false;
}

/**
 * Sequelize fragment for User.where: exclude dummy*@example.com (combine with [Op.and]).
 */
export function excludeDummyUsersEmailWhere() {
  return {
    [Op.or]: [
      { email: { [Op.notILike]: 'dummy%' } },
      { email: { [Op.notILike]: '%@example.com' } },
    ],
  };
}
