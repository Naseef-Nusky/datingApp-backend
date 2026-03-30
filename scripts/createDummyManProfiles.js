import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { generateDummyManProfilesCsv } from './generateDummyManProfilesCsv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

/** Default folder for male dummy photos (matches your "dummy images man" folder). */
const DEFAULT_IMAGES_REL = path.join('scripts', 'dummy images man');
const DEFAULT_CSV_REL = path.join('scripts', 'dummy_profiles_man.csv');

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  return {
    importAfter: flags.has('--import'),
    imagesRel: positional[0] || DEFAULT_IMAGES_REL,
    csvRel: positional[1] || DEFAULT_CSV_REL,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const { importAfter, imagesRel, csvRel } = parseArgs(argv);

  const imagesArg = path.isAbsolute(imagesRel) ? imagesRel : path.join(backendRoot, imagesRel);
  const csvArg = path.isAbsolute(csvRel) ? csvRel : path.join(backendRoot, csvRel);

  let result;
  try {
    result = generateDummyManProfilesCsv(imagesArg, csvArg);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
  console.log(`\nGenerated CSV: ${result.absOutputCsv}`);
  console.log(`Profiles: ${result.rowsCount} (image prefixes: ${result.prefixCount})`);

  if (!importAfter) {
    console.log('\nTo import into the database, run:');
    console.log(
      `  node scripts/importDummyProfilesFromCsv.js "${path.relative(backendRoot, result.absOutputCsv).replace(/\\/g, '/')}" "${path.relative(backendRoot, result.absImagesDir).replace(/\\/g, '/')}"`
    );
    console.log('\nOr:');
    console.log('  npm run import-dummy-man');
    return;
  }

  const importScript = path.join(backendRoot, 'scripts', 'importDummyProfilesFromCsv.js');
  const r = spawnSync(
    process.execPath,
    [importScript, result.absOutputCsv, result.absImagesDir],
    { cwd: backendRoot, stdio: 'inherit', shell: false }
  );
  process.exit(r.status ?? 1);
}

main();
