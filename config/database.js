import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
};

// SSL for hosted DB (e.g. Digital Ocean Managed PostgreSQL) – require: true and CA are required or you get "no encryption"
const dbHost = process.env.DB_HOST || 'localhost';
const useSSL = process.env.DB_SSL === 'true' || process.env.DB_SSL === '1' || dbHost.includes('ondigitalocean.com');
if (useSSL) {
  const caPath = process.env.DB_SSL_CA
    ? (path.isAbsolute(process.env.DB_SSL_CA) ? process.env.DB_SSL_CA : path.resolve(process.cwd(), process.env.DB_SSL_CA))
    : path.join(__dirname, '..', 'ca-certificate.crt');
  if (!fs.existsSync(caPath)) {
    console.warn(`⚠️ DB SSL enabled but CA file not found at ${caPath}. Set DB_SSL_CA in .env or place ca-certificate.crt in backend folder.`);
  }
  dbConfig.dialectOptions = {
    ssl: {
      require: true,
      rejectUnauthorized: true,
      ...(fs.existsSync(caPath) && { ca: fs.readFileSync(caPath).toString() }),
    },
  };
}

const sequelize = new Sequelize(
  process.env.DB_NAME || 'datingapp',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || '',
  dbConfig
);

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ PostgreSQL Connected successfully');
    
    // Always sync models in development (creates tables if they don't exist)
    // Models must be imported before calling this
    const shouldSync = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV || process.env.SYNC_DB === 'true';
    
    if (shouldSync) {
      console.log('🔄 Syncing database models...');
      try {
        await sequelize.sync({ force: false, alter: true });
        console.log('✅ Database models synchronized - All tables created/updated');
        
        // Verify tables were created
        const [results] = await sequelize.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          ORDER BY table_name;
        `);
        console.log('📊 Created tables:', results.map(r => r.table_name).join(', '));
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
    process.exit(1);
  }
};

export { sequelize };
export default connectDB;
