import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { Bootstrap, Conversation, Source } from "../src/api";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Message Canopy")).toBeVisible();
});

async function bootstrap(page: Page): Promise<Bootstrap> {
  const response = await page.request.get("/api/bootstrap");
  expect(response.ok()).toBe(true);
  return response.json();
}

async function api<T>(
  page: Page,
  session: Bootstrap,
  method: string,
  endpoint: string,
  data: unknown,
): Promise<T> {
  const response = await page.request.fetch(`/api${endpoint}`, {
    method,
    headers: { "X-Canopy-CSRF": session.csrf },
    data,
  });
  expect(response.ok(), `${method} ${endpoint}`).toBe(true);
  return response.json();
}

function source(
  type: Source["type"],
  name: string,
  values: Partial<Source> = {},
): Source {
  return {
    id: randomUUID(),
    type,
    name,
    enabled: true,
    createdAt: new Date().toISOString(),
    ...values,
  };
}

async function conversation(
  page: Page,
  session: Bootstrap,
  title: string,
  sources: Source[],
): Promise<Conversation> {
  const created = await api<Conversation>(
    page,
    session,
    "POST",
    "/conversations",
    { workspaceId: session.workspaces[0].id },
  );
  return api(page, session, "PATCH", `/conversations/${created.id}`, {
    title,
    config: { ...created.config, sources },
  });
}

async function openEmptyConversation(page: Page, id: string) {
  await page.evaluate((conversationId) => {
    localStorage.setItem("canopy.activeConversation", conversationId);
    localStorage.setItem("canopy.contextOpen", "false");
  }, id);
  await page.reload();
  await expect(page.getByLabel("Message Canopy")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Your next build/ }),
  ).toBeVisible();
}

const overview = (page: Page) =>
  page.getByRole("button", { name: "Open conversation context overview" });

test("Context overview reflects independent configured sources, disabled state, and persisted changes", async ({
  page,
}) => {
  const session = await bootstrap(page);
  const beta = await conversation(page, session, "Overview Beta isolation", [
    source("file", "Beta source", { path: "src/beta.ts" }),
  ]);
  const alpha = await conversation(page, session, "Overview Alpha isolation", [
    source("file", "Alpha source", { path: "src/alpha.ts" }),
    source("file", "Missing selection", { path: "src/missing-overview.ts" }),
    source("folder", "Disabled folder", { path: "src", enabled: false }),
    source("instruction", "Alpha task rules", {
      content: "Keep edits focused.",
    }),
    source("chat", "Beta reference", { referenceId: beta.id }),
    source("attachment", "Alpha notes", { content: "ALPHA_OVERVIEW_NOTES" }),
  ]);
  await openEmptyConversation(page, alpha.id);
  const card = overview(page);
  await expect(card).toBeVisible();
  await expect(
    page.locator(".context-companion, .context-window-dots"),
  ).toHaveCount(0);
  await expect(card.locator(".context-summary-files strong")).toHaveText("02");
  await expect(card.locator(".context-summary-instructions strong")).toHaveText(
    "01",
  );
  await expect(card.locator(".context-summary-references strong")).toHaveText(
    "01",
  );
  await expect(card.locator(".context-summary-attachments strong")).toHaveText(
    "01",
  );
  await expect(card).toContainText("5 enabled · 1 disabled");
  await expect(card).toContainText("Alpha source, Missing selection");
  await expect(card).toContainText("Preview to verify inclusion");
  await expect(card).not.toContainText(
    /\b(?:included|loaded|indexed|tokens)\b/i,
  );

  await page.getByRole("button", { name: beta.title, exact: true }).click();
  await expect(card.locator(".context-summary-files strong")).toHaveText("01");
  await expect(card).toContainText("Beta source");
  await expect(card).not.toContainText("Alpha source");
  await expect(card).not.toContainText("Missing selection");
  await page.getByRole("button", { name: alpha.title, exact: true }).click();
  await expect(card).toContainText("Alpha source, Missing selection");

  await card.click();
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().endsWith(`/api/conversations/${alpha.id}`),
  );
  await page.getByRole("switch", { name: "Enable Alpha source" }).click();
  expect((await saved).ok()).toBe(true);
  await page.getByRole("button", { name: "Close context panel" }).click();
  await expect(card.locator(".context-summary-files strong")).toHaveText("01");
  await expect(
    card.locator(".context-summary-files .context-summary-detail"),
  ).toHaveText("Missing selection");
  await expect(card).toContainText("4 enabled · 2 disabled");
  await page.reload();
  await expect(card).toContainText("4 enabled · 2 disabled");
  await expect(
    card.locator(".context-summary-files .context-summary-detail"),
  ).toHaveText("Missing selection");

  // Configuration does not prove a file exists or was sent. Only explicit
  // composition resolves the path and reports its actual exclusion.
  await page
    .getByLabel("Message Canopy")
    .fill("Inspect the configured sources");
  await page
    .getByRole("button", { name: "Preview request", exact: true })
    .click();
  const inspector = page.getByRole("dialog", {
    name: "Your next request, unpacked.",
  });
  const missing = inspector
    .locator(".excluded-source")
    .filter({ hasText: "Missing selection" });
  await expect(missing).toContainText("Path does not exist");
  await inspector.getByRole("button", { name: "Request payload" }).click();
  await expect(inspector.locator(".payload-code")).not.toContainText(
    "BROWSER_ALPHA_SENTINEL",
  );
  await expect(inspector.locator(".payload-code")).toContainText(
    "ALPHA_OVERVIEW_NOTES",
  );
});

