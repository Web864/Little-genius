# Little Genius Adventure — Local Backend

The backend runs locally and is proxied by the master frontend at `http://127.0.0.1:5173`.

## Start the backend

In PowerShell:

```powershell
cd E:\LittleGenius-Independent\consolidated-v48\master\backend
npm.cmd ci --ignore-scripts --no-audit --no-fund
node --env-file=.env src/server.js
```

The local, Git-ignored `.env` contains `HOST`, `PORT`, and `DATABASE_URL`. Keep it private. The server accepts only localhost PostgreSQL targets. Existing process environment variables take precedence over values loaded from `.env`.

Startup does not initialize or migrate the database. Do not run `npm run db:init` against `little_genius_dev`; schema v6/v7 require explicit owner approval.

## Verify local health

From another PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:4000/api/health
Invoke-RestMethod http://127.0.0.1:4000/api/health/db
```

The database health route performs a read-only identity query. The frontend Vite proxy forwards `/api` requests to `http://127.0.0.1:4000`.

## PostgreSQL integration tests

Database test helpers derive the local development connection settings from this backend `.env` and target only `lga_consolidation_test_20261124`. The `LGA_ENV_FILE` environment variable remains an explicit override. Confirm the test database identity and schema before running PostgreSQL integration tests. Never run them against `little_genius_dev`.
