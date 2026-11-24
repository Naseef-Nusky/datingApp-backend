import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

/**
 * Editable character brief + gift behaviour for an AI companion user.
 */
const AiCompanionPersona = sequelize.define(
  'AiCompanionPersona',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'users', key: 'id' },
      field: 'user_id',
    },
    /** Short label for CRM (e.g. "Maya – witty flirty") */
    displayLabel: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'display_label',
    },
    characterBrief: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'character_brief',
    },
    humourStyle: {
      type: DataTypes.STRING(80),
      allowNull: true,
      field: 'humour_style',
    },
    messageLength: {
      type: DataTypes.ENUM('short', 'medium', 'long'),
      defaultValue: 'medium',
      field: 'message_length',
    },
    emojiUse: {
      type: DataTypes.ENUM('none', 'light', 'frequent'),
      defaultValue: 'light',
      field: 'emoji_use',
    },
    conversationHabits: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'conversation_habits',
    },
    /** Gift catalog UUIDs this companion prefers (incl. premium) */
    favouriteGiftIds: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'favourite_gift_ids',
    },
    giftPreferencesNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'gift_preferences_notes',
    },
    /** Hours before first proactive gift suggestion (default 72) */
    giftSuggestMinHours: {
      type: DataTypes.INTEGER,
      defaultValue: 72,
      field: 'gift_suggest_min_hours',
    },
    /** Require chat activity on at least this many distinct calendar days */
    giftSuggestMinActiveDays: {
      type: DataTypes.INTEGER,
      defaultValue: 2,
      field: 'gift_suggest_min_active_days',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
    welcomeEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'welcome_enabled',
    },
    systemPromptExtra: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'system_prompt_extra',
    },
  },
  {
    tableName: 'ai_companion_personas',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ fields: ['user_id'] }, { fields: ['is_active'] }],
  }
);

export default AiCompanionPersona;
