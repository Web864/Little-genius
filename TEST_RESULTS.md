# Actual test results ? PARTIAL
- Node v25.9.0, npm.cmd 11.12.1.
- backend: `node --test test-*.mjs`: 19/19 PASS. Route-handler tests with mock SQL; this does not prove real PostgreSQL account operations.
- frontend: `npm.cmd ci --ignore-scripts --no-audit --no-fund`: PASS after sandbox retry. Backend locked dependency installation also PASS.
- frontend: `npm.cmd run build`: PASS (Vite 8.3.8, 44 modules). Nonblocking warning: bootstrap is both statically and dynamically imported.
- frontend: `node --test tests/aics/registry.test.ts tests/aics/accounts.test.ts tests/aics/accounts7a.test.ts tests/aics/progress.test.ts tests/aics/onboarding.test.ts tests/aics/localization.test.ts`: 121/121 PASS. One reference assertion was updated to permit the two explicitly Draft local activities; Urdu Draft requirement remains intact.
- frontend: `node_modules/.bin/tsc.cmd --noEmit`: FAIL, extensive inherited errors across legacy games (implicit types, DOM event types, nullable fields, unused symbols). Compiler settings were not weakened.
- `node master/check-existing-db.mjs` from workspace root: real local PostgreSQL read-only transaction PASS, expected tables and schema versions 1?5 found.
- master backend: startup PASS on 127.0.0.1:4000 with original env file loaded in place.
- master frontend: dev server startup PASS on 127.0.0.1:5173.
- Real browser QA: BLOCKED. Browser access host unavailable. Native fallback stopped because Computer Use could not determine current browser URL confidently enough to enforce policy. No successful UI observation or game-navigation test claimed.
- Real A/B account registration, backup/restore round trip, school isolation, owner publication, migration and mobile browser tests: NOT RUN.

Targeted passing tests validate reused vault logic; the newly connected login/logout lifecycle still needs actual browser integration coverage.
