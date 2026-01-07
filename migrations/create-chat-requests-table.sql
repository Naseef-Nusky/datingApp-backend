-- Create chat_requests table
CREATE TABLE IF NOT EXISTS chat_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chat_requests_receiver_status ON chat_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_requests_sender_status ON chat_requests(sender_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_requests_status ON chat_requests(status);
CREATE INDEX IF NOT EXISTS idx_chat_requests_created_at ON chat_requests(created_at);

-- Add unique constraint to prevent duplicate pending requests
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_requests_unique_pending 
ON chat_requests(sender_id, receiver_id) 
WHERE status = 'pending';










