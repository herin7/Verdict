-- Share-first inbox: every share is a row that doubles as its background job.

CREATE TABLE IF NOT EXISTS shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  client_id text NOT NULL,
  kind text NOT NULL,
  content_hash text NOT NULL,
  input_text text,
  input_url text,
  image_key text,
  status text NOT NULL DEFAULT 'queued',
  stage text,
  extracted_text text,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  timings jsonb NOT NULL DEFAULT '{}'::jsonb,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shares_user_client_uidx ON shares (user_id, client_id);
CREATE INDEX IF NOT EXISTS shares_user_updated_idx ON shares (user_id, updated_at);
CREATE INDEX IF NOT EXISTS shares_user_hash_idx ON shares (user_id, content_hash);

CREATE TABLE IF NOT EXISTS devices (
  expo_token text PRIMARY KEY,
  user_id text NOT NULL,
  platform text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_runs (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now()
);
