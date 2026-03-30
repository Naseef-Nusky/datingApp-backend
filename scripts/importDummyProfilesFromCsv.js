import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { sequelize } from '../config/database.js';
import '../models/index.js';
import { User, Profile } from '../models/index.js';
import { uploadToSpaces } from '../utils/spacesUpload.js';

dotenv.config();

/**
 * CSV columns (minimum): firstName,bio,gender,age,country,interests — no image column required.
 *
 * Default — group files by name prefix (ONE profile per person, not one profile per file):
 *   - "1.jpeg" → main photo [0]
 *   - "1 (2).jpeg", "1 (3).jpeg", "1(2).jpeg" → same person’s gallery [1], [2], … (sorted by number in parentheses)
 *   - "2.jpeg", "2 (2).jpeg" → next person
 *   - CSV row 1 → first prefix group (sorted), row 2 → second group, etc.
 *
 * Optional:
 *   --ordered  — ignore grouping; slice sorted files by row: [--chunk=N] files per row (default 1).
 *   --by-prefix — use CSV columns imageFile / imagePrefix to pick a prefix per row.
 *
 * All imported photos use isPublic: true.
 *
 * Example gender inputs: woman→female, man→male, other→other
 */
function mapGender(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return 'other';
  if (v === 'woman' || v === 'female' || v === 'f') return 'female';
  if (v === 'man' || v === 'male' || v === 'm') return 'male';
  if (v === 'other' || v === 'nonbinary' || v === 'nb') return 'other';
  return ['male', 'female', 'other'].includes(v) ? v : 'other';
}

function parseCsv(text) {
  // Minimal CSV parser supporting quoted fields (",") and commas/newlines inside quotes.
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        // Escaped quote
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(cur);
      cur = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      // Handle CRLF
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      const isBlankRow = row.every((c) => String(c).trim() === '');
      if (!isBlankRow) rows.push(row);
      row = [];
      cur = '';
      continue;
    }

    cur += ch;
  }

  // Flush last row
  row.push(cur);
  const isBlankRow = row.every((c) => String(c).trim() === '');
  if (!isBlankRow) rows.push(row);

  const header = rows[0].map((h) => String(h).trim());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = rows[r][c] !== undefined ? rows[r][c] : '';
    }
    out.push(obj);
  }
  return out;
}

function ensureNumberAge(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return 18;
  return Math.max(18, n);
}

function parseInterests(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getImageExt(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext.startsWith('.')) return ext.slice(1);
  return ext;
}

function guessMimeType(ext) {
  const e = String(ext || '').toLowerCase().trim();
  if (e === 'png') return 'image/png';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'webp') return 'image/webp';
  if (e === 'gif') return 'image/gif';
  return 'image/jpeg';
}

/** Natural sort so 2.jpeg comes before 10.jpeg */
function naturalSortFilenames(files) {
  return [...files].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
}

/** Gallery: "1 (2).jpeg" or "1(2).jpeg" — digits in parentheses */
const GALLERY_FILENAME_RE = /^(.+?)\s*\((\d+)\)\.(jpe?g|png|webp|gif)$/i;

/**
 * Group files so one profile gets main + gallery: e.g. 1.jpeg + 1 (2).jpeg + 1 (3).jpeg → one group.
 * Prefixes sorted naturally (1 before 2 before 10).
 * @returns {Array<{ prefix: string, files: string[] }>}
 */
function collectImageGroupsByPrefix(imageFiles) {
  const byPrefix = new Map();

  for (const file of imageFiles) {
    const gm = file.match(GALLERY_FILENAME_RE);
    if (gm) {
      const prefix = gm[1].trim();
      const n = parseInt(gm[2], 10);
      if (Number.isNaN(n) || n < 1) continue;
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, { main: null, gallery: [] });
      byPrefix.get(prefix).gallery.push({ file, n });
      continue;
    }
    if (/\(\d+\)/.test(file)) continue;
    const m = file.match(/^(.+)\.(jpe?g|png|webp|gif)$/i);
    if (!m) continue;
    const prefix = m[1].trim();
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, { main: null, gallery: [] });
    const g = byPrefix.get(prefix);
    if (!g.main) g.main = file;
    else
      console.warn(
        `⚠️ Multiple main-style files for prefix "${prefix}" — keeping "${g.main}", skipping "${file}"`
      );
  }

  const prefixes = naturalSortFilenames([...byPrefix.keys()]);
  return prefixes.map((prefix) => {
    const g = byPrefix.get(prefix);
    const gallery = (g.gallery || []).sort((a, b) => a.n - b.n).map((x) => x.file);
    const files = g.main ? [g.main, ...gallery] : [...gallery];
    return { prefix, files };
  });
}

function parseImportArgv() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const chunkArg = argv.find((a) => a.startsWith('--chunk='));
  let photosPerProfile = 1;
  if (chunkArg) {
    const n = parseInt(chunkArg.split('=')[1], 10);
    if (!Number.isNaN(n) && n >= 1) photosPerProfile = n;
  }

  let mode = 'group';
  if (flags.has('--by-prefix')) mode = 'csv-prefix';
  else if (flags.has('--ordered')) mode = 'ordered';

  return {
    csvPath: positional[0] || './scripts/dummy_profiles.csv',
    imagesDir: positional[1] || './scripts/dummy-images',
    mode,
    photosPerProfile,
  };
}

