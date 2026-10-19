# Canopy

A local, context-first AI coding workspace. Each conversation owns its sources, instructions, profile, model selection, and tool permissions. Change what the model can access without deleting your conversation.

Built independently from scratch with React, TypeScript, Vite, Express, and Node's SQLite driver. OpenCode is a reference, not a runtime dependency. This project is not affiliated with the OpenCode team.

## Run locally

Requires **Node 22.13+** and npm. Locally verified with Node 26.12.0.

```bash
cd "/home/vishal/D DRIVE/HARNESS/context-harness"
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. The API listens on `127.0.0.1:4317`. Nothing is published or exposed on the network.

For a production build served by one process:

```bash
npm run build
npm start
```

Open **http://127.0.0.1:4317**. The production server serves the built frontend and API together. Stop with Ctrl+C. `npm run preview` serves only frontend build inspection; use `npm start` for the complete application.

Optional environment variables:

```bash
CANOPY_WORKSPACE="/absolute/path/to/project" \
CANOPY_DATA_DIR="/absolute/path/to/private/canopy-data" \
PORT=4317 npm start
```

The default workspace is the working directory. Add additional projects through **Settings → Workspaces**. Application data defaults to `context-harness-data/` inside the initial workspace and is ignored by Git and retrieval. Set a dedicated private data directory if you want multiple launches to share one database. Run one application process per data directory.

## Connect an actual model

The application contains **no simulated AI or seeded model IDs**. It opens in a useful empty state until you connect a provider.

1. Open **Models & providers** in the sidebar.
2. Add an **Ollama (native)** or **OpenAI-compatible** connection.
3. For Ollama, enter the server origin, normally `http://127.0.0.1:11434`, without `/api` or `/v1`. Install/start Ollama and pull a model separately.
4. For a compatible endpoint, enter the complete API base URL, including its prefix (often `/v1`). Hosted providers require HTTPS; loopback endpoints can use HTTP. Enter a key when required.
5. Save, then **Discover models**. Discovery uses Ollama's `/api/tags` and `/api/show`, or a compatible `/models` endpoint. The first discovery can set a default model; change it in Settings.
6. When a provider omits metadata, the interface explicitly labels its conservative **8,192-token fallback**. Edit the connection to enter a verified context limit and enable tools/images only if the selected model supports them. You can enter an exact provider model ID manually when discovery is unavailable.

The composer selects a model **for the next request**. **Use model for this chat** persists that selection on the conversation. Switching models preserves messages and context. There is no implicit fallback to another provider when a request fails.

Compatible endpoints must implement streaming Chat Completions, including function tool calls for agent actions. Some providers/models use other request parameters or APIs; these require another adapter. Native Anthropic/Gemini APIs, OAuth subscriptions, and OpenCode SDK integration are not implemented.

## Work with context

The desktop sidebar remains visible. The independent context panel can be closed or resized; use its divider or arrow keys while the divider is focused. On compact screens it opens as a drawer.

- **Files & snippets:** choose workspace files or paste named code snippets. Files resolve from disk for every request.
- **Folders:** explicitly authorize a folder. Only relevant retrieved excerpts enter the prompt, rather than an assertion that the whole repository was sent.
- **Project instructions:** select a repository rules file or write project guidance. Repository rules are never silently discovered and executed.
- **Custom instructions:** editable guidance for this conversation.
- **Previous conversations:** explicitly import user-authored turns from a selected chat in the same workspace. Assistant replies are deliberately excluded because they may contain revoked file/tool data.
- **Saved memories:** explicitly approve reusable information, then select it for each conversation that should receive it.
- **Attachments:** text/code, PDF, DOCX, PNG, JPEG, and WebP; 4 MB per upload. Images require a configured image-capable model. Scanned PDFs need OCR elsewhere; no OCR is claimed.
- **Retrieved content:** reference a file under an enabled folder/file grant. It is re-resolved from disk, not served from a stale snippet cache.
- **Permissions:** reads and search can be allowed or blocked; file writes and terminal commands can only be blocked or individually approved.

Toggle a source to disable it temporarily, or remove it. The next invocation is rebuilt from current state. Profile application merges profile sources with conversation-specific additions, updates permissions, and preserves messages. The profile editor can create, rename, duplicate, modify, and delete profiles. Applying a profile copies its configuration; editing the saved profile does not mutate conversations that already applied it.

The composer supports temporary instructions and drag/drop, paste, or upload attachments for one request. They do not become saved conversation sources. Drafts are independent while switching chats in the same browser session; draft attachments are not durable until sent or added to saved context.

## Inspect what is actually sent

Use **Preview request** or **Inspect effective context** before sending. The inspector shows instructions, included source content, hashes, retrieval excerpts, omitted content/reasons, history selection, enforced permissions, model metadata, and the adapter's assembled request body. Sending from a preview checks its request hash; changed files/settings/prompts require another preview.

Each actual model invocation gets an immutable SQLite snapshot. **View context** below a reply opens its recorded request; for a tool-using response this references its final model invocation, including tool results. Earlier steps are retained in the invocation records returned by the conversation API. Authentication headers never enter snapshots. Image bytes are stored for reproducibility but represented by metadata in the inspector.

