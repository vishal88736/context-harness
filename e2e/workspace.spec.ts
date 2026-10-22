import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Message Canopy" }),
  ).toBeVisible();
});

async function addFile(page: Page, filename: string) {
  await page.getByRole("button", { name: "Add source", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add to your context" });
  await dialog.getByRole("button", { name: "src" }).click();
  await dialog.getByRole("checkbox", { name: filename }).check();
  await dialog
    .getByRole("button", { name: "Add to context", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("switch", { name: `Enable ${filename}` }),
  ).toBeVisible();
}
async function send(page: Page, prompt: string) {
  await page.getByRole("textbox", { name: "Message Canopy" }).fill(prompt);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText(/Protocol fixture response from/).last(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Stop generation" }),
  ).not.toBeVisible();
}
test("9. Desktop sidebar remains visible through context navigation; polished empty state", async ({
  page,
}) => {
  await expect(
    page.getByRole("complementary", { name: "Conversation sidebar" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Your next build/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Conversation context" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Permissions", exact: true }).click();
  await expect(page.getByLabel("Run commands permission")).toHaveValue("deny");
  await expect(
    page.getByRole("button", { name: "Start new conversation", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/canopy-desktop.png",
    fullPage: true,
  });
});
test("Independent chats, files, disable, context preview, and provider request payload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  await addFile(page, "alpha.ts");
  await send(page, "Browser conversation Alpha");
  await page
    .getByRole("button", { name: "View context", exact: true })
    .last()
    .click();
  const inspect = page.getByRole("dialog", {
    name: "What the model received.",
  });
  await inspect.getByRole("button", { name: "Request payload" }).click();
  await expect(inspect.locator(".payload-code")).toContainText(
    "BROWSER_ALPHA_SENTINEL",
  );
  await expect(inspect.locator(".payload-code")).not.toContainText(
    "BROWSER_BETA_SENTINEL",
  );
  await inspect.getByRole("button", { name: "Close inspector" }).click();
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  await addFile(page, "beta.ts");
  await send(page, "Browser conversation Beta");
  await expect(page.locator(".messages")).not.toContainText(
    "Browser conversation Alpha",
  );
  await page
    .getByRole("button", { name: "Browser conversation Alpha", exact: true })
    .click();
  await expect(page.locator(".messages")).toContainText(
    "Browser conversation Alpha",
  );
  await expect(
    page.getByRole("switch", { name: "Enable beta.ts" }),
  ).not.toBeVisible();
  await page.getByRole("switch", { name: "Enable alpha.ts" }).click();
  await page
    .getByRole("textbox", { name: "Message Canopy" })
    .fill("Inspect with alpha disabled");
  await page
    .getByRole("button", { name: "Preview request", exact: true })
    .click();
  const preview = page.getByRole("dialog", {
    name: "Your next request, unpacked.",
  });
  await preview.getByRole("button", { name: "Request payload" }).click();
  await expect(preview.locator(".payload-code")).not.toContainText(
    "BROWSER_ALPHA_SENTINEL",
  );
  await preview.getByRole("button", { name: "Send this request" }).click();
  await expect(page.locator(".message.assistant")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Stop generation" }),
  ).not.toBeVisible();
  expect(errors).toEqual([]);
});
test("Profile application, model override, renaming, pinning, searching, reload persistence", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  await send(page, "Persistent browser workspace");
  await page
    .getByRole("button", { name: "Context profiles", exact: true })
    .click();
  const profiles = page.getByRole("dialog", { name: "A good starting point." });
  await profiles
    .locator(".profile-card")
    .filter({
      has: page.getByRole("heading", { name: "Debugging", exact: true }),
    })
    .getByRole("button", { name: "Apply profile" })
    .click();
  await expect(
    page.getByRole("switch", { name: "Enable Debugging guidance" }),
  ).toBeVisible();
  await expect(page.locator(".messages")).toContainText(
    "Persistent browser workspace",
  );
  await page
    .getByLabel("Model for next request")
    .selectOption("browser-fixture::fixture-reviewer");
  await page.getByRole("button", { name: "Use model for this chat" }).click();
  await expect(page.getByLabel("Model for next request")).toHaveValue(
    "browser-fixture::fixture-reviewer",
  );
  await page
    .getByRole("button", { name: "Actions for Persistent browser workspace" })
    .click();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByLabel("Conversation title").fill("Renamed and saved");
  await page.getByRole("button", { name: "Save name" }).click();
  await page
    .getByRole("button", { name: "Actions for Renamed and saved" })
    .click();
  await page
    .getByRole("button", { name: "Pin conversation", exact: true })
    .click();
  await page.getByLabel("Search conversations").fill("Renamed");
  await expect(
    page.getByRole("button", { name: "Renamed and saved", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".messages")).toContainText(
    "Persistent browser workspace",
  );
  await expect(
    page.getByRole("switch", { name: "Enable Debugging guidance" }),
  ).toBeVisible();
  await expect(page.getByLabel("Model for next request")).toHaveValue(
    "browser-fixture::fixture-reviewer",
  );
  await expect(
    page.getByRole("heading", { name: "Pinned", exact: true }),
  ).toBeVisible();
});

test("Failed context saves block requests and retain disabled sources until retry succeeds", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  await addFile(page, "alpha.ts");
  let failSave = true;
  await page.route("**/api/conversations/*", async (route) => {
    if (
      route.request().method() === "PATCH" &&
      route.request().postDataJSON()?.config &&
      failSave
    ) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Storage temporarily unavailable" }),
      });
    } else await route.continue();
  });
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/(send|preview)$/.test(request.url()))
      requests.push(request.url());
  });
  const source = page.getByRole("switch", { name: "Enable alpha.ts" });
  await source.click();
  await expect(page.getByText(/Context changes are not saved/)).toBeVisible();
  await expect(source).not.toBeChecked();
  await page
    .getByLabel("Message Canopy")
    .fill("Request after disabled source save failed");
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Preview request", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Message Canopy").press("Enter");
  await page
    .getByRole("button", { name: "Inspect effective context", exact: true })
    .click();
  await expect(
    page.getByText(
      "Save your context changes before previewing or sending a request.",
    ),
  ).toBeVisible();
  expect(requests).toEqual([]);
  failSave = false;
  await page
    .getByRole("button", { name: "Retry saving context", exact: true })
    .click();
  await expect(
    page.getByText(/Context changes are not saved/),
  ).not.toBeVisible();
  await expect(source).not.toBeChecked();
  await page
    .getByRole("button", { name: "Preview request", exact: true })
    .click();
  const preview = page.getByRole("dialog", {
    name: "Your next request, unpacked.",
  });
  await preview.getByRole("button", { name: "Request payload" }).click();
  await expect(preview.locator(".payload-code")).not.toContainText(
    "BROWSER_ALPHA_SENTINEL",
  );
});

