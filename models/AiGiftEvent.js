import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

/** Audit log: gift suggested / dismissed / purchased for AI companions. */
const AiGiftEvent = sequelize.define(
  'AiGiftEvent',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    memberId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'member_id',
    },
    companionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'companion_id',
    },
    giftCatalogId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'gift_catalog_id',
    },
    eventType: {
      type: DataTypes.ENUM('suggested', 'dismissed', 'purchased', 'opt_out'),
      allowNull: false,
      field: 'event_type',
    },
    messageId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'message_id',
    },
    meta: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  },
  {
    tableName: 'ai_gift_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['member_id', 'companion_id'] },
      { fields: ['event_type'] },
      { fields: ['created_at'] },
    ],
  }
);

export default AiGiftEvent;