async function uploadPhotoFiles(absImagesDir, filesForUser) {
  const photos = [];
  for (const imageFile of filesForUser) {
    const imgPath = path.join(absImagesDir, imageFile);
    const buffer = fs.readFileSync(imgPath);
    const ext = getImageExt(imageFile);
    const mimeType = guessMimeType(ext);
    const photoUrl = await uploadToSpaces(buffer, mimeType, 'profiles/photos', imageFile);
    photos.push({
      url: photoUrl,
      isPublic: true,
      uploadedAt: new Date().toISOString(),
    });
  }
  return photos;
}

async function main() {
  const { csvPath, imagesDir, mode, photosPerProfile } = parseImportArgv();

  const absCsvPath = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
  const absImagesDir = path.isAbsolute(imagesDir) ? imagesDir : path.join(process.cwd(), imagesDir);

  if (!fs.existsSync(absCsvPath)) {
    throw new Error(`CSV not found: ${absCsvPath}`);
  }
  if (!fs.existsSync(absImagesDir)) {
    throw new Error(`Images folder not found: ${absImagesDir}`);
  }

  const raw = fs.readFileSync(absCsvPath, 'utf8');
  const rows = parseCsv(raw);
  if (!rows.length) {
    console.log('No rows found in CSV.');
    return;
  }

  const imageFilesRaw = fs
    .readdirSync(absImagesDir)
    .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f));
  const imageFiles =
    mode === 'ordered' ? naturalSortFilenames(imageFilesRaw) : [...imageFilesRaw].sort();

  if (!imageFiles.length) {
    console.log('⚠️ No image files found in images directory. Profiles will be created without photos.');
  } else {
    console.log(`📷 Found ${imageFiles.length} image files in ${absImagesDir}`);
  }

  const imageGroups = mode === 'group' ? collectImageGroupsByPrefix(imageFilesRaw) : [];
  if (mode === 'group' && imageGroups.length) {
    console.log(
      `📁 Grouped into ${imageGroups.length} profile(s) by filename prefix (e.g. 1.jpeg + 1 (2).jpeg = one person).`
    );
  } else if (mode === 'group' && imageFilesRaw.length && !imageGroups.length) {
    console.warn('⚠️ Could not group any images by prefix — check filenames.');
  }

  await sequelize.authenticate();
  if (mode === 'group') {
    console.log('✅ Connected to DB. Mode: group by prefix (one profile per person).');
  } else if (mode === 'ordered') {
    console.log(
      `✅ Connected to DB. Mode: ordered — ${photosPerProfile} file(s) per CSV row (flat list).`
    );
  } else {
    console.log('✅ Connected to DB. Mode: --by-prefix (CSV imageFile / imagePrefix).');
  }

  /** @type {Set<string>} */
  const usedImagePrefixes = new Set();

  let created = 0;

  const runRow = async (i, row, filesForUser, label) => {
    const firstName = String(row.firstName || '').trim();
    const bio = String(row.bio || '').trim();
    const gender = mapGender(row.gender);
    const age = ensureNumberAge(row.age);
    const country = String(row.country || '').trim();
    const interests = parseInterests(row.interests);

    if (!firstName) {
      console.log(`⏭️ ${label}: missing firstName, skipping.`);
      return;
    }

    const email = `dummy${i + 1}_${firstName.toLowerCase().replace(/\s+/g, '')}@example.com`;

    const user = await User.create({
      email,
      password: 'DummyPass123!',
      userType: 'regular',
      isVerified: false,
      isActive: true,
      registrationComplete: true,
      credits: 100,
    });

    let photos = [];
    if (filesForUser.length > 0) {
      photos = await uploadPhotoFiles(absImagesDir, filesForUser);
    }

    await Profile.create({
      userId: user.id,
      firstName,
      lastName: '',
      age,
      gender,
      bio,
      photos,
      location: {
        ...(country ? { country } : {}),
      },
      interests,
      lifestyle: {},
      preferences: {},
      wishlist: [],
      isOnline: false,
      profileViews: 0,
    });

    created++;
  };

  if (mode === 'group') {
    if (imageGroups.length === 0) {
      console.warn(
        '⚠️ No prefix groups — creating one profile per CSV row with empty photos. Add files like 1.jpeg, 1 (2).jpeg.'
      );
      for (let i = 0; i < rows.length; i++) {
        await runRow(i, rows[i], [], `Row ${i + 1}`);
        if ((i + 1) % 25 === 0) console.log(`Progress: ${i + 1}/${rows.length}...`);
      }
    } else {
      const n = Math.min(rows.length, imageGroups.length);
      if (rows.length !== imageGroups.length) {
        console.warn(
          `⚠️ CSV has ${rows.length} rows but ${imageGroups.length} image group(s). Creating ${n} profile(s).`
        );
      }
      for (let i = 0; i < n; i++) {
        const g = imageGroups[i];
        console.log(`  → Profile ${i + 1}: prefix "${g.prefix}" — ${g.files.length} photo(s) (main + gallery).`);
        await runRow(i, rows[i], g.files, `Row ${i + 1}`);
        if ((i + 1) % 25 === 0) console.log(`Progress: ${i + 1}/${n}...`);
      }
    }
  } else {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const firstName = String(row.firstName || '').trim();
      const bio = String(row.bio || '').trim();
      const gender = mapGender(row.gender);
      const age = ensureNumberAge(row.age);
      const country = String(row.country || '').trim();
      const interests = parseInterests(row.interests);
      const imagePrefixRaw = String(row.imagePrefix || '').trim();
      const imageFileRaw = String(row.imageFile || '').trim();
      let resolvedPrefix = imagePrefixRaw;
      if (!resolvedPrefix && imageFileRaw) {
        resolvedPrefix = path.basename(imageFileRaw, path.extname(imageFileRaw));
      }
      const hasExplicitImageKey = !!(imagePrefixRaw || imageFileRaw);
      const prefixKey =
        mode === 'csv-prefix' && hasExplicitImageKey && String(resolvedPrefix || '').trim()
          ? String(resolvedPrefix).trim().toLowerCase()
          : null;

      if (!firstName) {
        console.log(`⏭️ Row ${i + 1}: missing firstName, skipping.`);
        continue;
      }

      if (mode === 'csv-prefix' && prefixKey && usedImagePrefixes.has(prefixKey)) {
        console.log(
          `⏭️ Row ${i + 1} (${firstName}): duplicate image prefix "${resolvedPrefix}" — skipping.`
        );
        continue;
      }
      if (mode === 'csv-prefix' && prefixKey) {
        usedImagePrefixes.add(prefixKey);
      }

      const email = `dummy${i + 1}_${firstName.toLowerCase().replace(/\s+/g, '')}@example.com`;

      const user = await User.create({
        email,
        password: 'DummyPass123!',
        userType: 'regular',
        isVerified: false,
        isActive: true,
        registrationComplete: true,
        credits: 100,
      });

      let filesForUser = [];
      if (imageFiles.length > 0) {
        if (mode === 'ordered') {
          const start = i * photosPerProfile;
          filesForUser = imageFiles.slice(start, start + photosPerProfile);
          if (filesForUser.length === 0) {
            console.warn(
              `⚠️ Row ${i + 1} (${firstName}): no images left (ordered mode).`
            );
          }
        } else {
          const baseName = String(
            hasExplicitImageKey ? resolvedPrefix || firstName : firstName
          ).trim();
          const escaped = escapeRegex(baseName);
          const mainRegex = new RegExp(`^${escaped}\\.(jpe?g|png|webp|gif)$`, 'i');
          const galleryRegex = new RegExp(
            `^${escaped}\\s*\\((\\d+)\\)\\.(jpe?g|png|webp|gif)$`,
            'i'
          );

          let mainFile = imageFiles.find((file) => mainRegex.test(file)) || null;
          if (!mainFile && imageFileRaw) {
            const want = path.basename(imageFileRaw.replace(/\\/g, '/')).trim();
            mainFile = imageFiles.find((f) => f.toLowerCase() === want.toLowerCase()) || null;
          }
          const galleryMatches = imageFiles
            .map((file) => {
              const m = file.match(galleryRegex);
              if (!m) return null;
              const index = parseInt(m[1], 10);
              if (Number.isNaN(index) || index < 1) return null;
              return { file, index };
            })
            .filter(Boolean)
            .sort((a, b) => a.index - b.index)
            .map((x) => x.file);

          if (!mainFile && galleryMatches.length > 0) {
            console.warn(
              `⚠️ Row ${i + 1} (${firstName}): missing main "${baseName}.*" — using gallery only.`
            );
          }

          if (mainFile || galleryMatches.length > 0) {
            filesForUser = [mainFile, ...galleryMatches].filter(Boolean);
          } else if (hasExplicitImageKey) {
            console.warn(
              `⚠️ Row ${i + 1} (${firstName}): no files for prefix "${baseName}".`
            );
          } else {
            console.warn(`⚠️ Row ${i + 1} (${firstName}): no image match for "${baseName}".`);
          }
        }
      }

      let photos = [];
      if (filesForUser.length > 0) {
        photos = await uploadPhotoFiles(absImagesDir, filesForUser);
      }

      await Profile.create({
        userId: user.id,
        firstName,
        lastName: '',
        age,
        gender,
        bio,
        photos,
        location: {
          ...(country ? { country } : {}),
        },
        interests,
        lifestyle: {},
        preferences: {},
        wishlist: [],
        isOnline: false,
        profileViews: 0,
      });

      created++;
      if ((i + 1) % 25 === 0) console.log(`Progress: ${i + 1}/${rows.length}...`);
    }
  }

  console.log(`\n✅ Import done. Created ${created} users/profiles.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});