test("Typing the next draft while a request is being accepted preserves those edits", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/conversations/*/send", async (route) => {
    await waiting;
    await route.continue();
  });
  const composer = page.getByLabel("Message Canopy");
  await page.locator(".composer input[type=file]").setInputFiles({
    name: "sent-once.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Attachment for the first request"),
  });
  await expect(page.locator(".attachment-chips")).toContainText(
    "sent-once.txt",
  );
  await composer.fill("First request with delayed acceptance");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  try {
    await expect(
      page.getByRole("button", { name: "Stop generation" }),
    ).toBeVisible();
    await composer.fill("Keep this next request draft");
    await page.locator(".composer input[type=file]").setInputFiles({
      name: "next-request.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Attachment for the next request"),
    });
    await expect(page.locator(".attachment-chips")).toContainText(
      "next-request.txt",
    );
  } finally {
    release();
  }
  await expect(page.locator(".message.assistant .markdown")).toContainText(
    "Protocol fixture response from",
  );
  await expect(
    page.getByRole("button", { name: "Stop generation" }),
  ).not.toBeVisible();
  await expect(composer).toHaveValue("Keep this next request draft");
  await expect(page.locator(".attachment-chips")).toContainText(
    "next-request.txt",
  );
  await expect(page.locator(".attachment-chips")).not.toContainText(
    "sent-once.txt",
  );
});

test("A delayed context preview never opens over a different conversation", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  await addFile(page, "alpha.ts");
  await send(page, "Delayed preview conversation Alpha");
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  await send(page, "Delayed preview conversation Beta");
  await page.getByLabel("Message Canopy").fill("Beta draft stays in Beta");
  await page
    .getByRole("button", {
      name: "Delayed preview conversation Alpha",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("switch", { name: "Enable alpha.ts" }),
  ).toBeVisible();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/conversations/*/preview", async (route) => {
    await waiting;
    await route.continue();
  });
  const started = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith("/preview"),
  );
  const response = page.waitForResponse(
    (result) =>
      result.request().method() === "POST" && result.url().endsWith("/preview"),
  );
  await page
    .getByRole("button", { name: "Preview request", exact: true })
    .click();
  try {
    await started;
    await page
      .getByRole("button", {
        name: "Delayed preview conversation Beta",
        exact: true,
      })
      .click();
    await expect(page.locator(".messages")).toContainText(
      "Delayed preview conversation Beta",
    );
  } finally {
    release();
  }
  const snapshot = await (await response).json();
  expect(JSON.stringify(snapshot)).toContain("BROWSER_ALPHA_SENTINEL");
  await expect(
    page.getByRole("button", { name: "Preview request", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("dialog", { name: "Your next request, unpacked." }),
  ).not.toBeVisible();
  await expect(page.locator(".context-budget")).toContainText(
    "Not composed yet",
  );
  await expect(page.getByLabel("Message Canopy")).toHaveValue(
    "Beta draft stays in Beta",
  );
  await expect(
    page.getByRole("switch", { name: "Enable alpha.ts" }),
  ).not.toBeVisible();
});

