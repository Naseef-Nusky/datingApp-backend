import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Block = sequelize.define(
  'Block',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    blocker: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    blocked: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
  },
  {
    tableName: 'blocks',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['blocker', 'blocked'],
      },
    ],
  }
);

export default Block;
