/** Cross-provider HTTP fixtures verify context handoff, not live AI inference. */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/app";
import { id, now } from "../server/store";
import { requestSchema, type Snapshot } from "../server/schema";

test("Switching provider protocols preserves selected context and eligible history; revocation remains effective after handoff", async (t) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "canopy-handoff-"));
  const root = path.join(temporary, "project");
  await mkdir(root);
  const sentinel = "PROVIDER_HANDOFF_SOURCE_SENTINEL";
  await writeFile(
    path.join(root, "selected.ts"),
    `export const shared = "${sentinel}";\n`,
  );
  const requests: { route: string; body: any }[] = [];
  const server = http.createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const route = new URL(request.url!, "http://fixture.invalid").pathname;
    const body = raw ? JSON.parse(raw) : undefined;
    if (route === "/anthropic/models") {
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          data: [
            {
              id: "handoff-anthropic",
              display_name: "Anthropic fixture",
              max_input_tokens: 32768,
              max_tokens: 1024,
            },
          ],
          has_more: false,
        }),
      );
      return;
    }
    if (route === "/gemini/models") {
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          models: [
            {
              name: "models/handoff-gemini",
              displayName: "Gemini fixture",
              inputTokenLimit: 16384,
              outputTokenLimit: 512,
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
      );
      return;
    }
    requests.push({ route, body });
    response.setHeader("Content-Type", "text/event-stream");
    const emit = (packet: unknown) =>
      response.write(`data: ${JSON.stringify(packet)}\n\n`);
    if (route === "/anthropic/messages") {
      emit({
        type: "message_start",
        message: { usage: { input_tokens: 19, output_tokens: 0 } },
      });
      emit({
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "text_delta",
          text: `Anthropic fixture retained source: ${sentinel}`,
        },
      });
      emit({
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 7 },
      });
      emit({ type: "message_stop" });
    } else if (
      route === "/gemini/models/handoff-gemini:streamGenerateContent"
    ) {
      emit({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: "Gemini fixture handoff completed." }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 21, candidatesTokenCount: 6 },
      });
    } else {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const service = await createApp({
    root,
    dataDir: path.join(temporary, "data"),
  });
  t.after(async () => {
    service.agent.stopAll();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    service.close();
    await rm(temporary, { recursive: true, force: true });
  });
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const anthropic = service.store.saveProvider({
    id: id(),
    name: "Anthropic handoff fixture",
    kind: "anthropic",
    baseUrl: `${endpoint}/anthropic`,
    models: [],
    keyConfigured: false,
  });
  const gemini = service.store.saveProvider({
    id: id(),
    name: "Gemini handoff fixture",
    kind: "gemini",
    baseUrl: `${endpoint}/gemini`,
    models: [],
    keyConfigured: false,
  });
  const [anthropicModel] = await service.providers.discover(anthropic.id);
  const [geminiModel] = await service.providers.discover(gemini.id);
  const original = service.store.createConversation(
    service.store.workspaces()[0].id,
  );
  const selected = service.store.updateConversation(original.id, {
    providerId: anthropic.id,
    modelId: anthropicModel.id,
    config: {
      ...original.config,
      sources: [
        {
          id: id(),
          type: "file",
          name: "Shared source",
          path: "selected.ts",
          enabled: true,
          createdAt: now(),
        },
        {
          id: id(),
          type: "instruction",
          name: "Task guidance",
          content: "Keep the handoff task focused.",
          enabled: true,
          createdAt: now(),
        },
      ],
    },
  });
  const initialConfig = structuredClone(selected.config);
  async function send(
    prompt: string,
    override?: { providerId: string; modelId: string },
  ) {
    const events: any[] = [];
    await service.agent.run(
      selected.id,
      requestSchema.parse({ prompt, ...override }),
      (event) => events.push(event),
    );
    assert.ok(
      events.some((event) => event.type === "done"),
      JSON.stringify(events.filter((event) => event.type === "error")),
    );
    const snapshot: Snapshot = service.store.invocation(
      events.find((event) => event.type === "snapshot").snapshot.id,
    ).snapshot;
    assert.deepEqual(
      requests.at(-1)?.body,
      snapshot.payload,
      "The inspected request must be the actual transmitted HTTP body",
    );
    return snapshot;
  }
  const first = await send("Inspect the selected source and explain it.");
  const firstRecord = JSON.stringify(service.store.invocation(first.id));
  const firstAssistant = service.store.messages(selected.id).at(-1)!;
  assert.match(firstAssistant.content, new RegExp(sentinel));
  assert.equal(first.providerId, anthropic.id);
  assert.match(requests.at(-1)!.route, /^\/anthropic\/messages$/);

  const switched = service.store.updateConversation(selected.id, {
    providerId: gemini.id,
    modelId: geminiModel.id,
  });
  assert.equal(switched.id, selected.id);
  assert.equal(
    switched.revision,
    selected.revision,
    "Changing providers must not mutate context revision",
  );
  assert.deepEqual(switched.config, initialConfig);
  const second = await send("Continue the same task using the other provider.");
  assert.equal(second.providerId, gemini.id);
  assert.equal(second.fingerprint, first.fingerprint);
  assert.equal(second.budget.limit, geminiModel.contextWindow);
  assert.deepEqual(second.sources, first.sources);
  assert.ok(
    second.history.some(
      (entry) => entry.id === firstAssistant.id && entry.included,
    ),
  );
  const geminiBody = requests.at(-1)!.body;
  assert.match(
    requests.at(-1)!.route,
    /^\/gemini\/models\/handoff-gemini:streamGenerateContent$/,
  );
  assert.ok(
    geminiBody.contents.some(
      (entry: any) =>
        entry.role === "model" &&
        entry.parts.some((part: any) => part.text === firstAssistant.content),
    ),
    "The next provider must receive the prior assistant response when context provenance is unchanged",
  );
  assert.match(JSON.stringify(geminiBody), new RegExp(sentinel));
  assert.match(JSON.stringify(geminiBody), /Keep the handoff task focused/);
  assert.equal(service.store.messages(selected.id).length, 4);

  const oneTurn = await send("Use the first provider for this turn only.", {
    providerId: anthropic.id,
    modelId: anthropicModel.id,
  });
  assert.equal(oneTurn.providerId, anthropic.id);
  assert.equal(oneTurn.fingerprint, first.fingerprint);
  assert.equal(service.store.conversation(selected.id).providerId, gemini.id);
  assert.deepEqual(
    service.store.conversation(selected.id).config,
    initialConfig,
  );
  assert.ok(oneTurn.history.every((entry) => entry.included));
  assert.match(JSON.stringify(requests.at(-1)!.body), new RegExp(sentinel));

  service.store.updateConversation(selected.id, {
    config: {
      ...initialConfig,
      sources: initialConfig.sources.map((source) =>
        source.type === "file" ? { ...source, enabled: false } : source,
      ),
    },
  });
  const revoked = await send(
    "Continue with only the remaining enabled context.",
  );
  assert.equal(
    revoked.providerId,
    gemini.id,
    "A per-request override must expire after its turn",
  );
  assert.doesNotMatch(
    JSON.stringify(requests.at(-1)!.body),
    new RegExp(sentinel),
  );
  assert.ok(
    revoked.sources.some(
      (source) =>
        source.path === "selected.ts" &&
        source.status === "excluded" &&
        source.reason === "Disabled for this conversation",
    ),
  );
  assert.ok(
    revoked.history
      .filter((entry) => entry.role === "assistant")
      .every(
        (entry) => !entry.included && entry.reason?.includes("Context changed"),
      ),
    "Prior provider responses cannot reintroduce a disabled source",
  );
  assert.match(
    JSON.stringify(requests.at(-1)!.body),
    /Keep the handoff task focused/,
  );
  assert.deepEqual(revoked.permissions, initialConfig.permissions);
  assert.equal(
    service.store.messages(selected.id).length,
    8,
    "Changing context affects subsequent requests, not stored conversation history",
  );
  assert.equal(
    JSON.stringify(service.store.invocation(first.id)),
    firstRecord,
    "Provider handoff must preserve historical invocation records",
  );
});
