import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Message = sequelize.define(
  'Message',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    chatId: {
      type: DataTypes.UUID,
      allowNull: true, // Allow null temporarily for backward compatibility during migration
      references: {
        model: 'chats',
        key: 'id',
      },
      field: 'chat_id',
    },
    sender: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      field: 'sender_id',
    },
    receiver: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      field: 'receiver_id',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true, // Allow null for media-only messages
      defaultValue: '',
      field: 'message_text',
    },
    mediaUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'media_url',
    },
    messageType: {
      type: DataTypes.ENUM('text', 'image', 'video', 'voice', 'email', 'intro', 'gift'),
      defaultValue: 'text',
      field: 'message_type',
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_read',
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'read_at',
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_deleted',
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
    isIntroMessage: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_intro_message',
    },
    creditsUsed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'credits_used',
    },
  },
  {
    tableName: 'messages',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['chat_id'],
      },
      {
        fields: ['sender_id', 'receiver_id'],
      },
      {
        fields: ['created_at'],
      },
      {
        fields: ['is_deleted'],
      },
    ],
  }
);

export default Message;
