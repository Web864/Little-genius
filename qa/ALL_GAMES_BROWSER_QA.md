# Final Release-Blocker QA

**Project:** `E:\LittleGenius-Independent\consolidated-v48\master`  
**Date:** 2026-11-25

## Summary

- **14 requested game labels:** 14 PASS, 0 PARTIAL, 0 FAIL.
- **Distinct gameplay routes:** 13. Lost Letters and Picture Rescue intentionally share one route.
- **Addition Garden focused regression:** PASS (all 8 questions, wrong/correct paths, final completion).
- **Browser errors:** 0 in the gameplay matrix.
- **Viewports:** 390×844 mobile, 768×1024 tablet, 1440×900 desktop; no horizontal page overflow.
- **Frontend typecheck/build:** PASS.
- **Release status:** NOT READY. Current `little_genius_dev` schema versions could not be reconfirmed; v6/v7 are not approved or applied.

Gameplay used fresh Playwright Chromium contexts at `http://127.0.0.1:5173/`, with `/api/**` intercepted in-browser. No personal Chrome profile was used, and gameplay requests did not reach the backend or PostgreSQL.

## Browser results

| Game | Result | Gameplay exercised |
|---|---|---|
| ABC Lessons | PASS | Wrong/correct guided answer, capital and lowercase quizzes, tracing, all 26 letters, and course completion. |
| Lost Letters | PASS — shared route | Letter/picture clue, wrong and correct answers, two-clue progression, rescue celebrations, and completion. |
| Picture Rescue | PASS — shared route | Picture clue and two-picture rescue gameplay on the same route as Lost Letters; three-animal completion. |
| Story Quests | PASS | All three quests; wrong/correct letter and shape answers, collecting items, completion, and device progress. |
| Number Galaxy | PASS | Counted 1–10, wrong-answer retry and correct answers, recognition, tracing, and completion. |
| Addition Garden | PASS | All eight problems; wrong/correct guided and independent answers, progression, and completion. |
| Sound Forest | PASS | All 10 lessons; wrong/correct sound answers, tracing, and completion. |
| Urdu Garden | PASS | All 39 lessons; wrong/correct letter answers, tracing, and completion. |
| Word Builder | PASS | All eight words; incorrect assembly, correct letter sequence, progression, and completion. |
| Shape Lab | PASS | All five lessons; wrong/correct choices and completion. |
| Sorting Safari | PASS | All four rounds; wrong/correct responses, score updates, progression, and completion. |
| Pattern Parade | PASS | All four rounds; wrong/correct responses, score updates, progression, and completion. |
| Measurement Mission | PASS | All four rounds; wrong/correct responses, score updates, progression, and completion. |
| Nature Discovery | PASS | All four rounds; wrong/correct responses, score updates, progression, and completion. |

### Picture Rescue launcher finding

The shared route is intentional in the current app mapping, not a missing navigation defect:

- The English Learning Library provides one `lost` tile labelled “Lost Letters”.
- `TAB_ACTIVITIES.lost` maps both `act.lit.lost-letters` and `act.lit.picture-rescue` to that tab in [worlds.ts](../frontend/src/aics/worlds.ts).
- The live route uses [forestPictureGame.ts](../frontend/src/forestPictureGame.ts), whose screen heading explicitly reads “LOST LETTERS · PICTURE RESCUE”.

The separate [lostForest.ts](../frontend/src/lostForest.ts) implementation is not wired into the live Learning Library. No second launcher was added because that would contradict the explicit shared-tab mapping.

### Addition Garden regression

Confirmed the prior fix in [addition.ts](../frontend/src/addition.ts): the final render checks `finished` before reading the next question. The focused run completed all eight questions, including wrong/correct answers in guided and independent stages, with the “Little Addition Champion!” completion screen and zero browser errors.

### Validation notes

- `npm run typecheck`: PASS.
- `npm run build`: PASS (51 modules).
- A direct `node --test tests/aics/worlds.test.ts` probe was BLOCKED before test execution: it imports missing `tests/aics/fixtures/v48-anchors.ts`. This test file is not included in the configured `test:aics` script. No fixture or test files were changed.

## Database identity and schema status

- Read-only `GET /api/health/db` reported `lga_consolidation_test_20261124`, not `little_genius_dev`; its handler runs a `SELECT current_database(), NOW()`.
- A direct `psql` read-only connection to `little_genius_dev` was attempted with prompting disabled and failed with `fe_sendauth: no password supplied`.
- No project-local backend `.env` or `DATABASE_URL` was available. No external project configuration or credentials were read.
- **Current `little_genius_dev` schema versions: BLOCKED / UNKNOWN.** A prior read-only check on 2026-11-24 reported versions 1–5, but that result was not reconfirmed today.
- No migration, schema write, progress write, or PostgreSQL integration test was run.

## Prepared v6/v7 migration and rollback plan — NOT EXECUTED

The existing [schema-v6.sql](../backend/db/schema-v6.sql) and [schema-v7.sql](../backend/db/schema-v7.sql) are additive. v6 creates AICS organization, role, school, curriculum-release, revocation, and audit tables; v7 creates `local_six_game_snapshots`. Each records its version in `app_schema_versions`. The current `backend/db/init.js` only applies v1–v5, so it must not be treated as a v6/v7 runner.

**Apply only after explicit owner approval and access to the correct local database:**

1. Use a verified backup and a tested restore procedure. Confirm the connection target using a read-only identity query (`current_database()`, local server address, and transaction read-only state); stop if it is not `little_genius_dev`.
2. Read current schema versions and inspect the v6/v7 target table names, columns, and foreign keys. Stop on unexpected existing objects or versions.
3. Validate the unchanged v6/v7 SQL against an isolated clone/test database first. Do not use the running backend while migrating.
4. With a maintenance window and a verified pre-migration backup, apply v6, verify its objects/version, then apply v7 and verify its object/version. Check errors and table definitions before reopening writes.

**Rollback plan:**

1. Prefer restoring the verified pre-migration backup if either migration fails or post-migration writes have occurred.
2. A down migration is permissible only after a separate backup/export of any v6/v7 data and confirmation that dropping these additive tables will not discard needed records.
3. In reverse dependency order, remove v7 `local_six_game_snapshots`, then v6 tables in this order: `local_school_configs`, `local_school_memberships`, `local_curriculum_current`, `local_school_tenants`, `local_curriculum_releases`, `local_curriculum_revocations`, `local_aics_audit`, `local_account_roles`, `local_organizations`. Remove `app_schema_versions` rows 7 and 6 only after their owned objects are safely handled.
4. Never use `CASCADE`, truncate progress, or run rollback against an unverified database. Recheck identity and schema versions read-only afterward.

## Local services and remaining blockers

- Frontend: `http://127.0.0.1:5173/` — HTTP 200; left running.
- Backend: port 4000 — listener confirmed; health endpoint currently identifies the isolated test database.
- Owner approval is required before any v6/v7 migration to `little_genius_dev`. A secure local credential/configuration is also needed to complete the currently blocked read-only schema-version check.
- Account isolation, server-side progress persistence, and dev-database integration remain unverified; this QA run intentionally isolated gameplay from backend APIs.
