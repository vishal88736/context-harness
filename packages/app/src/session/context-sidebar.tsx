import { For, Show, createEffect, createMemo, createResource } from "solid-js"
import { createStore, unwrap } from "solid-js/store"
import { Option, Schema, type Types } from "effect"
import type { FormInfo, SessionMessageInfo } from "@opencode/client/promise"
import { ContextSelection } from "@opencode/schema/context-selection"
import {
  compareContexts,
  contextTurns,
  estimateContextTokens,
  initialContextState,
  readContextState,
  selectContextMessages,
  selectRequestMessages,
} from "@opencode/util/context-selection"
import { useLanguage } from "@/runtime/i18n/language"
import { useData } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { useProviders } from "@/providers/catalog/providers"
import { sessionTreeIDs } from "./requests/session-request-tree"
import type { SessionModel } from "./model"
import "./context-sidebar.css"

function messageText(message: SessionMessageInfo): string {
  if (message.type === "assistant")
    return message.content
      .map((part) => {
        if (part.type !== "tool") return part.text

        return `${part.name}\n${JSON.stringify(part.state)}`
      })
      .join("\n")

  if (message.type === "shell") return `${message.command}\n${message.output?.output ?? ""}`

  if (message.type === "compaction") return "summary" in message ? message.summary : ""

  return "text" in message ? message.text : ""
}

export function ContextSidebar(props: { session: SessionModel }) {
  const language = useLanguage()
  const data = useData()
  const [store, setStore] = createStore({ opened: false })

  const reviews = createMemo(() => {
    const id = props.session.identity.sessionID()

    return id
      ? sessionTreeIDs(data.session.list(), id)
          .flatMap((sessionID) => data.session.form.list(sessionID))
          .filter((form): form is NonNullable<typeof form> => !!form && form.metadata?.kind === "context.review")
      : []
  })

  createEffect(() => {
    if (reviews().length) setStore("opened", true)
  })

  return (
    <Show when={props.session.identity.sessionID()}>
      <button
        type="button"
        class="context-toggle"
        aria-expanded={store.opened}
        aria-controls="context-sidebar"
        onClick={() => setStore("opened", !store.opened)}
      >
        {language.t("context.title")}
        <Show when={reviews().length}>
          <span class="context-pending">{reviews().length}</span>
        </Show>
      </button>
      <Show when={store.opened}>
        <ContextSidebarPanel session={props.session} reviews={reviews()} onClose={() => setStore("opened", false)} />
      </Show>
    </Show>
  )
}

