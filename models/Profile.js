import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Profile = sequelize.define(
  'Profile',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    age: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 18,
      },
    },
    gender: {
      type: DataTypes.ENUM('male', 'female', 'other'),
      allowNull: false,
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: {
        len: [0, 1000],
      },
    },
    photos: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    coverPhoto: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'defaultCoverImg.jpg',
    },
    location: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    interests: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    lifestyle: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    preferences: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    wishlist: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    isOnline: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    lastSeen: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    profileViews: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    earnings: {
      type: DataTypes.JSONB,
      defaultValue: {
        total: 0,
        fromGifts: 0,
        fromMessages: 0,
        pendingPayout: 0,
      },
    },
    payoutRequests: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    chatRegisteredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    todayStatus: {
      type: DataTypes.ENUM('serious', 'penpal', 'romantic', 'flirty', 'naughty'),
      allowNull: true,
      defaultValue: null,
    },
    ringtone: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'defaultRingtone.mp3',
      comment: 'Ringtone file name for incoming calls',
    },
  },
  {
    tableName: 'profiles',
    timestamps: true,
  }
);

export default Profile;
