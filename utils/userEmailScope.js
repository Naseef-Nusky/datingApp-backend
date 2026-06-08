import { Op } from 'sequelize';

/** CRM panel accounts (System Users). */
export const CRM_SYSTEM_USER_TYPES = ['superadmin', 'admin', 'moderator', 'viewer', 'crm_streamer'];

/** Dating app accounts (members / talent). */
export const APP_DATING_USER_TYPES = ['regular', 'streamer', 'talent'];

export const STREAMER_USER_TYPES = ['streamer', 'talent'];

export function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

export function emailIlikeWhere(normalizedEmail) {
  return { email: { [Op.iLike]: normalizedEmail } };
}

export function crmStaffEmailWhere(normalizedEmail) {
  return {
    ...emailIlikeWhere(normalizedEmail),
    userType: { [Op.in]: CRM_SYSTEM_USER_TYPES },
  };
}

export function appDatingEmailWhere(normalizedEmail) {
  return {
    ...emailIlikeWhere(normalizedEmail),
    userType: { [Op.in]: APP_DATING_USER_TYPES },
  };
}

export function regularMemberEmailWhere(normalizedEmail) {
  return {
    ...emailIlikeWhere(normalizedEmail),
    userType: 'regular',
  };
}

export function streamerEmailWhere(normalizedEmail) {
  return {
    ...emailIlikeWhere(normalizedEmail),
    userType: { [Op.in]: STREAMER_USER_TYPES },
  };
}

export async function findCrmStaffByEmail(User, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return User.findOne({ where: crmStaffEmailWhere(normalized) });
}

export async function findRegularMemberByEmail(User, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return User.findOne({ where: regularMemberEmailWhere(normalized) });
}

export async function findAppDatingUserByEmail(User, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return User.findOne({ where: appDatingEmailWhere(normalized) });
}

export async function findStreamerByEmail(User, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return User.findOne({ where: streamerEmailWhere(normalized) });
}

/** Any row in users — email is globally unique across all account types. */
export async function findAnyUserByEmail(User, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return User.findOne({ where: emailIlikeWhere(normalized) });
}

export function duplicateEmailMessage(existingUser, intent = 'account') {
  if (!existingUser) return null;
  const type = String(existingUser.userType || 'account');
  if (intent === 'streamer' && (type === 'streamer' || type === 'talent')) {
    return 'This email is already registered as a streamer. Please use a different email.';
  }
  if (intent === 'member' && type === 'regular') {
    return 'This email is already registered as a member. Please use a different email.';
  }
  if (intent === 'crm' && CRM_SYSTEM_USER_TYPES.includes(type)) {
    return 'This email is already registered as a CRM user. Please use a different email.';
  }
  return `This email is already registered (${type}). Please use a different email.`;
}

export function isCrmSystemUser(userType) {
  return CRM_SYSTEM_USER_TYPES.includes(userType);
}
