import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

async function openProject(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Message Canopy")).toBeVisible();
  const bootstrap = await (await page.request.get("/api/bootstrap")).json();
  const root = path.join(
    path.dirname(bootstrap.workspaces[0].root),
    `External project ${randomUUID()}`,
  );
  await mkdir(path.join(root, "src"), { recursive: true });
  const original = 'export const external = "EXTERNAL_PROJECT_SENTINEL";\n';
  await writeFile(path.join(root, "src/notes.ts"), original);
  await writeFile(path.join(root, "README.md"), "# External project\n");
  await page.getByRole("button", { name: "Open folder", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Open a project folder" });
  await picker.getByLabel("Folder location").fill(root);
  await expect(
    picker.getByRole("button", { name: "Open this folder", exact: true }),
  ).toBeDisabled();
  await picker.getByRole("button", { name: "Go", exact: true }).click();
  await expect(
    picker.getByRole("button", { name: "src", exact: true }),
  ).toBeVisible();
  await picker.getByLabel("Workspace name").fill("External coding project");
  await picker
    .getByRole("button", { name: "Open this folder", exact: true })
    .click();
  await expect(picker).not.toBeVisible();
  await expect(page.locator(".workspace-breadcrumb")).toContainText(
    "External coding project",
  );
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  await page
    .getByRole("button", { name: "Open folder src", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open file notes.ts", exact: true })
    .click();
  const editor = page.getByRole("textbox", {
    name: "Edit src/notes.ts",
    exact: true,
  });
  await expect(editor).toContainText("EXTERNAL_PROJECT_SENTINEL");
  return { root, original, editor, bootstrap };
}

test("External folder, code drafts, reviewed save, explicit context selection, and exact preview work together", async ({
  page,
}) => {
  const { root, original, editor } = await openProject(page);
  const changed =
    'export const external = "EXTERNAL_PROJECT_SENTINEL_UPDATED";\n';
  await editor.fill(changed);
  await expect(page.getByLabel("Unsaved changes")).toBeVisible();
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  await expect(editor).toContainText("EXTERNAL_PROJECT_SENTINEL_UPDATED");
  await page
    .getByRole("button", { name: "Review & save", exact: true })
    .click();
  const review = page.getByRole("dialog", { name: "Review your file change" });
  await expect(review.locator(".diff-preview")).toContainText(
    "EXTERNAL_PROJECT_SENTINEL_UPDATED",
  );
  expect(await readFile(path.join(root, "src/notes.ts"), "utf8")).toBe(
    original,
  );
  await review
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  expect(await readFile(path.join(root, "src/notes.ts"), "utf8")).toBe(
    original,
  );
  await page
    .getByRole("button", { name: "Review & save", exact: true })
    .click();
  await review
    .getByRole("button", { name: "Apply file change", exact: true })
    .click();
  await expect(review).not.toBeVisible();
  expect(await readFile(path.join(root, "src/notes.ts"), "utf8")).toBe(changed);
  await expect(page.locator(".editor-status")).toContainText("Saved on disk");
  await page
    .getByRole("button", { name: "Add file to context", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "In conversation context", exact: true }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await page
    .getByLabel("Message Canopy")
    .fill("Inspect the selected external file");
  await page
    .getByRole("button", { name: "Preview request", exact: true })
    .click();
  const inspector = page.getByRole("dialog", {
    name: "Your next request, unpacked.",
  });
  await inspector
    .getByRole("button", { name: "Request payload", exact: true })
    .click();
  await expect(inspector.locator(".payload-code")).toContainText(
    "EXTERNAL_PROJECT_SENTINEL_UPDATED",
  );
  await expect(inspector.locator(".payload-code")).not.toContainText(
    "BROWSER_ALPHA_SENTINEL",
  );
  await expect(inspector.locator(".payload-code")).not.toContainText(
    "BROWSER_BETA_SENTINEL",
  );
  await inspector.getByRole("button", { name: "Close inspector" }).click();
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  await page.getByRole("button", { name: "Collapse file explorer" }).click();
  await expect(
    page.getByRole("button", { name: "Expand file explorer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand file explorer" }).click();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/canopy-light-code.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "artifacts/canopy-light-code-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("Stale editor approvals preserve newer files and reload recovers the draft safely", async ({
  page,
}) => {
  const { root, editor, bootstrap } = await openProject(page);
  await editor.fill('export const external = "MY_DRAFT";\n');
  await page
    .getByRole("button", { name: "Review & save", exact: true })
    .click();
  const review = page.getByRole("dialog", { name: "Review your file change" });
  await expect(review).toBeVisible();
  const externalChange =
    'export const external = "CHANGED_BY_ANOTHER_PROCESS";\n';
  await writeFile(path.join(root, "src/notes.ts"), externalChange);
  await review
    .getByRole("button", { name: "Apply file change", exact: true })
    .click();
  await expect(review).not.toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "file changed after preview",
  );
  expect(await readFile(path.join(root, "src/notes.ts"), "utf8")).toBe(
    externalChange,
  );
  await expect(editor).toContainText("MY_DRAFT");
  await page
    .getByRole("button", { name: "Reload file from disk", exact: true })
    .click();
  const reload = page.getByRole("dialog", { name: "Reload this file?" });
  await reload
    .getByRole("button", { name: "Reload from disk", exact: true })
    .click();
  await expect(editor).toContainText("CHANGED_BY_ANOTHER_PROCESS");
  await editor.fill('export const external = "REVIEWED_RECOVERY";\n');
  await page
    .getByRole("button", { name: "Review & save", exact: true })
    .click();
  await review
    .getByRole("button", { name: "Apply file change", exact: true })
    .click();
  await expect(review).not.toBeVisible();
  expect(await readFile(path.join(root, "src/notes.ts"), "utf8")).toContain(
    "REVIEWED_RECOVERY",
  );
  const current = await (await page.request.get("/api/bootstrap")).json();
  const workspace = current.workspaces.find(
    (w: { root: string }) => w.root === root,
  );
  const response = await page.request.get(
    `/api/workspaces/${workspace.id}/file-changes`,
  );
  const audit = await response.json();
  expect(
    audit.changes.some(
      (change: { decision: string }) => change.decision === "invalidated",
    ),
  ).toBe(true);
  expect(
    audit.changes.some(
      (change: { decision: string }) => change.decision === "applied",
    ),
  ).toBe(true);
  expect(bootstrap.csrf).toBeTruthy();
});
