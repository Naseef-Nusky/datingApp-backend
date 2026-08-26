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

/** Sequelize fragment: only seeded dummy profiles (e.g. dummy15_kendra@example.com). */
export function onlyDummyUsersEmailWhere() {
  return {
    [Op.and]: [
      { email: { [Op.iLike]: 'dummy%' } },
      { email: { [Op.iLike]: '%@example.com' } },
    ],
  };
}

/** Mark seeded dummy profiles online the same way a real logged-in user is. */
export async function markDummyProfilesOnline(User, Profile) {
  const dummyUsers = await User.findAll({
    where: onlyDummyUsersEmailWhere(),
    attributes: ['id'],
  });
  const ids = dummyUsers.map((u) => u.id);
  if (ids.length === 0) return 0;
  const [count] = await Profile.update(
    { isOnline: true },
    { where: { userId: { [Op.in]: ids } } }
  );
  return count;
}
