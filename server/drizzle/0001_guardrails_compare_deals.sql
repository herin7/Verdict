-- Additive migration: abuse prevention + compare/deals tables

CREATE TABLE IF NOT EXISTS violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  ip text,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS violations_fp_idx ON violations (fingerprint);
CREATE INDEX IF NOT EXISTS violations_ip_idx ON violations (ip);

CREATE TABLE IF NOT EXISTS ip_bans (
  ip text PRIMARY KEY,
  until timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ip_bans_until_idx ON ip_bans (until);

CREATE TABLE IF NOT EXISTS marketplace_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  offers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_offers_product_uidx ON marketplace_offers (product_id);

CREATE TABLE IF NOT EXISTS payment_profiles (
  user_id text PRIMARY KEY,
  methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
