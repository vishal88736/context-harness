/** Local HTTP protocol fixtures exercise native provider UI; no AI inference. */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import type { Bootstrap, Provider } from "../src/api";

type NativeAdapter = "anthropic" | "gemini";

async function protocolFixture(kind: NativeAdapter) {
  const modelId =
    kind === "gemini"
      ? "models/browser-native-fixture"
      : "browser-native-fixture";
  const label = kind === "gemini" ? "Gemini" : "Anthropic";
  const prefix = `${label} browser protocol fixture `;
  const answer = `${prefix}completed without AI inference.`;
  const requests: {
    method: string;
    url: string;
    headers: http.IncomingHttpHeaders;
    body: any;
  }[] = [];
  let complete!: () => void;
  const completion = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const server = http.createServer(async (request, response) => {
    let content = "";
    for await (const chunk of request) content += chunk;
    const body = content ? JSON.parse(content) : undefined;
    requests.push({
      method: request.method!,
      url: request.url!,
      headers: request.headers,
      body,
    });
    if (
      request.method === "GET" &&
      request.url === (kind === "anthropic" ? "/v1/models" : "/v1beta/models")
    ) {
      response.setHeader("Content-Type", "application/json");
      return response.end(
        JSON.stringify(
          kind === "anthropic"
            ? {
                data: [
                  {
                    id: modelId,
                    display_name: "Browser native protocol fixture",
                    max_input_tokens: 8192,
                    max_tokens: 4096,
                  },
                ],
                has_more: false,
              }
            : {
                models: [
                  {
                    name: modelId,
                    displayName: "Browser native protocol fixture",
                    inputTokenLimit: 8192,
                    outputTokenLimit: 4096,
                    supportedGenerationMethods: ["generateContent"],
                  },
                ],
              },
        ),
      );
    }
    const endpoint =
      kind === "anthropic"
        ? "/v1/messages"
        : `/v1beta/${modelId}:streamGenerateContent?alt=sse`;
    if (request.method !== "POST" || request.url !== endpoint) {
      response.statusCode = 404;
      return response.end(
        JSON.stringify({ error: "Unknown local protocol fixture route" }),
      );
    }
    response.setHeader("Content-Type", "text/event-stream");
    const emit = (packet: unknown) =>
      response.write(`data: ${JSON.stringify(packet)}\n\n`);
    if (kind === "anthropic") {
      emit({
        type: "message_start",
        message: { usage: { input_tokens: 35, output_tokens: 1 } },
      });
      emit({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      });
      emit({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: prefix },
      });
    } else
      emit({
        candidates: [{ content: { role: "model", parts: [{ text: prefix }] } }],
      });
    await completion;
    if (kind === "anthropic") {
      emit({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "completed without AI inference." },
      });
      emit({ type: "content_block_stop", index: 0 });
      emit({
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 12 },
      });
      emit({ type: "message_stop" });
    } else
      emit({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: "completed without AI inference." }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 35, candidatesTokenCount: 12 },
      });
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    modelId,
    label,
    prefix,
    answer,
    requests,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}${kind === "anthropic" ? "/v1" : "/v1beta"}`,
    complete,
    async close() {
      complete();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function bootstrap(page: Page): Promise<Bootstrap> {
  const response = await page.request.get("/api/bootstrap");
  expect(response.ok()).toBe(true);
  return response.json();
}

async function cleanup(page: Page, initial: Bootstrap, providerName: string) {
  const current = await bootstrap(page);
  const headers = { "X-Canopy-CSRF": current.csrf };
  // Restore the original default before removing the provider and closing its
  // ephemeral server, so later browser workflows never inherit a dead endpoint.
  const restored = await page.request.put("/api/settings", {
    headers,
    data: { defaultModel: initial.settings.defaultModel },
  });
  expect(restored.ok()).toBe(true);
  const initialConversations = new Set(
    initial.conversations.map((conversation) => conversation.id),
  );
  for (const conversation of current.conversations.filter(
    (conversation) => !initialConversations.has(conversation.id),
  )) {
    const stopped = await page.request.post(
      `/api/conversations/${conversation.id}/stop`,
      { headers, data: {} },
    );
    expect(stopped.ok()).toBe(true);
    await expect
      .poll(async () => {
        const response = await page.request.get(
          `/api/conversations/${conversation.id}`,
        );
        return (await response.json()).running;
      })
      .toBe(false);
    const deleted = await page.request.delete(
      `/api/conversations/${conversation.id}`,
      { headers },
    );
    expect(deleted.ok()).toBe(true);
  }
  for (const provider of current.providers.filter(
    (provider) =>
      provider.name === providerName &&
      !initial.providers.some((previous) => previous.id === provider.id),
  )) {
    const deleted = await page.request.delete(`/api/providers/${provider.id}`, {
      headers,
    });
    expect(deleted.ok()).toBe(true);
  }
  const final = await bootstrap(page);
  expect(final.settings.defaultModel).toEqual(initial.settings.defaultModel);
  expect(
    final.providers.some((provider) => provider.name === providerName),
  ).toBe(false);
  expect(
    final.conversations.map((conversation) => conversation.id).sort(),
  ).toEqual([...initialConversations].sort());
}

for (const kind of ["anthropic", "gemini"] as const) {
  test(`${kind} native provider setup discovers a local fixture, streams its response, and inspects the actual request`, async ({
    page,
  }) => {
    const fixture = await protocolFixture(kind);
    const providerName = `${fixture.label} browser local protocol fixture`;
    const key = `browser-${kind}-fixture-key-123456789`;
    let initial: Bootstrap | undefined;
    try {
      await page.goto("/");
      await expect(page.getByLabel("Message Canopy")).toBeVisible();
      initial = await bootstrap(page);
      await page
        .getByRole("button", { name: "Models & providers", exact: true })
        .click();
      const settings = page.getByRole("dialog", {
        name: "A workspace that fits you.",
      });
      await settings
        .getByRole("button", { name: "Add provider", exact: true })
        .click();
      await settings
        .locator(".provider-preset-card")
        .filter({
          hasText:
            kind === "anthropic" ? "Native Messages API" : "Native Gemini API",
        })
        .click();
      await expect(settings.getByLabel("Adapter", { exact: true })).toHaveValue(
        kind,
      );
      await settings.getByLabel("Name", { exact: true }).fill(providerName);
      await settings
        .getByLabel("API base URL", { exact: true })
        .fill(fixture.baseUrl);
      await settings.getByLabel(/API key/).fill(key);
      await settings
        .getByRole("button", { name: "Save provider", exact: true })
        .click();
      await settings
        .getByRole("button", { name: "Discover models", exact: true })
        .click();
      await expect(
        settings.getByText("Models discovered. Ready to chat.", {
          exact: true,
        }),
      ).toBeVisible();
      const discovered = await bootstrap(page);
      const provider = discovered.providers.find(
        (provider) => provider.name === providerName,
      ) as Provider;
      expect(provider.kind).toBe(kind);
      expect(provider.keyConfigured).toBe(true);
      expect(provider.models).toHaveLength(1);
      expect(provider.models[0]).toMatchObject({
        id: fixture.modelId,
        contextWindow: 8192,
        contextSource: "provider",
        maxOutputTokens: 4096,
      });
      expect(JSON.stringify(discovered)).not.toContain(key);
      await settings
        .getByLabel("Default model", { exact: true })
        .selectOption(`${provider.id}::${fixture.modelId}`);
      await expect(
        settings.getByLabel("Default model", { exact: true }),
      ).toHaveValue(`${provider.id}::${fixture.modelId}`);
      await settings.getByRole("button", { name: "Done", exact: true }).click();
      await page
        .getByRole("button", { name: "Start new conversation", exact: true })
        .click();
      await expect(page.getByLabel("Model for next request")).toHaveValue(
        `${provider.id}::${fixture.modelId}`,
      );
      const prompt = `Inspect this actual composed ${kind} request through the local protocol fixture.`;
      await page.getByLabel("Message Canopy").fill(prompt);
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Stop generation" }),
      ).toBeVisible();
      await expect(page.locator(".message.assistant .markdown")).toContainText(
        fixture.prefix.trim(),
      );
      fixture.complete();
      await expect(page.locator(".message.assistant .markdown")).toContainText(
        fixture.answer,
      );
      await expect(
        page.getByRole("button", { name: "Stop generation" }),
      ).not.toBeVisible();
      await page
        .getByRole("button", { name: "View context", exact: true })
        .last()
        .click();
      const inspector = page.getByRole("dialog", {
        name: "What the model received.",
      });
      await inspector
        .getByRole("button", { name: "Request payload", exact: true })
        .click();
      const payload = JSON.parse(
        (await inspector.locator(".payload-code").textContent())!,
      );
      const sent = fixture.requests.filter(
        (request) => request.method === "POST",
      );
      expect(sent).toHaveLength(1);
      expect(sent[0].body).toEqual(payload);
      expect(JSON.stringify(payload)).toContain(prompt);
      expect(JSON.stringify(payload)).not.toContain(key);
      expect(await inspector.textContent()).not.toContain(key);
      expect(
        fixture.requests.every(
          (request) =>
            !request.url.includes(key) && !/[?&]key=/.test(request.url),
        ),
      ).toBe(true);
      expect(sent[0].headers.authorization).toBeUndefined();
      if (kind === "anthropic") {
        expect(payload.model).toBe(fixture.modelId);
        expect(payload.system).toContain("You are Canopy");
        expect(
          payload.messages
            .flatMap((message: any) => message.content)
            .some((part: any) => part.text === prompt),
        ).toBe(true);
        expect(payload.max_tokens).toBeGreaterThan(0);
        expect(payload.max_tokens).toBeLessThanOrEqual(4096);
        expect(payload.contents).toBeUndefined();
        expect(sent[0].headers["x-api-key"]).toBe(key);
        expect(sent[0].headers["anthropic-version"]).toBe("2023-06-01");
      } else {
        expect(payload.systemInstruction.parts[0].text).toContain(
          "You are Canopy",
        );
        expect(
          payload.contents
            .flatMap((message: any) => message.parts)
            .some((part: any) => part.text === prompt),
        ).toBe(true);
        expect(payload.generationConfig.maxOutputTokens).toBeGreaterThan(0);
        expect(payload.generationConfig.maxOutputTokens).toBeLessThanOrEqual(
          4096,
        );
        expect(payload.messages).toBeUndefined();
        expect(sent[0].headers["x-goog-api-key"]).toBe(key);
        expect(sent[0].url).toBe(
          `/v1beta/${fixture.modelId}:streamGenerateContent?alt=sse`,
        );
      }
    } finally {
      fixture.complete();
      try {
        if (initial) await cleanup(page, initial, providerName);
      } finally {
        await fixture.close();
      }
    }
  });
}
