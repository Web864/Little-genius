# Audit baseline and continuation ? 2026-11-25 Asia/Karachi
Current work remains in the original isolated master. No replacement master was created. The owner confirmed that Milestone 4.1 was the working PostgreSQL-connected baseline and later milestone changes were not applied to that environment. Folder names and schema-file presence are not deployment evidence.

## Actual source comparison
E:/LittleGenius-Independent was inspected recursively for backend manifests and relevant source. Root ZIP backend route and SQL entries were read without extracting secrets. Downloads, Desktop and Documents candidate directories were checked; Downloads standalone archives were inspected too. No later-than-4.1 standalone package was found in these locations. This is a bounded discovery, not proof that no later artifact exists elsewhere.

| Source | Schema SQL files | Auth/progress routes | Dashboard evidence |
|---|---:|---:|---|
| little-genius-consolidated-local\backend | 5 | 12 | False |
| little-genius-local-milestone2\backend | 2 | 6 | False |
| little-genius-local-milestone2-2\backend | 2 | 6 | False |
| little-genius-local-milestone2-signout-fixed\little-genius-local-milestone2-m2-1\backend | 2 | 6 | False |
| little-genius-local-milestone3-2\backend | 2 | 6 | False |
| little-genius-local-milestone3-3\backend | 2 | 6 | False |
| little-genius-local-milestone3-4\backend | 3 | 8 | False |
| little-genius-local-milestone3-5\backend | 3 | 8 | False |
| little-genius-local-milestone3-6\backend | 4 | 10 | False |
| little-genius-local-milestone4-1\little-genius-consolidated-local\backend | 5 | 12 | True |
| little-genius-consolidated-local-single-QA.zip | 5 | 12 | See source archive |
| little-genius-local-milestone2-2-security-curriculum.zip | 2 | 6 | See source archive |
| little-genius-local-milestone2-signout-fixed.zip | 2 | 6 | See source archive |
| little-genius-local-milestone2.zip | 2 | 6 | See source archive |
| little-genius-local-milestone3-2-sorting-patterns.zip | 2 | 6 | See source archive |
| little-genius-local-milestone3-3-measurement-nature.zip | 2 | 6 | See source archive |
| little-genius-local-milestone3-4-draft-journeys-progress.zip | 3 | 8 | See source archive |
| little-genius-local-milestone3-5-progress-dashboard.zip | 3 | 8 | See source archive |
| little-genius-local-milestone3-6-abc-backup.zip | 4 | 10 | See source archive |
| little-genius-local-milestone3-7-stabilization.zip | 5 | 12 | See source archive |
| little-genius-local-milestone4-1-account-progress (1).zip | 5 | 12 | See source archive |

Feature deltas: schemas v1-v2 provide local adults/sessions/profile choices; v3 adds four Draft practice scores; v4 adds ABC snapshots; v5 adds Forest/Picture/Story snapshots. M3.5 adds the score dashboard; M4.1 adds four original-game backup cards. Available 3.7/4.1/consolidated sources contain the same auth implementation. No newer Number Galaxy, Addition Garden, Shape Lab, Urdu Garden, Sound Forest or Word Builder account backup endpoints/tables/tests were found. No six-game implementation was fabricated or blindly merged.

Detailed source route inventories, SQL hashes, test filenames and frontend progress hashes: VERSION_COMPARISON.json. Four Downloads standalone archive copies: DOWNLOADS_COMPARISON.json. Claude Phase 10 source is at C:/Users/DEV-X/Downloads/little-genius-aics-phase10 (2)/little-genius-aics-phase10. 25/27 AICS modules match; activityRegistry/worlds retain the existing local Sorting/Pattern Draft additions. PHASE10_COMPARISON.json records this. Claude service modules were reused unchanged.

## Runtime and provenance
Node v25.9.0, npm.cmd 11.12.1, Vite 8.3.8. Backend now requires Node >=22.18 for native TypeScript module stripping. Master baseline commit ef8dbed followed by checkpoints 9c5f59b (comparison), 9b3ecea (strict types), 26bc59d (AICS adapters), 7a5f31c (real browser integration).

Original discovery found no backend listening. This agent started and later restarted only its own process after checking exact PID/start time. Updated master server now listens at 127.0.0.1:4000, PID 20748 at verification. Frontend listener: 127.0.0.1:5173, PID 9508. Real browser tests independently started port 4173 and a dynamically allocated API port, recorded in BROWSER_RESULTS.json; both test listeners were closed afterwards.

Existing local dev database was inspected read-only and still has schema versions 1?5. Only the dedicated lga_consolidation_test_20261124 database received v6 migrations and fictional fixtures. No deployment, AppDeploy modification, existing dev migration, real account registration or real backup write was performed.
