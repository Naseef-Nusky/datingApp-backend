-- Streamer engagement sessions (chat, video, voice) for hourly payroll reporting
CREATE TABLE IF NOT EXISTS engagement_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_type VARCHAR(10) NOT NULL CHECK (session_type IN ('chat', 'video', 'voice')),
  status VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER,
  call_request_id UUID REFERENCES call_requests(id) ON DELETE SET NULL,
  chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_streamer_status ON engagement_sessions(streamer_id, status);
CREATE INDEX IF NOT EXISTS idx_engagement_streamer_started ON engagement_sessions(streamer_id, started_at);
CREATE INDEX IF NOT EXISTS idx_engagement_member ON engagement_sessions(member_id);
CREATE INDEX IF NOT EXISTS idx_engagement_type_started ON engagement_sessions(session_type, started_at);
CREATE INDEX IF NOT EXISTS idx_engagement_call_request ON engagement_sessions(call_request_id);
