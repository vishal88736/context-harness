# Local verification record

Latest local regression: **2026-10-23**, using Node **26.12.1**, npm **11.20.0**, and installed system Chromium. After applying the sampled screenshot palette, `npm run verify` passed end to end with **61 backend tests**, the checked production build, **one production restart test**, and **20 browser workflows**. The application is a local, single-user workspace. No public deployment or live neural-model performance is claimed.

## Completed checks

| Check                      | Result                                             | Evidence                                                                                                                               |
| -------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript validation      | Passed                                             | `npm run check`, also required by the production build                                                                                 |
| Backend/integration suite  | **61/61 passed**                                   | `npm test` → context/tools, discovery, native protocols, cross-provider handoff, redaction, and external workspaces                    |
| Browser workflows          | **20/20 passed**                                   | `npm run test:e2e` → workspace, presentation, coding, and native provider workflows                                                    |
| Production build           | Passed                                             | `npm run build`; built frontend and Node ESM bundle                                                                                    |
| Full process restart       | **1/1 passed**                                     | `npm run test:production` → `tests/production.smoke.ts`                                                                                |
| Dependency audit           | **0 known vulnerabilities reported on 2026-10-22** | `npm audit --json` covers the installed production and development dependency graph                                                    |
| Whitespace/conflict checks | Passed                                             | `git diff --check`                                                                                                                     |
| Visual review              | Light desktop and mobile screenshots inspected     | Ignored `artifacts/canopy-light-workspace.png`, `canopy-light-mobile.png`, `canopy-light-code.png`, and `canopy-light-code-mobile.png` |

The browser suite runs against separate temporary project/data directories. It never configures a test provider in the normal application's database.

## Presentation and documentation verified on 2026-10-23

- The palette was sampled directly from the user's screenshot: off-white `#F8F7F5`, sidebar lavender `#DEE1ED`, context lavender `#DFE2EE`, teal `#426D79` / `#406B78`, apricot heading `#EAA96A`, send button `#ECB379`, selected peach `#EFD2B8`, navy `#0C2236`, card surface `#FCFAF9`, and separators `#D3D8E6`. The source image contains gradients and texture; these are representative sampled colors assigned to the corresponding interface roles. Desktop and mobile conversation/editor screenshots were inspected after the complete browser run. The two-leaf mark and favicon match the navy palette.
- CodeMirror and rendered Markdown code blocks share the root palette variables for syntax, selections, search highlights, gutters, and diff states. The editor's `syntaxTheme` uses semantic CSS tokens instead of fixed theme colors. Vite continues to prebundle the lazy editor's modules; the complete run covers opening and editing an external project on the first Code visit.
- Contrast calculations found body text at 15.11:1, secondary text at 6.31:1, sidebar labels at 5.18:1, primary button text at 5.46:1, and apricot send-button text at 8.70:1 against their intended surfaces. These checks do not constitute a full accessibility audit. The reference's apricot emphasis color is retained for the large heading and decorative highlights.
- The linear welcome context brief derives category counts and names from the active conversation's configuration. Tests cover separate empty conversations, disabled sources, switching, reload persistence, and a missing configured file. The brief never asserts successful loading or model inclusion; explicit request preview reports actual excerpts and exclusions.
- Keyboard activation opens the context panel without opening source selection or sending/composing a request. The separate add-context control opens source selection.
- Browser checks cover 1440×960, 1024×768, 768×900, and 390×844. The desktop sidebar, mobile navigation/context access, compact context brief, reachable composer, and absence of document horizontal overflow are verified. Desktop quick actions remain fully visible. Screenshot capture disables transitions to record settled theme colors.
- README navigation, setup, workflows, provider settings, appearance, architecture, backup, troubleshooting, and verification boundaries are structured and linked. The ignored local guide documents the new presentation files and their connections.

## Workspace, editor, and provider verification on 2026-10-22

- The authenticated folder browser connects accessible project directories outside Canopy's repository, including paths with spaces, `~/...`, and canonical aliases. Missing/inaccessible folders return useful errors; credentials/runtime directories, home, and filesystem root cannot become projects. External file reads remain workspace-scoped.
- Browser workflows open a real external project, edit through CodeMirror 6, retain drafts while changing views, stage and cancel a real diff, apply an approved change, and inspect the saved file in the actual composed payload. Stale approvals preserve newer external edits; reload and fresh review recover. Mobile editor access and explorer collapse/expand are checked. CodeMirror/editor modules load on first Code visit rather than in the initial conversation bundle.
- Manual editor writes require authenticated CSRF-protected approval, an unexpired one-use proposal, fresh path/hash/credential checks, and atomic replacement. Regression tests retain mode `0664` under umask `022`; hash-only audit decisions and external workspace settings persist across restart. Schema version 1 migrates to version 2 without deleting messages.
- Native Anthropic and Gemini fixtures cover paginated discovery, exact assembled payloads, streaming, images, permission-enforced tools, tool continuations, output limits, cancellation, and provider errors. Compatible endpoints cover both output-token parameter names. Browser workflows configure native adapters through templates/settings and compare transmitted bodies with inspected snapshots. These are deterministic HTTP protocol fixtures, not hosted inference.
- Cross-provider handoff sends an Anthropic turn followed by Gemini in the same conversation. Configuration, permissions, context revision, fingerprint, and eligible history remain intact; the request is rebuilt for the new protocol and limit. A temporary override back to Anthropic expires, and disabling the file excludes its content and dependent assistant history from the next Gemini request without altering historical messages/snapshots.
- Changing a provider destination/adapter clears an omitted saved key. Discovery binds credentials to its starting connection and rejects concurrent endpoint or key changes before pagination/introspection and before saving. Three regression tests verify that replacement credentials never reach a stale connection.