test("Keyboard context overview navigation opens the panel without composing or sending", async ({
  page,
}) => {
  const session = await bootstrap(page);
  const chat = await conversation(page, session, "Keyboard context overview", [
    source("file", "Keyboard configured file", { path: "src/beta.ts" }),
  ]);
  await openEmptyConversation(page, chat.id);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/(preview|send)$/.test(request.url()))
      requests.push(request.url());
  });
  const card = overview(page);
  await expect(card).toBeVisible();
  await card.focus();
  await expect(card).toBeFocused();
  await card.press("Enter");
  await expect(
    page.getByRole("complementary", { name: "Conversation context" }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Enable Keyboard configured file" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Add to your context" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Conversation sidebar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close context panel" }).click();
  await card.focus();
  await card.press("Space");
  await expect(
    page.getByRole("complementary", { name: "Conversation context" }),
  ).toBeVisible();
  expect(requests).toEqual([]);
});

test("Workspace themes persist, follow system appearance, and retain mobile context access without overflow", async ({
  page,
}) => {
  const session = await bootstrap(page);
  const chat = await conversation(
    page,
    session,
    "Responsive themed workspace",
    [],
  );
  await openEmptyConversation(page, chat.id);
  const root = page.locator("html");
  async function appearance() {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const settings = page.getByRole("dialog", {
      name: "A workspace that fits you.",
    });
    await settings
      .getByRole("button", { name: "Appearance", exact: true })
      .click();
    return settings;
  }
  try {
    await mkdir("artifacts", { recursive: true });
    let settings = await appearance();
    await settings.getByRole("button", { name: "Dark", exact: true }).click();
    await expect(root).toHaveAttribute("data-theme", "dark");
    await expect(
      settings.getByRole("button", { name: "Dark", exact: true }),
    ).toHaveClass(/active/);
    const darkBackground = await root.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--bg"),
    );
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    await page.reload();
    await expect(root).toHaveAttribute("data-theme", "dark");
    await expect(overview(page)).toBeVisible();
    await expect(page.locator(".suggestion-card").last()).toBeInViewport({
      ratio: 1,
    });
    await page.screenshot({
      path: "artifacts/canopy-original-dark.png",
      fullPage: true,
      animations: "disabled",
    });

    settings = await appearance();
    await settings.getByRole("button", { name: "Light", exact: true }).click();
    await expect(root).toHaveAttribute("data-theme", "light");
    await expect(
      settings.getByRole("button", { name: "Light", exact: true }),
    ).toHaveClass(/active/);
    const lightBackground = await root.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--bg"),
    );
    expect(lightBackground.trim()).not.toBe("");
    expect(lightBackground).not.toBe(darkBackground);
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    await page.reload();
    await expect(root).toHaveAttribute("data-theme", "light");
    await expect(overview(page)).toBeVisible();
    await page.screenshot({
      path: "artifacts/canopy-original-light.png",
      fullPage: true,
      animations: "disabled",
    });

    settings = await appearance();
    await page.emulateMedia({ colorScheme: "dark" });
    await settings.getByRole("button", { name: "System", exact: true }).click();
    await expect(
      settings.getByRole("button", { name: "System", exact: true }),
    ).toHaveClass(/active/);
    await expect(root).toHaveAttribute("data-theme", "dark");
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    await page.emulateMedia({ colorScheme: "light" });
    await expect(root).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(root).toHaveAttribute("data-theme", "light");
    expect((await bootstrap(page)).settings.theme).toBe("system");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(root).toHaveAttribute("data-theme", "dark");

    for (const viewport of [
      { width: 1440, height: 960 },
      { width: 1024, height: 768 },
      { width: 768, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.reload();
      await expect(page.getByLabel("Message Canopy")).toBeInViewport();
      await expect(
        page.getByRole("button", { name: "Add your context" }),
      ).toBeVisible();
      await expect(overview(page)).toBeVisible();
      if (viewport.width > 768) {
        await expect(
          page.getByRole("complementary", { name: "Conversation sidebar" }),
        ).toBeInViewport();
      } else {
        await page
          .getByRole("button", { name: "Open conversation sidebar" })
          .click();
        await expect(
          page.getByRole("complementary", { name: "Conversation sidebar" }),
        ).toBeInViewport();
        await page.getByRole("button", { name: "Close sidebar" }).click();
        await overview(page).click();
        await expect(
          page.getByRole("complementary", { name: "Conversation context" }),
        ).toBeInViewport();
        await page.getByRole("button", { name: "Close context panel" }).click();
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(viewport.width);
      if (viewport.width === 390)
        await page.screenshot({
          path: "artifacts/canopy-original-mobile.png",
          fullPage: true,
          animations: "disabled",
        });
    }
  } finally {
    await api(page, session, "PUT", "/settings", {
      theme: session.settings.theme,
    });
  }
});
