import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createApp } from "../server/app";

test("compressed JSON is rejected without crashing the service", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "canopy-http-security-"));
  const service = await createApp({ root, dataDir: path.join(root, "data") });
  const server = service.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const bootstrap = await fetch(origin + "/api/bootstrap");
    const { csrf } = await bootstrap.json();
    const response = await fetch(origin + "/api/conversations", {
      method: "POST",
      headers: {
        Cookie: bootstrap.headers.get("set-cookie")!.split(";")[0],
        "X-Canopy-CSRF": csrf,
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      },
      body: Buffer.concat([gzipSync("{}"), Buffer.from("trailing bytes")]),
    });
    assert.equal(response.status, 415);
    assert.equal((await fetch(origin + "/api/health")).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    service.close();
    await rm(root, { recursive: true, force: true });
  }
});
