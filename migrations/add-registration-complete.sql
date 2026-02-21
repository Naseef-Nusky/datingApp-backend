-- New users created via magic link need to complete "about you" registration.
-- Existing users and full signups are considered complete (default true).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS registration_complete BOOLEAN NOT NULL DEFAULT true;
