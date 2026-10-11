# Context Harness

An independent AI coding harness based on [OpenCode](https://github.com/anomalyco/opencode), with interactive control over inference context. The project name can be changed in a future release.

The source was imported from a pinned archive without upstream Git history. [vishal88736/context-harness](https://github.com/vishal88736/context-harness) was created directly as a public repository with a fresh history. GitHub reports `fork: false`; it has no upstream fork relationship.

## Run locally

Use Bun **1.4.2**, as pinned in `package.json`.

```sh
bun install --frozen-lockfile
bun dev serve --port 4096
```

In a second terminal:

```sh
cd packages/app
bun dev -- --port 4444
```

Open http://localhost:4444 and connect to the local server at http://localhost:4096 using the local password printed by the server. Configure your model provider through the existing provider settings. Provider credentials remain in local server storage and must not be committed.

Open a session and select **Context** in its header. Choose a named configuration, include or exclude completed turns, add a summary, and reserve output capacity. The current task, system instructions, tool dependencies, and provider checkpoints remain protected. Configuration choices and snapshots persist in the session database; switching contexts does not delete conversation history.

In **Manual approval** mode each physical LLM request waits for approval, including tool continuations, title generation, and summarization/native compaction. Inspect the canonical preview, remove eligible turns, or add a note, then approve or cancel. Edits to a pending request apply to that request; configuration changes apply to subsequent requests.

## Current implementation

- Collapsible responsive context sidebar and five initial named contexts.
- Atomic turn selection, file/tool inspection, editable supplemental summaries, output reservations.
- Durable configurations; save, restore, duplicate, rename, and compare snapshots/configurations.
- Automatic canonical request preview, protected system instructions, tool definitions, token estimates, and last provider-reported input usage.
- Per-request approval through the existing Form/event system, with no permission bypass.
- Existing provider adapters, execution loop, permissions, storage, tool execution, and compaction remain in use.

Selection currently operates on completed turns, keeping tool calls and their results together. It does not redact individual parts inside a turn or information already contained in protected compaction checkpoints. Estimates are explicitly labeled: this provider abstraction exposes measured post-inference usage, rather than a general preflight token-count endpoint. Media and provider encodings can affect token counts. Automatic previews describe the current session; queued input and live instruction/tool changes can alter the next request.

## Development

```sh
# From packages/core
bun test test/session-runner.test.ts test/session-runner-message.test.ts test/session-runner-tool-events.test.ts test/session-compaction.test.ts

# From the root
bun run check
```

See [architecture and integration points](docs/ARCHITECTURE.md), [license review](docs/LICENSE_REVIEW.md), and [validation results](docs/VALIDATION.md).

## Attribution and repository status

Substantial existing code is OpenCode's work, Copyright (c) 2025 opencode, used under the MIT license. Its [license](LICENSE), original copyright notices, and bundled third-party notices remain intact. This project is not affiliated with Anomaly Innovations and does not claim to have authored the upstream implementation. OpenCode is a registered trademark of Anomaly Innovations, Inc.

[Source provenance](docs/upstream/SOURCE.json) identifies the exact imported revision. [The original upstream README](docs/upstream/README.md) is retained for reference. Upstream workflows are archived under `docs/upstream/workflows` so they cannot automatically deploy or publish this independent repository.

The web title, PWA name, root metadata, CLI description, and an executable alias use the Context Harness identity. Internal `@opencode/*` package names, protocol identifiers, storage conventions, provider names, and native packaging are retained for compatibility. Native release branding, icons, updater destinations, and publishing workflows require a separate release pass before shipping binaries.

The owner explicitly approved creating and pushing this public repository. The source import preserves upstream attribution; the independent Git history begins with this implementation.
