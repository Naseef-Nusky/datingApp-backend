#!/usr/bin/env node
/**
 * Send test engagement emails (compatibility, daily digest, new match).
 *
 * Usage:
 *   node scripts/sendTestEngagementEmail.mjs --email you@example.com
 *   node scripts/sendTestEngagementEmail.mjs --email you@example.com --type compatibility
 *   node scripts/sendTestEngagementEmail.mjs --email you@example.com --type digest
 *   node scripts/sendTestEngagementEmail.mjs --email you@example.com --type all
 *   node scripts/sendTestEngagementEmail.mjs --direct --email you@example.com --type all
 *
 * Env fallback: TEST_ENGAGEMENT_EMAIL or ADMIN_EMAIL
 */
import dotenv from 'dotenv';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import '../models/index.js';
import { User, Profile } from '../models/index.js';
import { triggerMobileCompatibilityEmail } from '../utils/mobileCompatibilityEmail.js';
import { touchMobileAppUser } from '../utils/mobileAppUser.js';
import { sendDailyDigest, sendMatchNotification } from '../utils/sendgridService.js';
import { sendMobileCompatibleMatchesEmail } from '../utils/emailService.js';

dotenv.config();

const args = process.argv.slice(2);

function getArg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const emailArg = getArg('--email') || process.env.TEST_ENGAGEMENT_EMAIL || process.env.ADMIN_EMAIL;
const type = getArg('--type') || 'compatibility';
const direct = args.includes('--direct');

async function findRegularUser(email) {
  const normalized = email.toLowerCase().trim();
  let user = await User.findOne({
    where: { email: { [Op.iLike]: normalized }, userType: 'regular', isActive: true },
    attributes: ['id', 'email', 'settings', 'emailPreferences', 'userType', 'isActive'],
  });
  if (user) return user;

  // Any active user with this email (e.g. test on streamer — script may still fail prefs)
  user = await User.findOne({
    where: { email: { [Op.iLike]: normalized }, isActive: true },
    attributes: ['id', 'email', 'settings', 'emailPreferences', 'userType', 'isActive'],
  });
  return user;
}

async function sendCompatibilityTest(user) {
  await touchMobileAppUser(user.id);
  const outcome = await triggerMobileCompatibilityEmail(user.id, { force: true });
  return { label: 'Mobile compatibility matches', outcome };
}

async function sendDigestTest(user) {
  const profile = await Profile.findOne({ where: { userId: user.id }, attributes: ['firstName'] });
  const userWithProfile = { ...user.toJSON(), profile };
  const stats = {
    newMatches: 2,
    newMessages: 5,
    profileViews: 3,
    unreadMessages: 1,
  };
  const result = await sendDailyDigest(userWithProfile, stats);
  return { label: 'Daily digest (sample stats)', outcome: result };
}

async function sendMatchTest(user) {
  const profile = await Profile.findOne({ where: { userId: user.id }, attributes: ['firstName'] });
  const userWithProfile = { ...user.toJSON(), profile };
  const matchData = {
    id: 'test-match-id',
    profile: {
      firstName: 'Alex',
      age: 28,
      photos: [{ url: 'https://vantagedating.com/logo.jpeg' }],
    },
  };
  const result = await sendMatchNotification(userWithProfile, matchData);
  return { label: 'New match notification', outcome: result };
}

async function sendCompatibilityDirect(email) {
  const matches = [
    {
      firstName: 'Alex',
      age: 28,
      score: 92,
      photoUrl: 'https://vantagedating.com/logo.jpeg',
      sharedInterests: ['Travel', 'Cooking', 'Fitness'],
      strengths: ['Great conversation match', 'Similar lifestyle'],
    },
    {
      firstName: 'Jordan',
      age: 31,
      score: 88,
      photoUrl: null,
      sharedInterests: ['Music', 'Art'],
      strengths: ['Shared values', 'Active lifestyle'],
    },
  ];
  const result = await sendMobileCompatibleMatchesEmail(email, 'there', matches);
  return { label: 'Mobile compatibility matches (sample data)', outcome: result };
}

