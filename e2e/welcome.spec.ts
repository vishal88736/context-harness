import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Bootstrap, Conversation } from "../src/api";

test("Clean workspace source controls keep files, instructions, permissions, providers, and web excerpts accessible", async ({
  page,
}) => {
  await page.goto("/workspace");
  await expect(page.getByLabel("Message Canopy")).toBeVisible();
  const bootstrapResponse = await page.request.get("/api/bootstrap");
  expect(bootstrapResponse.ok()).toBe(true);
  const session: Bootstrap = await bootstrapResponse.json();
  const createdResponse = await page.request.post("/api/conversations", {
    headers: { "X-Canopy-CSRF": session.csrf },
    data: { workspaceId: session.workspaces[0].id },
  });
  expect(createdResponse.ok()).toBe(true);
  const chat: Conversation = await createdResponse.json();

  try {
    await page.evaluate((id) => {
      localStorage.setItem("canopy.activeConversation", id);
      localStorage.setItem("canopy.contextOpen", "true");
    }, chat.id);
    await page.reload();
    await expect(page.getByLabel("Message Canopy")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "New conversation", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('[data-route-page="workspace"] .welcome-illustration'),
    ).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Context shortcuts" }),
    ).toHaveCount(0);
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({
      path: "artifacts/canopy-clean-workspace.png",
      fullPage: true,
    });

    const addContext = page.getByRole("button", {
      name: "Add context",
      exact: true,
    });
    await addContext.click();
    const sources = page.getByRole("dialog", { name: "Add to your context" });
    await expect(
      sources.getByRole("button", { name: "src", exact: true }),
    ).toBeVisible();
    await sources.getByRole("button", { name: "Cancel", exact: true }).click();

    await addContext.click();
    await sources
      .getByRole("button", { name: "Custom instructions", exact: true })
      .click();
    await expect(sources.getByLabel("Instructions / content")).toBeVisible();
    await sources.getByRole("button", { name: "Cancel", exact: true }).click();

    await page
      .getByRole("button", { name: "Permissions", exact: true })
      .click();
    await expect(page.getByLabel("Run commands permission")).toHaveValue(
      "deny",
    );
    await page.getByRole("button", { name: "Sources", exact: true }).click();

    await page
      .getByRole("button", { name: "Connect provider", exact: true })
      .click();
    const settings = page.getByRole("dialog", {
      name: "A workspace that fits you.",
    });
    await expect(
      settings.getByRole("button", { name: "Add provider", exact: true }),
    ).toBeVisible();
    await settings.getByRole("button", { name: "Close dialog" }).click();

    const url = "https://example.com/canopy-reference";
    const excerpt =
      "WELCOME_WEB_EXCERPT_SENTINEL: Use bounded, explicit context.";
    await addContext.click();
    await sources
      .getByRole("button", { name: "Web excerpt", exact: true })
      .click();
    const web = page.getByRole("dialog", { name: "Add web context" });
    await web.getByLabel("Page URL", { exact: true }).fill(url);
    await web
      .getByLabel("Page title", { exact: true })
      .fill("Reference excerpt");
    await web.getByLabel("Page excerpt", { exact: true }).fill(excerpt);
    await web
      .getByRole("button", { name: "Add excerpt to context", exact: true })
      .click();
    await expect(web).not.toBeVisible();
    const enabled = page.getByRole("switch", {
      name: "Enable Reference excerpt",
      exact: true,
    });
    await expect(enabled).toBeChecked();

    await page
      .getByLabel("Message Canopy")
      .fill("Inspect this explicit reference excerpt");
    await page
      .getByRole("button", { name: "Preview request", exact: true })
      .click();
    const preview = page.getByRole("dialog", {
      name: "Your next request, unpacked.",
    });
    await preview
      .getByRole("button", { name: "Request payload", exact: true })
      .click();
    await expect(preview.locator(".payload-code")).toContainText(url);
    await expect(preview.locator(".payload-code")).toContainText(excerpt);
    await preview.getByRole("button", { name: "Close inspector" }).click();
    await enabled.click();
    await expect(enabled).not.toBeChecked();
    await page
      .getByRole("button", { name: "Preview request", exact: true })
      .click();
    await preview
      .getByRole("button", { name: "Request payload", exact: true })
      .click();
    await expect(preview.locator(".payload-code")).not.toContainText(excerpt);
    await expect(preview.locator(".payload-code")).not.toContainText(url);
    await preview.getByRole("button", { name: "Close inspector" }).click();

    const closeContext = page.getByRole("button", {
      name: "Close context panel",
    });
    if (await closeContext.isVisible()) await closeContext.click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(addContext).toBeInViewport();
    await addContext.click();
    const webExcerpt = sources.getByRole("button", {
      name: "Web excerpt",
      exact: true,
    });
    await webExcerpt.scrollIntoViewIfNeeded();
    await expect(webExcerpt).toBeInViewport();
    await sources.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  } finally {
    const deleted = await page.request.delete(`/api/conversations/${chat.id}`, {
      headers: { "X-Canopy-CSRF": session.csrf },
    });
    expect(deleted.ok()).toBe(true);
  }
});
