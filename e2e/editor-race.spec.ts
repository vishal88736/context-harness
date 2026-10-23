import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("Concurrent file opens preserve drafts, latest navigation, and edits made during a reload", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(page.getByLabel("Message Canopy")).toBeVisible();
  const bootstrap = await (await page.request.get("/api/bootstrap")).json();
  const workspace = bootstrap.workspaces[0];
  const chat = await (
    await page.request.post("/api/conversations", {
      headers: { "X-Canopy-CSRF": bootstrap.csrf },
      data: { workspaceId: workspace.id },
    })
  ).json();
  await page.evaluate((id) => {
    localStorage.setItem("canopy.activeConversation", id);
    localStorage.setItem("canopy.contextOpen", "false");
  }, chat.id);
  await page.reload();
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  await page
    .getByRole("button", { name: "Open folder src", exact: true })
    .click();
  const original = await readFile(
    path.join(workspace.root, "src/alpha.ts"),
    "utf8",
  );
  const opening = gate();
  const reloading = gate();
  let reads = 0;
  await page.route("**/api/workspaces/*/file?*", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("path") !== "src/alpha.ts"
    )
      return route.continue();
    const number = ++reads;
    const response = await route.fetch();
    if (number === 1) await opening.promise;
    if (number === 2) await reloading.promise;
    await route.fulfill({ response });
  });
  try {
    const alphaFile = page.getByRole("button", {
      name: "Open file alpha.ts",
      exact: true,
    });
    await alphaFile.click();
    await alphaFile.click();
    await expect.poll(() => reads).toBe(1);
    await page
      .getByRole("button", { name: "Open file beta.ts", exact: true })
      .click();
    const beta = page.getByRole("textbox", {
      name: "Edit src/beta.ts",
      exact: true,
    });
    await expect(beta).toBeVisible();
    opening.release();
    const alphaTab = page.getByRole("tab", { name: "alpha.ts", exact: true });
    await expect(alphaTab).toBeVisible();
    await expect(beta).toBeVisible();
    await expect(alphaTab).toHaveAttribute("aria-selected", "false");
    await alphaTab.click();
    const alpha = page.getByRole("textbox", {
      name: "Edit src/alpha.ts",
      exact: true,
    });
    await alpha.fill(original + "// first unsaved draft");
    expect(reads).toBe(1);
    await page
      .getByRole("button", { name: "Reload file from disk", exact: true })
      .click();
    const confirm = page.getByRole("dialog", {
      name: "Reload this file?",
      exact: true,
    });
    await confirm
      .getByRole("button", { name: "Reload from disk", exact: true })
      .click();
    await expect.poll(() => reads).toBe(2);
    await alpha.fill(original + "// changed while reload waited");
    reloading.release();
    await expect(page.getByRole("alert")).toContainText(
      "Your draft changed while reloading. Your edits were kept.",
    );
    await expect(alpha).toContainText("changed while reload waited");
    expect(
      await readFile(path.join(workspace.root, "src/alpha.ts"), "utf8"),
    ).toBe(original);
    // A subsequent explicit reload still works when no newer edit races it.
    await page
      .getByRole("button", { name: "Reload file from disk", exact: true })
      .click();
    await confirm
      .getByRole("button", { name: "Reload from disk", exact: true })
      .click();
    await expect(alpha).not.toContainText("changed while reload waited");
    await expect(page.getByLabel("Unsaved changes")).not.toBeVisible();
    expect(reads).toBe(3);
  } finally {
    opening.release();
    reloading.release();
  }
});