test("Keyboard renaming retains input focus across every character", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  await send(page, "Keyboard rename original");
  await page
    .getByRole("button", { name: "Actions for Keyboard rename original" })
    .click();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  const title = page.getByLabel("Conversation title");
  await title.fill("");
  await title.focus();
  await page.keyboard.type("Keyboard rename preserved");
  await expect(title).toBeFocused();
  await expect(title).toHaveValue("Keyboard rename preserved");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Keyboard rename preserved",
      exact: true,
    }),
  ).toBeVisible();
});

test("Repeated retries regenerate only the latest user turn without duplicate user messages", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  await send(page, "Repeat this latest user turn");
  for (const count of [2, 3]) {
    await expect(
      page.getByRole("button", { name: "Retry", exact: true }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.locator(".message.assistant")).toHaveCount(count);
    await expect(
      page.getByRole("button", { name: "Stop generation" }),
    ).not.toBeVisible();
    await expect(
      page.locator(".message.assistant").last().locator(".markdown"),
    ).toContainText("Protocol fixture response from");
    await expect(page.locator(".message.user")).toHaveCount(1);
  }
  await page
    .getByRole("button", { name: "View context", exact: true })
    .last()
    .click();
  const inspector = page.getByRole("dialog", {
    name: "What the model received.",
  });
  await inspector.getByRole("button", { name: "Request payload" }).click();
  const payload = JSON.parse(
    (await inspector.locator(".payload-code").textContent())!,
  );
  expect(
    payload.messages.filter((m: { role: string }) => m.role === "assistant"),
  ).toEqual([]);
  expect(
    payload.messages.filter((m: { role: string }) => m.role === "user"),
  ).toHaveLength(1);
  await inspector.getByRole("button", { name: "Close inspector" }).click();
  await send(page, "Next user turn after retries");
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toHaveCount(1);
});
test("Agent tool approval displays real diff and resumes streaming after approval", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  await addFile(page, "alpha.ts");
  await page.getByLabel("Message Canopy").fill("TOOL_WRITE");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("Needs your approval")).toBeVisible();
  await expect(page.locator(".diff-preview")).toContainText(
    "export const alpha = 2",
  );
  await expect(
    page.getByRole("complementary", { name: "Conversation sidebar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve & apply diff" }).click();
  await expect(page.locator(".message.assistant .markdown")).toContainText(
    "Applied approved diff",
  );
  await expect(
    page.getByRole("button", { name: "Stop generation" }),
  ).not.toBeVisible();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/canopy-conversation.png",
    fullPage: true,
  });
});
test("Stop generation, provider error, and retry recovery remain usable", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  await page.getByLabel("Message Canopy").fill("WAIT_FOR_STOP");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop generation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop generation" }).click();
  await expect(
    page.getByText("Generation stopped.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Message Canopy").fill("BROKEN_STREAM");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".response-error").last()).toContainText(
    "before generation completed",
  );
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }).last(),
  ).toBeEnabled();
  await send(page, "Recovery request");
});
test("Mobile navigation, context, and composer remain accessible with no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "Open conversation sidebar" }).click();
  await expect(
    page.getByRole("complementary", { name: "Conversation sidebar" }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message Canopy" }),
  ).toBeInViewport();
  await page.locator(".context-header-button").click();
  await expect(
    page.getByRole("complementary", { name: "Conversation context" }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Permissions", exact: true }).click();
  await expect(page.getByLabel("Run commands permission")).toBeVisible();
  await page.getByRole("button", { name: "Close context panel" }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/canopy-mobile.png",
    fullPage: true,
  });
});

test("Provider settings discover real HTTP models and persist the chosen default", async ({
  page,
}) => {
  const initial = await (await page.request.get("/api/bootstrap")).json();
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
    .getByLabel("Name", { exact: true })
    .fill("Browser verified connection");
  await settings
    .getByLabel("Adapter", { exact: true })
    .selectOption("compatible");
  await settings
    .getByLabel("API base URL", { exact: true })
    .fill(initial.providers[0].baseUrl);
  await settings.getByLabel(/API key/).fill("browser-fixture-key-12345");
  await settings
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Discover models", exact: true })
    .click();
  await expect(
    settings.getByText("Models discovered. Ready to chat.", { exact: true }),
  ).toBeVisible();
  const updated = await (await page.request.get("/api/bootstrap")).json();
  const provider = updated.providers.find(
    (p: any) => p.name === "Browser verified connection",
  );
  expect(provider.models).toHaveLength(2);
  expect(provider.keyConfigured).toBe(true);
  expect(JSON.stringify(updated)).not.toContain("browser-fixture-key-12345");
  await settings
    .getByLabel("Default model", { exact: true })
    .selectOption(`${provider.id}::fixture-coder`);
  await settings.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message Canopy" }),
  ).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("Model for next request")).toHaveValue(
    `${provider.id}::fixture-coder`,
  );
});

