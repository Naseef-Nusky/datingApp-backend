import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const GiftCatalog = sequelize.define(
  'GiftCatalog',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    category: {
      type: DataTypes.ENUM('cake', 'flower', 'ceremony', 'jewelry', 'other'),
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('virtual', 'physical', 'both'),
      allowNull: false,
    },
    imageUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    creditCost: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    physicalPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: 'gift_catalogs',
    timestamps: true,
  }
);

export default GiftCatalog;