## Review fixes verified on 2026-10-21

- Failed context saves retain the pending selection during in-app navigation and block sends, previews, and retries until a save succeeds. Browser tests force a failed disable, verify no model request escapes, then recover and confirm the source remains absent. A full browser reload intentionally loads authoritative saved server state.
- Delayed request acceptance preserves newly typed drafts and newly added attachments while removing only attachments already submitted. Keyboard renaming retains focus. Delayed context previews cannot appear over another conversation.
- Repeated retries resolve the original latest user turn, do not duplicate user messages, and omit superseded assistant attempts from later effective history. Retry preview and send use identical cutoff validation and their payloads match. Earlier-turn retries are rejected rather than appended out of chronological order.
- Streaming redaction buffers unfinished configured credentials across provider chunks. Credential-bearing tool arguments and source metadata are sanitized before request persistence and inspection. Tests cover every split position of a configured key, overlapping keys, nested values, actual SSE output, persisted responses, and model tool-call continuation requests. This does not claim universal recognition of arbitrary secrets; image data is preserved as binary input and omitted from inspection views.
- The original compatible and Ollama discovery tests validate IDs, context limits, capabilities, duplicates, explicit settings, and malformed responses. The expanded suites also cover native adapters and concurrent credential changes.
- `LOCAL_CODEBASE_GUIDE.md` exists locally, has an exact anchored `.gitignore` rule, is untracked, and is excluded from file access/retrieval. The guide inventories the actual files, imports, request flows, tools, APIs, database, tests, and inactive retained tooling.
- `npm run verify` now includes backend tests, the checked production build, the production restart test, and the complete browser suite.

The original 2026-10-20 run covered 25 backend tests and eight browser workflows. The current regression extends that baseline to 61 backend tests and 20 browser workflows without changing the live-inference verification boundary.

## Required acceptance scenarios

| Scenario                     | Verified behavior                                                                                                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Independent histories     | Two conversations retain independent messages in API and browser tests.                                                                                                                                                                                     |
| 2. Independent file context  | Different file sentinels appear only in the corresponding conversation's assembled payload.                                                                                                                                                                 |
| 3. Disable a source          | The next request omits the disabled file, stale dependent assistant history, and matching retrieval hits. Overlapping folder grants and symlink aliases are tested.                                                                                         |
| 4. Apply a profile           | Messages and conversation-specific additions remain intact. Editing/deleting saved profiles does not mutate previously applied configurations.                                                                                                              |
| 5. Switch models/providers   | Conversation assignments and request overrides preserve history/context. Actual Anthropic→Gemini handoff preserves selected sources and eligible assistant history; disabling a source remains effective after switching. Global defaults affect new chats. |
| 6. Token budgets             | Large sources are explicitly truncated/excluded; older history exclusions and budget reserves are reported.                                                                                                                                                 |
| 7. Restart                   | A built Node process sends a request, stops, starts again, and restores identical messages, source configuration, model/default/theme settings, snapshots, and encrypted-key availability.                                                                  |
| 8. Tool permissions          | Model text cannot authorize denied commands. Missing CSRF approvals fail. Writes wait for approval and reject changed files; approved commands execute, and stopped approvals do not.                                                                       |
| 9. Persistent sidebar        | Desktop sidebar stays visible during context/permission navigation and tool approval. Mobile navigation and context controls remain reachable without horizontal overflow.                                                                                  |
| 10. Actual composed requests | Local HTTP fixtures capture transmitted bodies and compare them exactly to persisted assembled snapshots, including real file contents. Ollama NDJSON, compatible SSE, native Anthropic, native Gemini, and provider handoff are covered.                   |

Additional checks cover provider discovery/settings, incomplete stream errors, stop/recovery, profile CRUD, temporary uploads/instructions, encryption/redaction, blocked traversal/credential paths, and real PDF/DOCX text extraction. Images without configured model capabilities receive explicit exclusions.

## Verification boundaries

- **Not verified: live AI inference.** No Ollama runtime/model or user-hosted provider credentials were available. `tests/fixture-provider.ts` is a deterministic network-protocol fixture, not a neural model and not a production application provider.
- **Remote CI is separate from this local record.** A GitHub Actions workflow runs on pushes/PRs; inspect the repository's Actions results for remote evidence. This document records local checks only.
- **Not verified: exhaustive accessibility or cross-browser support.** Chromium desktop, tablet, and mobile layouts were tested at the dimensions above. Keyboard/focus controls are implemented; no independent accessibility certification is claimed.
- **Not a shell sandbox.** Approved terminal commands run as the local OS account. The UI and README explain that broader access explicitly.
- Token counts are conservative estimates; actual usage is recorded when returned by a provider. Unknown model metadata is labeled and user-configurable.
- Imported previous chats intentionally include user-authored turns, excluding assistant replies that could reintroduce revoked source data. Retrieval is bounded lexical scanning, not an embedding index.
- A direct in-app browser handoff was unavailable in this environment. Headless Chromium tests and saved screenshots supplied the browser verification evidence.

## Packaging and dependency fixes validated

The process-level test exposed a bundler default that stripped `node:` from `node:sqlite`. `tsup.config.ts` now preserves native module prefixes; the built server subsequently started and passed the restart test.

Mammoth's unused legacy CLI dependency pulled in an advisory-flagged `sprintf-js` version. The scoped `argparse: 2.0.1` override removes that chain. Actual DOCX extraction passed after the override; Mammoth's standalone CLI is not used by the application. The subsequent production audit reported no known vulnerabilities.

See [README.md](README.md) for setup, provider configuration, permissions, data backup, architecture, and current limitations.
