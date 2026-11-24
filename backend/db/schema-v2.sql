-- Local development milestone 2: isolated adult accounts and AICS preferences.
-- Additive migration only. No existing tables or data removed.
BEGIN;
CREATE TABLE IF NOT EXISTS local_adults (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS local_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  adult_id UUID NOT NULL REFERENCES local_adults(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lga_sessions_adult ON local_sessions(adult_id);
CREATE TABLE IF NOT EXISTS local_aics_profiles (
  adult_id UUID PRIMARY KEY REFERENCES local_adults(id) ON DELETE CASCADE,
  profile JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO app_schema_versions(version) VALUES(2) ON CONFLICT(version) DO NOTHING;
COMMIT;
