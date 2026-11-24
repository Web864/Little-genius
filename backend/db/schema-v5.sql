-- Additive local-only backup for three original game progress stores. No student identities.
BEGIN;
CREATE TABLE IF NOT EXISTS local_legacy_game_snapshots (
 adult_id UUID PRIMARY KEY REFERENCES local_adults(id) ON DELETE CASCADE,
 snapshot JSONB NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO app_schema_versions(version) VALUES(5) ON CONFLICT(version) DO NOTHING;
COMMIT;
