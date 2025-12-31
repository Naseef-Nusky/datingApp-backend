import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const CallRequest = sequelize.define(
  'CallRequest',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    callerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      field: 'caller_id',
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
    callType: {
      type: DataTypes.ENUM('video', 'voice'),
      allowNull: false,
      field: 'call_type',
    },
    status: {
      type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'missed', 'completed'),
      defaultValue: 'pending',
      allowNull: false,
    },
    answeredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'answered_at',
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'ended_at',
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Call duration in seconds',
    },
  },
  {
    tableName: 'call_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['receiver_id', 'status'],
      },
      {
        fields: ['caller_id', 'status'],
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

export default CallRequest;

