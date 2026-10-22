import { Store } from "./store";
import { ContextEngine } from "./context";
import { Providers } from "./providers";
import { ToolRunner } from "./tools";
import { HttpError, redact, StreamingRedactor } from "./security";
import { retryCutoff } from "./turns";
import type { SendInput, Snapshot, WireMessage } from "./schema";

export type AgentEvent = { type: string; [key: string]: unknown };
export class Agent {
  private running = new Map<string, AbortController>();
  constructor(
    private store: Store,
    private engine: ContextEngine,
    private providers: Providers,
    public tools: ToolRunner,
  ) {}
  isRunning(conversationId: string) {
    return this.running.has(conversationId);
  }
  stop(conversationId: string) {
    this.running.get(conversationId)?.abort();
  }
  stopAll() {
    for (const c of this.running.values()) c.abort();
  }
  async run(
    conversationId: string,
    input: SendInput,
    emit: (event: AgentEvent) => void,
  ) {
    if (this.running.has(conversationId))
      throw new HttpError(
        409,
        "A response is already running in this conversation.",
      );
    const controller = new AbortController();
    this.running.set(conversationId, controller);
    const signal = controller.signal;
    let assistantId: string | undefined;
    let content = "";
    let snapshot: Snapshot | undefined;
    const timeout = setTimeout(() => controller.abort(), 15 * 60_000);
    try {
      const original = this.store.messages(conversationId);
      const cutoff = retryCutoff(original, input) ?? original.length;
      snapshot = await this.engine.compose(conversationId, input, {
        cutoff,
        signal,
      });
      if (input.previewHash && input.previewHash !== snapshot.previewHash)
        throw new HttpError(
          409,
          "Effective context changed after preview. Preview again before sending.",
        );
      signal.throwIfAborted();
      this.store.saveInvocation(snapshot);
      if (!input.retryMessageId) {
        const user = this.store.addMessage(
          conversationId,
          "user",
          redact(input.prompt, this.providers.secrets()),
        );
        emit({ type: "message", message: user });
      }
      const assistant = this.store.addMessage(
        conversationId,
        "assistant",
        "",
        snapshot.id,
        "streaming",
      );
      assistantId = assistant.id;
      emit({ type: "message", message: assistant });
      emit({ type: "snapshot", snapshot: publicSnapshot(snapshot) });
      const c = this.store.conversation(conversationId);
      if (c.title === "New conversation") {
        const title = redact(input.prompt, this.providers.secrets())
          .replace(/[`#*\n]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 64);
        this.store.updateConversation(conversationId, {
          title: title || "Untitled conversation",
        });
        emit({ type: "title", title });
      }
      const continuation: WireMessage[] = [];
      for (let round = 0; round < 8; round++) {
        signal.throwIfAborted();
        emit({
          type: "progress",
          label: round
            ? `Continuing after tools · step ${round + 1}`
            : "Model is responding",
        });
        let lastSave = Date.now();
        const redactor = new StreamingRedactor(this.providers.secrets());
        const publish = (delta: string) => {
          if (!delta) return;
          content += delta;
          emit({ type: "delta", id: assistantId, delta });
          if (Date.now() - lastSave > 350) {
            this.store.updateMessage(assistantId!, content, "streaming");
            lastSave = Date.now();
          }
        };
        const result = await this.providers.stream(
          snapshot,
          signal,
          (delta) => {
            publish(redactor.push(delta));
          },
        );
        publish(redactor.finish());
        this.store.finishInvocation(snapshot.id, "complete", result.usage);
        emit({ type: "usage", usage: result.usage });
        if (!result.calls.length) {
          this.store.updateMessage(assistantId, content, "complete");
          emit({ type: "done", id: assistantId });
          return;
        }
        if (!snapshot.model.tools)
          throw new Error(
            "The model requested tools without the configured capability. Enable tool support in Settings if appropriate.",
          );
        if (round === 7)
          throw new Error(
            "Agent reached its 8-step limit. Review the results and continue with another request.",
          );
        if (result.calls.length > 6)
          throw new Error(
            "Model requested too many tools in one step (maximum 6).",
          );
        continuation.push(
          result.continuation ?? {
            role: "assistant",
            content: result.content || null,
            tool_calls: result.calls,
          },
        );
        for (const call of result.calls) {
          signal.throwIfAborted();
          const output = await this.tools.execute(
            conversationId,
            snapshot.id,
            call.function.name,
            call.function.arguments,
            signal,
            (execution) => emit({ type: "tool", execution }),
          );
          const clipped = output.slice(
            0,
            Math.max(
              800,
              Math.min(6000, Math.floor(snapshot.model.contextWindow / 8)),
            ),
          );
          continuation.push({
            role: "tool",
            content:
              clipped +
              (clipped.length < output.length
                ? "\n[Tool result explicitly truncated; full output is in the execution record.]"
                : ""),
            tool_call_id:
              snapshot.providerName &&
              this.store.providers().find((p) => p.id === snapshot!.providerId)
                ?.kind === "ollama"
                ? call.function.name
                : call.id,
          });
        }
        signal.throwIfAborted();
        snapshot = await this.engine.compose(
          conversationId,
          { ...input, previewHash: undefined },
          { cutoff, continuation, signal },
        );
        this.store.saveInvocation(snapshot);
        this.store.setMessageInvocation(assistantId, snapshot.id);
        emit({ type: "snapshot", snapshot: publicSnapshot(snapshot) });
      }
    } catch (error) {
      const stopped = signal.aborted;
      const message = stopped
        ? "Generation stopped."
        : redact((error as Error).message, this.providers.secrets());
      if (assistantId)
        this.store.updateMessage(
          assistantId,
          content,
          stopped ? "stopped" : "error",
          message,
        );
      if (snapshot)
        this.store.finishInvocation(snapshot.id, stopped ? "stopped" : "error");
      emit({ type: stopped ? "stopped" : "error", id: assistantId, message });
    } finally {
      clearTimeout(timeout);
      this.running.delete(conversationId);
    }
  }
}
// Keep credentials out, and replace image bytes with digest metadata in the inspector.
export function publicSnapshot(snapshot: Snapshot): Snapshot {
  return JSON.parse(
    JSON.stringify(snapshot, (key, value) => {
      if (
        value &&
        typeof value === "object" &&
        typeof value.data === "string" &&
        ((value.type === "base64" &&
          typeof value.media_type === "string" &&
          value.media_type.startsWith("image/")) ||
          (typeof value.mimeType === "string" &&
            value.mimeType.startsWith("image/")))
      )
        return {
          ...value,
          data: `[Image data omitted from inspector; ${value.data.length} encoded characters]`,
        };
      if (typeof value === "string" && value.startsWith("data:image/"))
        return `[Image data omitted from inspector; ${value.length} encoded characters]`;
      if (key === "images" && Array.isArray(value))
        return value.map((v) =>
          typeof v === "string"
            ? `[Image data omitted; ${v.length} encoded characters]`
            : v,
        );
      return value;
    }),
  );
}
