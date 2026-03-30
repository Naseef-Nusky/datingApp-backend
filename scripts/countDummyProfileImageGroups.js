import fs from 'fs';
import path from 'path';

// Natural sort so 2.jpeg comes before 10.jpeg.
function naturalSortFilenames(files) {
  return [...files].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function getImageExt(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext.startsWith('.')) return ext.slice(1);
  return ext;
}

// Examples:
// - "1.jpeg"
// - "1 (2).jpeg"
// - "1(2).jpeg"
const GALLERY_FILENAME_RE = /^(.+?)\s*\((\d+)\)\.(jpe?g|png|webp|gif)$/i;
const MAIN_FILENAME_RE = /^(.+?)\.(jpe?g|png|webp|gif)$/i;

function collectGroups(imageFiles) {
  const byPrefix = new Map(); // prefix -> { main: string|null, gallery: Array<{n:number,file:string}> }

  for (const file of imageFiles) {
    const ext = getImageExt(file);
    if (!ext) continue;

    const isGallery = file.match(GALLERY_FILENAME_RE);
    if (isGallery) {
      const prefix = isGallery[1].trim();
      const n = parseInt(isGallery[2], 10);
      if (!Number.isNaN(n) && n >= 1) {
        if (!byPrefix.has(prefix)) byPrefix.set(prefix, { main: null, gallery: [] });
        byPrefix.get(prefix).gallery.push({ n, file });
      }
      continue;
    }

    // Main file: has extension, but we skip if it includes "(<number>)" so we don't accidentally
    // treat gallery variants as main.
    if (/\(\d+\)/.test(file)) continue;

    const isMain = file.match(MAIN_FILENAME_RE);
    if (isMain) {
      const prefix = isMain[1].trim();
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, { main: null, gallery: [] });
      if (!byPrefix.get(prefix).main) byPrefix.get(prefix).main = file;
      continue;
    }
  }

  const prefixes = naturalSortFilenames([...byPrefix.keys()]);
  return prefixes.map((prefix) => {
    const g = byPrefix.get(prefix);
    const gallery = (g.gallery || []).sort((a, b) => a.n - b.n).map((x) => x.file);
    const files = g.main ? [g.main, ...gallery] : [...gallery];
    return { prefix, main: g.main, galleryCount: gallery.length, filesCount: files.length };
  });
}

function main() {
  const imagesDirArg = process.argv[2] || './scripts/dummy-images';
  const absImagesDir = path.isAbsolute(imagesDirArg) ? imagesDirArg : path.join(process.cwd(), imagesDirArg);

  if (!fs.existsSync(absImagesDir)) {
    console.error(`Images folder not found: ${absImagesDir}`);
    process.exit(1);
  }

  const imageFiles = fs
    .readdirSync(absImagesDir)
    .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f));

  const groups = collectGroups(imageFiles);
  console.log(`Image groups (one profile per prefix): ${groups.length}`);

  // Show a small breakdown (first 20 groups) to help verify naming matches.
  const preview = groups.slice(0, 20);
  if (preview.length) {
    console.log('Preview (prefix -> [main?] galleryCount):');
    for (const g of preview) {
      const mainFlag = g.main ? 'main' : 'no-main';
      console.log(`- ${g.prefix}: ${mainFlag}, gallery=${g.galleryCount}, totalFiles=${g.filesCount}`);
    }
  }
}

main();

