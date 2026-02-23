-- Free User badge: true = show flame icon (free access); false = paying member (no badge).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_free_user BOOLEAN NOT NULL DEFAULT true;
