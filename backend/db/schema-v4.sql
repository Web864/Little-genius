-- M3.6 local-only: opt-in, account-scoped alphabet snapshot. No child identities.
BEGIN;
CREATE TABLE IF NOT EXISTS local_alphabet_snapshots (
 adult_id UUID PRIMARY KEY REFERENCES local_adults(id) ON DELETE CASCADE,
 letters JSONB NOT NULL,
 course_complete BOOLEAN NOT NULL DEFAULT FALSE,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO app_schema_versions(version) VALUES(4) ON CONFLICT(version) DO NOTHING;
COMMIT;
