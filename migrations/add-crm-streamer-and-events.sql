-- CRM streamer staff role, is_admin_created flag, CRM event feed for new-user alerts
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin_created BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'enum_users_user_type' AND e.enumlabel = 'crm_streamer'
  ) THEN
    ALTER TYPE enum_users_user_type ADD VALUE 'crm_streamer';
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS crm_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(64) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_events_created_at ON crm_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_events_unread ON crm_events (read_at) WHERE read_at IS NULL;
