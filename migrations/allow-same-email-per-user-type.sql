-- Allow the same email for different account kinds (e.g. CRM staff + dating member).
-- Uniqueness is now (email, userType), not email alone.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;
DROP INDEX IF EXISTS users_email_key;
DROP INDEX IF EXISTS users_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_user_type_unique
  ON users (email, "userType");
