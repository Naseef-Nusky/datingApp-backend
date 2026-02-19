-- Add attachments JSON column to messages (for email locked photo/voice attachments)
-- Run this if your messages table doesn't have the column yet.

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS attachments JSON DEFAULT NULL;

COMMENT ON COLUMN messages.attachments IS 'For email: array of { type: photo|voice, url } - locked until receiver pays credits';