async function sendDigestDirect(email) {
  const userWithProfile = {
    email,
    profile: { firstName: 'Test' },
  };
  const stats = {
    newMatches: 2,
    newMessages: 5,
    profileViews: 3,
    unreadMessages: 1,
  };
  const result = await sendDailyDigest(userWithProfile, stats);
  return { label: 'Daily digest (sample stats)', outcome: result };
}

async function sendMatchDirect(email) {
  const userWithProfile = {
    email,
    profile: { firstName: 'Test' },
  };
  const matchData = {
    id: 'test-match-id',
    profile: {
      firstName: 'Alex',
      age: 28,
      photos: [{ url: 'https://vantagedating.com/logo.jpeg' }],
    },
  };
  const result = await sendMatchNotification(userWithProfile, matchData);
  return { label: 'New match notification', outcome: result };
}

async function main() {
  if (!emailArg) {
    console.error('❌ Provide --email you@example.com (or set TEST_ENGAGEMENT_EMAIL in .env)');
    process.exit(1);
  }

  if (!process.env.SENDGRID_API_KEY) {
    console.error('❌ SENDGRID_API_KEY is not set in .env');
    process.exit(1);
  }

  if (direct) {
    console.log(`📧 Direct test to: ${emailArg} (no DB user lookup)`);
    console.log(`📋 SendGrid from: ${process.env.SENDGRID_FROM_EMAIL || '(default)'}`);
    console.log(`📦 Type: ${type}\n`);

    const directRunners = [];
    if (type === 'all') {
      directRunners.push(sendCompatibilityDirect, sendDigestDirect, sendMatchDirect);
    } else if (type === 'digest') {
      directRunners.push(sendDigestDirect);
    } else if (type === 'match') {
      directRunners.push(sendMatchDirect);
    } else {
      directRunners.push(sendCompatibilityDirect);
    }

    for (const run of directRunners) {
      try {
        const { label, outcome } = await run(emailArg);
        console.log(`--- ${label} ---`);
        if (outcome?.sent || outcome?.success) {
          console.log('✅ Sent successfully');
          if (outcome.messageId) console.log(`   Message ID: ${outcome.messageId}`);
        } else {
          console.log('❌ Failed:', outcome?.error || outcome);
        }
        console.log('');
      } catch (err) {
        console.error(`❌ Error:`, err.message);
      }
    }

    console.log('Done. Check inbox (and spam) in 1–2 minutes.');
    process.exit(0);
  }

  await sequelize.authenticate();
  console.log('✅ Database connected');

  const user = await findRegularUser(emailArg);
  if (!user) {
    console.error(`❌ No user found for email: ${emailArg}`);
    console.error('   Register a member account with this email first, or pass a different --email');
    process.exit(1);
  }

  console.log(`📧 Test recipient: ${user.email} (${user.userType}, id=${user.id})`);
  console.log(`📋 SendGrid from: ${process.env.SENDGRID_FROM_EMAIL || '(default)'}`);
  console.log(`📦 Type: ${type}\n`);

  const runners = [];
  if (type === 'all') {
    runners.push(sendCompatibilityTest, sendDigestTest, sendMatchTest);
  } else if (type === 'digest') {
    runners.push(sendDigestTest);
  } else if (type === 'match') {
    runners.push(sendMatchTest);
  } else {
    runners.push(sendCompatibilityTest);
  }

  for (const run of runners) {
    try {
      const { label, outcome } = await run(user);
      console.log(`--- ${label} ---`);
      if (outcome?.sent || outcome?.success) {
        console.log('✅ Sent successfully');
        if (outcome.matchCount) console.log(`   Matches in email: ${outcome.matchCount}`);
        if (outcome.messageId) console.log(`   Message ID: ${outcome.messageId}`);
      } else if (outcome?.skipped) {
        console.log(`⚠️ Skipped: ${outcome.reason || 'unknown'}`);
        if (outcome.reason === 'no-matches') {
          console.log('   Tip: import dummy profiles — npm run import-dummy-profiles');
        }
        if (outcome.reason === 'same-top-matches') {
          console.log('   Tip: top 3 unchanged since last email — use force or wait for new profiles');
        }
      } else {
        console.log('❌ Failed:', outcome?.error || outcome);
      }
      console.log('');
    } catch (err) {
      console.error(`❌ Error:`, err.message);
    }
  }

  console.log('Done. Check inbox (and spam) in 1–2 minutes.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
