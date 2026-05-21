import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const NewUserStreamerEmail = sequelize.define(
  'NewUserStreamerEmail',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    newUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'new_user_id',
    },
    streamerUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'streamer_user_id',
    },
    sendAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'send_at',
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'sent_at',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'new_user_streamer_emails',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default NewUserStreamerEmail;
