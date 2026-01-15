import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import bcrypt from 'bcryptjs';

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [6, 255],
      },
    },
    userType: {
      type: DataTypes.ENUM('regular', 'talent', 'streamer', 'admin'),
      defaultValue: 'regular',
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    verificationToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    passwordResetToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    passwordResetExpires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    credits: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    subscriptionPlan: {
      type: DataTypes.ENUM('free', 'basic', 'premium', 'vip'),
      defaultValue: 'free',
    },
    subscriptionExpires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    monthlyCreditRefill: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    emailPreferences: {
      type: DataTypes.JSONB,
      defaultValue: {
        newMatches: true,
        newMessages: true,
        profileViews: true,
        dailyDigest: true,
        promotional: false,
        digestFrequency: 'daily', // 'real-time', 'hourly', 'daily', 'weekly'
        digestTime: '09:00', // HH:mm format
      },
      field: 'email_preferences',
    },
  },
  {
    tableName: 'users',
    timestamps: true,
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
    },
  }
);

// Instance method to compare password
User.prototype.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default User;
