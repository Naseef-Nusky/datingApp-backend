#!/usr/bin/env node
/**
 * Write public/.well-known/apple-app-site-association for static deploy on app.vantagedating.com.
 * Usage (from datingApp-backend): npm run generate-aasa
 * Requires APPLE_TEAM_ID in .env
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { buildAppleAppSiteAssociation } from '../utils/universalLinks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mobilePublicDir = path.join(__dirname, '..', '..', 'datingApp-mobile', 'public', '.well-known');
const body = buildAppleAppSiteAssociation();

if (body._configured === false) {
  console.error('❌', body.message);
  process.exit(1);
}

fs.mkdirSync(mobilePublicDir, { recursive: true });
const outPath = path.join(mobilePublicDir, 'apple-app-site-association');
fs.writeFileSync(outPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
console.log('✅ Wrote', outPath);
console.log('   Deploy app.vantagedating.com with this file at /.well-known/apple-app-site-association');
