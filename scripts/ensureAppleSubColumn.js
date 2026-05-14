/**
 * Adds users.apple_sub if missing (PostgreSQL). Run once per environment after deploy.
 * Usage: node scripts/ensureAppleSubColumn.js
 */
import dotenv from 'dotenv';
import { sequelize } from '../config/database.js';

dotenv.config();

async function main() {
  await sequelize.authenticate();
  await sequelize.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_sub VARCHAR(255);
  `);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_apple_sub_unique
    ON users (apple_sub)
    WHERE apple_sub IS NOT NULL;
  `);
  console.log('✅ users.apple_sub column / index ensured');
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
