-- Milestone 3.4: strictly local, account-scoped results for four draft practice games only.
-- No child identifiers, no automatic upload, no curriculum publication.
BEGIN;
CREATE TABLE IF NOT EXISTS local_practice_results (
  adult_id UUID NOT NULL REFERENCES local_adults(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL CHECK (game_id IN ('sorting','patterns','measurement','nature')),
  best_score SMALLINT NOT NULL CHECK (best_score BETWEEN 0 AND 4),
  last_score SMALLINT NOT NULL CHECK (last_score BETWEEN 0 AND 4),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(adult_id, game_id)
);
INSERT INTO app_schema_versions(version) VALUES(3) ON CONFLICT(version) DO NOTHING;
COMMIT;
