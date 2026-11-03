import { test, expect } from "@playwright/test";
test.use({ ignoreHTTPSErrors: true });

test("private workspace requires login, exposes effective tool restrictions, and signs out without leaking bootstrap", async ({
  page,
  context,
}) => {
  const origin = "https://127.0.0.1:5274";
  await page.goto(origin + "/workspace");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect((await context.request.get(origin + "/api/bootstrap")).status()).toBe(
    401,
  );
  await page.getByLabel("Owner password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect");
  await page.getByLabel("Owner password").fill("private-browser-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("complementary", {
      name: "Conversation sidebar",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Private workspace", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start new conversation", exact: true })
    .click();
  const bootstrap = await context.request.get(origin + "/api/bootstrap");
  expect(bootstrap.status()).toBe(200);
  const body = await bootstrap.json();
  expect(body.capabilities.terminal).toBe("disabled");
  expect(JSON.stringify(body)).not.toContain("scrypt$");
  if (
    !(await page
      .getByRole("button", { name: "Permissions", exact: true })
      .isVisible())
  )
    await page.getByRole("button", { name: /Conversation context/ }).click();
  await page.getByRole("button", { name: "Permissions", exact: true }).click();
  await expect(page.getByLabel("Run commands permission")).toBeDisabled();
  await expect(page.getByRole("status")).toContainText(
    "disabled by this instance",
  );
  await page.screenshot({ path: "artifacts/canopy-private-workspace.png" });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect((await context.request.get(origin + "/api/bootstrap")).status()).toBe(
    401,
  );
});
