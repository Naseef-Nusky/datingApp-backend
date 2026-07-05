import cron from 'node-cron';
import { runMobileCompatibilityEmailJob } from './mobileCompatibilityEmail.js';

/**
 * Hourly check for mobile app users: send when the current top 3 matches differ from the last email.
 * Only users who logged in via /api/mobile/* (Capacitor app) receive this.
 */
export const startMobileCompatibilityEmailScheduler = () => {
  const cronExpr = process.env.MOBILE_COMPAT_EMAIL_CRON || '0 * * * *'; // every hour at :00 UTC

  cron.schedule(
    cronExpr,
    async () => {
      console.log('[mobileCompatEmail] Scheduled run…');
      await runMobileCompatibilityEmailJob();
    },
    { scheduled: true, timezone: 'UTC' }
  );

  console.log(`✅ Mobile compatibility email scheduler started (${cronExpr} UTC)`);
};

export { runMobileCompatibilityEmailJob, triggerMobileCompatibilityEmail } from './mobileCompatibilityEmail.js';
