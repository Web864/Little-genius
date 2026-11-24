# Remaining gaps ? PARTIAL
1. Fix inherited strict TypeScript errors without suppressions or rewriting working games unnecessarily.
2. Verify newly wired account lifecycle in a real browser, including cross-tab logout, failed storage, expiry, guest-to-account quarantine and A/B reload behavior. Existing accountScope vault is reused; unowned progress is quarantined rather than silently assigned. Add an accessible adult-confirmed claim UI for old quarantined data.
3. Standalone school membership/configuration and owner publication backend adapters are missing. Phase 10 service logic exists but is not connected to PostgreSQL. Licensing is also missing locally. No fake owner identity was introduced.
4. Prepare and test concrete additive school/release/audit migrations, then request approval before touching the existing database.
5. Real PostgreSQL auth/backup A/B tests must use a separate authorized test environment, preserving existing accounts.
6. Number Galaxy, Addition Garden, Shape Lab, Urdu Garden, Sound Forest and Word Builder do not have dedicated account backup/dashboard coverage. Preserve current connected-curriculum browser records and design compatible snapshots rather than inventing completed results.
7. Full Phase 10 suite, mobile/navigation QA, live audio and frontend/backend round trips remain unverified.
8. Candidate discovery covered the expected E: development root. Other user folders and ZIP internals have not been exhaustively compared. No Milestone 4.5 package was found in that root.
