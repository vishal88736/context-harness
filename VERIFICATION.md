# Local verification record

Latest local regression: **2026-10-23**, using Node **26.12.1**, npm **11.20.0**, and installed system Chromium. The current home/workspace split and coding preferences have passed **61 backend tests**, the checked production build, **one production restart test**, and **25 browser workflows**. Checks were run through `npm test`, `npm run build`, `npm run test:production`, and `npm run test:e2e`. The application is a local, single-user workspace. No public deployment or live neural-model performance is claimed.

## Completed checks

| Check                      | Result                                                    | Evidence                                                                                                             |
| -------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| TypeScript validation      | Passed                                                    | `npm run check`, also required by the production build                                                               |
| Backend/integration suite  | **61/61 passed**                                          | `npm test` → context/tools, discovery, native protocols, cross-provider handoff, redaction, and external workspaces  |
| Browser workflows          | **25/25 passed**                                          | `npm run test:e2e` → home/navigation, themes, editor preferences/races, and existing context/provider/tool workflows |
| Production build           | Passed                                                    | `npm run build`; built frontend and Node ESM bundle                                                                  |
| Full process restart       | **1/1 passed**                                            | `npm run test:production` → `tests/production.smoke.ts`                                                              |
| Dependency audit           | **0 known vulnerabilities reported on 2026-10-22**        | `npm audit --json` covers the installed production and development dependency graph                                  |
| Whitespace/conflict checks | Passed                                                    | `git diff --check`                                                                                                   |
| Visual review              | Light/dark desktop and light mobile screenshots inspected | Ignored home, workspace, and code screenshots in `artifacts/`                                                        |

The browser suite runs against separate temporary project/data directories. It never configures a test provider in the normal application's database.

## Home, themes, and coding workspace — 2026-10-23

- `/` is an informational home; `/workspace` opens the actual coding application. Home does not bootstrap the workspace or create a conversation. Once opened, the workspace stays mounted while hidden/inert during Home navigation, retaining in-memory drafts, editor tabs, and streams. Browser reloads retain database state, not unsaved buffers.
- The workspace empty view now contains a concise conversation heading, add-context control, selection brief, and composer. The decorative modular SVG and feature explanations live on Home. Web excerpts remain accessible through **Add context → Web excerpt**; only the pasted excerpt and reference URL become a selected source.
- **Settings → Appearance** offers Light, Dark, and System. SQLite retains the preference across service restarts; a validated browser cache applies it before workspace bootstrap. System follows OS changes. The default light palette retains the reference's off-white/lavender/teal/apricot colors; syntax and editor surfaces share semantic theme variables.
- **Editor settings** controls font size, spaces per indent, and word wrap, with a reset action and validated browser-local persistence. CodeMirror reconfiguration preserves documents and undo history. Focus editor hides the explorer; the desktop conversation sidebar and independent context access remain available. Cursor position and language come from the active document.
- The build keeps the workspace and editor in separate lazy chunks. Production routing serves the real built application for both `/` and `/workspace`, including after a complete process restart.
- The complete browser run passed all 25 workflows. `navigation.spec.ts` verifies that Home makes no bootstrap call, retains selected context/chat/editor drafts across Home/Resume and Back/Forward, supports deep-link reloads, and keeps nested/hidden dialog keyboard focus correct. `editor-preferences.spec.ts` checks real indentation, font/wrap persistence, undo, cursor, and focus behavior.
- `editor-race.spec.ts` delays real file reads: duplicate clicks share one request, a slower response cannot steal the active tab, and newly typed edits survive a pending reload. A subsequent confirmed reload still succeeds. An initial full run exposed folder-location input racing the initial directory response; the picker now holds the field disabled during loading/opening. The coding workflows explicitly delay that response, verify the disabled state, and then connect an external project successfully. The final full run passes.
- Inspected screenshots include `canopy-home.png`, `canopy-home-mobile.png`, `canopy-home-dark.png`, `canopy-clean-workspace.png`, `canopy-dark-workspace.png`, `canopy-light-code.png`, `canopy-dark-code.png`, and `canopy-light-code-mobile.png`. They use isolated fixture data. These checks are not an exhaustive accessibility or cross-browser audit.

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

The original 2026-10-20 run covered 25 backend tests and eight browser workflows. The current regression retains the 61 backend tests and expands the browser workflows without changing the live-inference verification boundary.

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
