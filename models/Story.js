import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Story = sequelize.define(
  'Story',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    mediaType: {
      type: DataTypes.ENUM('photo', 'video'),
      allowNull: false,
    },
    mediaUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    views: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    reactions: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: 'stories',
    timestamps: true,
    indexes: [
      {
        fields: ['expiresAt'],
      },
    ],
  }
);

export default Story;
