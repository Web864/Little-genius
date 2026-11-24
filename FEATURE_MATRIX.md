# Feature matrix ? evidence, not production certification

| Feature | Code status | Integration | Verification | Missing work |
|---|---|---|---|---|
| Country registry | IMPLEMENTED | INTEGRATED | Targeted registry tests PASS | Educator review |
| Curriculum registry/mappings | DRAFT | INTEGRATED | Targeted registry tests PASS | No official approval |
| Parent onboarding | IMPLEMENTED | INTEGRATED | Pure logic tests PASS | Browser QA |
| Dynamic Learning Worlds | IMPLEMENTED | INTEGRATED | Build PASS | Navigation/mobile QA |
| Language localization | DRAFT | INTEGRATED | Targeted tests PASS | Content/browser review |
| Audio service | IMPLEMENTED | INTEGRATED | Build only | Live audio QA |
| Account isolation | IMPLEMENTED | New lifecycle wiring | Vault and mock API tests PASS | Browser lifecycle QA |
| School settings | IMPLEMENTED service/UI | Standalone API MISSING | NOT VERIFIED | Membership/schema/API adapters |
| Owner Curriculum Manager | IMPLEMENTED service/UI | Standalone API MISSING | NOT VERIFIED | Server authorization/storage |
| Publishing/rollback | IMPLEMENTED service | Standalone storage MISSING | NOT VERIFIED | Atomic release/audit persistence |
| PostgreSQL progress | IMPLEMENTED | INTEGRATED for eight games | Read-only DB + mock API PASS | Real test DB round trips |
| Parent dashboard | IMPLEMENTED | INTEGRATED | Build only | Real browser A/B tests |
| Licensing | MISSING standalone | MISSING | NOT VERIFIED | Standalone entitlement design |

## Game progress

| Games | Device format | Account backup/API | Auth | Dashboard / migration / validation |
|---|---|---|---|---|
| ABC Lessons | littleGeniusProgress + littleGeniusCourseComplete | local_alphabet_snapshots; alphabet/save, alphabet/load | Session + password | 26-letter summary; v4 existing; mock validation PASS |
| Lost Letters Forest | littleGeniusLostLettersV1: current/completed | local_legacy_game_snapshots; legacy/save, legacy/load | Session + password | Completion summary; v5 existing; strict allowlist mock tests PASS |
| Picture Rescue | littleGeniusPictureRescue: letter success/wrong and last | Same legacy snapshot | Session + password | Letters practiced; existing v5; mock validation PASS |
| Story Quests | littleGeniusAdventureQuests: forest/space/ocean flags | Same legacy snapshot | Session + password | Quest summary; existing v5; mock validation PASS |
| Sorting Safari, Pattern Parade, Measurement Mission, Nature Discovery | Round completion events, no persistent device snapshot identified | local_practice_results; practice/complete, practice/load | Session + password each operation | Best/last score, attempts; v3 existing; mock tests PASS |
| Number Galaxy, Addition Garden | Existing games; no dedicated persistent completion identified | MISSING dedicated backup | Games device-local | No account completion claim; further audit needed |
| Shape Lab, Urdu Garden, Sound Forest, Word Builder | Shared connected-curriculum records under littleGeniusConnectedCurriculum | MISSING dedicated account backup | Device-local | Vault preserves browser key; endpoint/schema design and tests pending |

All existing snapshot readers retained. No migration required for current supported backups. Backend account ids come from verified sessions, not request JSON. Browser data is not evidence of server backup.


## Continuation: version-by-version discovery
All backend manifests under E:/LittleGenius-Independent and backend source/schema entries in root ZIP archives were inspected read-only. No version later than 4.1 found in this development root. No newer six-game backup implementation found. Other drives/user Downloads not yet searched.

| Version/source | Schema files | API route count | Extra six-game backup | Eight-card dashboard |
|---|---:|---:|---|---|
| little-genius-consolidated-local\backend | 5 | 12 | Not found | False |
| little-genius-local-milestone2\backend | 2 | 6 | Not found | False |
| little-genius-local-milestone2-2\backend | 2 | 6 | Not found | False |
| little-genius-local-milestone2-signout-fixed\little-genius-local-milestone2-m2-1\backend | 2 | 6 | Not found | False |
| little-genius-local-milestone3-2\backend | 2 | 6 | Not found | False |
| little-genius-local-milestone3-3\backend | 2 | 6 | Not found | False |
| little-genius-local-milestone3-4\backend | 3 | 8 | Not found | False |
| little-genius-local-milestone3-5\backend | 3 | 8 | Not found | False |
| little-genius-local-milestone3-6\backend | 4 | 10 | Not found | False |
| little-genius-local-milestone4-1\little-genius-consolidated-local\backend | 5 | 12 | Not found | True |
| little-genius-consolidated-local-single-QA.zip | 5 | 12 | Not found | ZIP UI not compared |
| little-genius-local-milestone2-2-security-curriculum.zip | 2 | 6 | Not found | ZIP UI not compared |
| little-genius-local-milestone2-signout-fixed.zip | 2 | 6 | Not found | ZIP UI not compared |
| little-genius-local-milestone2.zip | 2 | 6 | Not found | ZIP UI not compared |
| little-genius-local-milestone3-2-sorting-patterns.zip | 2 | 6 | Not found | ZIP UI not compared |
| little-genius-local-milestone3-3-measurement-nature.zip | 2 | 6 | Not found | ZIP UI not compared |
| little-genius-local-milestone3-4-draft-journeys-progress.zip | 3 | 8 | Not found | ZIP UI not compared |
| little-genius-local-milestone3-5-progress-dashboard.zip | 3 | 8 | Not found | ZIP UI not compared |
| little-genius-local-milestone3-6-abc-backup.zip | 4 | 10 | Not found | ZIP UI not compared |
| little-genius-local-milestone3-7-stabilization.zip | 5 | 12 | Not found | ZIP UI not compared |
| little-genius-local-milestone4-1-account-progress (1).zip | 5 | 12 | Not found | ZIP UI not compared |
