# Feature matrix ? updated source of truth
IMPLEMENTED = source exists; INTEGRATED = wired to standalone runtime; VERIFIED = named tests passed; DRAFT = content unreviewed; MISSING = no sufficient source found. Isolated PostgreSQL verification does not mean the existing dev DB was migrated.

| Feature | Source / integration | Verified evidence | Remaining |
|---|---|---|---|
| Country/curriculum registry, mappings | Existing Claude modules, INTEGRATED; content DRAFT | Registry/AICS tests + onboarding browser | Educator/content review |
| Parent onboarding | INTEGRATED | Full browser setup and targeted tests | Wider locale/device QA |
| Dynamic Learning Worlds | INTEGRATED; existing fallback retained | Real mobile Worlds/Number navigation, build | Exhaustive game playthrough |
| Language localization/audio | Existing implementation; DRAFT languages retained | AICS logic tests; browser controls | Actual device voice/audio matrix |
| Account isolation | Existing vault reused; games imported after activation; quarantine claim UI connected | Real UI A/B switch, A recovery, vault tests | Broader failure/race browser matrix |
| School settings | Claude UI/service + new Fastify/PostgreSQL adapter | Admin save, teacher read, adult/owner/no-membership denial, cross-school/org/expiry tests | Approved dev migration/provisioning |
| Owner Curriculum Manager | Claude UI/service + trusted DB owner role | Real owner screen/API; other roles refused | Approved dev role provisioning |
| Publishing/rollback/revocation | Claude gates + transactional release/current/audit adapters | Pure state-machine tests; real Draft gate refusal, revocation, CAS rollback | Reviewed content; real publish/rollback remains intentionally unavailable |
| PostgreSQL progress | Existing account-scoped storage retained | Real A/B alphabet/legacy round trips | Six-game coverage below |
| Parent dashboard | Existing eight summaries retained | Browser dashboard load and ABC restore | Six-game summaries absent |
| Licensing | Standalone commercial licensing MISSING | School active/expiry is local authorization only | Commercial entitlements/billing/renewal design |

## Game storage and compatibility
| Games | Device representation | Server backup / endpoint | Auth/dashboard |
|---|---|---|---|
| ABC Lessons | littleGeniusProgress map, littleGeniusCourseComplete | local_alphabet_snapshots; alphabet/save, alphabet/load | Verified session + password; 26-letter summary; real browser restore PASS |
| Lost Letters Forest | littleGeniusLostLettersV1 current/completed | local_legacy_game_snapshots; legacy/save, legacy/load | Session + password; completion count; old snapshot reader retained |
| Picture Rescue | littleGeniusPictureRescue per-letter success/wrong + last | Same legacy snapshot | Session + password; practiced-letter count |
| Story Quests | littleGeniusAdventureQuests completion flags | Same legacy snapshot | Session + password; 3-quest count |
| Sorting Safari, Pattern Parade, Measurement Mission, Nature Discovery | Finished-round event | local_practice_results; practice/complete, practice/load | Session + password; best/last score and attempts |
| Number Galaxy, Addition Garden | In-memory game state; no dedicated persistent completion found | MISSING dedicated account backup | No fabricated completion/card |
| Shape Lab, Urdu Garden, Sound Forest, Word Builder | littleGeniusConnectedCurriculum records keyed world:index | Device vault preserves records; MISSING dedicated server snapshot | No dedicated account summaries |

No existing snapshot keys/SQL tables were replaced or removed. Server ids are derived from authenticated sessions; shared browser state is never presented as proof of a server backup. No new per-game tables were invented.

## Version-by-version source matrix
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

Later source packages are unapplied code, per owner confirmation. Available artifacts were compared by routes, SQL hashes, frontend progress code and tests; none supplied newer six-game backups. See VERSION_COMPARISON.json / DOWNLOADS_COMPARISON.json. No standalone source later than 4.1 was found in audited locations.
