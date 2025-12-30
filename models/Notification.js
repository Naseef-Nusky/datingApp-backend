import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Notification = sequelize.define(
  'Notification',
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
    type: {
      type: DataTypes.ENUM(
        'new_message',
        'new_match',
        'call_request',
        'gift_received',
        'profile_view',
        'story_reaction',
        'system',
        'chat_registration_required'
      ),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    relatedId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    relatedType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: 'notifications',
    timestamps: true,
    indexes: [
      {
        fields: ['userId', 'isRead', 'createdAt'],
      },
    ],
  }
);

export default Notification;
