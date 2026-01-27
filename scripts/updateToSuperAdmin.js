import dotenv from 'dotenv';
import { sequelize } from '../config/database.js';
import '../models/index.js';
import { User } from '../models/index.js';

dotenv.config();

const updateToSuperAdmin = async () => {
  try {
    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Admin email from env or default
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@nexdating.com';

    // Find the admin user
    const admin = await User.findOne({ 
      where: { 
        email: adminEmail.toLowerCase().trim()
      } 
    });

    if (!admin) {
      console.log('❌ Admin user not found!');
      console.log(`📧 Looking for email: ${adminEmail}`);
      console.log('\n💡 Run "npm run create-admin" to create a new admin user');
      process.exit(1);
    }

    // Check if already superadmin
    if (admin.userType === 'superadmin') {
      console.log('✅ User is already a superadmin!');
      console.log(`📧 Email: ${admin.email}`);
      console.log(`👤 User Type: ${admin.userType}`);
      process.exit(0);
    }

    // Update to superadmin
    await admin.update({
      userType: 'superadmin',
      isVerified: true,
      isActive: true,
    });

    console.log('\n✅ Admin user updated to superadmin successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:', admin.email);
    console.log('👤 User Type: superadmin');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n💡 You can now login to the admin panel with full superadmin privileges\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating admin user:', error);
    process.exit(1);
  }
};

updateToSuperAdmin();
