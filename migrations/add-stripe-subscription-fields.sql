-- Add Stripe subscription/customer IDs for recurring subscriptions (auto-renewal)
-- Run this if your DB was created before these fields existed.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
