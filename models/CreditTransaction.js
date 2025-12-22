import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const CreditTransaction = sequelize.define(
  'CreditTransaction',
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
      type: DataTypes.ENUM('purchase', 'subscription', 'usage', 'refund', 'refill'),
      allowNull: false,
    },
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    relatedTo: {
      type: DataTypes.ENUM('message', 'call', 'gift', 'subscription', 'other'),
      allowNull: true,
    },
    relatedId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    tableName: 'credit_transactions',
    timestamps: true,
    indexes: [
      {
        fields: ['userId', 'createdAt'],
      },
    ],
  }
);

export default CreditTransaction;
