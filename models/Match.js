import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Match = sequelize.define(
  'Match',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user1: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    user2: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    isMutual: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    user1Liked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    user2Liked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    matchedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastInteraction: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'matches',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['user1', 'user2'],
      },
    ],
  }
);

export default Match;
