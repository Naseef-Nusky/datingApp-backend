import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Gift = sequelize.define(
  'Gift',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    sender: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    receiver: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    giftType: {
      type: DataTypes.ENUM('virtual', 'physical'),
      allowNull: false,
    },
    giftItem: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'gift_catalogs',
        key: 'id',
      },
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    deliveryStatus: {
      type: DataTypes.ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled'),
      defaultValue: 'pending',
    },
    deliveryAddress: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    creditsUsed: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    isDelivered: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'gifts',
    timestamps: true,
  }
);

export default Gift;
