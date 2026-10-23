import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("Home stays independent and workspace navigation preserves chat, context, editor drafts, and modal focus", async ({
  page,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  const bootstraps: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/bootstrap"))
      bootstraps.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Your next build/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Conversation sidebar" }),
  ).toHaveCount(0);
  await expect(page).toHaveTitle("Canopy — Context-first AI coding");
  expect(bootstraps).toEqual([]);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/canopy-home.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("link", { name: "Open workspace", exact: true }).first(),
  ).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "artifacts/canopy-home-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page
    .getByRole("link", { name: "Open workspace", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByLabel("Message Canopy")).toBeVisible();
  const bootstrap = await (await page.request.get("/api/bootstrap")).json();
  const created = await page.request.post("/api/conversations", {
    headers: { "X-Canopy-CSRF": bootstrap.csrf },
    data: { workspaceId: bootstrap.workspaces[0].id },
  });
  const chat = await created.json();
  const source = {
    id: randomUUID(),
    type: "file",
    name: "Navigation alpha",
    enabled: true,
    path: "src/alpha.ts",
    createdAt: new Date().toISOString(),
  };
  const configured = await page.request.patch(`/api/conversations/${chat.id}`, {
    headers: { "X-Canopy-CSRF": bootstrap.csrf },
    data: {
      title: "Navigation retained conversation",
      config: { ...chat.config, sources: [source] },
    },
  });
  expect(configured.ok()).toBe(true);
  await page.evaluate((id) => {
    localStorage.setItem("canopy.activeConversation", id);
    localStorage.setItem("canopy.contextOpen", "false");
  }, chat.id);
  await page.reload();
  await page
    .getByLabel("Message Canopy")
    .fill("Keep this unsent conversation draft");
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  await page
    .getByRole("button", { name: "Open folder src", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open file alpha.ts", exact: true })
    .click();
  const editor = page.getByRole("textbox", {
    name: "Edit src/alpha.ts",
    exact: true,
  });
  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText("// retained unsaved editor draft");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: /Your next build/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Canopy home", exact: true }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(editor).toContainText("retained unsaved editor draft");
  await page.goForward();
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("link", { name: "Resume workspace", exact: true })
    .first()
    .click();
  await expect(editor).toContainText("retained unsaved editor draft");
  await expect(
    page.getByRole("button", { name: "In conversation context", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Editor settings", exact: true })
    .click();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: /Your next build/ }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await page.goForward();
  const modal = page.getByRole("dialog", {
    name: "Editor settings",
    exact: true,
  });
  await expect(modal).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await modal.evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await expect(page.getByLabel("Message Canopy")).toHaveValue(
    "Keep this unsent conversation draft",
  );
  const detail = await (
    await page.request.get(`/api/conversations/${chat.id}`)
  ).json();
  expect(detail.conversation.config.sources).toEqual([source]);
  await page.reload();
  await expect(page.getByLabel("Message Canopy")).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("canopy.activeConversation"),
    ),
  ).toBe(chat.id);
  await expect(
    page.getByRole("button", { name: "Open conversation context overview" }),
  ).toContainText("Navigation alpha");
});

test("Escape closes only the topmost source dialog and retains profile edits", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(page.getByLabel("Message Canopy")).toBeVisible();
  await page
    .getByRole("button", { name: "Context profiles", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Coding profile", exact: true })
    .click();
  const profile = page.getByRole("dialog", {
    name: "Make this profile yours.",
    exact: true,
  });
  await profile
    .getByLabel("Profile name", { exact: true })
    .fill("Retain unsaved profile edit");
  await profile
    .getByRole("button", { name: "Add source to profile", exact: true })
    .click();
  const source = page.getByRole("dialog", {
    name: "Add to your context",
    exact: true,
  });
  await expect(source).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(source).not.toBeVisible();
  await expect(profile).toBeVisible();
  await expect(profile.getByLabel("Profile name", { exact: true })).toHaveValue(
    "Retain unsaved profile edit",
  );
  await profile.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Done", exact: true })
    .click();
});
