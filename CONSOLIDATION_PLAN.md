## Plan
1. Create isolated master under current writable workspace, excluding secrets, databases, dependencies and generated builds.
2. Reuse Milestone 4.1 backend/frontend; compare AICS modules by hash with Phase 10.
3. Install dependencies, run existing backend tests, typecheck and build.
4. Read-only local DB/schema inspection using existing env in place; never copy credentials.
5. Repair integration gaps with targeted tests; school/owner backend requires reviewed additive migration before existing DB use.
6. Browser QA and exact documentation; report PARTIAL until every completion condition passes.
