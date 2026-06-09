import { isDummyUserEmail } from './dummyUser.js';

const DATING_USER_TYPES = ['regular', 'streamer', 'talent'];

/** True when a user/profile is complete enough to appear in CRM lists and new-user events. */
export function isSuccessfulRegistrationProfile(user) {
  if (!user?.id) return false;
  if (!DATING_USER_TYPES.includes(user.userType)) return false;
  if (isDummyUserEmail(user.email)) return false;
  if (user.registrationComplete === false) return false;

  const profile = user.profile;
  if (!profile || !String(profile.firstName || '').trim()) return false;

  return true;
}
