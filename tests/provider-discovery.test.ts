import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { Providers } from "../server/providers";
import { modelSchema, type Provider } from "../server/schema";
import { Vault } from "../server/security";
import { id, Store } from "../server/store";

async function discoveryFixture(t: TestContext, kind: Provider["kind"]) {
  const directory = await mkdtemp(path.join(tmpdir(), "canopy-discovery-"));
  const store = new Store(":memory:", directory);
  const providers = new Providers(
    store,
    await Vault.create(path.join(directory, "data")),
  );
  let entries: unknown = [];
  const information = new Map<string, unknown>();
  const server = http.createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/v1/models")
      return response.end(JSON.stringify({ data: entries }));
    if (request.url === "/api/tags")
      return response.end(JSON.stringify({ models: entries }));
    if (request.url === "/api/show") {
      let body = "";
      for await (const chunk of request) body += chunk;
      return response.end(
        JSON.stringify(information.get(JSON.parse(body).model) ?? {}),
      );
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "Unknown discovery fixture route" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const provider = store.saveProvider({
    id: id(),
    name: "Discovery protocol fixture (not AI)",
    kind,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}${kind === "compatible" ? "/v1" : ""}`,
    models: [],
    keyConfigured: false,
  });
  return {
    store,
    provider,
    discover: () => providers.discover(provider.id),
    entries(value: unknown) {
      entries = value;
    },
    info(name: string, value: unknown) {
      information.set(name, value);
    },
  };
}

for (const kind of ["compatible", "ollama"] as const) {
  test(`${kind} discovery bounds context limits and labels invalid metadata as fallback`, async (t) => {
    const fixture = await discoveryFixture(t, kind);
    // JSON encodes NaN/Infinity as null; non-finite metadata still must not
    // become a provider-reported or usable context-window value.
    const limits = [
      -1,
      2048.5,
      10_000_001,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      0,
      2047,
      "32768",
      null,
      undefined,
      32768,
      2048,
      10_000_000,
    ];
    fixture.entries(
      limits.map((limit, index) => {
        const name = `limit-${index}`;
        fixture.info(name, { model_info: { "fixture.context_length": limit } });
        return kind === "ollama"
          ? { name }
          : { id: name, context_length: limit };
      }),
    );
    const models = await fixture.discover();
    assert.equal(models.length, limits.length);
    for (const [index, model] of models.entries()) {
      const valid = modelSchema.shape.contextWindow.safeParse(limits[index]);
      const reported = limits[index] !== undefined && valid.success;
      assert.equal(model.contextSource, reported ? "provider" : "fallback");
      assert.equal(model.contextWindow, reported ? valid.data : 8192);
      assert.equal(modelSchema.safeParse(model).success, true);
    }
    assert.deepEqual(fixture.store.providers()[0].models, models);
  });

  test(`${kind} discovery rejects invalid identifiers and normalizes malformed capabilities`, async (t) => {
    const fixture = await discoveryFixture(t, kind);
    const invalidIds = [undefined, null, 7, {}, "", " ", "x".repeat(201)];
    if (kind === "ollama") {
      fixture.entries([
        ...invalidIds.map((name) => ({ name })),
        null,
        { name: "valid-native" },
        { name: "valid-native" },
        { name: "array-capabilities" },
      ]);
      fixture.info("valid-native", {
        model_info: null,
        capabilities: "tools,vision",
      });
      fixture.info("array-capabilities", {
        model_info: { "fixture.context_length": 32768 },
        capabilities: ["tools", "vision", true],
      });
    } else {
      fixture.entries([
        ...invalidIds.map((id) => ({ id })),
        null,
        {
          id: "valid-compatible",
          name: { untrusted: "object" },
          supported_parameters: "tools",
          architecture: { input_modalities: "image" },
        },
        { id: "valid-compatible" },
        {
          id: "long-name",
          name: "n".repeat(201),
          supported_parameters: { includes: true },
          architecture: { input_modalities: true },
        },
        {
          id: "array-capabilities",
          name: "A valid display name",
          supported_parameters: ["tools", 1],
          architecture: { input_modalities: ["image", false] },
        },
      ]);
    }
    const models = await fixture.discover();
    assert.equal(models.length, kind === "ollama" ? 2 : 3);
    assert.equal(new Set(models.map((m) => m.id)).size, models.length);
    const malformed = models[0];
    assert.equal(malformed.name, malformed.id);
    assert.equal(malformed.tools, false);
    assert.equal(malformed.vision, false);
    assert.equal(models.at(-1)?.tools, true);
    assert.equal(models.at(-1)?.vision, true);
    for (const model of models) {
      assert.equal(typeof model.tools, "boolean");
      assert.equal(typeof model.vision, "boolean");
      assert.equal(modelSchema.safeParse(model).success, true);
    }
  });

  test(`${kind} rediscovery preserves explicit limits and capability choices`, async (t) => {
    const fixture = await discoveryFixture(t, kind);
    fixture.entries([
      kind === "ollama"
        ? { name: "customized" }
        : {
            id: "customized",
            context_window: 32768,
            supported_parameters: ["tools"],
            architecture: { input_modalities: ["image"] },
          },
    ]);
    fixture.info("customized", {
      model_info: { "fixture.context_length": 32768 },
      capabilities: ["tools", "vision"],
    });
    const [initial] = await fixture.discover();
    fixture.store.saveProvider({
      ...fixture.provider,
      models: [
        {
          ...initial,
          contextSource: "user",
          contextWindow: 65536,
          tools: false,
          vision: false,
        },
      ],
    });
    const [disabled] = await fixture.discover();
    assert.equal(disabled.contextSource, "user");
    assert.equal(disabled.contextWindow, 65536);
    assert.equal(disabled.tools, false);
    assert.equal(disabled.vision, false);

    fixture.store.saveProvider({
      ...fixture.provider,
      models: [{ ...disabled, tools: true, vision: true }],
    });
    fixture.info("customized", { capabilities: [] });
    if (kind === "compatible") fixture.entries([{ id: "customized" }]);
    const [enabled] = await fixture.discover();
    assert.equal(enabled.tools, true);
    assert.equal(enabled.vision, true);
    assert.equal(enabled.contextWindow, 65536);
  });

  test(`${kind} malformed discovery responses preserve the saved model list`, async (t) => {
    const fixture = await discoveryFixture(t, kind);
    fixture.entries([
      kind === "ollama" ? { name: "retained" } : { id: "retained" },
    ]);
    const initial = await fixture.discover();
    fixture.entries("this is not a model array");
    await assert.rejects(fixture.discover(), /returned an invalid model list/);
    assert.deepEqual(fixture.store.providers()[0].models, initial);
  });
}

for (const kind of ["anthropic", "gemini", "ollama"] as const) {
  test(`${kind} discovery does not send rotated credentials to a stale connection`, async (t) => {
    for (const change of ["endpoint", "credential"] as const) {
      const directory = await mkdtemp(
        path.join(tmpdir(), "canopy-discovery-race-"),
      );
      const store = new Store(":memory:", directory);
      const vault = await Vault.create(path.join(directory, "data"));
      const providers = new Providers(store, vault);
      const requests: { path: string; key: string | undefined }[] = [];
      let receiveFirst!: () => void;
      const firstReceived = new Promise<void>((resolve) => {
        receiveFirst = resolve;
      });
      let releaseFirst!: () => void;
      const firstReleased = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const server = http.createServer(async (request, response) => {
        const authorization = request.headers.authorization;
        requests.push({
          path: request.url!,
          key:
            kind === "anthropic"
              ? (request.headers["x-api-key"] as string | undefined)
              : kind === "gemini"
                ? (request.headers["x-goog-api-key"] as string | undefined)
                : authorization?.replace(/^Bearer /, ""),
        });
        if (requests.length === 1) {
          receiveFirst();
          await firstReleased;
        }
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify(
            kind === "ollama"
              ? request.url === "/api/tags"
                ? { models: [{ name: "fixture-model" }] }
                : {}
              : kind === "anthropic"
                ? request.url!.includes("after_id")
                  ? { data: [], has_more: false }
                  : {
                      data: [{ id: "fixture-model" }],
                      has_more: true,
                      last_id: "fixture-model",
                    }
                : request.url!.includes("pageToken")
                  ? { models: [] }
                  : {
                      models: [
                        {
                          name: "models/fixture-model",
                          supportedGenerationMethods: ["generateContent"],
                        },
                      ],
                      nextPageToken: "second",
                    },
          ),
        );
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      t.after(async () => {
        releaseFirst();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        store.close();
        await rm(directory, { recursive: true, force: true });
      });
      const originalKey = "fixture-original-connection-key";
      const replacementKey = "fixture-replacement-connection-key";
      const provider = store.saveProvider(
        {
          id: id(),
          name: "Credential race protocol fixture (not AI)",
          kind,
          baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}${kind === "ollama" ? "" : "/v1"}`,
          models: [],
          keyConfigured: true,
        },
        vault.encrypt(originalKey),
      );
      const discovery = providers.discover(provider.id);
      // Attach the rejection assertion before releasing the held HTTP response.
      const rejected = assert.rejects(
        discovery,
        /Provider settings changed during model discovery/,
      );
      await firstReceived;
      const changed = store.saveProvider(
        {
          ...provider,
          baseUrl:
            change === "endpoint"
              ? `${provider.baseUrl}/replacement`
              : provider.baseUrl,
        },
        vault.encrypt(replacementKey),
      );
      releaseFirst();
      await rejected;
      assert.equal(
        requests.length,
        1,
        "stale discovery must stop before pagination or introspection",
      );
      assert.equal(requests[0].key, originalKey);
      assert.ok(requests.every((request) => request.key !== replacementKey));
      assert.deepEqual(
        store.providers().find((value) => value.id === provider.id),
        changed,
      );
    }
  });
}
