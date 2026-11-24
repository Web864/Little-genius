# Concrete migration review ? v6 NOT applied to existing dev
SQL: backend/db/schema-v6.sql. Existing v1-v5 SQL and db:init remain unchanged; db:init does NOT silently include v6.

## Added tables
| Table | Purpose / boundaries |
|---|---|
| local_organizations | Active organization registry |
| local_account_roles | Trusted owner role linked to existing adult id |
| local_school_tenants | School-to-organization link, active flag and expiry |
| local_school_memberships | Existing adult -> one school/organization; school_admin or teacher; composite FK prevents mismatched organization |
| local_school_configs | School-scoped JSON config and CAS version |
| local_curriculum_releases | Existing Claude release document + revision |
| local_curriculum_current | Current framework pointer referencing a release |
| local_curriculum_revocations | Permanent digest revocation documents |
| local_aics_audit | Atomic actor/time/action/subject/detail history |

No existing tables are altered, no account/progress records are rewritten, and no school or owner membership is granted by the migration. The schema ledger gets version 6. All DDL runs inside BEGIN/COMMIT. IF NOT EXISTS is idempotent but does not repair an incompatible pre-existing table; inspect column/constraint compatibility before any approved rollout.

## Isolated evidence
backend/scripts/prepare-test-db.mjs refuses remote configurations and targets only the fixed local test database (never little_genius_dev). Actual v1-v6 creation passed. Reapplying v6 preserved a real fictional account alphabet backup. Real tests verified cross-organization FK rejection, config CAS races, role checks, owner Draft/publication refusal and transaction/savepoint rollback. Existing dev recheck still showed versions 1?5 after these tests.

## Rollback / recovery
If migration fails before COMMIT, issue ROLLBACK on that connection; no partial v6 schema should commit. Before approved dev application, obtain a private local backup through the owner's normal backup process; do not commit or attach it. Stop only the intended local runtime during approved maintenance, inspect actual constraints and verify old snapshots after migration.

For application rollback after successful v6 commit: return to the baseline Git checkpoint/runtime; leave additive v6 tables intact so new audit/config/release data is preserved. Never automatically DROP tables or delete schema ledger rows. A destructive down migration is deliberately not supplied. Any later data removal/restoration requires a separate reviewed decision.

No existing dev migration is authorized or executed. Approval must name this SQL after reviewing its nine tables. Owner and school privileges must then be provisioned against verified existing adult ids through a trusted administrative procedure; test fixture provisioning must never be run against dev.
