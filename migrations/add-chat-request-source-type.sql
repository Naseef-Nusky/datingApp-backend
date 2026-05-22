-- Track whether a chat request came from email, mingle, or regular chat invite
ALTER TABLE chat_requests
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'chat',
  ADD COLUMN IF NOT EXISTS related_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;
