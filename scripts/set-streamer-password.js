import { sequelize } from '../config/database.js';
import User from '../models/User.js';
import { findStreamerByEmail, normalizeEmail } from '../utils/userEmailScope.js';

const email = normalizeEmail(process.argv[2] || '');
const password = process.argv[3] || '';

if (!email || !password || password.length < 6) {
  console.error('Usage: node scripts/set-streamer-password.js <email> <password>');
  process.exit(1);
}

await sequelize.authenticate();
const user = await findStreamerByEmail(User, email);
if (!user) {
  console.error('Streamer not found:', email);
  process.exit(1);
}

user.password = password;
await user.save();
console.log('Password updated for streamer:', email);
