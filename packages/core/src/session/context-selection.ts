export * as SessionContextSelection from "./context-selection.js"

import { LLMRequest, Message } from "@opencode/ai"
import { ContextSelection } from "@opencode/schema/context-selection"
import {
  contextTurns,
  estimateContextTokens,
  initialContextState,
  readContextState,
  selectContextMessages,
  selectRequestMessages,
} from "@opencode/util/context-selection"
import { Effect, Schema } from "effect"
import { Form } from "../form.js"
import { SessionStore } from "./store.js"
import type { SessionSchema } from "./schema.js"
import type { SessionMessage } from "./message.js"

export const state = (metadata: SessionSchema.Info["metadata"]) =>
  readContextState(ContextSelection.State, metadata?.[ContextSelection.KEY], initialContextState())

export const configuration = (metadata: SessionSchema.Info["metadata"]) => {
  const value = state(metadata)
  return value.configurations.find((item) => item.id === value.active)!
}

export const select = (messages: readonly SessionMessage.Info[], metadata: SessionSchema.Info["metadata"]) =>
  selectContextMessages(messages, configuration(metadata).excluded)

export const preview = (request: LLMRequest, contextLimit: number, kind: string, defaultOutputTokens = 0) =>
  Schema.decodeUnknownSync(Schema.fromJsonString(ContextSelection.Review))(
    JSON.stringify({
      system: request.system,
      messages: request.messages,
      tools: request.tools,
      outputTokens: request.generation?.maxTokens ?? defaultOutputTokens,
      contextLimit,
      kind,
      model: request.model.id,
      estimated: true,
    }),
  )

/** Captures existing services; each invocation reviews one physical provider request. */
export const makeReview = Effect.gen(function* () {
  const forms = yield* Form.Service
  const store = yield* SessionStore.Service
  return Effect.fn("SessionContextSelection.review")(function* (input: {
    sessionID: SessionSchema.ID
    kind: string
    contextLimit: number
    outputLimit: number
    request: LLMRequest
  }) {
    const session = yield* store.get(input.sessionID)
    const current = configuration(session?.metadata)
    if (current.mode !== "manual") return input.request
    const history = yield* store.context(input.sessionID).pipe(Effect.orDie)
    const present = new Set(
      input.request.messages.filter((message) => message.role === "user").map((message) => message.id),
    )
    const eligible = contextTurns(history).filter((turn) => !turn.locked && present.has(turn.id))
    const answer = yield* forms
      .ask({
        sessionID: input.sessionID,
        title: "Review context before inference",
        metadata: {
          kind: "context.review",
          preview: preview(input.request, input.contextLimit, input.kind, input.outputLimit),
        },
        fields: [
          {
            key: "decision",
            type: "string",
            required: true,
            custom: false,
            options: [
              { value: "approve", label: "Approve request" },
              { value: "cancel", label: "Cancel request" },
            ],
          },
          {
            key: "excluded",
            type: "multiselect",
            options: eligible.map((turn) => ({ value: turn.id, label: turn.id })),
            default: [],
          },
          { key: "note", type: "string", maxLength: 100_000, default: "" },
        ],
      })
      .pipe(Effect.orDie)
    if (answer.status !== "answered" || answer.answer.decision !== "approve") return yield* Effect.interrupt
    const excluded = Array.isArray(answer.answer.excluded) ? answer.answer.excluded : []
    const note = typeof answer.answer.note === "string" ? answer.answer.note : ""
    const messages = selectRequestMessages(
      input.request.messages,
      eligible.map((turn) => turn.id),
      excluded,
    )
    const request = LLMRequest.update(input.request, {
      messages: [...messages, ...(note ? [Message.user(`User-provided context note:\n${note}`)] : [])],
    })
    // This is an estimate. The provider remains authoritative, and normal overflow recovery still applies.
    const inputTokens = estimateContextTokens({
      system: request.system,
      messages: request.messages,
      tools: request.tools,
    })
    yield* Effect.logDebug("context reviewed", { sessionID: input.sessionID, inputTokens, estimated: true })
    return request
  })
})