test("Temporary composer instructions and uploads are sent once, with exact inspection", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  await page.getByRole("button", { name: "Instructions", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Temporary instructions", exact: true })
    .fill("ONE_TURN_BROWSER_INSTRUCTION");
  await page.locator(".composer input[type=file]").setInputFiles({
    name: "turn-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("ONE_TURN_BROWSER_ATTACHMENT"),
  });
  await expect(page.locator(".attachment-chips")).toContainText(
    "turn-notes.txt",
  );
  await send(page, "Use this temporary material");
  await page
    .getByRole("button", { name: "View context", exact: true })
    .last()
    .click();
  let inspector = page.getByRole("dialog", {
    name: "What the model received.",
  });
  await inspector
    .getByRole("button", { name: "Request payload", exact: true })
    .click();
  await expect(inspector.locator(".payload-code")).toContainText(
    "ONE_TURN_BROWSER_INSTRUCTION",
  );
  await expect(inspector.locator(".payload-code")).toContainText(
    "ONE_TURN_BROWSER_ATTACHMENT",
  );
  await inspector.getByRole("button", { name: "Close inspector" }).click();
  await send(page, "A fresh ordinary turn");
  await page
    .getByRole("button", { name: "View context", exact: true })
    .last()
    .click();
  inspector = page.getByRole("dialog", { name: "What the model received." });
  await inspector
    .getByRole("button", { name: "Request payload", exact: true })
    .click();
  await expect(inspector.locator(".payload-code")).not.toContainText(
    "ONE_TURN_BROWSER_",
  );
});
