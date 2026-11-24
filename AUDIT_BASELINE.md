# Audit baseline

Discovery date: 2026-11-24 (Asia/Karachi). Original folders unchanged.

Node: v25.9.0; npm.cmd: 11.12.1. PowerShell npm.ps1 is blocked by execution policy; use npm.cmd.

## Candidates
- E:\LittleGenius-Independent\little-genius-local-milestone4-1\little-genius-consolidated-local\frontend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone4-1\little-genius-consolidated-local\backend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone3-2\frontend\package.json
- E:\LittleGenius-Independent\little-genius-local-backend-starter\little-genius-local-backend-starter\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone2-2\frontend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone3-5\frontend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone3-3\frontend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone3-2\backend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone2\frontend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone3-5\backend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone2-2\backend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone3-6\frontend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone2-signout-fixed\little-genius-local-milestone2-m2-1\frontend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone2\backend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone3-3\backend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone3-4\frontend\package.json
- E:\LittleGenius-Independent\little-genius-consolidated-local\frontend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone2-signout-fixed\little-genius-local-milestone2-m2-1\backend\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone3-6\backend\package.json
- E:\LittleGenius-Independent\little-genius-consolidated-local\backend\package.json
- E:\LittleGenius-Independent\consolidated-v48\package.json
- E:\LittleGenius-Independent\little-genius-local-milestone3-4\backend\package.json
- E:\LittleGenius-Independent\little-genius-aics-playable-preview\package.json

## Selection
Milestone 4.1 is the provisional runtime base: standalone Fastify 5 + pg 8, local adult auth, password-confirmed profile/practice/alphabet/legacy backup APIs and eight-card dashboard. Its localAuth.js hash matches little-genius-consolidated-local. Build and DB verification remain required.
Current consolidated-v48 is AppDeploy-specific and lacks a standalone backend manifest. Preserve as reference.
Phase 10 reference modules/tests exist in consolidated-v48/aics-phase10-reference; sibling Phase 10 directory is empty; ZIP exists but has not been accepted as authoritative.
No git repositories detected in the inspected candidate roots. No running backend confirmed: 4000 health connection failed; process inventory access denied. PostgreSQL 18 Windows service reports Running; connectivity not yet verified.

## Plan
1. Create isolated master under current writable workspace, excluding secrets, databases, dependencies and generated builds.
2. Reuse Milestone 4.1 backend/frontend; compare AICS modules by hash with Phase 10.
3. Install dependencies, run existing backend tests, typecheck and build.
4. Read-only local DB/schema inspection using existing env in place; never copy credentials.
5. Repair integration gaps with targeted tests; school/owner backend requires reviewed additive migration before existing DB use.
6. Browser QA and exact documentation; report PARTIAL until every completion condition passes.
