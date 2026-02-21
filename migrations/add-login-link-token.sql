-- Add magic login link fields to users table (email-based login)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS login_link_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS login_link_expires TIMESTAMP WITH TIME ZONE;
