/**
 * Creates a fully-onboarded regular user for App Store review (email + password login).
 * Set REVIEW_USER_EMAIL / REVIEW_USER_PASSWORD in .env (do not commit real passwords).
 *
 * Usage: node scripts/createAppReviewUser.js
 */
import dotenv from 'dotenv';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import '../models/index.js';
import { User, Profile } from '../models/index.js';

dotenv.config();

const PLACEHOLDER_PHOTO =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop';

async function main() {
  const email = (process.env.REVIEW_USER_EMAIL || 'review@vantagedating.com').toLowerCase().trim();
  const password = process.env.REVIEW_USER_PASSWORD || 'Review@ChangeMe123!';

  if (!email || !password || password.length < 8) {
    console.error('Set REVIEW_USER_EMAIL and REVIEW_USER_PASSWORD (min 8 chars) in .env');
    process.exit(1);
  }

  await sequelize.authenticate();

  let user = await User.findOne({ where: { email: { [Op.iLike]: email } } });
  if (user) {
    user.password = password;
    user.userType = 'regular';
    user.isActive = true;
    user.isVerified = true;
    user.registrationComplete = true;
    user.verificationStatus = 'verified';
    await user.save();
    console.log('✅ Updated existing review user:', email);
  } else {
    user = await User.create({
      email,
      password,
      userType: 'regular',
      isVerified: true,
      isActive: true,
      registrationComplete: true,
      verificationStatus: 'verified',
      credits: 5000,
    });
    await Profile.create({
      userId: user.id,
      firstName: 'App',
      lastName: 'Review',
      age: 30,
      gender: 'female',
      bio: 'Demo profile for App Store review.',
      photos: [{ url: PLACEHOLDER_PHOTO }],
      location: { city: 'London', country: 'United Kingdom', isAutoDetected: false },
      preferences: { lookingFor: 'male', ageRange: { min: 25, max: 55 }, description: 'Review account.' },
      interests: ['Travel', 'Music'],
      lifestyle: {
        zodiac: 'Leo',
        work: 'Other',
        education: 'University',
        languages: ['English'],
        relationship: 'Single',
        haveKids: false,
        smoke: 'No',
        drink: 'Socially',
        height: "5'6\"",
        bodyType: 'Average',
        eyes: 'Brown',
        hair: 'Brown',
      },
    });
    console.log('✅ Created review user:', email);
  }

  const profile = await Profile.findOne({ where: { userId: user.id } });
  if (profile) {
    profile.firstName = profile.firstName || 'App';
    profile.lastName = profile.lastName || 'Review';
    profile.age = profile.age || 30;
    profile.gender = profile.gender || 'female';
    if (!Array.isArray(profile.photos) || profile.photos.length === 0) {
      profile.photos = [{ url: PLACEHOLDER_PHOTO }];
    }
    if (!profile.preferences?.lookingFor) {
      profile.preferences = { ...(profile.preferences || {}), lookingFor: 'male', ageRange: { min: 25, max: 55 } };
    }
    await profile.save();
  }

  console.log('\nPaste into App Store Connect → App Review → Demo Account:');
  console.log('  Email:', email);
  console.log('  Password:', password);
  console.log('\nNotes: password login on /login; no magic link required.\n');

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
