import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbHost = process.env.DB_HOST || 'localhost';
const isRemoteDb =
  dbHost.includes('ondigitalocean.com') ||
  process.env.DB_SSL === 'true' ||
  process.env.DB_SSL === '1';

const dbConfig = {
  host: dbHost,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    min: parseInt(process.env.DB_POOL_MIN || '0', 10),
    acquire: parseInt(process.env.DB_POOL_ACQUIRE_MS || '60000', 10),
    idle: parseInt(process.env.DB_POOL_IDLE_MS || '30000', 10),
    evict: parseInt(process.env.DB_POOL_EVICT_MS || '10000', 10),
  },
  retry: {
    max: parseInt(process.env.DB_QUERY_RETRIES || '3', 10),
    match: [
      /ETIMEDOUT/,
      /ECONNRESET/,
      /ECONNREFUSED/,
      /SequelizeConnectionError/,
      /SequelizeConnectionAcquireTimeoutError/,
    ],
  },
  dialectOptions: {
    keepAlive: true,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '20000', 10),
  },
};

// SSL for hosted DB (e.g. Digital Ocean Managed PostgreSQL)
const useSSL = isRemoteDb;
if (useSSL) {
  const caPath = process.env.DB_SSL_CA
    ? path.isAbsolute(process.env.DB_SSL_CA)
      ? process.env.DB_SSL_CA
      : path.resolve(process.cwd(), process.env.DB_SSL_CA)
    : path.join(__dirname, '..', 'ca-certificate.crt');
  if (!fs.existsSync(caPath)) {
    console.warn(
      `⚠️ DB SSL enabled but CA file not found at ${caPath}. Set DB_SSL_CA in .env or place ca-certificate.crt in backend folder.`
    );
  }
  dbConfig.dialectOptions.ssl = {
    require: true,
    rejectUnauthorized: true,
    ...(fs.existsSync(caPath) && { ca: fs.readFileSync(caPath).toString() }),
  };
}

const sequelize = new Sequelize(
  process.env.DB_NAME || 'datingapp',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || '',
  dbConfig
);

function isFirewallTimeoutError(error) {
  const code = error?.parent?.code || error?.original?.code || error?.code;
  const message = error?.message || '';
  return (
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    message.includes('ETIMEDOUT') ||
    message.includes('ECONNREFUSED')
  );
}

function printFirewallHelp() {
  if (!isRemoteDb) return;
  console.error('');
  console.error('💡 DigitalOcean database firewall likely blocked your IP (common when Wi‑Fi/IP changes).');
  console.error('   Fix options:');
  console.error('   1. Run: npm run db:allow-my-ip   (adds your current public IP to DO trusted sources)');
  console.error('   2. DO dashboard → Databases → your cluster → Settings → Trusted Sources → add your IP');
  console.error('   3. Local dev: npm run db:local && use DB_HOST=localhost in .env (no IP whitelist needed)');
  console.error('   4. Production: run the API on a DO Droplet in the same VPC (stable, no home IP changes)');
  console.error('');
}

async function authenticateWithRetry() {
  const maxAttempts = parseInt(process.env.DB_CONNECT_RETRIES || '5', 10);
  const delayMs = parseInt(process.env.DB_CONNECT_RETRY_DELAY_MS || '4000', 10);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await sequelize.authenticate();
      return;
    } catch (error) {
      const lastAttempt = attempt === maxAttempts;
      console.error(
        `❌ DB connect attempt ${attempt}/${maxAttempts} failed: ${error.message}`
      );

      if (isFirewallTimeoutError(error)) {
        printFirewallHelp();
      }

      if (lastAttempt) throw error;
      console.log(`⏳ Retrying in ${delayMs / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

const connectDB = async () => {
  try {
    await authenticateWithRetry();
    console.log('✅ PostgreSQL Connected successfully');

    const migrationPath = path.join(
      __dirname,
      '..',
      'migrations',
      'allow-same-email-per-user-type.sql'
    );
    if (fs.existsSync(migrationPath)) {
      try {
        const sql = fs.readFileSync(migrationPath, 'utf8');
        await sequelize.query(sql);
        console.log('✅ Email-per-role uniqueness migration applied');
      } catch (migrationErr) {
        console.warn('⚠️ Email-per-role migration:', migrationErr.message);
      }
    }

    const shouldSync =
      process.env.NODE_ENV === 'development' ||
      !process.env.NODE_ENV ||
      process.env.SYNC_DB === 'true';

    if (shouldSync) {
      console.log('🔄 Syncing database models...');
      try {
        await sequelize.sync({ force: false, alter: false });
        console.log('✅ Database models synchronized - All tables created/updated');

        const [results] = await sequelize.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          ORDER BY table_name;
        `);
        console.log('📊 Created tables:', results.map((r) => r.table_name).join(', '));
      } catch (syncError) {
        console.error('❌ Error syncing models:', syncError.message);
        throw syncError;
      }
    } else {
      console.log('⏭️  Skipping model sync (NODE_ENV is not development)');
    }
  } catch (error) {
    console.error('❌ Unable to connect to PostgreSQL:', error.message);
    if (error.parent) {
      console.error('❌ Database error:', error.parent.message);
    }
    if (isFirewallTimeoutError(error)) {
      printFirewallHelp();
    }
    process.exit(1);
  }
};

export { sequelize };
export default connectDB;
