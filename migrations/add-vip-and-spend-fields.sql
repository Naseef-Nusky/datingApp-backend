-- Add VIP and credit-spend tracking columns to users table
-- Run this if your DB was created before these fields existed.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS total_credits_spent INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_credit_spent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS vip_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vip_expires_at TIMESTAMP WITH TIME ZONE;

-- Optional: backfill total_credits_spent from credit_transactions for existing users
-- UPDATE users u
-- SET total_credits_spent = COALESCE((
--   SELECT SUM(ABS(ct.amount)) FROM credit_transactions ct
--   WHERE ct.user_id = u.id AND ct.type = 'usage' AND ct.amount < 0
-- ), 0),
-- last_credit_spent_at = (
--   SELECT MAX(ct.created_at) FROM credit_transactions ct
--   WHERE ct.user_id = u.id AND ct.type = 'usage' AND ct.amount < 0
-- )
-- WHERE u.total_credits_spent = 0 AND u.last_credit_spent_at IS NULL;
