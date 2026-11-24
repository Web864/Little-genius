-- Little Genius Adventure: local-only initial schema.
-- These tables are empty placeholders. No auth, permission enforcement or user-data APIs yet.
BEGIN;
CREATE TABLE IF NOT EXISTS app_schema_versions (
  version INTEGER PRIMARY KEY,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 120),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS curriculum_packs (
  id UUID PRIMARY KEY,
  school_id UUID REFERENCES schools(id),
  pack_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'published', 'revoked')),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, pack_key)
);
INSERT INTO app_schema_versions(version) VALUES(1) ON CONFLICT(version) DO NOTHING;
COMMIT;
