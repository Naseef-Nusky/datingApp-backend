import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'datingapp',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
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
