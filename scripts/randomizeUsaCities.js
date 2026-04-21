import dotenv from 'dotenv';
import { sequelize } from '../config/database.js';
import '../models/index.js';

dotenv.config();

const USA_CITIES = [
  'New York',
  'Los Angeles',
  'Chicago',
  'Houston',
  'Phoenix',
  'Philadelphia',
  'San Antonio',
  'San Diego',
  'Dallas',
  'San Jose',
  'Austin',
  'Jacksonville',
  'Fort Worth',
  'Columbus',
  'Charlotte',
  'San Francisco',
  'Indianapolis',
  'Seattle',
  'Denver',
  'Boston',
  'Nashville',
  'Detroit',
  'Portland',
  'Las Vegas',
  'Miami',
  'Atlanta',
  'Orlando',
  'Tampa',
  'New Orleans',
  'Minneapolis',
];

const randomizeUsaCities = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    const [beforeRows] = await sequelize.query(`
      SELECT
        COUNT(*)::int AS total_profiles,
        COUNT(*) FILTER (
          WHERE UPPER(COALESCE(location->>'country', '')) = 'USA'
        )::int AS usa_profiles
      FROM profiles
    `);

    const before = beforeRows[0];

    if (!before.usa_profiles) {
      console.log('No USA profiles found. Nothing to update.');
      process.exit(0);
    }

    const citySqlArray = `ARRAY[${USA_CITIES.map((city) => `'${city.replace(/'/g, "''")}'`).join(', ')}]`;

    const [updatedRows] = await sequelize.query(`
      UPDATE profiles p
      SET location = jsonb_set(
        jsonb_set(
          COALESCE(p.location, '{}'::jsonb),
          '{city}',
          to_jsonb((${citySqlArray})[1 + floor(random() * ${USA_CITIES.length})::int]),
          true
        ),
        '{country}',
        to_jsonb('USA'::text),
        true
      )
      WHERE UPPER(COALESCE(p.location->>'country', '')) = 'USA'
      RETURNING id, location->>'city' AS city
    `);

    const sample = updatedRows.slice(0, 10).map((r) => r.city).join(', ');

    console.log('');
    console.log('USA city randomization complete');
    console.log('-------------------------------');
    console.log(`Total profiles: ${before.total_profiles}`);
    console.log(`USA profiles found: ${before.usa_profiles}`);
    console.log(`USA profiles updated: ${updatedRows.length}`);
    if (sample) {
      console.log(`Sample assigned cities: ${sample}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Randomization failed:', error);
    process.exit(1);
  }
};

randomizeUsaCities();
