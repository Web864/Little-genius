# Little Genius Adventure isolated master ? PARTIAL
This copy preserves Milestone 4.1 standalone Fastify/PostgreSQL runtime plus its existing AICS modules. Original projects, live AppDeploy v48 and existing database contents were not modified. See TEST_RESULTS.md and REMAINING_GAPS.md before use.

## Windows startup
Use Node 25.9.0 (verified here) and npm.cmd in PowerShell; npm.ps1 is blocked by this machine's execution policy.

Backend terminal:
```powershell
cd E:\LittleGenius-Independent\consolidated-v48\master\backend
npm.cmd ci --ignore-scripts --no-audit --no-fund
node --env-file=E:/LittleGenius-Independent/little-genius-consolidated-local/backend/.env src/server.js
```
The existing local .env is loaded in place; it is never copied or committed. The server accepts only the localhost little_genius_dev target. Do not run db:init. If port 4000 is occupied, inspect the listener; do not terminate unrelated services.

Frontend terminal:
```powershell
cd E:\LittleGenius-Independent\consolidated-v48\master\frontend
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run build
npm.cmd run dev -- --port 5173 --strictPort
```
Open http://127.0.0.1:5173. Backend must be available before games mount so account storage verification can fail closed. Vite proxies /api to local port 4000. No deployment command is required.

Backend tests: `node --test test-*.mjs`. Exact frontend commands/results are in TEST_RESULTS.md. The Windows environment may require sandbox authorization for npm/Vite filesystem writes. No paid resources or remote Git push were used.

## Provenance
Base: E:\LittleGenius-Independent\little-genius-local-milestone4-1\little-genius-consolidated-local. Backend auth implementation SHA256: F2ABE0E96873B3A4B82E6D47E9AA397383B02903E419150232560152CEFC8F15 (matches sibling standalone consolidated project).
AICS: 25/27 source modules match the preserved v48/Phase 10 snapshot exactly; activityRegistry and worlds retain local Sorting Safari and Pattern Parade Draft additions. Detailed comparison: AICS_COMPARISON.json. Reference tests were copied from the preserved Phase 10 harness.
Git baseline and integration branch are local only. No credentials, dependencies, generated builds or raw database data are tracked.
