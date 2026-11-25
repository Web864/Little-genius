-- Six existing learning games: opt-in, adult-owned progress backups.
-- PREPARATION ONLY. Do not apply to the existing database without approval.
-- This migration is intended to follow schema v6.

BEGIN;

CREATE TABLE IF NOT EXISTS local_six_game_snapshots (
    adult_id UUID PRIMARY KEY
        REFERENCES local_adults(id)
        ON DELETE CASCADE,

    snapshot JSONB NOT NULL,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_schema_versions(version)
VALUES (7)
ON CONFLICT (version) DO NOTHING;

COMMIT;