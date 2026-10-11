# Architecture and context integration

Source: anomalyco/opencode, commit `e31136bdbdb43e934d8bbd81e75a2065a2625699` (see `upstream/SOURCE.json`). The imported version is 2.0.26 and uses the current V2 architecture. Older descriptions involving `packages/opencode/src/session/llm.ts` do not apply to this revision.

## Existing modules

| Responsibility                   | Modules                                                                                                                                | Role                                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API and generated clients | `packages/protocol/src/groups/session.ts`, `packages/server/src/handlers/session.ts`, `packages/client`                                | Authenticated, location-scoped session APIs and typed clients                                                                                 |
| Session admission and storage    | `packages/core/src/session.ts`, `session/session.ts`, `session/inbox.ts`, `session/store.ts`, `session/projector.ts`, `session/sql.ts` | Durable events, SQLite projections, queued/steered work and conversation history                                                              |
| Autonomous execution             | `session/execution.ts`, `session/run-coordinator.ts`, `session/runner/llm.ts`                                                          | Process ownership, drain loop, retries, continuation and overflow recovery                                                                    |
| Context and instructions         | `session/context.ts`, `session/history.ts`, `session/instruction-state.ts`, `session/instructions.ts`, `instructions/*`                | Permission-scoped tools/instructions and provider-compatible history windows                                                                  |
| Final request construction       | `session/model-request.ts`, `session/runner/to-llm-message.ts`                                                                         | Convert durable messages, run request hooks, assemble system/messages/tools/generation/provider options, enforce media/provenance constraints |
| Physical requests                | `session/runner/step.ts`, `session/title.ts`, `session/generate.ts`, `session/compaction.ts`                                           | Primary streaming, auxiliary title/generation, summary and native compaction requests                                                         |
| Provider transport               | `packages/ai/src/llm.ts`, `packages/ai/src/route/*`, `session/model-transport.ts`                                                      | Canonical request lowering, HTTP/WebSocket transport, provider requirements                                                                   |
| Tools and permissions            | `packages/core/src/tool.ts`, `tool/*`, `permission.ts`, `session/runner/step.ts`                                                       | Advertised tool snapshot, permission checks, concurrent tool runs, result settlement                                                          |
| Token accounting                 | `session/compaction.ts`, `session/usage.ts`, `packages/core/src/util/token.ts`, `packages/schema/src/token-usage.ts`                   | Provider-reported usage plus text estimates and overflow recovery                                                                             |
| Frontend                         | `packages/app/src/session/screen.tsx`, `session/model.ts`, `session/timeline/*`, `packages/session-ui`, `packages/ui`                  | SolidJS session screen, virtualized history, shared UI, CSS theme tokens and typed event synchronization                                      |

## Exact inference boundary

`SessionContext.load` reads provider-compatible history. The drain loop calls `SessionModelRequest.baseTranscript`, which constructs the protected system prefix and uses `toLLMMessages` to convert session messages, including paired tool calls/results and provider-specific metadata.

`SessionModelRequest.prepare` is the shared final builder. Its `LLM.request({...})` call assembles `system`, `messages`, `tools`, `toolChoice`, `generation`, and `providerOptions`; `LLMRequest.update` then applies route/header hooks and validates native checkpoint provenance. The primary request reaches the provider at `SessionStep.attempt`'s `llm.stream(reviewed, prepared.options)` call. Transport adapters subsequently lower the canonical request into each provider's wire format.

## Implemented integration

1. `packages/schema/src/context-selection.ts` defines versioned configurations, snapshots and the safe request preview. No Core dependencies enter browser code.
2. `packages/util/src/context-selection.ts` groups turns and filters immutable views. Original durable messages are not rewritten or removed. System/control/checkpoint messages survive exclusion. The newest request and unfinished tool exchanges remain locked.
3. `packages/core/src/session/context-selection.ts` reads the active selection and supplies a review closure using the real SessionStore and Form services.
4. `SessionContext.load`, generation, title history and manual/native compaction use selected history. Context changes invalidate the previous measured prompt anchor, making compaction recompute an estimate instead of labeling a stale provider count as current usage.
5. `SessionModelRequest.prepare` adds supplemental summaries as user content and caps primary/summary output tokens at the requested reservation while retaining model limits and plugin hooks. Auxiliary title/generate requests retain upstream generation defaults; previews reserve their catalog output limit when no explicit cap is set.
6. `Prepared.review` intercepts each physical request immediately before inference. Primary attempts, continuation/retry attempts, titles, generation, summary retries/nudges and native compaction each invoke it. Automatic mode returns the canonical request immediately. Manual mode publishes a `context.review` Form and waits for an explicit answer; cancellation interrupts the request. No response means no inference.
7. Approval permits removal only of eligible complete turns and addition of a user note. Protected system content, tool definitions, route/auth headers, provider options, and permissions are not editable. Result messages lacking IDs are filtered with the assistant exchange that owns them.
8. `GET /api/session/:sessionID/context/preview` returns the current canonical primary preview without calling an LLM. It uses existing authentication and session-location middleware. Generated client surfaces are produced by `bun run generate` in `packages/client`.
9. `packages/app/src/session/context-sidebar.tsx` integrates a lazy panel into the existing screen. The panel reads actual system/tool content, shows selectable loaded history, renders token estimates, and handles review forms for the session and its child sessions.

## Persistence and scope

The existing `session.update` API persists the versioned value under `session.metadata["context-harness"]`. Metadata changes use the existing durable event/projection path. Each context stores its own exclusions, mode, summary and output reservation. Snapshots contain independent copies of configurations and reference stable message IDs; history remains in the session database. Contexts are session-scoped, with upstream metadata inheritance for children.

The initial selector deliberately uses complete turns, rather than individual tool parts. Checkpoint contents may already summarize older information, so excluding original messages cannot remove information embedded inside a protected summary/native window. The UI states this scope. A future part selector would need dependency closure plus fresh summaries when content is redacted.

Automatic previews are point-in-time primary previews; new inbox deliveries, instruction discoveries, agent step limits, plugins, or provider transport lowering may change the eventual request. Manual review shows the actual canonical physical request, including compaction prompts appended after request preparation. Ephemeral approvals are never restored as approved after restart; the normal session execution recovery mechanism requests fresh approval when it resumes.

The provider abstraction currently has no shared preflight counting endpoint. Estimates use serialized text/JSON and remain labeled estimates, including in the budget dashboard. Previous measured provider usage is displayed separately. Overflow warnings are advisory; existing automatic compaction and provider overflow recovery remain authoritative.
