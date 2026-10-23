import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("Editor preferences persist and reconfigure drafts, indentation, focus, and cursor without replacing undo history", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(page.getByLabel("Message Canopy")).toBeVisible();
  const bootstrap = await (await page.request.get("/api/bootstrap")).json();
  const root = path.join(
    path.dirname(bootstrap.workspaces[0].root),
    `Editor preferences ${randomUUID()}`,
  );
  await mkdir(root, { recursive: true });
  const original = "export const value = 1;\nexport const second = 2;\n";
  await writeFile(path.join(root, "main.ts"), original);
  const workspaceResponse = await page.request.post("/api/workspaces", {
    headers: { "X-Canopy-CSRF": bootstrap.csrf },
    data: { root, name: "Editor preferences project" },
  });
  expect(workspaceResponse.ok()).toBe(true);
  const workspace = await workspaceResponse.json();
  const conversationResponse = await page.request.post("/api/conversations", {
    headers: { "X-Canopy-CSRF": bootstrap.csrf },
    data: { workspaceId: workspace.id },
  });
  expect(conversationResponse.ok()).toBe(true);
  const conversation = await conversationResponse.json();
  await page.evaluate((id) => {
    localStorage.setItem("canopy.activeConversation", id);
    localStorage.setItem("canopy.contextOpen", "false");
  }, conversation.id);
  await page.reload();
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  await page
    .getByRole("button", { name: "Open file main.ts", exact: true })
    .click();
  const editor = page.getByRole("textbox", {
    name: "Edit main.ts",
    exact: true,
  });
  await expect(editor).toContainText("export const value = 1;");

  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText("// retain this draft");
  await expect(page.getByLabel("Unsaved changes")).toBeVisible();
  await page
    .getByRole("button", { name: "Editor settings", exact: true })
    .click();
  const settings = page.getByRole("dialog", {
    name: "Editor settings",
    exact: true,
  });
  await settings
    .getByLabel("Editor font size", { exact: true })
    .selectOption("18");
  await settings
    .getByLabel("Editor indentation", { exact: true })
    .selectOption("4");
  await settings.getByRole("switch", { name: "Editor word wrap" }).click();
  await settings.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".source-editor > .cm-editor")).toHaveCSS(
    "font-size",
    "18px",
  );
  await expect(editor).toHaveClass(/cm-lineWrapping/);
  await expect(editor).toContainText("retain this draft");
  await expect(page.locator(".editor-status")).toContainText(
    "TypeScript · Spaces: 4",
  );
  expect(await readFile(path.join(root, "main.ts"), "utf8")).toBe(original);

  // Reconfiguration must preserve CodeMirror's actual edit history.
  await editor.press("ControlOrMeta+z");
  await expect(editor).not.toContainText("retain this draft");
  await expect(page.getByLabel("Unsaved changes")).not.toBeVisible();
  await editor.press("ControlOrMeta+End");
  await editor.press("Tab");
  await expect
    .poll(() => editor.locator(".cm-line").last().textContent())
    .toBe("    ");
  await editor.press("ControlOrMeta+z");
  await expect(page.getByLabel("Unsaved changes")).not.toBeVisible();
  await editor.press("ControlOrMeta+Home");
  await editor.press("ArrowDown");
  await editor.press("ArrowRight");
  await expect(page.getByLabel("Cursor position")).toHaveText("Ln 2, Col 2");

  await page.getByRole("button", { name: "Focus editor", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Project files", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("complementary", {
      name: "Conversation sidebar",
      exact: true,
    }),
  ).toBeVisible();
  await expect(editor).toBeVisible();
  await page
    .getByRole("button", { name: "Exit editor focus", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Project files", exact: true }),
  ).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  await page
    .getByRole("button", { name: "Open file main.ts", exact: true })
    .click();
  await expect(page.locator(".source-editor > .cm-editor")).toHaveCSS(
    "font-size",
    "18px",
  );
  await expect(editor).toHaveClass(/cm-lineWrapping/);
  await expect(page.locator(".editor-status")).toContainText("Spaces: 4");
  await page
    .getByRole("button", { name: "Editor settings", exact: true })
    .click();
  await expect(
    settings.getByLabel("Editor font size", { exact: true }),
  ).toHaveValue("18");
  await expect(
    settings.getByLabel("Editor indentation", { exact: true }),
  ).toHaveValue("4");
  await expect(
    settings.getByRole("switch", { name: "Editor word wrap" }),
  ).toBeChecked();
  await settings
    .getByRole("button", { name: "Reset editor settings", exact: true })
    .click();
  await settings.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".source-editor > .cm-editor")).toHaveCSS(
    "font-size",
    "14px",
  );
  await expect(editor).not.toHaveClass(/cm-lineWrapping/);
  await expect(page.locator(".editor-status")).toContainText("Spaces: 2");

  // A malformed local preference cannot make the editor unusable on restart.
  await page.evaluate(() =>
    localStorage.setItem("canopy.editorPreferences", "{invalid"),
  );
  await page.reload();
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  await page
    .getByRole("button", { name: "Open file main.ts", exact: true })
    .click();
  await expect(page.locator(".source-editor > .cm-editor")).toHaveCSS(
    "font-size",
    "14px",
  );
  await expect(editor).toContainText("export const value = 1;");
  expect(await readFile(path.join(root, "main.ts"), "utf8")).toBe(original);
});
