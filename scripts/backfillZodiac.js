import dotenv from 'dotenv';
import { sequelize } from '../config/database.js';
import '../models/index.js';

dotenv.config();

const backfillZodiac = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    const [beforeRows] = await sequelize.query(`
      SELECT
        COUNT(*)::int AS total_profiles,
        COUNT(*) FILTER (
          WHERE (lifestyle->>'zodiac' IS NULL OR lifestyle->>'zodiac' = '')
        )::int AS missing_zodiac,
        COUNT(*) FILTER (
          WHERE (lifestyle->>'zodiac' IS NULL OR lifestyle->>'zodiac' = '')
            AND (lifestyle->>'birthDate' IS NULL OR lifestyle->>'birthDate' = '')
            AND (lifestyle->>'dateOfBirth' IS NULL OR lifestyle->>'dateOfBirth' = '')
            AND (lifestyle->>'dob' IS NULL OR lifestyle->>'dob' = '')
            AND (lifestyle->>'birthday' IS NULL OR lifestyle->>'birthday' = '')
            AND age IS NOT NULL
        )::int AS eligible_age_random
      FROM profiles
    `);

    const before = beforeRows[0];

    const [updateRows] = await sequelize.query(`
      WITH candidate AS (
        SELECT id
        FROM profiles
        WHERE (lifestyle->>'zodiac' IS NULL OR lifestyle->>'zodiac' = '')
          AND (lifestyle->>'birthDate' IS NULL OR lifestyle->>'birthDate' = '')
          AND (lifestyle->>'dateOfBirth' IS NULL OR lifestyle->>'dateOfBirth' = '')
          AND (lifestyle->>'dob' IS NULL OR lifestyle->>'dob' = '')
          AND (lifestyle->>'birthday' IS NULL OR lifestyle->>'birthday' = '')
          AND age IS NOT NULL
      )
      UPDATE profiles p
      SET lifestyle = jsonb_set(
        jsonb_set(
          COALESCE(p.lifestyle, '{}'::jsonb),
          '{zodiac}',
          to_jsonb(
            CASE (floor(random() * 12)::int)
              WHEN 0 THEN 'Aries'
              WHEN 1 THEN 'Taurus'
              WHEN 2 THEN 'Gemini'
              WHEN 3 THEN 'Cancer'
              WHEN 4 THEN 'Leo'
              WHEN 5 THEN 'Virgo'
              WHEN 6 THEN 'Libra'
              WHEN 7 THEN 'Scorpio'
              WHEN 8 THEN 'Sagittarius'
              WHEN 9 THEN 'Capricorn'
              WHEN 10 THEN 'Aquarius'
              ELSE 'Pisces'
            END
          ),
          true
        ),
        '{zodiacEstimatedFromAge}',
        'true'::jsonb,
        true
      )
      FROM candidate c
      WHERE p.id = c.id
      RETURNING p.id
    `);

    const updatedFromAgeRandom = updateRows.length;

    const [afterRows] = await sequelize.query(`
      SELECT
        COUNT(*)::int AS total_profiles,
        COUNT(*) FILTER (
          WHERE (lifestyle->>'zodiac' IS NULL OR lifestyle->>'zodiac' = '')
        )::int AS missing_zodiac
      FROM profiles
    `);
    const after = afterRows[0];

    console.log('');
    console.log('Backfill complete');
    console.log('-----------------');
    console.log(`Total profiles: ${before.total_profiles}`);
    console.log(`Missing zodiac before: ${before.missing_zodiac}`);
    console.log(`Eligible for age/random fallback: ${before.eligible_age_random}`);
    console.log(`Updated from age/random fallback: ${updatedFromAgeRandom}`);
    console.log(`Missing zodiac after: ${after.missing_zodiac}`);

    process.exit(0);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
};

backfillZodiac();
