-- Shopping Missions + Firecrawl monitor linkage

CREATE TABLE IF NOT EXISTS shopping_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  title text NOT NULL,
  goal text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  country text NOT NULL DEFAULT 'IN',
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  product jsonb,
  proposal jsonb,
  monitor_id text,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shopping_missions_user_idx ON shopping_missions (user_id);
CREATE INDEX IF NOT EXISTS shopping_missions_user_status_idx ON shopping_missions (user_id, status);
CREATE INDEX IF NOT EXISTS shopping_missions_monitor_idx ON shopping_missions (monitor_id);
