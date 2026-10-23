import { HttpError, redact, Vault } from "./security";
import type { Store } from "./store";
import { modelSchema } from "./schema";
import {
  geminiModelPath,
  nativePayload,
  nativeStream,
} from "./provider-adapters/native";
import { readPackets } from "./provider-adapters/stream";
import type {
  Model,
  Provider,
  Snapshot,
  ToolCall,
  ToolDefinition,
  WireMessage,
} from "./schema";

export interface Usage {
  input: number;
  output: number;
}
export interface ModelResult {
  content: string;
  calls: ToolCall[];
  usage?: Usage;
  continuation?: WireMessage;
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const capability = (value: unknown, name: string): boolean =>
  Array.isArray(value) && value.includes(name);

function discoveredModel(
  input: {
    id: unknown;
    name: unknown;
    contextWindow: unknown;
    tools: boolean;
    vision: boolean;
    maxOutputTokens?: unknown;
  },
  previous?: Model,
): Model | null {
  const identifier = modelSchema.shape.id.safeParse(input.id);
  if (!identifier.success || !identifier.data.trim()) return null;
  const name = modelSchema.shape.name.safeParse(input.name);
  const reportedLimit = modelSchema.shape.contextWindow.safeParse(
    input.contextWindow,
  );
  const savedLimit = modelSchema.shape.contextWindow.safeParse(
    previous?.contextWindow,
  );
  const useSavedLimit =
    previous?.contextSource === "user" && savedLimit.success;
  const maximum = modelSchema.shape.maxOutputTokens.safeParse(
    input.maxOutputTokens ?? previous?.maxOutputTokens,
  );
  // The schema does not track capability provenance. Existing boolean settings
  // are treated as deliberate choices, so discovery cannot silently enable
  // tools or undo an edit. New models take validated provider capabilities.
  return modelSchema.parse({
    id: identifier.data,
    name: name.success && name.data.trim() ? name.data : identifier.data,
    contextWindow: useSavedLimit
      ? savedLimit.data
      : input.contextWindow !== undefined && reportedLimit.success
        ? reportedLimit.data
        : 8192,
    contextSource: useSavedLimit
      ? "user"
      : input.contextWindow !== undefined && reportedLimit.success
        ? "provider"
        : "fallback",
    tools: typeof previous?.tools === "boolean" ? previous.tools : input.tools,
    vision:
      typeof previous?.vision === "boolean" ? previous.vision : input.vision,
    ...(maximum.success && maximum.data !== undefined
      ? { maxOutputTokens: maximum.data }
      : {}),
    ...(previous?.outputTokenParameter
      ? { outputTokenParameter: previous.outputTokenParameter }
      : {}),
  });
}
export function validateProviderUrl(input: string) {
  const url = new URL(input);
  if (url.username || url.password || url.search || url.hash)
    throw new HttpError(
      400,
      "Provider URL cannot contain credentials, query parameters, or fragments.",
    );
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    throw new HttpError(
      400,
      "Hosted providers require HTTPS. HTTP is supported only on loopback.",
    );
  return url.toString().replace(/\/$/, "");
}
export function buildPayload(
  provider: Provider,
  model: Model,
  messages: WireMessage[],
  definitions: ToolDefinition[],
  outputReserve: number,
): Record<string, unknown> {
  const native = nativePayload(
    provider,
    model,
    messages,
    definitions,
    outputReserve,
  );
  if (native) return native;
  if (provider.kind === "ollama")
    return {
      model: model.id,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content ?? "",
        ...(m.images?.length
          ? { images: m.images.map((i) => i.split(",")[1]) }
          : {}),
        ...(m.tool_calls
          ? {
              tool_calls: m.tool_calls.map((t) => ({
                function: {
                  name: t.function.name,
                  arguments: JSON.parse(t.function.arguments),
                },
              })),
            }
          : {}),
        ...(m.tool_call_id ? { tool_name: m.tool_call_id } : {}),
      })),
      stream: true,
      options: { num_ctx: model.contextWindow, num_predict: outputReserve },
      ...(definitions.length && model.tools ? { tools: definitions } : {}),
    };
  return {
    model: model.id,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.images?.length
        ? [
            { type: "text", text: m.content ?? "" },
            ...m.images.map((url) => ({
              type: "image_url",
              image_url: { url, detail: "low" },
            })),
          ]
        : m.content,
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    })),
    stream: true,
    [model.outputTokenParameter ?? "max_completion_tokens"]: Math.min(
      outputReserve,
      model.maxOutputTokens ?? outputReserve,
    ),
    ...(definitions.length && model.tools ? { tools: definitions } : {}),
  };
}

