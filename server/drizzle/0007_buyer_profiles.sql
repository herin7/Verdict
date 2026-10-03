-- Buyer profile from onboarding, and the per-user verdict it produces on each share.

CREATE TABLE IF NOT EXISTS buyer_profiles (
  user_id text PRIMARY KEY,
  profile jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shares ADD COLUMN IF NOT EXISTS personal jsonb;
