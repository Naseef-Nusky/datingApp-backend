import CrmEvent from '../models/CrmEvent.js';
import Profile from '../models/Profile.js';

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
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() ||
    user.email?.split('@')[0] ||
    'New member';

  const title =
    source === 'crm'
      ? `User added in CRM: ${name}`
      : `New registration: ${name}`;

  const message =
    source === 'crm'
      ? `${name} (${user.email}) was created by staff.`
      : `${name} (${user.email}) signed up on the app.`;

  try {
    return await CrmEvent.create({
      eventType: 'new_user',
      userId: user.id,
      title,
      message,
      payload: {
        source,
        userType: user.userType,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('recordCrmNewUserEvent error:', err.message);
    return null;
  }
}
