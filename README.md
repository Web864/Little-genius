# Little Genius Adventure ? existing isolated master
Overall status: PARTIAL. Strict typecheck, build, targeted AICS suite, full backend suite including real isolated PostgreSQL, and real mobile browser smoke PASS. Existing dev schema-v6 rollout requires approval. See TEST_RESULTS.md and MIGRATION_PLAN.md.

## Normal Windows startup (existing development DB)
Verified runtime: Node v25.9.0. Minimum backend Node >=22.18. Use npm.cmd because this machine blocks npm.ps1. The local configuration is kept in `backend\.env`, which is ignored by Git. Never expose or commit it.

Backend PowerShell:
```powershell
cd E:\LittleGenius-Independent\consolidated-v48\master\backend
npm.cmd ci --ignore-scripts --no-audit --no-fund
node --env-file=.env src/server.js
```
Frontend PowerShell:
```powershell
cd E:\LittleGenius-Independent\consolidated-v48\master\frontend
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev -- --port 5173 --strictPort
```
Actual local app URL: http://127.0.0.1:5173. API: http://127.0.0.1:4000/api/health. Both listeners were verified; do not start duplicates if already running. Never stop an unrelated process. At the last check this agent's updated API PID was 20748; Vite PID was 9508. PIDs are observations, not stable startup configuration.

Existing v1-v5 account/progress features run without v6. New school/owner APIs fail closed until v6 and trusted roles/memberships are approved and provisioned. Do not run db:init against the existing DB. No automatic migration is part of startup.

## Reproduce isolated integration tests
From the workspace root E:\LittleGenius-Independent\consolidated-v48:
```powershell
node master/backend/scripts/prepare-test-db.mjs
$env:LGA_REAL_DB_TEST='1'
node --test master/backend/test-*.mjs
npm.cmd --prefix master/frontend run test:aics
node master/frontend/tests/browser-smoke.mjs
```
prepare-test-db creates/reuses ONLY localhost lga_consolidation_test_20261124 and applies v1-v7 there. It derives credentials from `backend\.env` (or the explicit LGA_ENV_FILE override) and refuses remote targets. Tests seed fictional example.invalid accounts/schools; the dedicated DB is retained for inspection. Do not point test fixture tools at real databases. Without LGA_REAL_DB_TEST=1, the real-DB test is explicitly skipped; do not report that run as DB verification.

The browser runner uses the installed Google Chrome via Playwright, a fresh browser context, actual Vite port 4173 with strict binding, and an API on a dynamically allocated free port. It prints exact addresses/listener evidence and closes its servers. No frontend/API request mocking is used. Ensure port 4173 is free; it will not silently choose another port. Browser test never contacts the existing dev DB.

## Source and checkpoints
Historical source lineage: E:/LittleGenius-Independent/little-genius-local-milestone4-1/little-genius-consolidated-local. This path is provenance only, not a runtime or test dependency. Source manifests, route/schema comparisons and Phase 10 paths are recorded in AUDIT_BASELINE.md and JSON comparison artifacts. Existing Claude service modules are reused; original games/snapshot readers retained. Branch: integration/standalone-aics. Git checkpoints record discovery, strict typing, backend adapters and real browser verification. No remote push or deployment.

# Little-genius
