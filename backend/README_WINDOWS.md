# Little Genius Adventure — Local Backend Starter (not deployed)

This is an intentionally minimal companion to the existing playable AICS preview. It does **not** modify the frontend, AppDeploy app, Cloudflare site, or production user data.

## 1. Install PostgreSQL on Windows

Official installer: https://www.postgresql.org/download/windows/
During setup, remember the local `postgres` password. Keep database port `5432` and pgAdmin selected. Do not expose PostgreSQL to public networks.

In pgAdmin: connect to `PostgreSQL` (using installation password), right-click `Databases` -> `Create` -> `Database`, name it `little_genius_dev`, and save.

## 2. Setup backend

Open PowerShell inside this extracted folder:

```powershell
node -v
npm install
Copy-Item .env.example .env
notepad .env
```

Change `CHANGE_ME` in `DATABASE_URL` to your own local PostgreSQL password. For characters like `@`, `#`, `/` or `:` in passwords, URL-encode them in the connection string (e.g. `@` -> `%40`). Never share `.env`.

```powershell
npm run db:init
npm run dev
```

With the server running, open another PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:4000/api/health
Invoke-RestMethod http://127.0.0.1:4000/api/health/db
```

Both should show `ok: True`; second should show database `little_genius_dev`.

## 3. Frontend separate terminal

In your existing `little-genius-aics-playable-preview` frontend folder:

```powershell
npm run dev
```

Visit its localhost URL separately. Frontend and backend are **not connected yet**. That is deliberate: we must first design login, school tenancy and authorization properly.

## 4. Browser refresh issue — investigate without erasing data

On `http://localhost:5173` (or the actual Vite address), after saving selections, open DevTools -> Console and run:

```js
JSON.parse(localStorage.getItem('lgaAicsProfileV1') || 'null')
```

Note whether it shows your selected `countryCode`, `frameworkId`, `languages`. Refresh and run again. If it is missing after reload: check origin/port consistency, browser incognito or storage restrictions, and console errors. If present but UI resets: investigate app read/render logic. Do not `localStorage.clear()` or overwrite any stored progress.

## Security and limits

- Backend binds only to 127.0.0.1; do not change that for testing.
- No login, tokens, licences, progress synchronization, curriculum publishing, or school write APIs exist yet.
- DB tables are placeholders only, with content packs defaulting to Draft. No role checks exist because no protected routes exist.
- Never put a database password in the frontend or commit `.env` to Git.
- Do not upload either folder, any `.env`, or databases until all security testing is complete.
