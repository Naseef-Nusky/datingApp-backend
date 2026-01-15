import cron from 'node-cron';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import Match from '../models/Match.js';
import Message from '../models/Message.js';
import Notification from '../models/Notification.js';
import { Op } from 'sequelize';
import { sendDailyDigest } from './sendgridService.js';

/**
 * Calculate daily stats for a user
 */
const calculateDailyStats = async (userId, startDate, endDate) => {
  try {
    // New matches (mutual matches created today)
    const newMatches = await Match.count({
      where: {
        [Op.or]: [
          { user1: userId },
          { user2: userId },
        ],
        isMutual: true,
        matchedAt: {
          [Op.between]: [startDate, endDate],
        },
      },
    });

    // New messages received today
    const newMessages = await Message.count({
      where: {
        receiver: userId,
        messageType: {
          [Op.in]: ['text', 'email'],
        },
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
    });

    // Profile views (notifications of type profile_view created today)
    const profileViews = await Notification.count({
      where: {
        userId,
        type: 'profile_view',
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
    });

    // Unread messages
    const unreadMessages = await Message.count({
      where: {
        receiver: userId,
        isRead: false,
        messageType: {
          [Op.in]: ['text', 'email'],
        },
      },
    });

    return {
      newMatches,
      newMessages,
      profileViews,
      unreadMessages,
    };
  } catch (error) {
    console.error('Error calculating daily stats:', error);
    return {
      newMatches: 0,
      newMessages: 0,
      profileViews: 0,
      unreadMessages: 0,
    };
  }
};

/**
 * Send daily digest to a single user
 */
const sendUserDigest = async (user) => {
  try {
    const prefs = user.emailPreferences || {};
    
    // Check if user wants daily digest
    if (prefs.dailyDigest === false) {
      return;
    }

    // Get user's preferred digest time (default 9 AM)
    const digestTime = prefs.digestTime || '09:00';
    const [hours, minutes] = digestTime.split(':').map(Number);
    
    // Calculate date range for today
    const now = new Date();
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    // Calculate stats
    const stats = await calculateDailyStats(user.id, startDate, endDate);

    // Only send if there's activity or unread messages
    if (stats.newMatches === 0 && stats.newMessages === 0 && 
        stats.profileViews === 0 && stats.unreadMessages === 0) {
      return; // Skip if no activity
    }

    // Send digest email
    const emailResult = await sendDailyDigest(user, stats);
    
    if (emailResult.success) {
      console.log(`✅ Daily digest sent to ${user.email}`);
    } else {
      console.error(`❌ Failed to send daily digest to ${user.email}:`, emailResult.error);
    }
  } catch (error) {
    console.error(`Error sending daily digest to user ${user.id}:`, error);
  }
};

/**
 * Send daily digests to all users
 */
const sendAllDigests = async () => {
  try {
    console.log('📧 Starting daily digest job...');
    
    const users = await User.findAll({
      where: {
        isActive: true,
        isVerified: true,
      },
      include: [
        {
          model: Profile,
          as: 'profile',
        },
      ],
    });

    console.log(`📊 Found ${users.length} active users`);

    // Process users in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      await Promise.all(batch.map(user => sendUserDigest(user)));
      
      // Small delay between batches
      if (i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('✅ Daily digest job completed');
  } catch (error) {
    console.error('❌ Error in daily digest job:', error);
  }
};

/**
 * Schedule daily digest job
 * Runs every day at 9 AM (can be customized per user)
 */
export const startDailyDigestScheduler = () => {
  // Run at 9 AM every day
  cron.schedule('0 9 * * *', async () => {
    console.log('🕘 Running scheduled daily digest...');
    await sendAllDigests();
  }, {
    scheduled: true,
    timezone: 'UTC',
  });

  console.log('✅ Daily digest scheduler started (runs daily at 9 AM UTC)');
};

/**
 * Manual trigger for testing
 */
export const triggerDailyDigest = async (userId = null) => {
  if (userId) {
    const user = await User.findByPk(userId, {
      include: [{ model: Profile, as: 'profile' }],
    });
    if (user) {
      await sendUserDigest(user);
    }
  } else {
    await sendAllDigests();
  }
};

export default {
  startDailyDigestScheduler,
  triggerDailyDigest,
  sendUserDigest,
};