function ContextSidebarPanel(props: { session: SessionModel; reviews: FormInfo[]; onClose: () => void }) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const providers = useProviders(props.session.workspace.directory)
  const initial: ContextSelection.State = initialContextState()

  const [store, setStore] = createStore({
    value: initial,
    busy: false,
    error: "",
    name: "",
    snapshot: "",
    compare: "",
    reviewID: "",
    excluded: Array<string>(),
    note: "",
  })

  createEffect(() =>
    setStore(
      "value",
      readContextState(
        ContextSelection.State,
        props.session.data.info()?.metadata?.[ContextSelection.KEY],
        initialContextState(),
      ),
    ),
  )
  const active = createMemo(() => store.value.configurations.find((item) => item.id === store.value.active)!)
  const turns = createMemo(() => contextTurns(props.session.history.messages()))
  const selected = createMemo(() => selectContextMessages(props.session.history.messages(), active().excluded))
  const request = createMemo(() => props.reviews.find((form) => form.id === store.reviewID) ?? props.reviews[0])
  createEffect(() => {
    const id = request()?.id
    setStore("reviewID", id ?? "")
    setStore("excluded", [])
    setStore("note", "")
  })

  const review = createMemo(() => {
    const parsed = Schema.decodeUnknownOption(ContextSelection.Review)(request()?.metadata?.preview)

    return Option.isSome(parsed) ? parsed.value : undefined
  })

  const eligible = createMemo(() =>
    request()?.fields.find((field) => field.key === "excluded" && field.type === "multiselect"),
  )

  const eligibleIDs = createMemo(() => {
    const field = eligible()

    return field?.type === "multiselect" ? field.options.map((option) => option.value) : []
  })

  const [automaticPreview] = createResource(
    () => {
      const sessionID = props.session.identity.sessionID()
      const messages = props.session.history.messages()
      const last = messages.at(-1)

      return sessionID && !store.busy && !request()
        ? {
            sessionID,
            revision: JSON.stringify(store.value),
            messageID: last?.id,
            completed: last?.type === "assistant" ? last.time.completed : undefined,
          }
        : false
    },
    (input) => sdk.api.session.previewContext({ sessionID: input.sessionID }),
  )

  const preview = createMemo(() => {
    const value = review() ?? automaticPreview()

    if (!value) return undefined

    return {
      ...value,
      messages: [
        ...selectRequestMessages(value.messages, eligibleIDs(), store.excluded),
        ...(store.note
          ? [{ role: "user", content: [{ type: "text", text: `User-provided context note:\n${store.note}` }] }]
          : []),
      ],
    }
  })

  const model = createMemo(() => {
    const ref =
      props.session.data.info()?.model ??
      props.session.history.messages().findLast((message) => message.type === "assistant")?.model

    return ref ? providers.all().get(ref.providerID)?.models[ref.id] : undefined
  })

  const budget = createMemo(() => {
    const value = preview()

    const messages =
      value?.messages ?? selected().map((message) => ({ type: message.type, text: messageText(message) }))

    const input =
      estimateContextTokens({ messages, summary: value ? "" : active().summary }) +
      (value ? estimateContextTokens({ system: value.system, tools: value.tools }) : 0)

    const output = value?.outputTokens ?? Math.min(active().outputTokens ?? Infinity, model()?.limit.output || 32_000)
    const limit = value?.contextLimit ?? model()?.limit.context ?? 0

    const last = props.session.history
      .messages()
      .findLast((message) => message.type === "assistant" && !!message.tokens)

    const measured =
      last?.type === "assistant" && last.tokens
        ? last.tokens.input + last.tokens.cache.read + last.tokens.cache.write
        : undefined

    return {
      input,
      output,
      limit,
      remaining: limit - input - output,
      complete: !!value,
      measured,
      system: value ? estimateContextTokens(value.system) : undefined,
      tools: value ? estimateContextTokens(value.tools) : undefined,
    }
  })

  const snapshot = createMemo(() => store.value.snapshots.find((item) => item.id === store.snapshot))

  const compared = createMemo(
    () =>
      store.value.configurations.find((item) => item.id === store.compare) ??
      store.value.snapshots.find((item) => item.id === store.compare)?.configuration,
  )

  const difference = createMemo(() => (compared() ? compareContexts(active(), compared()!) : undefined))

  const save = (value: ContextSelection.State) => {
    const sessionID = props.session.identity.sessionID()

    if (!sessionID || store.busy) return
    setStore("busy", true)
    setStore("error", "")
    setStore("value", value)
    void sdk.api.session
      .get({ sessionID })
      .then((session) =>
        sdk.api.session.update({
          sessionID,
          metadata: {
            ...session.metadata,
            // SAFETY: The validated JSON contract is serialized by the client, which declares JSON arrays mutable.
            [ContextSelection.KEY]: Schema.encodeSync(ContextSelection.State)(
              value,
            ) as Types.DeepMutable<ContextSelection.State>,
          },
        }),
      )
      .catch(() => {
        setStore("error", language.t("context.saveFailed"))
        setStore(
          "value",
          readContextState(
            ContextSelection.State,
            props.session.data.info()?.metadata?.[ContextSelection.KEY],
            initialContextState(),
          ),
        )
      })
      .finally(() => setStore("busy", false))
  }

  const update = (change: Partial<ContextSelection.Configuration>) =>
    save({
      ...store.value,
      configurations: store.value.configurations.map((item) =>
        item.id === active().id ? { ...item, ...change } : item,
      ),
    })

  const reply = (decision: "approve" | "cancel") => {
    const form = request()

    if (!form || store.busy) return
    setStore("busy", true)
    setStore("error", "")
    void sdk.api.session.form
      .reply({
        sessionID: form.sessionID,
        formID: form.id,
        answer: {
          decision,
          excluded: [...store.excluded],
          note: store.note,
        },
      })
      .catch(() => setStore("error", language.t("context.approvalFailed")))
      .finally(() => setStore("busy", false))
  }

  return (
    <aside id="context-sidebar" class="context-sidebar" aria-label={language.t("context.title")}>
      <header>
        <strong>{language.t("context.title")}</strong>
        <button type="button" onClick={props.onClose} aria-label={language.t("context.close")}>
          ×
        </button>
      </header>
      <div class="context-body">
        <Show when={store.error}>
          <p role="alert">{store.error}</p>
        </Show>
        <Show when={automaticPreview.error && !request()}>
          <p role="alert">{language.t("context.previewFailed")}</p>
        </Show>
        <fieldset disabled={store.busy}>
          <label>
            {language.t("context.configuration")}
            <select
              value={store.value.active}
              onChange={(event) => save({ ...store.value, active: event.currentTarget.value })}
            >
              <For each={store.value.configurations}>{(item) => <option value={item.id}>{item.name}</option>}</For>
            </select>
          </label>
          <label>
            {language.t("context.mode")}
            <select
              value={active().mode}
              onChange={(event) => update({ mode: event.currentTarget.value === "manual" ? "manual" : "automatic" })}
            >
              <option value="automatic">{language.t("context.automatic")}</option>
              <option value="manual">{language.t("context.manual")}</option>
            </select>
          </label>
          <p class="context-hint">{language.t("context.modeHint")}</p>
          <details>
            <summary>{language.t("context.manage")}</summary>
            <input
              aria-label={language.t("context.name")}
              placeholder={language.t("context.name")}
              value={store.name}
              onInput={(event) => setStore("name", event.currentTarget.value)}
            />
            <div class="context-actions">
              <button
                type="button"
                disabled={!store.name.trim()}
                onClick={() => {
                  const id = crypto.randomUUID()
                  save({
                    ...store.value,
                    active: id,
                    configurations: [
                      ...store.value.configurations,
                      { ...active(), id, name: store.name.trim(), excluded: [], summary: "" },
                    ],
                  })
                }}
              >
                {language.t("context.create")}
              </button>
              <button type="button" disabled={!store.name.trim()} onClick={() => update({ name: store.name.trim() })}>
                {language.t("context.rename")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = crypto.randomUUID()
                  save({
                    ...store.value,
                    active: id,
                    configurations: [
                      ...store.value.configurations,
                      {
                        ...structuredClone(unwrap(active())),
                        id,
                        name: store.name.trim() || language.t("context.copyName", { name: active().name }),
                      },
                    ],
                  })
                }}
              >
                {language.t("context.duplicate")}
              </button>
            </div>
          </details>
          <label>
            {language.t("context.summary")}
            <textarea value={active().summary} onChange={(event) => update({ summary: event.currentTarget.value })} />
          </label>
          <label>
            {language.t("context.output")}
            <input
              type="number"
              min="1"
              placeholder={language.t("context.modelDefault")}
              value={active().outputTokens ?? ""}
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber
                const next = { ...active() }

                if (Number.isInteger(value) && value > 0) next.outputTokens = value

                if (!event.currentTarget.value) delete next.outputTokens
                update(next)
              }}
            />
          </label>
        </fieldset>
        <section class="context-budget" aria-label={language.t("context.budget")}>
          <strong>{language.t("context.budget")}</strong>
          <dl>
            <dt>{language.t("context.limit")}</dt>
            <dd>{budget().limit || language.t("context.unknown")}</dd>
            <dt>{language.t("context.input")}</dt>
            <dd>≈ {budget().input.toLocaleString()}</dd>
            <dt>{language.t("context.output")}</dt>
            <dd>{budget().output.toLocaleString()}</dd>
            <dt>{language.t("context.remaining")}</dt>
            <dd>{budget().limit ? budget().remaining.toLocaleString() : language.t("context.unknown")}</dd>
            <dt>{language.t("context.system")}</dt>
            <dd>{budget().system === undefined ? language.t("context.unknown") : `≈ ${budget().system}`}</dd>
            <dt>{language.t("context.tools")}</dt>
            <dd>{budget().tools === undefined ? language.t("context.unknown") : `≈ ${budget().tools}`}</dd>
            <Show when={budget().measured !== undefined}>
              <dt>{language.t("context.measured")}</dt>
              <dd>{budget().measured?.toLocaleString()}</dd>
            </Show>
          </dl>
          <Show when={budget().limit}>
            <progress
              max={budget().limit}
              value={Math.min(budget().limit, budget().input + budget().output)}
              aria-label={language.t("context.budget")}
            />
          </Show>
          <p class="context-hint">
            {language.t(budget().complete ? "context.estimateHint" : "context.partialEstimate")}
          </p>
          <Show when={budget().limit && budget().remaining < 0}>
            <p role="alert">{language.t("context.overflow")}</p>
          </Show>
        </section>
        <Show when={request()}>
          <section class="context-review">
            <strong>{language.t("context.pending")}</strong>
            <Show when={props.reviews.length > 1}>
              <select
                aria-label={language.t("context.pending")}
                value={request()?.id}
                onChange={(event) => setStore("reviewID", event.currentTarget.value)}
              >
                <For each={props.reviews}>
                  {(form) => (
                    <option value={form.id}>
                      {form.sessionID} · {form.id}
                    </option>
                  )}
                </For>
              </select>
            </Show>
            <p class="context-hint">{language.t("context.reviewHint")}</p>
            <label>
              {language.t("context.note")}
              <textarea
                value={store.note}
                onInput={(event) => setStore("note", event.currentTarget.value)}
                disabled={store.busy}
              />
            </label>
            <div class="context-actions">
              <button type="button" disabled={store.busy || !preview()} onClick={() => reply("approve")}>
                {language.t("context.approve")}
              </button>
              <button type="button" disabled={store.busy} onClick={() => reply("cancel")}>
                {language.t("context.cancel")}
              </button>
            </div>
          </section>
        </Show>
        <details open>
          <summary>{language.t("context.messages")}</summary>
          <p class="context-hint">{language.t("context.selectionHint")}</p>
          <For each={turns()}>
            {(turn) => (
              <div class="context-turn">
                <label class="context-turn-label">
                  <input
                    type="checkbox"
                    checked={turn.locked || (!active().excluded.includes(turn.id) && !store.excluded.includes(turn.id))}
                    disabled={store.busy || turn.locked || (!!request() && !eligibleIDs().includes(turn.id))}
                    onChange={(event) => {
                      const list = request() ? store.excluded : active().excluded

                      const excluded = event.currentTarget.checked
                        ? list.filter((id) => id !== turn.id)
                        : [...list, turn.id]

                      if (request()) setStore("excluded", excluded)
                      else update({ excluded })
                    }}
                  />
                  <span>{messageText(turn.messages[0]).slice(0, 100) || language.t("context.attachments")}</span>
                  <small>≈ {estimateContextTokens(turn.messages.map(messageText))}</small>
                </label>
                <Show when={turn.locked}>
                  <small class="context-hint">{language.t("context.protected")}</small>
                </Show>
                <details>
                  <summary>{language.t("context.inspect")}</summary>
                  <For each={turn.messages}>
                    {(message) => (
                      <div>
                        <small>{message.type}</small>
                        <pre>{messageText(message)}</pre>
                        <Show when={message.type === "user" && message.files?.length}>
                          {message.type === "user" && (
                            <ul>
                              <For each={message.files}>
                                {(file) => (
                                  <li>{file.name ?? (file.source.type === "uri" ? file.source.uri : file.mime)}</li>
                                )}
                              </For>
                            </ul>
                          )}
                        </Show>
                      </div>
                    )}
                  </For>
                </details>
              </div>
            )}
          </For>
        </details>
        <details>
          <summary>{language.t("context.system")}</summary>
          <p class="context-hint">{language.t("context.systemHint")}</p>
          <Show when={preview()} fallback={<p>{language.t("context.systemPreviewHint")}</p>}>
            {(value) => (
              <pre>
                {value()
                  .system.map((part) => part.text)
                  .join("\n\n")}
              </pre>
            )}
          </Show>
        </details>
        <details>
          <summary>{language.t("context.preview")}</summary>
          <Show when={preview()} fallback={<pre>{selected().map(messageText).join("\n\n")}</pre>}>
            {(value) => (
              <pre>
                {JSON.stringify({ system: value().system, messages: value().messages, tools: value().tools }, null, 2)}
              </pre>
            )}
          </Show>
        </details>
        <details>
          <summary>{language.t("context.snapshots")}</summary>
          <fieldset disabled={store.busy}>
            <button
              type="button"
              onClick={() =>
                save({
                  ...store.value,
                  snapshots: [
                    ...store.value.snapshots,
                    {
                      id: crypto.randomUUID(),
                      name: store.name.trim() || active().name,
                      created: Date.now(),
                      configuration: structuredClone(unwrap(active())),
                    },
                  ],
                })
              }
            >
              {language.t("context.saveSnapshot")}
            </button>
            <select
              aria-label={language.t("context.snapshots")}
              value={store.snapshot}
              onChange={(event) => setStore("snapshot", event.currentTarget.value)}
            >
              <option value="">{language.t("context.chooseSnapshot")}</option>
              <For each={store.value.snapshots}>
                {(item) => (
                  <option value={item.id}>
                    {item.name} · {new Date(item.created).toLocaleString()}
                  </option>
                )}
              </For>
            </select>
            <div class="context-actions">
              <button
                type="button"
                disabled={!snapshot()}
                onClick={() => {
                  const item = snapshot()

                  if (item) update({ ...structuredClone(unwrap(item.configuration)), id: active().id })
                }}
              >
                {language.t("context.restore")}
              </button>
              <button
                type="button"
                disabled={!snapshot() || !store.name.trim()}
                onClick={() =>
                  save({
                    ...store.value,
                    snapshots: store.value.snapshots.map((item) =>
                      item.id === store.snapshot ? { ...item, name: store.name.trim() } : item,
                    ),
                  })
                }
              >
                {language.t("context.rename")}
              </button>
              <button
                type="button"
                disabled={!snapshot()}
                onClick={() => {
                  const item = snapshot()

                  if (item)
                    save({
                      ...store.value,
                      snapshots: [
                        ...store.value.snapshots,
                        {
                          ...structuredClone(unwrap(item)),
                          id: crypto.randomUUID(),
                          created: Date.now(),
                          name: language.t("context.copyName", { name: item.name }),
                        },
                      ],
                    })
                }}
              >
                {language.t("context.duplicate")}
              </button>
            </div>
          </fieldset>
          <label>
            {language.t("context.compare")}
            <select value={store.compare} onChange={(event) => setStore("compare", event.currentTarget.value)}>
              <option value="">{language.t("context.chooseCompare")}</option>
              <For each={store.value.configurations}>{(item) => <option value={item.id}>{item.name}</option>}</For>
              <For each={store.value.snapshots}>
                {(item) => (
                  <option value={item.id}>
                    {item.name} · {new Date(item.created).toLocaleString()}
                  </option>
                )}
              </For>
            </select>
          </label>
          <Show when={difference()}>
            {(value) => (
              <p>
                {language.t("context.difference", {
                  left: value().onlyLeft.length,
                  right: value().onlyRight.length,
                  summary: language.t(value().summaryChanged ? "context.changed" : "context.same"),
                  mode: language.t(value().modeChanged ? "context.changed" : "context.same"),
                  output: language.t(value().outputChanged ? "context.changed" : "context.same"),
                })}
              </p>
            )}
          </Show>
        </details>
      </div>
    </aside>
  )
}
