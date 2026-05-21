-- Queue: send new members a delayed "ready to chat" email from a random streamer persona.

CREATE TABLE IF NOT EXISTS new_user_streamer_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  new_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  streamer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  send_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS new_user_streamer_emails_new_user_pending
  ON new_user_streamer_emails (new_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS new_user_streamer_emails_send_at_status
  ON new_user_streamer_emails (send_at, status);
