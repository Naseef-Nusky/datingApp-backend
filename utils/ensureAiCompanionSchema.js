import { sequelize } from '../config/database.js';

/** Idempotent DDL for AI companion columns/tables (sync uses alter:false). */
export async function ensureAiCompanionSchema() {
  const statements = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_ai_companion BOOLEAN NOT NULL DEFAULT false`,
    `CREATE TABLE IF NOT EXISTS ai_companion_personas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      display_label VARCHAR(120),
      character_brief TEXT NOT NULL DEFAULT '',
      humour_style VARCHAR(80),
      message_length VARCHAR(20) DEFAULT 'medium',
      emoji_use VARCHAR(20) DEFAULT 'light',
      conversation_habits TEXT,
      favourite_gift_ids JSONB DEFAULT '[]'::jsonb,
      gift_preferences_notes TEXT,
      gift_suggest_min_hours INTEGER DEFAULT 72,
      gift_suggest_min_active_days INTEGER DEFAULT 2,
      is_active BOOLEAN DEFAULT true,
      welcome_enabled BOOLEAN DEFAULT true,
      system_prompt_extra TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS ai_callback_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      companion_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      preferred_call_type VARCHAR(20) DEFAULT 'either',
      status VARCHAR(20) DEFAULT 'open',
      chat_context TEXT,
      staff_notes TEXT,
      reviewed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS ai_gift_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id UUID NOT NULL,
      companion_id UUID NOT NULL,
      gift_catalog_id UUID,
      event_type VARCHAR(20) NOT NULL,
      message_id UUID,
      meta JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS ai_companions_user_active_idx ON users (is_ai_companion) WHERE is_ai_companion = true`,
    `CREATE INDEX IF NOT EXISTS ai_callback_status_idx ON ai_callback_requests (status)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      const msg = err?.message || '';
      if (!/already exists|duplicate/i.test(msg)) {
        console.warn('[ensureAiCompanionSchema]', msg);
      }
    }
  }
}
