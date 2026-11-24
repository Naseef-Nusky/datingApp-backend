import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

/**
 * Staff callback queue when a member repeatedly asks an AI companion for voice/video.
 * One open request per member at a time.
 */
const AiCallbackRequest = sequelize.define(
  'AiCallbackRequest',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    memberId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      field: 'member_id',
    },
    companionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      field: 'companion_id',
    },
    preferredCallType: {
      type: DataTypes.ENUM('voice', 'video', 'either'),
      defaultValue: 'either',
      field: 'preferred_call_type',
    },
    status: {
      type: DataTypes.ENUM('open', 'accepted', 'completed', 'cancelled'),
      defaultValue: 'open',
    },
    chatContext: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'chat_context',
    },
    staffNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'staff_notes',
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewed_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
  },
  {
    tableName: 'ai_callback_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['member_id', 'status'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  }
);

export default AiCallbackRequest;
