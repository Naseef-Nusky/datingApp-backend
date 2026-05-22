import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const ChatRequest = sequelize.define(
  'ChatRequest',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    senderId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      field: 'sender_id',
    },
    receiverId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      field: 'receiver_id',
    },
    firstMessage: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'first_message',
    },
    status: {
      type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'expired'),
      defaultValue: 'pending',
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
    },
    sourceType: {
      type: DataTypes.STRING(20),
      defaultValue: 'chat',
      allowNull: false,
      field: 'source_type',
    },
    relatedMessageId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'related_message_id',
    },
  },
  {
    tableName: 'chat_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['receiver_id', 'status'],
      },
      {
        fields: ['sender_id', 'status'],
      },
      {
        fields: ['status'],
      },
      {
        fields: ['created_at'],
      },
    ],
  }
);

export default ChatRequest;

