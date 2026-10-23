import { HttpError } from "../security";
import type { ModelResult, Usage } from "../providers";
import type {
  Model,
  Provider,
  ToolCall,
  ToolDefinition,
  WireMessage,
} from "../schema";
import { readPackets } from "./stream";

type Part = Record<string, unknown>;
const record = (value: unknown): Part =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Part)
    : {};
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

function image(url: string) {
  const match =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!match) throw new HttpError(400, "Invalid provider image attachment.");
  return { mimeType: match[1], data: match[2] };
}
function argumentsObject(raw: string): Part {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new HttpError(400, "Tool-call arguments must be a JSON object.");
  return parsed as Part;
}

export function nativePayload(
  provider: Provider,
  model: Model,
  messages: WireMessage[],
  definitions: ToolDefinition[],
  outputReserve: number,
): Record<string, unknown> | undefined {
  if (provider.kind !== "anthropic" && provider.kind !== "gemini") return;
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content ?? "")
    .join("\n\n");
  const maximum = Math.min(
    outputReserve,
    model.maxOutputTokens ?? outputReserve,
  );
  const tools = model.tools ? definitions : [];
  if (provider.kind === "anthropic") {
    const turns: { role: "user" | "assistant"; content: Part[] }[] = [];
    for (const message of messages.filter((m) => m.role !== "system")) {
      const role = message.role === "assistant" ? "assistant" : "user";
      const content: Part[] = [];
      if (message.role === "tool")
        content.push({
          type: "tool_result",
          tool_use_id: message.tool_call_id,
          content: message.content ?? "",
        });
      else {
        if (message.content)
          content.push({ type: "text", text: message.content });
        for (const url of message.images ?? []) {
          const media = image(url);
          content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: media.mimeType,
              data: media.data,
            },
          });
        }
        for (const call of message.tool_calls ?? [])
          content.push({
            type: "tool_use",
            id: call.id,
            name: call.function.name,
            input: argumentsObject(call.function.arguments),
          });
      }
      if (!content.length) continue;
      const previous = turns.at(-1);
      if (previous?.role === role) previous.content.push(...content);
      else turns.push({ role, content });
    }
    return {
      model: model.id,
      system,
      messages: turns,
      max_tokens: maximum,
      stream: true,
      ...(tools.length
        ? {
            tools: tools.map(({ function: fn }) => ({
              name: fn.name,
              description: fn.description,
              input_schema: fn.parameters,
            })),
          }
        : {}),
    };
  }
  const contents: { role: "user" | "model"; parts: Part[] }[] = [];
  const calls = new Map<string, { name: string; nativeId?: string }>();
  for (const message of messages.filter((m) => m.role !== "system")) {
    const role = message.role === "assistant" ? "model" : "user";
    let parts: Part[] = [];
    if (message.role === "tool") {
      const call = calls.get(message.tool_call_id ?? "");
      if (!call)
        throw new HttpError(
          400,
          "Gemini tool result has no matching function call.",
        );
      parts.push({
        functionResponse: {
          name: call.name,
          ...(call.nativeId ? { id: call.nativeId } : {}),
          response: { output: message.content ?? "" },
        },
      });
    } else if (message.providerData?.kind === "gemini") {
      parts = structuredClone(message.providerData.parts);
      const nativeCalls = parts
        .filter((part) => part.functionCall)
        .map((part) => record(part.functionCall));
      for (const [index, call] of (message.tool_calls ?? []).entries()) {
        const native = nativeCalls[index];
        calls.set(call.id, {
          name: call.function.name,
          ...(typeof native?.id === "string" ? { nativeId: native.id } : {}),
        });
      }
    } else {
      if (message.content) parts.push({ text: message.content });
      for (const url of message.images ?? [])
        parts.push({ inlineData: image(url) });
      for (const call of message.tool_calls ?? []) {
        parts.push({
          functionCall: {
            name: call.function.name,
            args: argumentsObject(call.function.arguments),
          },
        });
        calls.set(call.id, { name: call.function.name });
      }
    }
    if (!parts.length) continue;
    const previous = contents.at(-1);
    if (previous?.role === role) previous.parts.push(...parts);
    else contents.push({ role, parts });
  }
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { maxOutputTokens: maximum },
    ...(tools.length
      ? {
          tools: [
            {
              functionDeclarations: tools.map(({ function: fn }) => ({
                name: fn.name,
                description: fn.description,
                parametersJsonSchema: fn.parameters,
              })),
            },
          ],
        }
      : {}),
  };
}

export function geminiModelPath(id: string) {
  if (!/^models\/[A-Za-z0-9_.-]+$/.test(id))
    throw new HttpError(
      400,
      "Use the exact Gemini model resource returned by discovery (models/name).",
    );
  return id;
}

