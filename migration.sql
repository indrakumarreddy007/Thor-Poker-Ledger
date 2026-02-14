-- Migration to add username and password columns to users table
ALTER TABLE users ADD COLUMN username TEXT UNIQUE;
ALTER TABLE users ADD COLUMN password TEXT;

-- Update existing rows if any (optional, but good practice to avoid nulls if we had constraints)
-- UPDATE users SET username = 'user_' || id, password = 'temporary_password' WHERE username IS NULL;
