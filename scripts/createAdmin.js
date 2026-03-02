import dotenv from 'dotenv';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import '../models/index.js';
import { User, Profile } from '../models/index.js';

dotenv.config();

const createAdmin = async () => {
  try {
    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Admin credentials
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@vantagedating.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
    const adminFirstName = process.env.ADMIN_FIRST_NAME || 'Admin';
    const adminLastName = process.env.ADMIN_LAST_NAME || 'User';

    // Check if admin already exists
    const existingAdmin = await User.findOne({ 
      where: { 
        email: adminEmail.toLowerCase().trim(),
        userType: { [Op.in]: ['admin', 'superadmin'] },
      } 
    });

    if (existingAdmin) {
      console.log('⚠️  Admin user already exists!');
      console.log(`📧 Email: ${adminEmail}`);
      console.log(`🔑 Password: ${adminPassword}`);
      console.log('\n💡 To change password, update the ADMIN_PASSWORD in .env and run this script again');
      process.exit(0);
    }

    // Create admin user
    const admin = await User.create({
      email: adminEmail.toLowerCase().trim(),
      password: adminPassword, // Will be hashed automatically by User model hooks
      userType: 'superadmin',
      isVerified: true,
      isActive: true,
      credits: 10000, // Give admin plenty of credits
    });

    // Create admin profile
    await Profile.create({
      userId: admin.id,
      firstName: adminFirstName,
      lastName: adminLastName,
      age: 30,
      gender: 'other',
      bio: 'System Administrator',
      location: { city: 'Admin', country: 'System', isAutoDetected: false },
    });

    console.log('\n✅ Admin user created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:', adminEmail);
    console.log('🔑 Password:', adminPassword);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n💡 You can now login to the admin panel with these credentials');
    console.log('💡 To change credentials, set ADMIN_EMAIL and ADMIN_PASSWORD in .env file\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
};

createAdmin();
