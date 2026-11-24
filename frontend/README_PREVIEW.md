# Little Genius Adventure — AICS Browser Preview (LOCAL / STATIC HOST ONLY)

This is an **actual AICS Phase 10 onboarding UI** combined with the original v48 learning games.
It is a browser-only evaluation environment, **not** the secure AICS production release.

- All curriculum packs stay Draft; the real publish gate correctly keeps original Learning Worlds unchanged.
- An adult can try the six-step onboarding wizard and edit choices using the existing grown-up gate.
- Original 15 activities, mobile navigation and artwork remain playable (subject to browser features).
- **Not present:** accounts, school licences, backend, school settings, Owner Curriculum Manager, server authorization, content publishing, cross-account isolation, verified native translations and recorded audio.
- Browser localStorage is sandboxed to the preview host; this preview does not migrate user accounts/progress from the original app.

## Build on your Windows laptop

1. Extract this ZIP into a fresh folder.
2. Open PowerShell in that folder.
3. Run `npm install` then `npm run build`. The build should not import `@appdeploy/client` because this preview uses a browser-only entry point.
4. Test locally using `npm run dev` and the URL shown by Vite.
5. For an optional public URL, use Cloudflare Pages Direct Upload to deploy the generated `dist` folder only. Do not publish the project source ZIP or connect real customer data.

This project deliberately does not contain a backend. The genuine integrated source and the original v48 backups remain separate archives.

### One-command Windows helper

Open PowerShell in the extracted project folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\BUILD_AND_UPLOAD_WINDOWS.ps1
```

This installs dependencies, compiles the site, and checks `dist/index.html`. It **does not deploy** or upload files. If npm/Vite reports an error, do not upload `dist`.

### Cloudflare Pages Direct Upload

Open `https://dash.cloudflare.com/` > **Workers & Pages** > **Create application** > **Pages** > **Direct Upload** (labels may vary). Name the project `little-genius-aics-preview`, select the generated **`dist` folder**, and click **Deploy site**. Verify the URL ends in `.pages.dev`, not the original AppDeploy domain.

**Do not upload the source ZIP**: Cloudflare Direct Upload serves compiled static assets, not source code. Preview site is public to anyone with its link. Do not use customer accounts, real child data, payment details, or school licence keys. Open in a separate browser profile to avoid mixing test localStorage with any other site.
