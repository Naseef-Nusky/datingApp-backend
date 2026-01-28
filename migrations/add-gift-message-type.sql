-- Add 'gift' to message_type enum so gifts appear as stickers in chat.
-- Run with: psql -U your_user -d your_db -f add-gift-message-type.sql
-- If the type name differs, find it with: SELECT typname FROM pg_type WHERE typtype = 'e';

ALTER TYPE enum_messages_message_type ADD VALUE IF NOT EXISTS 'gift';
