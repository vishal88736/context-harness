export * as SessionGenerate from "./generate.js"

import type { FileSystem } from "../filesystem.js"
import { LLMClient, Message, type AIError } from "@opencode/ai"
import { Effect } from "effect"
import { Database } from "../database/database.js"
import { Instance } from "../instance/service.js"
import { Plugin } from "../plugin/service.js"
import type { Instructions } from "../instructions/index.js"
import { SessionContext } from "./context.js"
import type { AgentNotFoundError } from "./error.js"
import { SessionHistory } from "./history.js"
import { SessionProviderContext } from "./provider-context.js"
import { SessionModelRequest } from "./model-request.js"
import type { SessionRunnerModel } from "./runner/model.js"
import type { SessionSchema } from "./schema.js"
import { SessionContextSelection } from "./context-selection.js"

export type Error =
  | AgentNotFoundError
  | Instructions.InitializationBlocked
  | SessionRunnerModel.Error
  | AIError
  | FileSystem.DirectoryNotFoundError

/** The preview and generation use the same permission-scoped transcript and provider lowering. */
const prepare = Effect.fn("SessionGenerate.prepare")(function* (input: {
  session: SessionSchema.Info
  prompt?: string
}) {
  const instances = yield* Instance.Service
  const database = yield* Database.Service

  return yield* Effect.gen(function* () {
    yield* Plugin.awaitActivation
    const context = yield* SessionContext.Service
    const selection = yield* context.select(input.session.id)
    const model = yield* context.resolveModel(selection.session)
    const history = yield* SessionHistory.preview(
      database.db,
      selection.session.id,
      selection.instructions,
      SessionProviderContext.provenance(model) ?? "local",
    )
    const transcript = SessionModelRequest.baseTranscript({
      agent: selection.agent.info,
      model,
      tools: selection.tools,
      initial: history.initial,
      messages: SessionContextSelection.select(history.messages, selection.session.metadata),
    })
    const prepared = yield* context.request[input.prompt === undefined ? "primary" : "generate"]({
      session: selection.session,
      agent: selection.agent.id,
      model,
      tools: selection.tools,
      system: transcript.system,
      messages: [
        ...transcript.messages,
        ...(history.instructionUpdate ? [Message.system(history.instructionUpdate)] : []),
        ...(input.prompt === undefined ? [] : [Message.user(input.prompt)]),
      ],
    })
    return { prepared, model }
  }).pipe(instances.provide(input.session))
})

export const preview = Effect.fn("SessionGenerate.preview")(function* (session: SessionSchema.Info) {
  const result = yield* prepare({ session })
  return SessionContextSelection.preview(
    result.prepared.request,
    result.model.limit.context,
    "primary",
    result.model.limit.output,
  )
})

/** Generates text from current Session context without mutating the Session. */
export const generate = Effect.fn("SessionGenerate.generate")(function* (input: {
  session: SessionSchema.Info
  prompt: string
}) {
  const llm = yield* LLMClient.Service
  const result = yield* prepare(input)
  yield* Effect.logInfo("sending session generation request", {
    sessionID: input.session.id,
    providerID: result.model.ref.providerID,
    modelID: result.model.ref.id,
  })
  const reviewed = yield* result.prepared.review(result.prepared.request)
  const response = yield* llm.generate(reviewed, result.prepared.options)
  yield* Effect.logInfo("session generation usage diagnostic", { usage: response.usage })
  return response.text
})
