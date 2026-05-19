import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const CrmEvent = sequelize.define(
  'CrmEvent',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    eventType: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'event_type',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    payload: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'read_at',
    },
  },
  {
    tableName: 'crm_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

export default CrmEvent;
