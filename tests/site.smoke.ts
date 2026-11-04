import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

test("public website offers verified local downloads without bootstrapping a coding backend", async () => {
  const root = path.resolve("dist-site");
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
  };
  const server = http.createServer(async (req, res) => {
    const name = new URL(req.url!, "http://localhost").pathname;
    const filename = path.resolve(
      root,
      "." + (name === "/" ? "/index.html" : decodeURIComponent(name)),
    );
    if (!filename.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const data = await readFile(filename);
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(filename)] ?? "application/octet-stream",
      });
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_PATH ??
      (!process.env.CI && existsSync("/usr/bin/chromium")
        ? "/usr/bin/chromium"
        : undefined),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const errors: string[] = [],
      api: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.url().includes("/api/")) api.push(r.url());
    });
    await page.goto(origin);
    await page
      .getByRole("link", { name: "Get Canopy", exact: true })
      .first()
      .click();
    await page.getByRole("heading", { name: "Bring Canopy home." }).waitFor();
    await page.getByText("Package not published yet").first().waitFor();
    assert.equal(
      await page.getByRole("link", { name: /Download ·/ }).count(),
      0,
    );
    const manifest = {
      version: "v1.0.0",
      artifacts: [
        {
          platform: "linux-x64",
          url: "/downloads/v1.0.0/canopy-linux-x64.tar.gz",
          sha256: "a".repeat(64),
          bytes: 104857600,
        },
      ],
    };
    await page.route("**/downloads/latest.json", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(manifest),
      }),
    );
    await page.reload();
    const link = page.getByRole("link", { name: "Download · 100 MB" });
    await link.waitFor();
    assert.equal(await link.getAttribute("href"), manifest.artifacts[0].url);
    await page
      .locator("#download")
      .screenshot({ path: "artifacts/canopy-public-downloads.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page
      .locator("#download")
      .screenshot({ path: "artifacts/canopy-public-downloads-mobile.png" });
    await page.route("**/downloads/latest.json", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...manifest,
          artifacts: [
            { ...manifest.artifacts[0], url: "https://evil.example/app" },
          ],
        }),
      }),
    );
    await page.reload();
    await page.getByText("Package not published yet").first().waitFor();
    assert.equal(
      await page.getByRole("link", { name: /Download ·/ }).count(),
      0,
    );
    assert.equal(api.length, 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