export class Providers {
  constructor(
    private store: Store,
    private vault: Vault,
  ) {}
  key(providerId: string) {
    return this.vault.decrypt(this.store.providerCipher(providerId));
  }
  secrets() {
    return this.store
      .providers()
      .map((p) => this.key(p.id))
      .filter(Boolean);
  }
  async discover(providerId: string): Promise<Model[]> {
    const p = this.store.providers().find((x) => x.id === providerId);
    if (!p) throw new HttpError(404, "Provider not found");
    // Catalog requests can span several network awaits. Keep credentials bound
    // to the connection that started discovery, and stop before another request
    // if that connection or its encrypted credential changed in the meantime.
    const credentialCipher = this.store.providerCipher(providerId);
    const credential = this.vault.decrypt(credentialCipher);
    const checkConnection = () => {
      const current = this.store
        .providers()
        .find((value) => value.id === providerId);
      if (
        !current ||
        JSON.stringify(current) !== JSON.stringify(p) ||
        this.store.providerCipher(providerId) !== credentialCipher
      )
        throw new HttpError(
          409,
          "Provider settings changed during model discovery. Discover models again.",
        );
      return current;
    };
    const fetchCatalog = (endpoint: string, body: unknown, timeout: number) => {
      checkConnection();
      return this.fetch(
        p,
        endpoint,
        body,
        AbortSignal.timeout(timeout),
        credential,
      );
    };
    const response = await fetchCatalog(
      p.kind === "ollama" ? "/api/tags" : "/models",
      undefined,
      20_000,
    );
    let data = object(await response.json());
    const listField =
      p.kind === "ollama" || p.kind === "gemini" ? "models" : "data";
    const entries = data[listField];
    if (!Array.isArray(entries))
      throw new HttpError(
        502,
        `${p.name} returned an invalid model list. Check its discovery endpoint.`,
      );
    // Native catalogs paginate. Bound discovery to the same 200-model UI limit.
    const catalog = [...entries];
    const cursors = new Set<string>();
    for (let page = 1; page < 10 && catalog.length < 200; page++) {
      const cursor =
        p.kind === "gemini"
          ? data.nextPageToken
          : p.kind === "anthropic" && data.has_more === true
            ? data.last_id
            : undefined;
      if (typeof cursor !== "string" || !cursor || cursors.has(cursor)) break;
      cursors.add(cursor);
      const query =
        p.kind === "gemini"
          ? `pageToken=${encodeURIComponent(cursor)}`
          : `after_id=${encodeURIComponent(cursor)}`;
      data = object(
        await (
          await fetchCatalog(`/models?${query}`, undefined, 20_000)
        ).json(),
      );
      if (!Array.isArray(data[listField]))
        throw new HttpError(
          502,
          `${p.name} returned an invalid model list on a later page.`,
        );
      catalog.push(...(data[listField] as unknown[]));
    }
    const models: Model[] = [];
    const seen = new Set<string>();
    const add = (model: Model | null) => {
      if (model && !seen.has(model.id)) {
        models.push(model);
        seen.add(model.id);
      }
    };
    if (p.kind === "ollama") {
      // Bound introspection; discovery remains useful if a server does not implement /api/show.
      for (const entry of catalog.slice(0, 100)) {
        const m = object(entry);
        const identifier = modelSchema.shape.id.safeParse(m.name);
        if (!identifier.success || !identifier.data.trim()) continue;
        let info: Record<string, unknown> = {};
        try {
          info = object(
            await (
              await fetchCatalog("/api/show", { model: identifier.data }, 5_000)
            ).json(),
          );
        } catch {
          checkConnection();
          /* explicit fallback below */
        }
        const limit = Object.entries(object(info.model_info)).find(([k]) =>
          k.endsWith(".context_length"),
        )?.[1];
        add(
          discoveredModel(
            {
              id: identifier.data,
              name: identifier.data,
              contextWindow: limit,
              tools: capability(info.capabilities, "tools"),
              vision: capability(info.capabilities, "vision"),
            },
            p.models.find((v) => v.id === identifier.data),
          ),
        );
      }
    } else if (p.kind === "gemini") {
      for (const entry of catalog.slice(0, 200)) {
        const m = object(entry);
        if (
          typeof m.name !== "string" ||
          !/^models\/[A-Za-z0-9_.-]+$/.test(m.name) ||
          !capability(m.supportedGenerationMethods, "generateContent")
        )
          continue;
        add(
          discoveredModel(
            {
              id: m.name,
              name: m.displayName ?? m.name,
              contextWindow: m.inputTokenLimit,
              maxOutputTokens: m.outputTokenLimit,
              tools: false,
              vision: false,
            },
            p.models.find((x) => x.id === m.name),
          ),
        );
      }
    } else if (p.kind === "anthropic") {
      for (const entry of catalog.slice(0, 200)) {
        const m = object(entry);
        if (m.lifecycle === "retired") continue;
        const capabilities = object(m.capabilities);
        add(
          discoveredModel(
            {
              id: m.id,
              name: m.display_name ?? m.id,
              contextWindow: m.max_input_tokens,
              maxOutputTokens: m.max_tokens,
              tools: object(capabilities.tools).supported === true,
              vision: object(capabilities.image_input).supported === true,
            },
            p.models.find((x) => x.id === m.id),
          ),
        );
      }
    } else {
      for (const entry of catalog.slice(0, 200)) {
        const m = object(entry);
        add(
          discoveredModel(
            {
              id: m.id,
              name: m.name ?? m.id,
              contextWindow:
                m.context_length ??
                m.context_window ??
                object(m.top_provider).context_length,
              tools: capability(m.supported_parameters, "tools"),
              vision: capability(
                object(m.architecture).input_modalities,
                "image",
              ),
            },
            p.models.find((x) => x.id === m.id),
          ),
        );
      }
    }
    const current = checkConnection();
    this.store.saveProvider({ ...current, models });
    return models;
  }
  private async fetch(
    p: Provider,
    endpoint: string,
    body?: unknown,
    signal?: AbortSignal,
    credential?: string,
  ) {
    const key = credential ?? this.key(p.id);
    let response: Response;
    try {
      response = await fetch(`${validateProviderUrl(p.baseUrl)}${endpoint}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(p.kind === "anthropic"
            ? {
                "anthropic-version": "2023-06-01",
                ...(key ? { "x-api-key": key } : {}),
              }
            : p.kind === "gemini"
              ? key
                ? { "x-goog-api-key": key }
                : {}
              : key
                ? { Authorization: `Bearer ${key}` }
                : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
        redirect: "error",
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new HttpError(
        502,
        `Cannot reach ${p.name}. Check its URL and that the provider is running. ${redact((e as Error).message, [key])}`,
      );
    }
    if (!response.ok) {
      const detail = redact((await response.text()).slice(0, 1500), [key]);
      throw new HttpError(
        502,
        `${p.name} returned ${response.status}: ${detail}`,
      );
    }
    return response;
  }
  async stream(
    snapshot: Snapshot,
    signal: AbortSignal,
    onDelta: (s: string) => void,
  ): Promise<ModelResult> {
    const p = this.store.providers().find((p) => p.id === snapshot.providerId);
    if (!p) throw new HttpError(400, "The selected provider has been removed.");
    const response = await this.fetch(
      p,
      p.kind === "ollama"
        ? "/api/chat"
        : p.kind === "anthropic"
          ? "/messages"
          : p.kind === "gemini"
            ? `/${geminiModelPath(snapshot.model.id)}:streamGenerateContent?alt=sse`
            : "/chat/completions",
      snapshot.payload,
      signal,
    );
    if (p.kind === "anthropic" || p.kind === "gemini") {
      try {
        return await nativeStream(response, p.kind, signal, onDelta);
      } catch (error) {
        if (signal.aborted) throw error;
        throw new HttpError(
          502,
          redact((error as Error).message, this.secrets()),
        );
      }
    }
    let content = "";
    let usage: Usage | undefined;
    let finished = false;
    let stopReason: string | undefined;
    const keys = this.secrets();
    const calls = new Map<number, ToolCall>();
    function consume(raw: unknown) {
      const packet = object(raw) as any;
      if (packet.error)
        throw new Error(
          redact(
            typeof packet.error === "string"
              ? packet.error
              : (packet.error.message ?? "Provider error"),
            keys,
          ),
        );
      if (p!.kind === "ollama") {
        if (packet.message?.content) {
          content += packet.message.content;
          if (content.length > 2_000_000)
            throw new Error("Provider response exceeds the safety limit.");
          onDelta(packet.message.content);
        }
        for (const [index, t] of (packet.message?.tool_calls ?? []).entries())
          calls.set(index, {
            id: `ollama-${index}`,
            type: "function",
            function: {
              name: t.function.name,
              arguments: JSON.stringify(t.function.arguments),
            },
          });
        if (packet.done) {
          finished = true;
          if (typeof packet.done_reason === "string")
            stopReason = packet.done_reason;
          usage = {
            input: packet.prompt_eval_count ?? 0,
            output: packet.eval_count ?? 0,
          };
          return true;
        }
      } else {
        const choice = packet.choices?.[0];
        const delta = choice?.delta;
        if (delta?.content) {
          content += delta.content;
          if (content.length > 2_000_000)
            throw new Error("Provider response exceeds the safety limit.");
          onDelta(delta.content);
        }
        for (const t of delta?.tool_calls ?? []) {
          const existing = calls.get(t.index) ?? {
            id: t.id ?? `call-${t.index}`,
            type: "function",
            function: { name: "", arguments: "" },
          };
          if (t.id) existing.id = t.id;
          existing.function.name += t.function?.name ?? "";
          existing.function.arguments += t.function?.arguments ?? "";
          if (existing.function.arguments.length > 1_000_000)
            throw new Error("Provider tool arguments exceed the safety limit.");
          calls.set(t.index, existing);
        }
        if (choice?.finish_reason) {
          finished = true;
          stopReason = choice.finish_reason;
        }
        if (packet.usage)
          usage = {
            input: packet.usage.prompt_tokens ?? 0,
            output: packet.usage.completion_tokens ?? 0,
          };
      }
    }
    try {
      const terminal = await readPackets(
        response,
        p.kind === "ollama" ? "ndjson" : "sse",
        signal,
        consume,
      );
      if (!finished && !terminal)
        throw new Error(
          "Provider connection closed before generation completed. Retry the response.",
        );
      if (stopReason && !["stop", "tool_calls"].includes(stopReason))
        throw new Error(
          `Provider stopped with ${stopReason}. The response may be incomplete; review it before retrying.`,
        );
      return { content, calls: [...calls.values()], usage };
    } catch (error) {
      if (signal.aborted) throw error;
      throw new HttpError(502, redact((error as Error).message, keys));
    }
  }
}