Instruction precedence is harness → workspace → selected project guidance → conversation guidance → per-request instructions. Files, attachments, memories, imported chats, and retrieved content are labeled untrusted reference data. This precedence guides the model; **server permission checks**, rather than prompt instructions, enforce access and approvals.

Historical messages and effective context are separate. Old messages remain readable even when omitted from a request. Assistant replies whose context fingerprint differs are excluded, so disabled/changed source information cannot return through an old response. Temporary instructions and attachments also participate in provenance. This conservative policy may omit useful older replies; the inspector explains why. No hidden summaries or stateful provider sessions are reused.

Budgeting uses a deliberately conservative UTF-8 byte estimate, framing allowance, output reserve, and safety margin. Images reserve 4,096 tokens each. Exact tokenizers differ; estimates are labeled, and actual provider usage is recorded when returned. Source excerpts are explicitly truncated or excluded, and recent compatible history is selected within the remaining budget. A prompt whose mandatory material cannot fit is rejected. Long tool continuations can require a shorter new request or larger model; the harness reports this rather than sending an oversized prompt.

## Coding tools and approvals

The agent can read files, search authorized paths, propose an entire file's new contents as a diff, and request shell commands. It supports up to eight model steps and six tool calls per step. Stop generation cancels the provider request, pending approvals, and the process group of a running command.

File tools are limited to this conversation's enabled file/folder grants. Explicitly disabled paths take precedence over overlapping folder grants. Traversal, symlink escapes, binary files, credentials, Git internals, build output, and application state are excluded. Text reads are bounded. File writes use a temporary file and atomic rename; approval rechecks the context revision and original file hash, preserving existing file permissions. Parent folders must already exist.

Every write presents a diff, and every terminal command presents the exact command and reason. Neither can execute without the separate browser approval. Terminal is blocked by default. **An approved shell command runs as your OS user; it is not an OS sandbox and can access files beyond the context grants.** Commands receive a reduced environment without provider keys, have a 60-second timeout and bounded output, and have persistent execution/approval records. Review destructive commands before approving. The application never provides an approval tool to a model.

## Persistence and security boundaries

SQLite runs in WAL mode with foreign keys, busy timeout, indexes, and a versioned migration. Workspaces, conversations, messages, profiles, source configurations, model settings, memories, invocation snapshots, tool executions, and decisions persist across restarts. Interrupted generations/approvals are marked stopped/denied on startup; they never resume invisibly.

Provider keys are AES-256-GCM encrypted. The local `vault.key` and SQLite database use private filesystem permissions. Protect and back up **both** the data directory and key: encryption does not protect against an attacker who can read the key as your OS account. Known keys and common credential patterns are redacted from context, results, and inspected content; arbitrary secrets cannot be recognized perfectly, so choose source files carefully.

The backend binds only to loopback, checks Host and Origin, uses an HttpOnly SameSite session cookie and a CSRF header for mutations, and sets security headers. No arbitrary CORS, remote login, telemetry, CDN fonts, or hosted storage is required. The production frontend uses a Content Security Policy. This is a **single-user local application**, not a multi-user internet service; do not expose it through a public proxy. It is not an OS-level adversarial process sandbox.

Back up the data directory while stopped. For a running database use SQLite's backup facility; do not copy only the `.sqlite` file while its WAL contains pending changes.

## Architecture

```text
src/                   React workspace, sidebar, composer, dialogs, inspector
server/schema.ts       Shared types and Zod request validation
server/store.ts        SQLite migrations, records, transactions
server/context.ts      Fresh context resolution, isolation, provenance, budgets
server/retrieval.ts     Bounded lexical search of authorized paths
server/providers.ts    Provider discovery, request adapters, streaming parsers
server/agent.ts        Session execution, cancellation, model/tool loop
server/tools.ts        Permission checks, approvals, diffs, file/command execution
server/security.ts     Path boundaries, vault encryption, credential redaction
server/app.ts          Local authenticated API and production frontend serving
tests/                 Backend/integration tests and HTTP protocol fixture
e2e/                   Chromium tests with isolated temporary workspaces
```

Retrieval is a fresh, bounded lexical scan (up to 2,000 candidate files; per-directory traversal limits also apply). It is suitable for local projects and prioritizes permission correctness. Embedding indexes, automatic summaries, git worktrees, language servers, and multi-agent/model review orchestration are future extensions, not claimed features.

## Verify

```bash
npm run check
npm test
npm run build
npm run test:production
npm run test:e2e
```

Browser tests use an existing `/usr/bin/chromium` when available. Otherwise install Playwright Chromium with `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_PATH` to your executable. CI installs Playwright's browser. Screenshots are written to ignored `artifacts/`; failure traces and HTML reports are also ignored.

The test provider is a **deterministic HTTP protocol fixture**, created only by tests, never shipped as an application provider. Tests verify real network requests containing the actual composed context, persistence, cancellation, and controlled filesystem changes. They do **not** prove neural reasoning quality or a live hosted/local model connection. See [VERIFICATION.md](VERIFICATION.md) for the recorded verification scope.

## Shortcuts

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
