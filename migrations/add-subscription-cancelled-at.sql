-- Store when a user cancelled their subscription and when the paid period ends (for CRM display)
-- Run this if your DB was created before these fields existed.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_cancelled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP WITH TIME ZONE;
