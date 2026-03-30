import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HEADERS = ['firstName', 'bio', 'gender', 'age', 'country', 'interests'];

const MAN_NAMES = [
  'Liam', 'Noah', 'Oliver', 'Elijah', 'James', 'William', 'Benjamin', 'Lucas', 'Henry', 'Alexander',
  'Mason', 'Michael', 'Ethan', 'Daniel', 'Jacob', 'Logan', 'Jackson', 'Levi', 'Sebastian', 'Mateo',
  'Jack', 'Owen', 'Theodore', 'Aiden', 'Samuel', 'Joseph', 'John', 'David', 'Wyatt', 'Matthew',
  'Luke', 'Asher', 'Carter', 'Julian', 'Grayson', 'Leo', 'Jayden', 'Gabriel', 'Isaac', 'Lincoln',
  'Anthony', 'Hudson', 'Dylan', 'Ezra', 'Thomas', 'Charles', 'Christopher', 'Jaxon', 'Maverick', 'Josiah',
  'Isaiah', 'Andrew', 'Elias', 'Joshua', 'Nathan', 'Caleb', 'Ryan', 'Adrian', 'Miles', 'Eli',
];

const COUNTRIES = [
  'USA', 'UK', 'Canada', 'Australia', 'New Zealand', 'Germany', 'Italy', 'Spain', 'Brazil', 'Philippines',
];

const INTEREST_GROUPS = [
  ['Travelling', 'Fitness', 'Movies', 'Music', 'Nature', 'Sports'],
  ['Cooking', 'Reading', 'Coffee', 'Hiking', 'Photography', 'Pets'],
  ['Gym', 'Football', 'Gaming', 'Podcasts', 'Tech', 'Startups'],
  ['Running', 'Meditation & Yoga', 'Brunch', 'Business', 'Wine', 'Museums & Art'],
  ['Dancing', 'Music & Concerts', 'Restaurants', 'Socializing', 'Nightlife', 'Travelling'],
  ['Cycling', 'Camping', 'Adventure', 'Road trips', 'Nature', 'Sports'],
];

const BIOS = [
  "Easygoing and family-minded. Looking for a genuine connection and someone kind to build with.",
  "Career-focused but I always make time for good people, good food, and meaningful conversations.",
  "I enjoy staying active, weekend trips, and quiet nights in. Hoping to meet someone emotionally mature.",
  "Loyal, respectful, and positive. Looking for something real, not just small talk.",
  "I love travelling, discovering new places, and making simple moments memorable with the right person.",
  "Calm personality with a good sense of humour. I value honesty, consistency, and shared goals.",
  "I work hard during the week and enjoy fitness, movies, and time with close friends on weekends.",
  "Open-minded and thoughtful. I appreciate deep conversations, trust, and mutual respect.",
];

function naturalSort(values) {
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const GALLERY_FILENAME_RE = /^(.+?)\s*\((\d+)\)\.(jpe?g|png|webp|gif)$/i;

function collectImagePrefixes(imageFiles) {
  const prefixes = new Set();

  for (const file of imageFiles) {
    const gallery = file.match(GALLERY_FILENAME_RE);
    if (gallery) {
      prefixes.add(gallery[1].trim());
      continue;
    }

    if (!/\.(jpe?g|png|webp|gif)$/i.test(file)) continue;
    if (/\(\d+\)/.test(file)) continue;

    const mainMatch = file.match(/^(.+?)\.(jpe?g|png|webp|gif)$/i);
    if (mainMatch) prefixes.add(mainMatch[1].trim());
  }

  return naturalSort([...prefixes]);
}

function pickInterests(index) {
  const group = INTEREST_GROUPS[index % INTEREST_GROUPS.length];
  return group.join(', ');
}

function buildRows(profileCount) {
  const rows = [];

  for (let i = 0; i < profileCount; i++) {
    const firstName = MAN_NAMES[i % MAN_NAMES.length];
    const bio = BIOS[i % BIOS.length];
    const age = 24 + (i % 13); // 24..36
    const country = COUNTRIES[i % COUNTRIES.length];
    const interests = pickInterests(i);

    rows.push({
      firstName,
      bio,
      gender: 'man',
      age,
      country,
      interests,
    });
  }

  return rows;
}

function toCsv(rows) {
  const lines = [HEADERS.join(',')];
  for (const row of rows) {
    lines.push(HEADERS.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * @param {string} absImagesDir - Absolute path to folder with male dummy images
 * @param {string} absOutputCsv - Absolute path for output CSV
 * @returns {{ absImagesDir: string, absOutputCsv: string, rowsCount: number, prefixCount: number }}
 */
export function generateDummyManProfilesCsv(absImagesDir, absOutputCsv) {
  if (!fs.existsSync(absImagesDir)) {
    throw new Error(`Images folder not found: ${absImagesDir}`);
  }

  const imageFiles = fs
    .readdirSync(absImagesDir)
    .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f));

  if (imageFiles.length === 0) {
    throw new Error(`No image files found in: ${absImagesDir}`);
  }

  const prefixes = collectImagePrefixes(imageFiles);
  if (prefixes.length === 0) {
    throw new Error('No valid image prefixes found. Use names like "1.jpg" and "1 (2).jpg".');
  }

  const rows = buildRows(prefixes.length);
  const csv = toCsv(rows);

  fs.writeFileSync(absOutputCsv, csv, 'utf8');

  return {
    absImagesDir,
    absOutputCsv,
    rowsCount: rows.length,
    prefixCount: prefixes.length,
  };
}

function main() {
  const imagesDirArg =
    process.argv[2] || path.join('scripts', 'dummy images man');
  const outputCsvArg = process.argv[3] || path.join('scripts', 'dummy_profiles_man.csv');

  const absImagesDir = path.isAbsolute(imagesDirArg) ? imagesDirArg : path.join(process.cwd(), imagesDirArg);
  const absOutputCsv = path.isAbsolute(outputCsvArg) ? outputCsvArg : path.join(process.cwd(), outputCsvArg);

  try {
    const result = generateDummyManProfilesCsv(absImagesDir, absOutputCsv);
    console.log(`Generated: ${result.absOutputCsv}`);
    console.log(`Profiles: ${result.rowsCount}`);
    console.log(`Image prefixes detected: ${result.prefixCount}`);
    console.log('\nUse import command:');
    console.log(
      `node scripts/importDummyProfilesFromCsv.js "${outputCsvArg}" "${imagesDirArg}"`
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main();
}
