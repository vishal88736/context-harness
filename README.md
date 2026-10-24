# Canopy

A local AI coding workspace where **every conversation owns its context**. Choose what a model can access, inspect its next request, and change that selection without losing your messages.

Built with React, TypeScript, Vite, Express, and SQLite. OpenCode is a reference, not a runtime dependency; this project is independently implemented and is not affiliated with the OpenCode team.

## Features

- **Independent conversation context:** files, folders, instructions, previous chats, approved memories, attachments, and tool permissions.
- **Transparent requests:** previews, actual source excerpts, explicit exclusions, token estimates, and persistent invocation snapshots.
- **Persistent workspace:** project selector, searchable/pinnable chat history, saved profiles, and SQLite persistence.
- **Four provider protocols:** native Ollama, Anthropic, Gemini, and Chat Completions compatible endpoints, with model discovery and per-request selection.
- **Coding tools with approvals:** authorized reads/search, proposed file diffs, command decisions, execution records, cancellation, and retries.
- **Code workbench:** local folder explorer, CodeMirror syntax editing, multiple file tabs, per-workspace edit drafts, and explicit diff approval before saving.
- **Adaptable workspace:** Light, Dark, and System themes, a persistent desktop sidebar, resizable context panel, responsive navigation, and Markdown/code copying.
- **Separate home and workspace:** an informational home page with explicit entry to the working app, preserving open drafts and streams during in-app navigation.

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [First coding workflow](#first-coding-workflow)
- [Open projects and edit code](#open-projects-and-edit-code)
- [Context and profiles](#context-and-profiles)
- [Request inspector and isolation](#request-inspector-and-isolation)
- [Providers and model selection](#providers-and-model-selection)
- [Appearance and navigation](#appearance-and-navigation)
- [Coding tools and security](#coding-tools-and-security)
- [Configuration, data, and backups](#configuration-data-and-backups)
- [Architecture](#architecture)
- [Development and verification](#development-and-verification)
- [Troubleshooting](#troubleshooting)
- [Current limits](#current-limits)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [References](#references)

## Requirements

Requires **Node 22.13+** and npm. The latest local verification used Node 26.12.1; CI is configured for Node 24. Node must include the built-in `node:sqlite` module. Terminal tools additionally require `/bin/bash`, so Linux/macOS are the intended platforms; native Windows command execution is not implemented.

## Quick start

### Development

From the directory containing this README and `package.json`:

```bash
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. The home page describes Canopy; select **Open workspace** to enter the app at `/workspace`. Development runs Vite on port 5173 and the API on port 4317. Vite proxies `/api` to the backend. Keep both processes running; Ctrl+C stops them. The backend binds to loopback only.

### Production

For a production build served by one process:

```bash
npm run build
npm start
```

Open **http://127.0.0.1:4317**. The production server serves the built frontend and API together. Stop with Ctrl+C. `npm run preview` serves only frontend build inspection; use `npm start` for the complete application.

Run the commands from the application directory: production assets are resolved from its `dist/` directory. `npm start` requires an existing build.

## First coding workflow

1. Select **Open workspace** on the home page, then click **Open folder** in the top bar, or **Settings → Workspaces → Browse project folders**. Choose an existing project anywhere your OS account can access; it does not need to be inside Canopy's own repository.
2. Connect a real model using [Providers and model selection](#providers-and-model-selection). Connection templates fill endpoint details; discovery supplies actual model IDs.
3. Create a conversation for that workspace. Switch to **Code** to browse files or open multiple editor tabs. Select **Add file to context** when the active conversation should receive a file's saved contents.
4. Open **Context**, review enabled sources, and optionally apply **Coding**, **Debugging**, **Research**, **Code Review**, or your own profile. Opening a project or a file does not automatically authorize it for the AI.
5. Write a request in **Conversation**. Add temporary instructions/attachments for this turn only, and choose a model for this request or use **Use model for this chat**.
6. Select **Preview request**. Review actual excerpts, history, exclusions, token estimates, and the assembled provider payload, then send. A changed preview requires another review.
7. Review proposed agent diffs or commands and approve/deny each action. For your own editor changes, choose **Review & save**, inspect the diff, and select **Apply file change**. Neither edit path silently overwrites a file changed since review.
8. Use **Stop** to cancel generation and pending agent approvals. Start another conversation to work with an independent context configuration; return to any saved chat later.

## Open projects and edit code

### Open an existing folder

**Open folder** uses a real local folder browser, with home/root shortcuts, parent navigation, and a location field accepting absolute paths or `~/...`. After entering a location, use **Go** to resolve it before opening that folder. It lists directories without uploading or copying the project. You can also connect folders through Settings. Canonical paths, including paths with spaces and directory aliases, are reused instead of creating duplicate workspaces.

Choose a project subfolder rather than the entire home directory or filesystem root. Credentials and application runtime folders remain protected. The selected folder must be accessible to the account running Canopy.

### Browse and add context

The **Code** tab contains the project explorer and a multi-tab **CodeMirror 6** editor with line numbers, syntax highlighting, folding, bracket matching/closing, search/replace, completion, and undo/redo. Language modes cover JavaScript/TypeScript, JSX/TSX, JSON, Python, Markdown, HTML, and CSS; other extensions open as plain text. Completion is supplied by the editor/language modes, not a language server or AI autocomplete service.

**Conversation** keeps the current chat available, and the context panel remains independent of both views. Browsing or opening a file is a human action; use **Add file to context** or the context manager to grant it to the active conversation. The code workbench loads on first use and remains mounted while you switch views, so chat streaming and file drafts stay available.

**Add file to context references the saved file on disk.** Unsaved editor drafts are not silently sent to the model. Save an approved edit first, or provide an explicit snippet/temporary attachment when that is the intended input.

### Editor preferences and focus

Use **Editor settings** in the Code view to choose a 12, 14, 16, or 18 px font, 2- or 4-space indentation, and word wrap. **Reset editor settings** restores 14 px, 2 spaces, and wrapping off. Preferences are saved in this browser under `canopy.editorPreferences`; changing them reconfigures the editor without discarding drafts or undo history. The status bar reports the active file's language and actual cursor line/column.

**Focus editor** hides the project explorer; **Exit focus** restores it. Workspace navigation remains available.

### Review and save

Editor drafts and open tabs are maintained per workspace while the page stays open. You can switch conversations, projects, or views without merging those drafts. Closing a dirty tab asks before discarding it, and the page registers a browser-unload warning while unsaved edits exist. Drafts are not durable across a browser restart.

Repeated file clicks share an in-flight read, and slower responses cannot switch you away from a newer selection. If you edit while a confirmed reload is pending, those newer edits are kept and the editor explains why it skipped the reload.

Choose **Review & save** (or Ctrl/Cmd+S inside the editor) to stage a real diff. Staging does not write the file. **Apply file change** is a separate approval, guarded by the original file hash, current workspace/path checks, and a ten-minute one-use proposal. A changed file requires a fresh review. Approved writes use an atomic rename after fresh conflict checks and preserve an existing file's POSIX read/write/execute permission bits.

The editor currently modifies existing text files only, with a 250 KB UTF-8 edit limit. Credential paths, binary/oversized files, and redacted previews cannot be edited here. Manual editor changes use the connected workspace and explicit human approval; model tools still require their own conversation grants and permissions. A persistent audit records change hashes, decisions, and timestamps without storing editor file contents or diffs.

## Context and profiles

The desktop sidebar remains visible. The independent context panel can be closed or resized; use its divider or arrow keys while the divider is focused. On compact screens it opens as a drawer.

On a new conversation, the **Conversation context** brief groups its enabled selections into files/folders, instructions, chats/memories, and attachments, with a separate disabled count. These are configuration counts: they do not prove that files exist, content was included, or tokens were used. Open the brief to edit the context panel; **Add context** opens source selection directly. The brief adapts to compact layouts, and context controls remain available on smaller screens. Use **Preview request** to verify actual inclusion.

Use **Add context** to select files, folders, instructions, previous conversations, memories, attachments, or a **Web excerpt**. The web dialog lets you name a page, record its URL, and paste the exact excerpt you want to share. It saves an untrusted reference snippet in the current conversation, with the URL preserved alongside the excerpt. The page is not fetched automatically; this is not browser search. Preview, disable, or remove it like any other selected source. Conversation permissions remain in the context panel, and provider connections remain in Settings.

### Sources

- **Files & snippets:** choose workspace files or paste named code snippets. Files resolve from disk for every request.
- **Web excerpts:** use **Add context → Web excerpt** to paste selected page text and its reference URL. Only the pasted text and URL are supplied; there is no automatic page retrieval.
- **Folders:** explicitly authorize a folder. Only relevant retrieved excerpts enter the prompt, rather than an assertion that the whole repository was sent.
- **Project instructions:** select a repository rules file or write project guidance. Repository rules are never silently discovered and executed.
- **Custom instructions:** editable guidance for this conversation.
- **Previous conversations:** explicitly import user-authored turns from a selected chat in the same workspace. Assistant replies are deliberately excluded because they may contain revoked file/tool data.
- **Saved memories:** explicitly approve reusable information, then select it for each conversation that should receive it.
- **Attachments:** text/code, PDF, DOCX, PNG, JPEG, and WebP; 4 MB per upload. Images require a configured image-capable model. Scanned PDFs need OCR elsewhere; no OCR is claimed.
- **Retrieved content:** reference a file under an enabled folder/file grant. It is re-resolved from disk, not served from a stale snippet cache.
- **Permissions:** reads and search can be allowed or blocked; file writes and terminal commands can only be blocked or individually approved.

### Changes and save recovery

Toggle a source to disable it temporarily, or remove it. The next invocation is rebuilt from current state. If a context change cannot be saved, sending and previewing are blocked until recovery, so a failed disable cannot silently send the old configuration. Pending failed changes survive in-app navigation; a full browser reload loads the authoritative saved server state.

### Profiles

Profile application merges profile sources with conversation-specific additions, updates permissions, and preserves messages. The profile editor can create, rename, duplicate, modify, and delete profiles. Applying a profile copies its configuration; editing the saved profile does not mutate conversations that already applied it.

### Temporary input and retries

The composer supports temporary instructions and drag/drop, paste, or upload attachments for one request. They do not become saved conversation sources. Drafts are independent while switching chats in the same browser session; draft attachments are not durable until sent or added to saved context.

**Retry** is available for the latest user turn. Repeated attempts remain visible, while only the latest eligible answer enters subsequent model context. To revisit an earlier turn after sending new messages, send a new request. Draft edits made while a request is being accepted are preserved.

## Request inspector and isolation

Use **Preview request** or **Inspect effective context** before sending. The inspector shows instructions, included source content, hashes, retrieval excerpts, omitted content/reasons, history selection, enforced permissions, model metadata, and the adapter's assembled request body. Sending from a preview checks its request hash; changed files/settings/prompts require another preview.

Each actual model invocation gets an immutable SQLite snapshot. **View context** below a reply opens its recorded request; for a tool-using response this references its final model invocation, including tool results. Earlier steps are retained in the invocation records returned by the conversation API. Authentication headers never enter snapshots. Image bytes are stored for reproducibility but represented by metadata in the inspector.

### Instruction precedence

Instruction precedence is harness → workspace → selected project guidance → conversation guidance → per-request instructions. Files, attachments, memories, imported chats, and retrieved content are labeled untrusted reference data. This precedence guides the model; **server permission checks**, rather than prompt instructions, enforce access and approvals.

### History isolation

Historical messages and effective context are separate. Old messages remain readable even when omitted from a request. Assistant replies whose context fingerprint differs are excluded, so disabled/changed source information cannot return through an old response. Temporary instructions and attachments also participate in provenance. This conservative policy may omit useful older replies; the inspector explains why. No hidden summaries or stateful provider sessions are reused.

### Token budgeting

Budgeting uses a deliberately conservative UTF-8 byte estimate, framing allowance, output reserve, and safety margin. Provider-reported maximum output tokens also constrain the reserve. Images reserve 4,096 tokens each. Exact tokenizers differ; estimates are labeled, and actual provider usage is recorded when returned. Source excerpts are explicitly truncated or excluded, and recent compatible history is selected within the remaining budget. A prompt whose mandatory material cannot fit is rejected. Long tool continuations can require a shorter new request or larger model; the harness reports this rather than sending an oversized prompt.

## Providers and model selection

Canopy supports **four documented API protocols**, with templates for OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, Ollama, LM Studio, and a custom endpoint. Templates contain endpoint/adapter settings, not credentials or seeded model IDs.

| Adapter                     | Common connections                                             | API base URL                                                                                                  |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Chat Completions compatible | OpenAI, OpenRouter, Groq, LM Studio, custom compatible servers | The complete API prefix, usually ending in `/v1`; use the selected template or the provider's documented URL. |
| Ollama native               | Local Ollama                                                   | Normally `http://127.0.0.1:11434`, without `/api` or `/v1`.                                                   |
| Anthropic native            | Anthropic Messages API                                         | Normally `https://api.anthropic.com/v1`.                                                                      |
| Gemini native               | Google Gemini API                                              | Normally `https://generativelanguage.googleapis.com/v1beta`.                                                  |

1. Open **Connect provider** / **Providers** in the top bar, or **Models & providers** in the sidebar.
2. Choose a template or select the matching adapter, enter its base URL and any required API key, then save. Local model servers must be installed, running, and have a model available separately.
3. Select **Discover models**. Discovery calls the provider's actual model interface; choose the default in Settings. If discovery is unavailable, enter an exact model ID verified with that provider. Gemini uses the full `models/name` resource returned by discovery.
4. Review the model's context limit and capabilities. Missing/invalid context limits use a clearly labeled conservative **8,192-token fallback**. Enable tools/images only when supported. Rediscovery preserves saved capability choices and user-entered limits.

### Selection and output limits

The composer selects a model **for the next request**. **Use model for this chat** persists that selection on the conversation. Switching models preserves messages and context. A failed request never silently selects another provider.

You can switch providers within the same conversation: for example, implement with one provider and ask another to review. Enabled sources, instructions, permissions, and eligible conversation history stay attached to the conversation. Each adapter rebuilds the request in its provider's format; the new model's context limit and capabilities may change what fits. Preview the request to inspect any exclusions. Provider-specific internal reasoning state is not transferred.

For compatible endpoints, the per-model **Output limit field** selects `max_completion_tokens` or `max_tokens`. Choose the parameter that endpoint documents; several templates initialize the common compatible setting during discovery. Native adapters use their own output field. Provider-reported output limits, when available, bound the reserved output budget.

### Connection boundaries

Provider keys are encrypted locally and are not returned in request inspection. Calls run from the backend, so the model server does not need browser CORS configuration. Hosted endpoints require HTTPS; HTTP is permitted only on loopback. Connection, authentication, unsupported-capability, malformed-stream, cancellation, and provider-limit errors are surfaced in the interface.

Renaming a connection or editing its model metadata preserves its saved key. Changing the adapter or API base URL clears an omitted old key and stops active generations; enter the appropriate key for the new connection. A credential is not silently forwarded to a different endpoint.

Bring any provider that implements one of these protocols. Other APIs/authentication schemes need an adapter or compatible gateway; this is not universal compatibility. Native OpenAI Responses, OAuth subscriptions, Bedrock/Vertex/Azure-specific authentication, and custom authentication headers are not implemented. Real inference requires your provider access or installed local model.

## Appearance and navigation

**Settings → Appearance** offers **Light**, **Dark**, and **System**. Light remains the default, with off-white surfaces, soft lavender navigation, teal actions, apricot highlights, navy text, and a shared two-leaf mark. Its palette uses workspace `#F8F7F5`, sidebar `#DEE1ED`, context panel `#DFE2EE`, teal `#426D79`, decorative apricot `#EAA96A`, send-button apricot `#ECB379`, selected peach `#EFD2B8`, navy `#0C2236`, cards `#FCFAF9`, and borders `#D3D8E6`. Large emphasized headings use `#C17B3F` in light mode for contrast. Dark applies shared dark surface/text tokens to the home page, workspace, dialogs, and editor. System follows operating-system theme changes while the app is open. The preference persists in SQLite and a validated browser cache (`canopy.theme`) used before workspace loading.

The informational home page lives at `/`; **Open workspace** enters the working app at `/workspace`, and changes to **Resume workspace** after it has been opened. The sidebar's logo and **Home** control return home. Browser Back/Forward and direct `/workspace` loads are supported; the production server serves the app shell for that route. Opening the home page alone does not bootstrap workspace APIs or create a conversation. Once opened, the workspace stays mounted but hidden and inert while home is visible, preserving in-memory chat drafts, editor buffers, context selections, and active streams during in-app navigation. A browser reload still loses unsaved drafts.

The compact home page includes a full-frame [workspace preview](docs/workspace-preview.md) captured from the actual app with a sample project. It follows the selected light/dark theme and opens at full resolution. It illustrates the editor and selected context without accessing the visitor's project or simulating an AI response. An illustrated **Make room for your next idea** section closes the page with a direct workspace entry.

The top bar exposes **Open folder**, provider connection, and context access. The **Conversation** and **Code** tabs share the active workspace and conversation. The desktop sidebar keeps projects and chat history visible; smaller layouts retain navigation, file/context controls, and responsive panels.

The home page features the five reference-inspired mascots: Byte in the hero and Inspect context card, Node and Stack in the other context features, Codey beside the coding-workspace section, and one roaming Roo. The workspace uses only a small, static Byte beside the empty conversation heading; mascots stay out of messages and the code editor. Artwork supports light/dark surfaces, responsive layouts, and reduced motion. [Mascot assets and generation prompts](docs/mascots.md) document their source and placement.

Roo follows a 28-second eased flight around the viewport edges while you scroll the home page. The larger illustration turns to face its direction of travel, gently banks, and leaves a light dashed trail. Its decorative layer lets pointer input pass through to the page. A fixed **Pause Roo / Play Roo** control saves your preference in this browser and freezes both Roo and the slowly drifting hero chips. System reduced motion takes precedence; motion also pauses when the browser tab is hidden, and Roo is removed from the working app. The other characters remain still.

The home page adds a brief staggered hero entrance and upward reveals as sections enter view. Completed reveals do not replay when scrolling back. Cards and the workspace preview lift subtly on hover; navigation underlines, FAQ highlights, and button arrows add restrained feedback. Pausing motion or enabling reduced motion keeps all content readable, and keyboard focus reveals any pending target immediately. These effects stay within the landing page; they do not animate the editor, messages, or context controls.

The compact new-conversation view contains a heading, **Add context**, and the context selection brief above the composer. Product explanations and larger character scenes live on the home page.

## Coding tools and security

### File tools and execution

The agent can read files, search authorized paths, propose an entire file's new contents as a diff, and request shell commands. It supports up to eight model steps and six tool calls per step. Stop generation cancels the provider request, pending approvals, and the process group of a running command.

File tools are limited to this conversation's enabled file/folder grants. Explicitly disabled paths take precedence over overlapping folder grants. Traversal, symlink escapes, binary files, credentials, Git internals, build output, and application state are excluded. Text reads are bounded. File writes use a temporary file and atomic rename; approval rechecks the context revision and original file hash. Parent folders must already exist.

Every write presents a diff, and every terminal command presents the exact command and reason. Neither can execute without the separate browser approval. Terminal is blocked by default. **An approved shell command runs as your OS user; it is not an OS sandbox and can access files beyond the context grants.** Commands receive a reduced environment without provider keys, have a 60-second timeout and bounded output, and have persistent execution/approval records. Review destructive commands before approving. The application never provides an approval tool to a model.

### Local service and credentials

The backend binds only to loopback, checks Host and Origin, uses an HttpOnly SameSite session cookie and a CSRF header for mutations, and sets security headers. No arbitrary CORS, remote login, telemetry, CDN fonts, or hosted storage is required. The production frontend uses a Content Security Policy. This is a **single-user local application**, not a multi-user internet service; do not expose it through a public proxy. It is not an OS-level adversarial process sandbox.

Provider keys are AES-256-GCM encrypted. The local `vault.key` and SQLite database use private filesystem permissions. Protect and back up **both** the data directory and key: encryption does not protect against an attacker who can read the key as your OS account. Redaction covers configured keys and common credential patterns; it is a safeguard, not a guarantee that arbitrary secrets can be detected. Choose source files carefully. Conversation content, snapshots, attachments, and tool output otherwise remain sensitive local data, not an encrypted archive.

## Configuration, data, and backups

### Environment configuration

Optional environment variables for the backend:

| Variable           | Default                                    | Purpose                                                     |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------- |
| `CANOPY_WORKSPACE` | Current working directory                  | Existing initial project folder; use an absolute path.      |
| `CANOPY_DATA_DIR`  | `<initial workspace>/context-harness-data` | Private directory containing SQLite and the encryption key. |
| `PORT`             | `4317`                                     | Backend port, an integer from 1024 to 65535.                |

For example:

```bash
CANOPY_WORKSPACE="/absolute/path/to/project" \
CANOPY_DATA_DIR="/absolute/path/to/private/canopy-data" \
PORT=4317 npm start
```

Add additional projects through **Settings → Workspaces**. The initial workspace is created when the database is first initialized; changing `CANOPY_WORKSPACE` later does not relocate existing conversations. Reuse the same `CANOPY_DATA_DIR` to reopen the same database. Run **one application process per data directory**.

The app does not automatically load `.env` files. Export these variables in the launching shell or service. Provider keys are configured in the interface, not through checked-in environment files. If you change the development API port, also update the target in `vite.config.ts`; `PORT` alone does not change Vite's proxy.

### Persistent data

SQLite runs in WAL mode with foreign keys, busy timeout, indexes, and versioned migrations. Schema version 2 adds hash-only manual file-change audit records. Valid Light/Dark/System appearance preferences are retained; missing or invalid values default to light. Workspaces, conversations, messages, profiles, source configurations, model settings, memories, invocation snapshots, tool executions, and decisions persist across restarts. Interrupted generations/approvals are marked stopped/denied on startup; they never resume invisibly. Pending manual editor proposals expire after a restart; they are not reapplied from disk.

### Backup and restore

Back up the data directory while stopped. For a running database use SQLite's backup facility; do not copy only the `.sqlite` file while its WAL contains pending changes.

Restore a stopped backup to a private directory and launch with `CANOPY_DATA_DIR` pointing there. Keep `canopy.sqlite` and its matching `vault.key` together. Project source files are outside the database backup; back those up separately. Deleting a conversation permanently cascades to its messages, invocations, executions, and approval records. Disabling a source changes future requests and does not erase earlier snapshots.

## Architecture

```text
src/
├── ApplicationRouter.tsx       Home/workspace routes, lazy retained workspace
├── App.tsx                     Workspace, conversation/code views, stream state
├── appearance.tsx / .css       Theme preference, System listener, dark tokens
├── editor-preferences.ts / .css Validated local editor settings and control styles
├── api.ts                      Typed JSON/SSE client
├── provider-presets.ts         Connection templates without keys or model IDs
├── use-home-reveals.ts         One-time section reveals, focus fallback and cleanup
├── components/
│   ├── CodeWorkbench.tsx       Explorer, file tabs, drafts, diff approval
│   ├── SourceEditor.tsx        CodeMirror language modes, editing, undo/scroll state
│   ├── FolderPicker.tsx        Local OS directory browser
│   ├── ContextOverview.tsx     Per-chat selection brief
│   ├── HomePage.tsx            Informational home and workspace entry
│   ├── HomeRoamer.tsx          Home-only Roo, viewport sizing and motion control
│   ├── HomeClosing.tsx         Illustrated next-idea workspace entry
│   ├── CanopyMascot.tsx        Decorative character assets and loading behavior
│   ├── WelcomeIllustration.tsx Retained alternative modular SVG
│   ├── WebContextDialog.tsx    Explicit page URL and pasted excerpt
│   └── ...                     Sidebar, chat, context, profiles, settings, inspector
├── styles.css                  Default light theme tokens and base layout
├── home-page.css               Responsive home-page layout
├── home-motion.css             Hero/section reveals, floating chips and hover motion
├── home-roamer.css             Viewport flight path and accessible pause control
├── home-closing.css            Layered paper/window artwork and responsive ending
├── readability.css             Readability overrides
├── workspace-presentation.css  Workspace, code editor, chat presentation
└── context-presentation.css    Context and dialog presentation
server/
├── app.ts / index.ts           Local API, startup, static web serving
├── schema.ts / store.ts        Validated types, SQLite migrations and records
├── workspaces.ts              OS folder access, safe human file-change approvals
├── context.ts / retrieval.ts   Composition, isolation, budgets, fresh lexical search
├── providers.ts               Discovery, transport, compatible/Ollama adapters
├── provider-adapters/
│   ├── native.ts              Anthropic/Gemini payloads, tools, streaming
│   └── stream.ts              Bounded SSE/NDJSON decoding and cancellation
├── agent.ts / turns.ts         Session/tool loop, retries, answer provenance
└── tools.ts / security.ts      Agent permissions, approvals, vault, path boundaries
tests/                         Backend integration and HTTP protocol fixtures
e2e/                           Isolated browser and coding workflows
```

Retrieval is a fresh, bounded lexical scan (up to 2,000 candidate files; per-directory traversal limits also apply). It is suitable for local projects and prioritizes permission correctness. Embedding indexes, automatic summaries, git worktrees, language servers, and multi-agent/model review orchestration are future extensions, not claimed features.

Manual file changes follow `SourceEditor → CodeWorkbench → file-changes API → WorkspaceFiles → hash/path checks → atomic write`, with hashes recorded in SQLite. `SourceEditor` handles editing; it cannot write files or add AI context directly. This path is separate from model tool execution.

The main request path is `App → api/streamChat → app routes → Agent → ContextEngine → Providers`; tool calls return through `ToolRunner`, which validates permissions and records results in `Store`. Frontend types come from `server/schema.ts` through type-only imports; database, vault, and provider keys stay in the backend.

`src/main.tsx` renders `ApplicationRouter` inside `AppearanceProvider` and the error boundary. It loads base/readability/workspace/context styles, followed by home and appearance layers; the workbench imports editor-preference styles when loaded. Default light tokens live in `src/styles.css`, and `src/appearance.css` supplies dark overrides. The context brief derives its counts from the active conversation's actual source configuration and does not compose or send a model request.

`LOCAL_CODEBASE_GUIDE.md` is a detailed local file-by-file and connection guide. It is intentionally excluded by the exact `/LOCAL_CODEBASE_GUIDE.md` rule in `.gitignore` and by context file access/retrieval. It is available in this working copy and will not be included in a fresh clone unless separately supplied. Git ignore rules alone are not general model-access rules.

Some inherited `.opencode/`, editor, and GitHub helper files remain outside the application runtime. The npm scripts do not import or execute them. The active CI workflow is `.github/workflows/ci.yml`; Canopy does not require Bun, OpenCode, or a GitHub token to run. The local guide identifies these retained files and their status.

## Development and verification

### Commands

| Command                   | Purpose                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run dev`             | Watch API source and serve the Vite frontend on port 5173.                                 |
| `npm run dev:server`      | Watch only the API on port 4317 (or `PORT`).                                               |
| `npm run check`           | Type-check application, server, tests, and build configuration.                            |
| `npm test`                | Run backend/integration tests serially with Node's test runner via `tsx`.                  |
| `npm run build`           | Type-check, build the web app to `dist/`, and bundle the backend to `dist-server/`.        |
| `npm start`               | Serve the production frontend and API in one process.                                      |
| `npm run test:production` | Test built assets and persistence across a full process restart; build first.              |
| `npm run test:e2e`        | Run Chromium workflows against an isolated temporary workspace and HTTP fixture.           |
| `npm run verify`          | Run backend tests, build (including type checking), production restart, and browser tests. |
| `npm run preview`         | Inspect only Vite's built frontend (normally port 4173); not the full app.                 |
| `npm run format`          | Rewrite source, tests, and root config/docs with Prettier.                                 |

Run the complete local suite with `npm run verify`, or run its checks individually:

```bash
npm run check
npm test
npm run build
npm run test:production
npm run test:e2e
```

Browser tests use an existing `/usr/bin/chromium` when available. Otherwise install Playwright Chromium with `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_PATH` to your executable. CI installs Playwright's browser. Screenshots are written to ignored `artifacts/`; failure traces and HTML reports are also ignored.

The test provider is a **deterministic HTTP protocol fixture**, created only by tests, never shipped as an application provider. Tests verify real network requests containing the actual composed context, persistence, cancellation, and controlled filesystem changes. They do **not** prove neural reasoning quality or a live hosted/local model connection. See [VERIFICATION.md](VERIFICATION.md) for the recorded verification scope.

Verification results and their dates are maintained in [VERIFICATION.md](VERIFICATION.md). Treat a recorded pass as evidence for that revision, not a promise that every future edit has passed. Run `npm run verify` after changes and keep live inference, protocol-fixture tests, browser checks, and remote CI evidence distinct.

`PLAYWRIGHT_CHROMIUM_PATH` and `CI` affect test browser selection only. The browser fixture uses ports 5273 and 4318; these must be free. Backend tests use temporary data and dynamic ports. Tests do not read your normal provider database or prove that a real model is installed.

## Troubleshooting

| Symptom                                                | Resolution                                                                                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node:sqlite` missing or an unsupported engine warning | Use Node 22.13+ with built-in SQLite support, then run `npm ci` again. An experimental SQLite warning on some Node versions is separate from a startup error.                                                            |
| Port 5173 or 4317 is occupied                          | Stop the other process or change the backend port and Vite proxy together. Avoid opening two instances on one data directory.                                                                                            |
| Interface loads but cannot connect to the API          | Start `npm run dev` from the application directory and check the API terminal. For production, build and use port 4317 with `npm start`.                                                                                 |
| Session expired / invalid request token after restart  | Reload the page to establish a new local session and CSRF token.                                                                                                                                                         |
| Folder picker cannot open a project                    | Check the absolute/`~/...` path and OS account permissions. Choose a project subfolder; home/root, credentials, and runtime folders are protected.                                                                       |
| Editor save is rejected                                | Keep your draft, reopen the current saved file, and request a fresh diff. Changed hashes, expired proposals, protected content, or workspace changes invalidate old approvals.                                           |
| Discovery fails or returns no models                   | Check the provider server and base URL. Ollama uses its origin; native Anthropic/Gemini and compatible providers need their documented API prefix. Configure an exact provider ID manually only when you know it exists. |
| Provider rejects a request or tool/image parameter     | Check the adapter, model capabilities, and compatible output-limit field against that endpoint. Disable unsupported capabilities or add an adapter; Canopy does not silently switch providers.                           |
| A file is excluded or a tool path is denied            | Inspect the reason, then add an enabled file/folder grant. Disabled paths override broader grants; credentials, runtime data, and escaping symlinks remain blocked.                                                      |
| Context save failed                                    | Retry/recover the save or reload saved state before sending. Check API availability; do not assume an unsaved toggle changed the model request.                                                                          |
| Context budget is full                                 | Read exclusions in the inspector, reduce source/attachment/history size, shorten the prompt, or select a verified larger context limit.                                                                                  |
| A write says the file/context changed                  | Request a fresh diff and approval; old approval must not overwrite new content. New files need an existing authorized parent folder.                                                                                     |
| Terminal action does not appear                        | Set terminal permission to **Ask** and enable tools only for a model that supports tool calls. Every command still needs a separate approval.                                                                            |
| PDF contains no usable text                            | Supply a text excerpt or perform OCR externally; scanned PDFs are not automatically recognized.                                                                                                                          |
| Browser test executable missing                        | Run `npx playwright install chromium` or set `PLAYWRIGHT_CHROMIUM_PATH`; install system browser dependencies if needed.                                                                                                  |
| Vault cannot decrypt configured keys                   | Restore the matching `vault.key` from backup. Do not generate a replacement key over an existing database.                                                                                                               |

## Current limits

- Live hosted/local inference still requires provider access or an installed local model. Protocol fixtures do not prove neural reasoning quality.
- Only the four documented protocols and supported API-key authentication are implemented. Other provider-specific APIs, custom auth, OAuth subscriptions, and advanced model orchestration require further integration.
- The integrated editor handles existing bounded text files. It does not claim language-server completion, debugging, a terminal emulator, or automatic draft recovery after a browser restart.
- Retrieval is bounded lexical scanning, not a semantic/vector index. There is no automatic summarization, OCR, language server, or background repository index.
- Approved Bash commands run with the local OS account's access, outside any OS sandbox. Native Windows terminal execution is unsupported.
- Token counts are estimated until provider usage is returned. Context changes conservatively omit older dependent assistant replies; selected previous chats include user-authored turns only.
- Browser coverage targets Chromium desktop/mobile workflows, not exhaustive cross-browser, accessibility, or adversarial security certification. Verify remote CI separately.

## Keyboard shortcuts

| Action                        | Shortcut            |
| ----------------------------- | ------------------- |
| New conversation              | Ctrl/Cmd+N          |
| Search conversations          | Ctrl/Cmd+K          |
| Toggle context                | Ctrl/Cmd+Shift+C    |
| Send / new line               | Enter / Shift+Enter |
| Review editor changes         | Ctrl/Cmd+S          |
| Find / replace in the editor  | Ctrl/Cmd+F          |
| Indent inside the editor      | Tab                 |
| Leave the editor by keyboard  | Escape, then Tab    |
| Close dialog                  | Escape              |
| Navigate focused chat history | Up / Down           |

Some browser-reserved shortcuts may take precedence. All actions have visible controls.

## References

The user-supplied [OpenCode v2.0.32](https://github.com/anomalyco/opencode/tree/v2.0.32) was inspected as a design reference, especially its [permission layer](https://github.com/anomalyco/opencode/blob/v2.0.32/packages/core/src/permission.ts), [model-request preparation](https://github.com/anomalyco/opencode/blob/v2.0.32/packages/core/src/session/model-request.ts), and [Ollama provider discovery](https://github.com/anomalyco/opencode/blob/v2.0.32/packages/core/src/plugin/provider/ollama.ts). No unsupported OpenCode 2.0 API is assumed or required.

Adapter protocols: [Ollama Chat API](https://docs.ollama.com/api/chat) and [Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).

Native protocols: [Anthropic model discovery](https://platform.claude.com/docs/en/api/models/list), [Messages API](https://platform.claude.com/docs/en/api/messages/create), [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming), [Gemini models](https://ai.google.dev/api/models), [Gemini generation](https://ai.google.dev/api/generate-content), and [Gemini tool-turn signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures).
