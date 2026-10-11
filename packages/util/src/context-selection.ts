import { Option, Schema } from "effect"

// Runtime helpers accept the shared contract structurally, keeping Util independent of Schema and Core.
export type Configuration = {
  readonly id: string
  readonly name: string
  readonly mode: "automatic" | "manual"
  readonly excluded: readonly string[]
  readonly summary: string
  readonly outputTokens?: number
}

export type HistoryMessage = {
  readonly id: string
  readonly type: string
  readonly content?: readonly { readonly type: string; readonly state?: object }[]
}

const protectedTypes = new Set([
  "system",
  "compaction",
  "model-switched",
  "agent-switched",
  "location-switched",
  "idle",
])

/** A user request and all its assistant/tool continuations form one selectable unit. */
export function contextTurns<M extends HistoryMessage>(messages: readonly M[]) {
  const starts = messages.flatMap((message, index) => (message.type === "user" ? [index] : []))
  return starts.map((start, index) => {
    const items = messages.slice(start, starts[index + 1] ?? messages.length)
    return {
      id: messages[start].id,
      messages: items,
      locked:
        index === starts.length - 1 ||
        items.some((message) =>
          message.content?.some(
            (part) =>
              part.type === "tool" &&
              part.state &&
              "status" in part.state &&
              part.state.status !== "completed" &&
              part.state.status !== "error",
          ),
        ),
    }
  })
}

export function selectContextMessages<M extends HistoryMessage>(messages: readonly M[], excluded: readonly string[]) {
  if (excluded.length === 0) return messages
  const disabled = new Set(excluded)
  const omitted = new Set(
    contextTurns(messages)
      .filter((turn) => !turn.locked && disabled.has(turn.id))
      .flatMap((turn) =>
        turn.messages.filter((message) => !protectedTypes.has(message.type)).map((message) => message.id),
      ),
  )
  return messages.filter((message) => !omitted.has(message.id))
}

export function initialContextState() {
  return {
    version: 1 as const,
    active: "coding",
    configurations: ["Coding", "Debugging", "Architecture", "Testing", "Research"].map((name) => ({
      id: name.toLowerCase(),
      name,
      mode: "automatic" as "automatic" | "manual",
      excluded: [] as string[],
      summary: "",
    })),
    snapshots: [] as { id: string; name: string; created: number; configuration: Configuration }[],
  }
}

export function readContextState<
  S extends { readonly active: string; readonly configurations: readonly Configuration[] },
>(schema: Schema.Codec<S>, value: unknown, fallback: S) {
  const parsed = Schema.decodeUnknownOption(schema)(value)
  if (Option.isNone(parsed)) return fallback
  return parsed.value.configurations.some((item) => item.id === parsed.value.active) ? parsed.value : fallback
}

export function compareContexts(left: Configuration, right: Configuration) {
  return {
    onlyLeft: left.excluded.filter((id) => !right.excluded.includes(id)),
    onlyRight: right.excluded.filter((id) => !left.excluded.includes(id)),
    summaryChanged: left.summary !== right.summary,
    modeChanged: left.mode !== right.mode,
    outputChanged: left.outputTokens !== right.outputTokens,
  }
}

/** Canonical messages retain whole tool exchanges, including result messages without IDs. */
export function selectRequestMessages<M extends { readonly id?: string; readonly role: string }>(
  messages: readonly M[],
  eligible: readonly string[],
  excluded: readonly string[],
) {
  const allowed = new Set(eligible)
  const disabled = new Set(excluded)
  let omitted = false
  return messages.filter((message) => {
    if (message.role === "user") omitted = !!message.id && allowed.has(message.id) && disabled.has(message.id)
    return message.role === "system" || !omitted
  })
}

/** Text/JSON estimate, including a small message envelope allowance. Media requires provider accounting. */
export function estimateContextTokens(value: unknown) {
  return Math.ceil(JSON.stringify(value).length / 4)
}
