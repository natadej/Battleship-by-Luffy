CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  accuracy REAL NOT NULL,
  level INTEGER NOT NULL,
  shots INTEGER NOT NULL,
  won INTEGER NOT NULL,
  assisted INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (score DESC, accuracy DESC);
CREATE INDEX IF NOT EXISTS scores_ip ON scores (ip_hash, created_at);
