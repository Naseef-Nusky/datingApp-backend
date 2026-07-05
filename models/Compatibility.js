import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Compatibility = sequelize.define(
  'Compatibility',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userLowId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_low_id',
    },
    userHighId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_high_id',
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 0, max: 100 },
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    strengths: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    challenges: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    icebreakers: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    source: {
      type: DataTypes.STRING(32),
      defaultValue: 'ai',
      comment: 'ai | heuristic',
    },
  },
  {
    tableName: 'compatibilities',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['user_low_id', 'user_high_id'],
      },
    ],
  }
);

export default Compatibility;
