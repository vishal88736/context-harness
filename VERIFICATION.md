# Local verification record

Latest complete regression run: **2026-10-22**, using Node **26.12.1**, npm **11.20.0**, and installed system Chromium. `npm run verify` passed end to end. The application is a local, single-user workspace. No public deployment or live neural-model performance is claimed.

## Completed checks

| Check                       | Result                                              | Evidence                                                                                                                                             |
| --------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript validation       | Passed                                              | `npm run check`, also required by the production build                                                                                               |
| Backend/integration suite   | **40/40 passed**                                    | `npm test` → harness, discovery, and redaction tests                                                                                                 |
| Browser workflows           | **16/16 passed**                                    | `npm run test:e2e` → `e2e/workspace.spec.ts` and `e2e/presentation.spec.ts`                                                                          |
| Production build            | Passed                                              | `npm run build`; built frontend and Node ESM bundle                                                                                                  |
| Full process restart        | **1/1 passed**                                      | `npm run test:production` → `tests/production.smoke.ts`                                                                                              |
| Production dependency audit | **0 known vulnerabilities reported on 2026-10-20**  | Historical `npm audit --omit=dev --json`; dependencies unchanged in this review                                                                      |
| Whitespace/conflict checks  | Passed                                              | `git diff --check`                                                                                                                                   |
| Visual review               | Dark/light desktop and mobile screenshots inspected | Ignored `artifacts/canopy-original-dark.png`, `canopy-original-light.png`, `canopy-original-mobile.png`, plus existing desktop/conversation captures |

The browser suite runs against separate temporary project/data directories. It never configures a test provider in the normal application's database.

## Presentation and documentation verified on 2026-10-22

- The workspace, conversation composer, context panel, source cards, profiles, settings, and inspector use graphite/ice-blue or cool light themes, editorial headings, flat sections, and restrained borders. A shared two-leaf Canopy mark appears in the sidebar, welcome screen, assistant replies, and favicon. The character illustration and pastel map have been removed. Light, dark, and system appearance persist; system changes update the current page.
- The linear welcome context brief derives category counts and names from the active conversation's configuration. Tests cover separate empty conversations, disabled sources, switching, reload persistence, and a missing configured file. The brief never asserts successful loading or model inclusion; explicit request preview reports actual excerpts and exclusions.
- Keyboard activation opens the context panel without opening source selection or sending/composing a request. The separate add-context control opens source selection.
- Browser checks cover 1440×960, 1024×768, 768×900, and 390×844. The desktop sidebar, mobile navigation/context access, compact context brief, reachable composer, and absence of document horizontal overflow are verified. Desktop quick actions remain fully visible. Screenshot capture disables transitions to record settled theme colors.
- README navigation, setup, workflows, provider settings, appearance, architecture, backup, troubleshooting, and verification boundaries are structured and linked. The ignored local guide documents the new presentation files and their connections.

## Review fixes verified on 2026-10-21

- Failed context saves retain the pending selection during in-app navigation and block sends, previews, and retries until a save succeeds. Browser tests force a failed disable, verify no model request escapes, then recover and confirm the source remains absent. A full browser reload intentionally loads authoritative saved server state.
- Delayed request acceptance preserves newly typed drafts and newly added attachments while removing only attachments already submitted. Keyboard renaming retains focus. Delayed context previews cannot appear over another conversation.
- Repeated retries resolve the original latest user turn, do not duplicate user messages, and omit superseded assistant attempts from later effective history. Retry preview and send use identical cutoff validation and their payloads match. Earlier-turn retries are rejected rather than appended out of chronological order.
- Streaming redaction buffers unfinished configured credentials across provider chunks. Credential-bearing tool arguments and source metadata are sanitized before request persistence and inspection. Tests cover every split position of a configured key, overlapping keys, nested values, actual SSE output, persisted responses, and model tool-call continuation requests. This does not claim universal recognition of arbitrary secrets; image data is preserved as binary input and omitted from inspection views.
- Both adapters validate discovered model IDs, context limits, and capabilities, deduplicate IDs, preserve explicit settings, and retain saved model lists on malformed discovery responses. Eight isolated discovery tests cover these cases.
- `LOCAL_CODEBASE_GUIDE.md` exists locally, has an exact anchored `.gitignore` rule, is untracked, and is excluded from file access/retrieval. The guide inventories the actual files, imports, request flows, tools, APIs, database, tests, and inactive retained tooling.
- `npm run verify` now includes backend tests, the checked production build, the production restart test, and the complete browser suite.

The original 2026-10-20 run covered 25 backend tests and eight browser workflows. The latest run extends that baseline to 40 backend tests and 16 browser workflows without changing the live-inference verification boundary.

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
- **Not verified: exhaustive accessibility or cross-browser support.** Chromium desktop, tablet, and mobile layouts were tested at the dimensions above. Keyboard/focus controls are implemented; no independent accessibility certification is claimed.
- **Not a shell sandbox.** Approved terminal commands run as the local OS account. The UI and README explain that broader access explicitly.
- Token counts are conservative estimates; actual usage is recorded when returned by a provider. Unknown model metadata is labeled and user-configurable.
- Imported previous chats intentionally include user-authored turns, excluding assistant replies that could reintroduce revoked source data. Retrieval is bounded lexical scanning, not an embedding index.
- A direct in-app browser handoff was unavailable in this environment. Headless Chromium tests and saved screenshots supplied the browser verification evidence.

## Packaging and dependency fixes validated

The process-level test exposed a bundler default that stripped `node:` from `node:sqlite`. `tsup.config.ts` now preserves native module prefixes; the built server subsequently started and passed the restart test.

Mammoth's unused legacy CLI dependency pulled in an advisory-flagged `sprintf-js` version. The scoped `argparse: 2.0.1` override removes that chain. Actual DOCX extraction passed after the override; Mammoth's standalone CLI is not used by the application. The subsequent production audit reported no known vulnerabilities.

See [README.md](README.md) for setup, provider configuration, permissions, data backup, architecture, and current limitations.
