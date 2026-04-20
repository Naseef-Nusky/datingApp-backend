import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const ZODIAC_BOUNDARIES = [
  { sign: 'Capricorn', start: [12, 22], end: [1, 19] },
  { sign: 'Aquarius', start: [1, 20], end: [2, 18] },
  { sign: 'Pisces', start: [2, 19], end: [3, 20] },
  { sign: 'Aries', start: [3, 21], end: [4, 19] },
  { sign: 'Taurus', start: [4, 20], end: [5, 20] },
  { sign: 'Gemini', start: [5, 21], end: [6, 20] },
  { sign: 'Cancer', start: [6, 21], end: [7, 22] },
  { sign: 'Leo', start: [7, 23], end: [8, 22] },
  { sign: 'Virgo', start: [8, 23], end: [9, 22] },
  { sign: 'Libra', start: [9, 23], end: [10, 22] },
  { sign: 'Scorpio', start: [10, 23], end: [11, 21] },
  { sign: 'Sagittarius', start: [11, 22], end: [12, 21] },
];

function parseMonthDay(input) {
  if (!input) return null;
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return { month: input.getUTCMonth() + 1, day: input.getUTCDate() };
  }

  const raw = String(input).trim();
  if (!raw) return null;

  // Supports YYYY-MM-DD and YYYY/MM/DD
  let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    return { month: parseInt(match[2], 10), day: parseInt(match[3], 10) };
  }

  // Supports MM-DD and MM/DD
  match = raw.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    return { month: parseInt(match[1], 10), day: parseInt(match[2], 10) };
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return { month: parsed.getUTCMonth() + 1, day: parsed.getUTCDate() };
  }

  return null;
}

function inRange(month, day, startMonth, startDay, endMonth, endDay) {
  if (startMonth === endMonth) {
    return month === startMonth && day >= startDay && day <= endDay;
  }
  if (startMonth < endMonth) {
    return (
      (month === startMonth && day >= startDay) ||
      (month === endMonth && day <= endDay) ||
      (month > startMonth && month < endMonth)
    );
  }
  // Across year boundary (e.g. Capricorn)
  return (
    (month === startMonth && day >= startDay) ||
    (month === endMonth && day <= endDay) ||
    month > startMonth ||
    month < endMonth
  );
}

function getZodiacSignFromMonthDay(month, day) {
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  for (const item of ZODIAC_BOUNDARIES) {
    if (inRange(month, day, item.start[0], item.start[1], item.end[0], item.end[1])) {
      return item.sign;
    }
  }
  return null;
}

function applyAutomaticZodiac(profileInstance) {
  const lifestyle = profileInstance.lifestyle;
  if (!lifestyle || typeof lifestyle !== 'object' || Array.isArray(lifestyle)) return;

  const birthDateSource =
    lifestyle.birthDate ||
    lifestyle.dateOfBirth ||
    lifestyle.dob ||
    lifestyle.birthday;

  const monthDay = parseMonthDay(birthDateSource);
  if (!monthDay) return;

  const zodiac = getZodiacSignFromMonthDay(monthDay.month, monthDay.day);
  if (!zodiac) return;

  profileInstance.lifestyle = {
    ...lifestyle,
    zodiac,
  };
}

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
    hooks: {
      beforeValidate: (profile) => {
        applyAutomaticZodiac(profile);
      },
      beforeUpdate: (profile) => {
        applyAutomaticZodiac(profile);
      },
      beforeCreate: (profile) => {
        applyAutomaticZodiac(profile);
      },
    },
  }
);

export default Profile;
