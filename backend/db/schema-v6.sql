-- PROPOSED additive AICS adapter schema. Apply to isolated test DB first.
-- Existing account/progress tables and records are not updated.
BEGIN;
CREATE TABLE IF NOT EXISTS local_organizations (
 id UUID PRIMARY KEY, display_name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS local_account_roles (
 adult_id UUID PRIMARY KEY REFERENCES local_adults(id), role TEXT NOT NULL CHECK(role='owner')
);
CREATE TABLE IF NOT EXISTS local_school_tenants (
 school_id UUID PRIMARY KEY REFERENCES schools(id), organization_id UUID NOT NULL REFERENCES local_organizations(id),
 active BOOLEAN NOT NULL DEFAULT TRUE, expires_at TIMESTAMPTZ NOT NULL,
 UNIQUE(school_id,organization_id)
);
CREATE TABLE IF NOT EXISTS local_school_memberships (
 adult_id UUID PRIMARY KEY REFERENCES local_adults(id), school_id UUID NOT NULL, organization_id UUID NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('school_admin','teacher')), active BOOLEAN NOT NULL DEFAULT TRUE,
 FOREIGN KEY(school_id,organization_id) REFERENCES local_school_tenants(school_id,organization_id)
);
CREATE TABLE IF NOT EXISTS local_school_configs (
 school_id UUID PRIMARY KEY REFERENCES local_school_tenants(school_id), version INTEGER NOT NULL CHECK(version>0), document JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS local_curriculum_releases (
 id TEXT PRIMARY KEY, rev INTEGER NOT NULL CHECK(rev>0), document JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS local_curriculum_current (
 framework_id TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES local_curriculum_releases(id), document JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS local_curriculum_revocations (
 digest TEXT PRIMARY KEY, document JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS local_aics_audit (
 id UUID PRIMARY KEY, actor UUID NOT NULL REFERENCES local_adults(id), at TIMESTAMPTZ NOT NULL,
 action TEXT NOT NULL, subject TEXT NOT NULL, detail TEXT NOT NULL
);
INSERT INTO app_schema_versions(version) VALUES(6) ON CONFLICT(version) DO NOTHING;
COMMIT;
