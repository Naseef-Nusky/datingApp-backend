-- Pick streamer when email sends (must be online then), not at signup.

ALTER TABLE new_user_streamer_emails
  ALTER COLUMN streamer_user_id DROP NOT NULL;
