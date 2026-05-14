import { Op } from 'sequelize';

/**
 * Seeded demo users from import scripts, e.g. dummy15_kendra@example.com.
 * They are userType "regular" but must not appear to streamers/talent.
 */
export function isDummyUserEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.trim().toLowerCase();
  return e.startsWith('dummy') && e.endsWith('@example.com');
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
