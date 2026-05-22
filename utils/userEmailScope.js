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

export function isCrmSystemUser(userType) {
  return CRM_SYSTEM_USER_TYPES.includes(userType);
}
