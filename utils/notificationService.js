import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import {
  sendMatchNotification,
  sendMessageNotification,
  sendProfileViewNotification,
} from './sendgridService.js';

/**
 * Check if user has email preference enabled
 */
const shouldSendEmail = async (userId, notificationType) => {
  try {
    const user = await User.findByPk(userId);
    if (!user || !user.emailPreferences) return false;

    const prefs = user.emailPreferences;
    
    switch (notificationType) {
      case 'new_match':
        return prefs.newMatches !== false;
      case 'new_message':
        return prefs.newMessages !== false;
      case 'profile_view':
        return prefs.profileViews !== false;
      default:
        return true;
    }
  } catch (error) {
    console.error('Error checking email preferences:', error);
    return true; // Default to sending if error
  }
};

/**
 * Create match notification and send email
 */
export const notifyNewMatch = async (userId, matchData) => {
  try {
    // Create notification in database
    const notification = await Notification.create({
      userId,
      type: 'new_match',
      title: 'New Match!',
      message: `You have a new match with ${matchData.profile?.firstName || 'Someone'}!`,
      relatedId: matchData.id,
      relatedType: 'match',
      emailSent: false,
    });

    // Send email if preference enabled
    const shouldEmail = await shouldSendEmail(userId, 'new_match');
    if (shouldEmail) {
      const user = await User.findByPk(userId, {
        include: [{ model: Profile, as: 'profile' }],
      });

      if (user) {
        const emailResult = await sendMatchNotification(user, matchData);
        if (emailResult.success) {
          await notification.update({
            emailSent: true,
            emailSentAt: new Date(),
            sendgridMessageId: emailResult.messageId,
          });
        }
      }
    }

    return notification;
  } catch (error) {
    console.error('Error creating match notification:', error);
    throw error;
  }
};

/**
 * Create message notification and send email
 */
export const notifyNewMessage = async (userId, senderData, messageContent, messageId) => {
  try {
    const senderName = senderData.profile?.firstName || senderData.email?.split('@')[0] || 'Someone';
    
    // Create notification in database
    const notification = await Notification.create({
      userId,
      type: 'new_message',
      title: `New message from ${senderName}`,
      message: messageContent.substring(0, 200),
      relatedId: messageId,
      relatedType: 'message',
      emailSent: false,
    });

    // Send email if preference enabled
    const shouldEmail = await shouldSendEmail(userId, 'new_message');
    if (shouldEmail) {
      const user = await User.findByPk(userId, {
        include: [{ model: Profile, as: 'profile' }],
      });

      if (user) {
        const emailResult = await sendMessageNotification(user, senderData, messageContent, messageId);
        if (emailResult.success) {
          await notification.update({
            emailSent: true,
            emailSentAt: new Date(),
            sendgridMessageId: emailResult.messageId,
          });
        }
      }
    }

    return notification;
  } catch (error) {
    console.error('Error creating message notification:', error);
    throw error;
  }
};

/**
 * Create profile view notification and send email
 */
export const notifyProfileView = async (userId, viewerData) => {
  try {
    const viewerName = viewerData.profile?.firstName || viewerData.email?.split('@')[0] || 'Someone';
    
    // Create notification in database
    const notification = await Notification.create({
      userId,
      type: 'profile_view',
      title: 'Profile Viewed',
      message: `${viewerName} viewed your profile`,
      relatedId: viewerData.id,
      relatedType: 'user',
      emailSent: false,
    });

    // Send email if preference enabled (throttle to once per day per viewer)
    const shouldEmail = await shouldSendEmail(userId, 'profile_view');
    if (shouldEmail) {
      // Check if we already sent an email for this viewer today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const existingNotification = await Notification.findOne({
        where: {
          userId,
          type: 'profile_view',
          relatedId: viewerData.id,
          emailSent: true,
          emailSentAt: {
            [require('sequelize').Op.gte]: today,
          },
        },
      });

      if (!existingNotification) {
        const user = await User.findByPk(userId, {
          include: [{ model: Profile, as: 'profile' }],
        });

        if (user) {
          const emailResult = await sendProfileViewNotification(user, viewerData);
          if (emailResult.success) {
            await notification.update({
              emailSent: true,
              emailSentAt: new Date(),
              sendgridMessageId: emailResult.messageId,
            });
          }
        }
      }
    }

    return notification;
  } catch (error) {
    console.error('Error creating profile view notification:', error);
    throw error;
  }
};

export default {
  notifyNewMatch,
  notifyNewMessage,
  notifyProfileView,
};
