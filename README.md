# Canopy

A local AI coding workspace where **every conversation owns its context**. Choose what a model can access, inspect its next request, and change that selection without losing your messages.

Built with React, TypeScript, Vite, Express, and SQLite. OpenCode is a reference, not a runtime dependency; this project is independently implemented and is not affiliated with the OpenCode team.

## Features

- **Independent conversation context:** files, folders, instructions, previous chats, approved memories, attachments, and tool permissions.
- **Transparent requests:** previews, actual source excerpts, explicit exclusions, token estimates, and persistent invocation snapshots.
- **Persistent workspace:** project selector, searchable/pinnable chat history, saved profiles, and SQLite persistence.
- **Real model adapters:** discovered Ollama and Chat Completions compatible models, defaults, per-chat assignments, and per-request overrides.
- **Coding tools with approvals:** authorized reads/search, proposed file diffs, command decisions, execution records, cancellation, and retries.
- **Polished presentation:** persistent desktop sidebar, resizable context panel, responsive navigation, Markdown/code copying, and dark/light/system themes.

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [First coding workflow](#first-coding-workflow)
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

Open **http://127.0.0.1:5173**. Development runs Vite on port 5173 and the API on port 4317. Vite proxies `/api` to the backend. Keep both processes running; Ctrl+C stops them. The backend binds to loopback only.

### Production

For a production build served by one process:

```bash
npm run build
npm start
```

Open **http://127.0.0.1:4317**. The production server serves the built frontend and API together. Stop with Ctrl+C. `npm run preview` serves only frontend build inspection; use `npm start` for the complete application.

Run the commands from the application directory: production assets are resolved from its `dist/` directory. `npm start` requires an existing build.

## First coding workflow

Connect a model using [Providers and model selection](#providers-and-model-selection), then:

1. Select your project in the sidebar, or add its existing folder in **Settings → Workspaces**.
2. Create a conversation. Open **Context**, add relevant files or authorize a folder, and optionally apply **Coding**, **Debugging**, **Research**, **Code Review**, or your own profile.
3. Check **Permissions**. Read and search are allowed by default, writes require approval, and terminal commands are blocked by default. Model tool support must also be enabled for a tool-capable model.
4. Write a request. Add temporary instructions or attachments in the composer when they should apply to this turn only. Choose a model for this request, or persist it with **Use model for this chat**.
5. Select **Preview request**. Review actual excerpts, history, exclusions, token estimates, and the provider payload, then send. A stale preview is rejected if effective context changes.
6. Review proposed diffs or commands and approve/deny each action. **Stop** cancels generation and pending approvals. Completed tool results remain with the conversation.
7. Start another conversation and select its context independently. Reopen the first chat to continue with its own saved configuration.

## Context and profiles

The desktop sidebar remains visible. The independent context panel can be closed or resized; use its divider or arrow keys while the divider is focused. On compact screens it opens as a drawer.

On a new conversation's welcome screen, the **Conversation context** brief groups its enabled selections into files/folders, selected instructions, chats/memories, and attachments, with a separate disabled count. These are configuration counts: they do not prove that files exist, content was included, or tokens were used. Open the brief or workspace pill to edit the context panel; **Add your context** opens source selection directly. The brief adapts to compact layouts, and context controls remain available on smaller screens. Use **Preview request** to verify actual inclusion.

### Sources

- **Files & snippets:** choose workspace files or paste named code snippets. Files resolve from disk for every request.
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

Budgeting uses a deliberately conservative UTF-8 byte estimate, framing allowance, output reserve, and safety margin. Images reserve 4,096 tokens each. Exact tokenizers differ; estimates are labeled, and actual provider usage is recorded when returned. Source excerpts are explicitly truncated or excluded, and recent compatible history is selected within the remaining budget. A prompt whose mandatory material cannot fit is rejected. Long tool continuations can require a shorter new request or larger model; the harness reports this rather than sending an oversized prompt.

## Providers and model selection

The application contains **no simulated AI or seeded model IDs**. It opens in a useful empty state until you connect a provider.

1. Open **Models & providers** in the sidebar.
2. Add an **Ollama (native)** or **OpenAI-compatible** connection.
3. For Ollama, enter the server origin, normally `http://127.0.0.1:11434`, without `/api` or `/v1`. Install/start Ollama and pull a model separately.
4. For a compatible endpoint, enter the complete API base URL, including its prefix (often `/v1`). Hosted providers require HTTPS; loopback endpoints can use HTTP. Enter a key when required.
5. Save, then **Discover models**. Discovery uses Ollama's `/api/tags` and `/api/show`, or a compatible `/models` endpoint. The first discovery can set a default model; change it in Settings.
6. When a provider omits metadata or returns an invalid context limit, the interface explicitly labels its conservative **8,192-token fallback**. Edit the connection to enter a verified context limit and enable tools/images only if the selected model supports them. Rediscovery preserves saved capability choices and user-entered limits; edit tools/images manually if the provider's capabilities change. You can enter an exact provider model ID manually when discovery is unavailable.

The composer selects a model **for the next request**. **Use model for this chat** persists that selection on the conversation. Switching models preserves messages and context. There is no implicit fallback to another provider when a request fails.

Compatible endpoints must implement streaming Chat Completions, including function tool calls for agent actions. The adapter sends `max_completion_tokens`; an endpoint that requires different request parameters needs another adapter. Provider calls run from the local backend, so browser CORS configuration is not required on the model server. No request is sent until a real provider and model are selected.

## Appearance and navigation

Choose **Dark**, **Light**, or **System** under **Settings → Appearance**. Dark is the default, using graphite surfaces and ice-blue accents; Light uses cool neutral surfaces, and System follows the OS preference. Canopy's original visual design pairs an editorial welcome heading with clear, technical controls across the sidebar, chat, context manager, profiles, settings, and inspector. A shared two-leaf Canopy mark appears in the sidebar, welcome screen, assistant replies, and favicon.

The desktop sidebar keeps projects and conversation history in view. Context opens independently; compact layouts expose navigation and context as drawers. The welcome context brief reflects configured selections and opens the context panel, while **Add your context** opens source selection. Its linear summary adapts to the available width.

## Coding tools and security

### File tools and execution

The agent can read files, search authorized paths, propose an entire file's new contents as a diff, and request shell commands. It supports up to eight model steps and six tool calls per step. Stop generation cancels the provider request, pending approvals, and the process group of a running command.

File tools are limited to this conversation's enabled file/folder grants. Explicitly disabled paths take precedence over overlapping folder grants. Traversal, symlink escapes, binary files, credentials, Git internals, build output, and application state are excluded. Text reads are bounded. File writes use a temporary file and atomic rename; approval rechecks the context revision and original file hash, preserving existing file permissions. Parent folders must already exist.

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

SQLite runs in WAL mode with foreign keys, busy timeout, indexes, and a versioned migration. Workspaces, conversations, messages, profiles, source configurations, model settings, memories, invocation snapshots, tool executions, and decisions persist across restarts. Interrupted generations/approvals are marked stopped/denied on startup; they never resume invisibly.

### Backup and restore

Back up the data directory while stopped. For a running database use SQLite's backup facility; do not copy only the `.sqlite` file while its WAL contains pending changes.

Restore a stopped backup to a private directory and launch with `CANOPY_DATA_DIR` pointing there. Keep `canopy.sqlite` and its matching `vault.key` together. Project source files are outside the database backup; back those up separately. Deleting a conversation permanently cascades to its messages, invocations, executions, and approval records. Disabling a source changes future requests and does not erase earlier snapshots.

## Architecture

```text
src/
├── App.tsx                     Workspace state, navigation, chat streams
├── api.ts                      Typed JSON/SSE client
├── components/                 Sidebar, chat, context, profiles, settings, inspector
│   └── ContextOverview.tsx     Per-chat selection brief
├── styles.css                  Base layout and dark/light theme tokens
├── readability.css             Readability overrides
├── workspace-presentation.css  Workspace, welcome brief, chat presentation
└── context-presentation.css    Context, profiles, settings, inspector presentation
server/
├── index.ts                    Startup, loopback listener, shutdown
├── app.ts                      Authenticated API and production web serving
├── schema.ts                   Shared types and Zod validation
├── store.ts                    SQLite migrations, records, transactions
├── context.ts                  Composition, isolation, provenance, budgets
├── retrieval.ts                Bounded fresh lexical search
├── providers.ts                Discovery, adapters, streaming parsers
├── agent.ts                    Session lifecycle and model/tool loop
├── turns.ts                    Retry validation and answer selection
├── tool-catalog.ts             Model-facing tool definitions
├── tools.ts                    Enforced permissions, approvals, execution
└── security.ts                 Path boundaries, credential vault, redaction
tests/                         Backend/integration tests and HTTP fixtures
e2e/                           Isolated browser and presentation workflows
```

Retrieval is a fresh, bounded lexical scan (up to 2,000 candidate files; per-directory traversal limits also apply). It is suitable for local projects and prioritizes permission correctness. Embedding indexes, automatic summaries, git worktrees, language servers, and multi-agent/model review orchestration are future extensions, not claimed features.

The main request path is `App → api/streamChat → app routes → Agent → ContextEngine → Providers`; tool calls return through `ToolRunner`, which validates permissions and records results in `Store`. Frontend types come from `server/schema.ts` through type-only imports; database, vault, and provider keys stay in the backend.

`src/main.tsx` loads the base styles, readability overrides, then the workspace and context presentation layers. Theme tokens remain in `src/styles.css`; the context brief derives its counts from the active conversation's actual source configuration and does not compose or send a model request.

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

| Symptom                                                | Resolution                                                                                                                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node:sqlite` missing or an unsupported engine warning | Use Node 22.13+ with built-in SQLite support, then run `npm ci` again. An experimental SQLite warning on some Node versions is separate from a startup error.                                        |
| Port 5173 or 4317 is occupied                          | Stop the other process or change the backend port and Vite proxy together. Avoid opening two instances on one data directory.                                                                        |
| Interface loads but cannot connect to the API          | Start `npm run dev` from the application directory and check the API terminal. For production, build and use port 4317 with `npm start`.                                                             |
| Session expired / invalid request token after restart  | Reload the page to establish a new local session and CSRF token.                                                                                                                                     |
| Discovery fails or returns no models                   | Check the provider server and base URL. Ollama uses its origin; compatible providers usually need an API prefix such as `/v1`. Configure an exact provider ID manually only when you know it exists. |
| Provider rejects a request or tool/image parameter     | Check that model metadata and the adapter protocol match the endpoint. Disable unsupported capabilities or add an adapter; Canopy does not silently switch providers.                                |
| A file is excluded or a tool path is denied            | Inspect the reason, then add an enabled file/folder grant. Disabled paths override broader grants; credentials, runtime data, and escaping symlinks remain blocked.                                  |
| Context save failed                                    | Retry/recover the save or reload saved state before sending. Check API availability; do not assume an unsaved toggle changed the model request.                                                      |
| Context budget is full                                 | Read exclusions in the inspector, reduce source/attachment/history size, shorten the prompt, or select a verified larger context limit.                                                              |
| A write says the file/context changed                  | Request a fresh diff and approval; old approval must not overwrite new content. New files need an existing authorized parent folder.                                                                 |
| Terminal action does not appear                        | Set terminal permission to **Ask** and enable tools only for a model that supports tool calls. Every command still needs a separate approval.                                                        |
| PDF contains no usable text                            | Supply a text excerpt or perform OCR externally; scanned PDFs are not automatically recognized.                                                                                                      |
| Browser test executable missing                        | Run `npx playwright install chromium` or set `PLAYWRIGHT_CHROMIUM_PATH`; install system browser dependencies if needed.                                                                              |
| Vault cannot decrypt configured keys                   | Restore the matching `vault.key` from backup. Do not generate a replacement key over an existing database.                                                                                           |

## Current limits

- Live hosted/local neural inference still requires your provider and credentials/model installation. Protocol tests alone do not verify reasoning quality.
- Only native Ollama and streaming Chat Completions compatible providers are implemented. Native Anthropic/Gemini, OAuth subscriptions, OpenCode SDK integration, and advanced model orchestration are not implemented.
- Retrieval scans bounded text files; it is not a persistent semantic/vector index. No automatic summarization, OCR, language server, or background repository indexing is claimed.
- The app is local and single-user. Approval-controlled Bash runs with your OS account's access, not in a container or OS sandbox. Native Windows terminal execution is unsupported.
- Token usage is estimated until a provider returns usage. Imported chats include user-authored messages only; context changes conservatively exclude older dependent assistant replies.
- Drafts survive switching chats in the current page session, not a browser restart. Uploaded draft attachments become durable only when sent in an invocation or saved as context.
- Browser coverage targets Chromium desktop/mobile workflows, not exhaustive browser, accessibility, or adversarial security certification. Remote CI completion must be verified separately.

## Keyboard shortcuts

| Action                        | Shortcut            |
| ----------------------------- | ------------------- |
| New conversation              | Ctrl/Cmd+N          |
| Search conversations          | Ctrl/Cmd+K          |
| Toggle context                | Ctrl/Cmd+Shift+C    |
| Send / new line               | Enter / Shift+Enter |
| Close dialog                  | Escape              |
| Navigate focused chat history | Up / Down           |

Some browser-reserved shortcuts may take precedence. All actions have visible controls.

## References

The user-supplied [OpenCode v2.0.32](https://github.com/anomalyco/opencode/tree/v2.0.32) was inspected as a design reference, especially its [permission layer](https://github.com/anomalyco/opencode/blob/v2.0.32/packages/core/src/permission.ts), [model-request preparation](https://github.com/anomalyco/opencode/blob/v2.0.32/packages/core/src/session/model-request.ts), and [Ollama provider discovery](https://github.com/anomalyco/opencode/blob/v2.0.32/packages/core/src/plugin/provider/ollama.ts). No unsupported OpenCode 2.0 API is assumed or required.

Adapter protocols: [Ollama Chat API](https://docs.ollama.com/api/chat) and [Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
