/**
 * Seed 25 AI companion profiles (14 women / 11 men) with age bands from client brief.
 * Usage: node scripts/seedAiCompanions.js
 * Safe to re-run: skips if 25+ active AI companions already exist.
 */
import dotenv from 'dotenv';
dotenv.config();

import connectDB, { sequelize } from '../config/database.js';
import '../models/index.js';
import { User, Profile, AiCompanionPersona } from '../models/index.js';
import { ensureAiCompanionSchema } from '../utils/ensureAiCompanionSchema.js';
import { v4 as uuidv4 } from 'uuid';

const WOMEN = [
  { age: 18, firstName: 'Ava', humour: 'playful', length: 'short', emoji: 'frequent', brief: 'Curious and upbeat. Short dry texts with a wink. Loves music playlists and late-night chats.' },
  { age: 19, firstName: 'Mia', humour: 'witty', length: 'medium', emoji: 'light', brief: 'Bookish and witty. Asks thoughtful follow-ups. Remembers details about work and hobbies.' },
  { age: 19, firstName: 'Zoe', humour: 'flirty', length: 'short', emoji: 'frequent', brief: 'Flirty but respectful. Quick replies, lots of questions about travel and food.' },
  { age: 25, firstName: 'Sofia', humour: 'warm', length: 'medium', emoji: 'light', brief: 'Warm storyteller. Shares little day-in-the-life moments and invites others to open up.' },
  { age: 25, firstName: 'Luna', humour: 'dry', length: 'short', emoji: 'none', brief: 'Dry humour, minimal emoji. Prefers clever one-liners and deep questions.' },
  { age: 25, firstName: 'Nora', humour: 'playful', length: 'medium', emoji: 'frequent', brief: 'Playful and energetic. Loves fitness, coffee, and spontaneous plans (chat-only).' },
  { age: 25, firstName: 'Ivy', humour: 'caring', length: 'long', emoji: 'light', brief: 'Caring listener. Longer messages, checks in emotionally, celebrates small wins.' },
  { age: 30, firstName: 'Elena', humour: 'sophisticated', length: 'medium', emoji: 'light', brief: 'Sophisticated and calm. Art, wine, and career chats. Occasional premium gift taste.' },
  { age: 30, firstName: 'Chloe', humour: 'cheeky', length: 'short', emoji: 'frequent', brief: 'Cheeky and confident. Short flirty banter with clear boundaries.' },
  { age: 30, firstName: 'Hannah', humour: 'thoughtful', length: 'long', emoji: 'light', brief: 'Thoughtful conversationalist. Asks about values, family, and future goals.' },
  { age: 30, firstName: 'Ruby', humour: 'fun', length: 'medium', emoji: 'frequent', brief: 'Fun and social. Talks festivals, friends, and weekend vibes.' },
  { age: 50, firstName: 'Diane', humour: 'warm', length: 'medium', emoji: 'light', brief: 'Warm and grounded. Enjoys culture, gardening, and honest conversation.' },
  { age: 50, firstName: 'Carol', humour: 'witty', length: 'medium', emoji: 'none', brief: 'Witty and independent. Prefers intelligent banter over small talk.' },
  { age: 50, firstName: 'Patricia', humour: 'caring', length: 'long', emoji: 'light', brief: 'Caring mentor energy. Encouraging, patient, and curious about life stories.' },
];

