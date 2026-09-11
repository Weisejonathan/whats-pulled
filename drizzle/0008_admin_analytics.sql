-- Privacy-conscious first-party analytics for the admin operations dashboard.
-- Sessions contain only a random browser id, the current route and optional user relation.
CREATE TABLE IF NOT EXISTS analytics_sessions (
  id text PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  page_path text NOT NULL,
  tool text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_sessions_last_seen_idx
  ON analytics_sessions(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS analytics_sessions_user_idx
  ON analytics_sessions(user_id);

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text REFERENCES analytics_sessions(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  tool text,
  page_path text,
  input_units integer NOT NULL DEFAULT 0,
  output_units integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(14, 8) NOT NULL DEFAULT 0,
  metadata jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_occurred_at_idx
  ON analytics_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_tool_idx
  ON analytics_events(tool, occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx
  ON analytics_events(session_id);
