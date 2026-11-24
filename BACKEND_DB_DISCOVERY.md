# Backend and DB discovery
Read-only inspection of the existing local little_genius_dev database succeeded using the existing backend .env in place. No credentials were copied. PostgreSQL 18 service is running. Schema ledger: 1, 2, 3, 4, 5.

Tables: app_schema_versions, schools, curriculum_packs, local_adults, local_sessions, local_aics_profiles, local_practice_results, local_alphabet_snapshots, local_legacy_game_snapshots. No personal records were read or reported. Schema columns/constraints still require a full compatibility audit.

Original backend on port 4000 was not listening during initial discovery. Win32_Process inventory was denied, so original process provenance could not be established. The isolated master backend subsequently started on 127.0.0.1:4000 (tool session 76212); its source is master/backend/src/server.js. It uses the original local configuration through Node --env-file, without copying it.

Environment names inspected: HOST, PORT, DATABASE_URL. No migration, registration, backup write, password change or production access was performed.
