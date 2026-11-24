# Actual verification results ? 2026-11-25 (Asia/Karachi)
Current status: PASS for the verified isolated integration scope; overall PARTIAL for existing-dev rollout and exhaustive application QA.

| Check / exact command | Actual result |
|---|---|
| `npm.cmd --prefix master/frontend run typecheck` from workspace | PASS, zero diagnostics; original 511 lines retained in TYPECHECK_BASELINE.txt |
| `npm.cmd run build` in master/frontend | PASS, Vite 8.3.8, 47 modules; dynamic learning module produced; only plugin-timing advisory |
| `$env:LGA_REAL_DB_TEST='1'; node --test master/backend/test-*.mjs` from workspace | PASS 26/26, zero skips; log BACKEND_TEST_RESULTS.txt |
| `npm.cmd run test:aics` in master/frontend (13 explicitly listed files) | PASS 242/242; log AICS_TEST_RESULTS.txt |
| `node master/backend/scripts/prepare-test-db.mjs` from workspace | PASS; dedicated test DB only, schemas 1?6 |
| `node master/check-existing-db.mjs` from workspace | PASS read-only; existing dev still versions 1?5 |
| `node master/frontend/tests/browser-smoke.mjs` from workspace | PASS actual headless Chrome + Vite + Fastify + PostgreSQL; BROWSER_RESULTS.json |
| Updated master API /api/health, /api/health/db, /api/auth/me | 200 OK after restart on actual port 4000 |
| `git -C master diff --check` | PASS |

## What the tests prove
The original 19 backend tests use mock SQL and remain marked as such. Added integration tests use real PostgreSQL on lga_consolidation_test_20261124 through actual Fastify routing. They cover anonymous, regular adult, global owner, school admin, teacher, cross-school and mismatched organization access; inactive/expired organization/school eligibility; forged role/school fields; concurrent config versions; owner Draft create/submit/publication/approval refusal; audit/revocation; real old alphabet/legacy snapshot saves and loads; A/B isolation, wrong password, logout invalidation, invalid snapshot rejection; migration idempotence and transaction/CAS rollback. Missing-DB handling has a separate injected failing storage test, not a claim of real DB outage testing.

Owner release happy-path publication of genuinely reviewed educational content was NOT exercised against real registries: these packs correctly remain Draft/unpublishable. Pure Claude release service tests cover state transitions with test fixtures. Reference tests were updated to include two existing local Draft activities and explicitly labelled Draft practice metadata, preserving all publication gates.

## Real browser evidence
The supported Playwright runner verifies bound addresses rather than assuming 5173. Last PASS: frontend http://127.0.0.1:4173, API http://127.0.0.1:61137; listeners reported bound and live. Test servers were closed afterwards. Normal independent frontend was separately confirmed on port 5173 by Vite configuration/launch and netstat; backend 4000 by launch, netstat and health requests.

390x844 real-browser checks: full country/curriculum/age/language onboarding and save; Learning Worlds/Number Galaxy navigation; Parent Corner hold gate; real UI login/logout; school settings display/save with confirmation; owner control visibility and real pack/audit reads; shared-browser A/B separation; Account A vault recovery; ABC password-confirmed backup, dashboard load and restore; no uncaught page errors. A fictional progress value was seeded into browser storage; the subsequent backup/restore API and DB operations were real, not intercepted or mocked. Screenshot: qa/browser-owner-mobile.png (visually inspected).

Earlier browser attempts failed on test selectors/wait timing (hidden desktop nav, empty owner slot, data loading); they were repaired and rerun. Native Computer Use host limitation was bypassed with the user-requested supported Playwright runner, not claimed as a successful native UI test.

Not claimed: full playthrough of all fourteen games, desktop/tablet matrix, installed-PWA/offline audio, real child data, production deployment, commercial licensing, unseen later packages or existing-dev schema-v6 rollout.
