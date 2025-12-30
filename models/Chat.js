import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Chat = sequelize.define(
  'Chat',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user1Id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      field: 'user_1_id',
    },
    user2Id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      field: 'user_2_id',
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_message_at',
    },
    lastMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_message',
    },
    unreadCountUser1: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'unread_count_user_1',
    },
    unreadCountUser2: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'unread_count_user_2',
    },
  },
  {
    tableName: 'chats',
    timestamps: true,
    indexes: [
      {
        fields: ['user_1_id', 'user_2_id'],
        unique: true,
      },
      {
        fields: ['last_message_at'],
      },
    ],
  }
);

export default Chat;