/** Native protocols return the same tool-call contract used by permission checks. */
export async function nativeStream(
  response: Response,
  kind: "anthropic" | "gemini",
  signal: AbortSignal,
  onDelta: (delta: string) => void,
): Promise<ModelResult> {
  let content = "";
  let usage: Usage | undefined;
  let finished = false;
  let stopReason: string | undefined;
  const calls = new Map<number, ToolCall>();
  const initialInputs = new Map<number, Part>();
  const parts: Part[] = [];
  let partBytes = 0;
  const publish = (text: string) => {
    content += text;
    if (content.length > 2_000_000)
      throw new Error("Provider response exceeds the safety limit.");
    onDelta(text);
  };
  await readPackets(response, "sse", signal, (raw) => {
    const packet = record(raw);
    if (packet.error)
      throw new Error(String(record(packet.error).message ?? packet.error));
    if (kind === "anthropic") {
      const index = typeof packet.index === "number" ? packet.index : 0;
      if (packet.type === "message_start") {
        const initial = record(record(packet.message).usage);
        if (record(packet.message).usage)
          usage = {
            input:
              count(initial.input_tokens) +
              count(initial.cache_read_input_tokens) +
              count(initial.cache_creation_input_tokens),
            output: count(initial.output_tokens),
          };
      } else if (packet.type === "content_block_start") {
        const block = record(packet.content_block);
        if (block.type === "text" && typeof block.text === "string")
          publish(block.text);
        else if (block.type === "tool_use") {
          if (typeof block.id !== "string" || typeof block.name !== "string")
            throw new Error("Provider sent an invalid tool-use block.");
          calls.set(index, {
            id: block.id,
            type: "function",
            function: { name: block.name, arguments: "" },
          });
          initialInputs.set(index, record(block.input));
        }
      } else if (packet.type === "content_block_delta") {
        const delta = record(packet.delta);
        if (delta.type === "text_delta" && typeof delta.text === "string")
          publish(delta.text);
        else if (delta.type === "input_json_delta") {
          const call = calls.get(index);
          if (!call || typeof delta.partial_json !== "string")
            throw new Error(
              "Provider sent a tool delta without a tool-use block.",
            );
          call.function.arguments += delta.partial_json;
          if (call.function.arguments.length > 1_000_000)
            throw new Error("Provider tool arguments exceed the safety limit.");
        }
      } else if (packet.type === "content_block_stop") {
        const call = calls.get(index);
        if (call && !call.function.arguments)
          call.function.arguments = JSON.stringify(
            initialInputs.get(index) ?? {},
          );
      } else if (packet.type === "message_delta") {
        const delta = record(packet.delta);
        if (typeof delta.stop_reason === "string")
          stopReason = delta.stop_reason;
        const updated = record(packet.usage);
        if (packet.usage)
          usage = {
            input:
              updated.input_tokens === undefined
                ? (usage?.input ?? 0)
                : count(updated.input_tokens) +
                  count(updated.cache_read_input_tokens) +
                  count(updated.cache_creation_input_tokens),
            output: count(updated.output_tokens),
          };
      } else if (packet.type === "message_stop") {
        finished = true;
        return true;
      }
    } else {
      const feedback = record(packet.promptFeedback);
      if (feedback.blockReason)
        throw new Error(`Gemini blocked the request: ${feedback.blockReason}`);
      const candidate = record(array(packet.candidates)[0]);
      for (const rawPart of array(record(candidate.content).parts)) {
        const part = record(rawPart);
        // Keep original part boundaries and opaque signatures for this tool turn.
        // Thought text is never displayed as the assistant's answer.
        if (Object.keys(part).length) {
          partBytes += Buffer.byteLength(JSON.stringify(part), "utf8");
          if (partBytes > 2_000_000)
            throw new Error("Provider continuation exceeds the safety limit.");
          parts.push(structuredClone(part));
        }
        if (typeof part.text === "string" && part.thought !== true)
          publish(part.text);
        if (part.functionCall) {
          const call = record(part.functionCall);
          if (typeof call.name !== "string" || !call.name)
            throw new Error("Gemini returned an invalid function call.");
          calls.set(calls.size, {
            id: typeof call.id === "string" ? call.id : `gemini-${calls.size}`,
            type: "function",
            function: {
              name: call.name,
              arguments: JSON.stringify(call.args ?? {}),
            },
          });
        }
      }
      if (packet.usageMetadata) {
        const metadata = record(packet.usageMetadata);
        usage = {
          input: count(metadata.promptTokenCount),
          output:
            count(metadata.candidatesTokenCount) +
            count(metadata.thoughtsTokenCount),
        };
      }
      if (typeof candidate.finishReason === "string") {
        stopReason = candidate.finishReason;
        finished = true;
        return true;
      }
    }
  });
  if (!finished)
    throw new Error(
      "Provider connection closed before generation completed. Retry the response.",
    );
  if (
    stopReason &&
    !["end_turn", "stop_sequence", "tool_use", "STOP"].includes(stopReason)
  )
    throw new Error(
      `Provider stopped with ${stopReason}. The response may be incomplete; review it and retry with a higher output limit or a different model.`,
    );
  for (const call of calls.values())
    argumentsObject(call.function.arguments || "{}");
  return {
    content,
    calls: [...calls.values()],
    usage,
    ...(kind === "gemini" && calls.size
      ? {
          continuation: {
            role: "assistant" as const,
            content: content || null,
            tool_calls: [...calls.values()],
            providerData: { kind: "gemini" as const, parts },
          },
        }
      : {}),
  };
}
