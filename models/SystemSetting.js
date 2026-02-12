import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

// Generic key/value store for system-wide settings (JSONB value)
// Used for CRM-managed credit costs, feature flags, etc.
const SystemSetting = sequelize.define(
  'SystemSetting',
  {
    key: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: 'system_settings',
    timestamps: true,
  }
);

export default SystemSetting;

