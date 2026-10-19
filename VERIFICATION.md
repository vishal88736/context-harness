# Local verification record

Verified on **2026-10-20**, using Node **26.12.0**, npm **11.20.0**, and installed system Chromium. The application is a local, single-user workspace. No public deployment or live neural-model performance is claimed.

## Completed checks

| Check                       | Result                                   | Evidence                                                                               |
| --------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| TypeScript validation       | Passed                                   | `npm run check`, also required by the production build                                 |
| Backend/integration suite   | **25/25 passed**                         | `npm test` → `tests/harness.test.ts`                                                   |
| Browser workflows           | **8/8 passed**                           | `npm run test:e2e` → `e2e/workspace.spec.ts`                                           |
| Production build            | Passed                                   | `npm run build`; built frontend and Node ESM bundle                                    |
| Full process restart        | **1/1 passed**                           | `npm run test:production` → `tests/production.smoke.ts`                                |
| Production dependency audit | **0 known vulnerabilities reported**     | `npm audit --omit=dev --json`                                                          |
| Whitespace/conflict checks  | Passed                                   | `git diff --check`                                                                     |
| Visual review               | Desktop and mobile screenshots inspected | Ignored `artifacts/canopy-desktop.png`, `canopy-conversation.png`, `canopy-mobile.png` |

The browser suite runs against separate temporary project/data directories. It never configures a test provider in the normal application's database.

## Required acceptance scenarios

| Scenario                     | Verified behavior                                                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Independent histories     | Two conversations retain independent messages in API and browser tests.                                                                                                                                                                  |
| 2. Independent file context  | Different file sentinels appear only in the corresponding conversation's assembled payload.                                                                                                                                              |
| 3. Disable a source          | The next request omits the disabled file, stale dependent assistant history, and matching retrieval hits. Overlapping folder grants and symlink aliases are tested.                                                                      |
| 4. Apply a profile           | Messages and conversation-specific additions remain intact. Editing/deleting saved profiles does not mutate previously applied configurations.                                                                                           |
| 5. Switch models             | Conversation-level assignments and request overrides preserve history/context. Global defaults apply to new chats without replacing existing assignments.                                                                                |
| 6. Token budgets             | Large sources are explicitly truncated/excluded; older history exclusions and budget reserves are reported.                                                                                                                              |
| 7. Restart                   | A built Node process sends a request, stops, starts again, and restores identical messages, source configuration, model/default/theme settings, snapshots, and encrypted-key availability.                                               |
| 8. Tool permissions          | Model text cannot authorize denied commands. Missing CSRF approvals fail. Writes wait for approval and reject changed files; approved commands execute, and stopped approvals do not.                                                    |
| 9. Persistent sidebar        | Desktop sidebar stays visible during context/permission navigation and tool approval. Mobile navigation and context controls remain reachable without horizontal overflow.                                                               |
| 10. Actual composed requests | A local HTTP protocol fixture captures the transmitted body; the integration test compares it exactly to the persisted assembled snapshot, including real file contents. Native Ollama NDJSON and compatible SSE transports are covered. |

Additional checks cover provider discovery/settings, incomplete stream errors, stop/recovery, profile CRUD, temporary uploads/instructions, encryption/redaction, blocked traversal/credential paths, and real PDF/DOCX text extraction. Images without configured model capabilities receive explicit exclusions.

## Verification boundaries

- **Not verified: live AI inference.** No Ollama runtime/model or user-hosted provider credentials were available. `tests/fixture-provider.ts` is a deterministic network-protocol fixture, not a neural model and not a production application provider.
- **Not verified: remote CI execution.** A GitHub Actions workflow is included; no push or remote CI run was performed by this implementation session.
- **Not verified: exhaustive accessibility or cross-browser support.** Chromium desktop (1440×960) and mobile layout (390×844) were tested. Keyboard/focus controls are implemented; no independent accessibility certification is claimed.
- **Not a shell sandbox.** Approved terminal commands run as the local OS account. The UI and README explain that broader access explicitly.
- Token counts are conservative estimates; actual usage is recorded when returned by a provider. Unknown model metadata is labeled and user-configurable.
- Imported previous chats intentionally include user-authored turns, excluding assistant replies that could reintroduce revoked source data. Retrieval is bounded lexical scanning, not an embedding index.
- A direct in-app browser handoff was unavailable in this environment. Headless Chromium tests and saved screenshots supplied the browser verification evidence.

## Packaging and dependency fixes validated

The process-level test exposed a bundler default that stripped `node:` from `node:sqlite`. `tsup.config.ts` now preserves native module prefixes; the built server subsequently started and passed the restart test.

Mammoth's unused legacy CLI dependency pulled in an advisory-flagged `sprintf-js` version. The scoped `argparse: 2.0.1` override removes that chain. Actual DOCX extraction passed after the override; Mammoth's standalone CLI is not used by the application. The subsequent production audit reported no known vulnerabilities.

See [README.md](README.md) for setup, provider configuration, permissions, data backup, architecture, and current limitations.