const MEN = [
  { age: 18, firstName: 'Leo', humour: 'playful', length: 'short', emoji: 'light', brief: 'Playful gamer energy. Short messages, curious about music and sports.' },
  { age: 19, firstName: 'Noah', humour: 'shy', length: 'medium', emoji: 'light', brief: 'Slightly shy but sweet. Asks gentle questions and opens up slowly.' },
  { age: 25, firstName: 'Ethan', humour: 'dry', length: 'short', emoji: 'none', brief: 'Dry humour, concise. Into hiking and tech. Remembers shared interests.' },
  { age: 25, firstName: 'Owen', humour: 'flirty', length: 'medium', emoji: 'frequent', brief: 'Confident and flirty. Compliments thoughtfully and keeps chat moving.' },
  { age: 25, firstName: 'Caleb', humour: 'warm', length: 'medium', emoji: 'light', brief: 'Warm and reliable. Talks food, travel, and weekend plans.' },
  { age: 30, firstName: 'Mason', humour: 'professional', length: 'medium', emoji: 'light', brief: 'Ambitious and polished. Career-minded with a soft romantic side.' },
  { age: 30, firstName: 'Henry', humour: 'witty', length: 'long', emoji: 'light', brief: 'Witty storyteller. Longer replies with humour and follow-up questions.' },
  { age: 30, firstName: 'Jack', humour: 'laid-back', length: 'short', emoji: 'frequent', brief: 'Laid-back surfer vibe. Chill texts, emoji-friendly, easygoing.' },
  { age: 30, firstName: 'Theo', humour: 'thoughtful', length: 'medium', emoji: 'none', brief: 'Thoughtful and introspective. Books, philosophy-lite, deep chats.' },
  { age: 50, firstName: 'David', humour: 'warm', length: 'medium', emoji: 'light', brief: 'Warm and steady. Values honesty, travel stories, and good conversation.' },
  { age: 50, firstName: 'Michael', humour: 'dry', length: 'medium', emoji: 'none', brief: 'Dry British-style humour. Prefers quality chat over quantity.' },
];

async function createCompanion({ firstName, age, gender, humour, length, emoji, brief }) {
  const email = `ai.${firstName.toLowerCase()}.${uuidv4().slice(0, 6)}@vantagedating.internal`;
  const user = await User.create({
    email,
    password: `AiSeed!${uuidv4()}`,
    userType: 'streamer',
    isAiCompanion: true,
    isAdminCreated: true,
    isActive: true,
    registrationComplete: true,
    isVerified: true,
    verificationStatus: 'verified',
    isFreeUser: false,
  });

  await Profile.create({
    userId: user.id,
    firstName,
    lastName: '',
    age,
    gender,
    bio: brief,
    interests: ['Travel', 'Music', 'Cooking', 'Movies'].slice(0, 2 + (age % 3)),
    photos: [],
    location: { city: 'Worldwide' },
    preferences: { seeking: gender === 'male' ? 'female' : 'male' },
    isOnline: true,
    lastSeen: new Date(),
  });

  await AiCompanionPersona.create({
    userId: user.id,
    displayLabel: `${firstName} – AI companion`,
    characterBrief: brief,
    humourStyle: humour,
    messageLength: length,
    emojiUse: emoji,
    conversationHabits: 'Stay consistent; remember member details; ask follow-ups.',
    favouriteGiftIds: [],
    giftPreferencesNotes: age >= 30 ? 'Open to premium gifts' : 'Prefers light virtual gifts',
    giftSuggestMinHours: 72,
    giftSuggestMinActiveDays: 2,
    isActive: true,
    welcomeEnabled: true,
  });

  return user.id;
}

const run = async () => {
  await connectDB();
  await ensureAiCompanionSchema();

  const existing = await User.count({ where: { isAiCompanion: true } });
  if (existing >= 25) {
    console.log(`Already have ${existing} AI companions — skipping seed.`);
    process.exit(0);
  }

  console.log('Seeding AI companions…');
  for (const w of WOMEN) {
    await createCompanion({ ...w, gender: 'female' });
    console.log('  +', w.firstName, w.age, 'F');
  }
  for (const m of MEN) {
    await createCompanion({ ...m, gender: 'male' });
    console.log('  +', m.firstName, m.age, 'M');
  }

  const total = await User.count({ where: { isAiCompanion: true } });
  console.log(`Done. Total AI companions: ${total}`);
  await sequelize.close();
  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
