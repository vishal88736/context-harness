export * as ContextSelection from "./context-selection.js"

import { Schema } from "effect"
import { optional, PositiveInt, NonNegativeInt } from "./schema.js"

export const KEY = "context-harness"

export const Configuration = Schema.Struct({
  id: Schema.String,
  name: Schema.String.check(Schema.isMinLength(1)),
  mode: Schema.Literals(["automatic", "manual"]),
  excluded: Schema.Array(Schema.String),
  summary: Schema.String,
  outputTokens: PositiveInt.pipe(optional),
}).annotate({ identifier: "ContextSelection.Configuration" })
export interface Configuration extends Schema.Schema.Type<typeof Configuration> {}

export const Snapshot = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  created: Schema.Number,
  configuration: Configuration,
}).annotate({ identifier: "ContextSelection.Snapshot" })
export interface Snapshot extends Schema.Schema.Type<typeof Snapshot> {}

export const State = Schema.Struct({
  version: Schema.Literal(1),
  active: Schema.String,
  configurations: Schema.Array(Configuration).check(Schema.isMinLength(1)),
  snapshots: Schema.Array(Snapshot),
}).annotate({ identifier: "ContextSelection.State" })
export interface State extends Schema.Schema.Type<typeof State> {}

export const Review = Schema.Struct({
  system: Schema.Array(Schema.Struct({ text: Schema.String })),
  messages: Schema.Array(
    Schema.Struct({
      id: Schema.String.pipe(optional),
      role: Schema.String,
      content: Schema.Array(Schema.Json),
    }),
  ),
  tools: Schema.Array(Schema.Json),
  outputTokens: NonNegativeInt,
  contextLimit: NonNegativeInt,
  kind: Schema.String,
  model: Schema.String,
  estimated: Schema.Boolean,
}).annotate({ identifier: "ContextSelection.Review" })
export interface Review extends Schema.Schema.Type<typeof Review> {}
