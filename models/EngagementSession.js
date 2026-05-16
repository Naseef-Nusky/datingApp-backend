import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const EngagementSession = sequelize.define(
  'EngagementSession',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    streamerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'streamer_id',
      references: { model: 'users', key: 'id' },
    },
    memberId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'member_id',
      references: { model: 'users', key: 'id' },
    },
    sessionType: {
      type: DataTypes.ENUM('chat', 'video', 'voice'),
      allowNull: false,
      field: 'session_type',
    },
    status: {
      type: DataTypes.ENUM('active', 'completed'),
      defaultValue: 'active',
      allowNull: false,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'started_at',
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'ended_at',
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'last_activity_at',
    },
    durationSeconds: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'duration_seconds',
    },
    callRequestId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'call_request_id',
      references: { model: 'call_requests', key: 'id' },
    },
    chatId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'chat_id',
      references: { model: 'chats', key: 'id' },
    },
  },
  {
    tableName: 'engagement_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['streamer_id', 'status'] },
      { fields: ['streamer_id', 'started_at'] },
      { fields: ['member_id'] },
      { fields: ['session_type', 'started_at'] },
    ],
  }
);

export default EngagementSession;
