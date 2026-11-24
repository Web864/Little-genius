# Migration safety
No database migration was executed or added. Existing reviewed source schemas v1?v5 are retained verbatim as reference; do not run db:init on the existing database.

Runtime account/progress work reuses local_adults, local_sessions, local_aics_profiles, local_practice_results, local_alphabet_snapshots and local_legacy_game_snapshots. No new game tables are required for the currently supported snapshots.

Before school/owner integration: design additive membership/role, school configuration, immutable curriculum release, current-pointer, revocation and audit storage. Inspect actual constraints, prepare concrete SQL, transaction/CAS behavior and rollback instructions; test on a separately isolated database. Existing schools/curriculum_packs are placeholders and do not implement those permissions. Never derive owner authority from a request body or browser storage.

No approval is requested for speculative SQL. Owner approval is required only after a concrete migration and isolated migration tests are ready, before applying it to existing little_genius_dev. Recovery must preserve old snapshots and schema; never drop or reset the database.
