import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixtureProvider } from "./fixture-provider";

test("Production process serves real assets and persists a complete conversation across a full restart", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "canopy-production-"));
  const root = path.join(temp, "project");
  await mkdir(root);
  await writeFile(
    path.join(root, "reference.ts"),
    'const value = "PRODUCTION_RESTART_SENTINEL";\n',
  );
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = (reservation.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const provider = await fixtureProvider();
  let child: ChildProcess | null = null;
  let cookie = "";
  let csrf = "";
  let log = "";
  async function start() {
    child = spawn(process.execPath, ["dist-server/index.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        CANOPY_WORKSPACE: root,
        CANOPY_DATA_DIR: path.join(temp, "data"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => {
      log += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      log += String(chunk);
    });
    for (let i = 0; i < 150; i++) {
      try {
        const r = await fetch(origin + "/api/health");
        if (r.ok) return;
      } catch {
        /* server is starting */
      }
      if (child.exitCode !== null) throw new Error(log);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error(`Production server did not start: ${log}`);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exit = once(child, "exit");
    child.kill("SIGTERM");
    await exit;
    child = null;
  }
  async function bootstrap() {
    const r = await fetch(origin + "/api/bootstrap");
    cookie = r.headers.get("set-cookie")!.split(";")[0];
    const b = await r.json();
    csrf = b.csrf;
    return b;
  }
  async function call(route: string, method = "GET", body?: unknown) {
    const r = await fetch(origin + "/api" + route, {
      method,
      headers: {
        Cookie: cookie,
        "X-Canopy-CSRF": csrf,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.ok(r.ok, await r.clone().text());
    return r;
  }
  try {
    await start();
    const html = await fetch(origin);
    assert.equal(html.status, 200);
    assert.match(
      html.headers.get("content-security-policy")!,
      /default-src 'self'/,
    );
    const page = await html.text();
    assert.match(page, /Canopy/);
    const asset = page.match(/src="([^\"]+\.js)"/)?.[1];
    assert.ok(asset);
    assert.equal((await fetch(origin + asset)).status, 200);
    const workspace = await fetch(origin + "/workspace");
    assert.equal(workspace.status, 200);
    assert.match(workspace.headers.get("content-type")!, /text\/html/);
    assert.equal(await workspace.text(), page);
    const b = await bootstrap();
    const c = await (
      await call("/conversations", "POST", { workspaceId: b.workspaces[0].id })
    ).json();
    await call(`/conversations/${c.id}`, "PATCH", {
      config: {
        ...c.config,
        sources: [
          {
            id: "restart-file",
            type: "file",
            name: "reference.ts",
            path: "reference.ts",
            enabled: true,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    });
    const p = await (
      await call("/providers", "POST", {
        name: "Production HTTP fixture",
        kind: "compatible",
        baseUrl: provider.baseUrl,
        apiKey: "fixture-private-key-12345",
      })
    ).json();
    await call(`/providers/${p.id}/discover`, "POST");
    await call("/settings", "PUT", {
      theme: "light",
      defaultModel: { providerId: p.id, modelId: "fixture-coder" },
    });
    const response = await call(`/conversations/${c.id}/send`, "POST", {
      prompt: "Persist this production conversation",
    });
    assert.match(await response.text(), /"type":"done"/);
    const before = await (await call(`/conversations/${c.id}`)).json();
    assert.equal(before.messages.length, 2);
    assert.match(
      JSON.stringify(provider.requests.at(-1)),
      /PRODUCTION_RESTART_SENTINEL/,
    );
    await stop();
    await start();
    assert.equal((await fetch(origin + "/workspace")).status, 200);
    const restored = await bootstrap();
    assert.equal(restored.settings.theme, "light");
    assert.equal(restored.settings.defaultModel.modelId, "fixture-coder");
    assert.ok(restored.providers[0].keyConfigured);
    assert.doesNotMatch(JSON.stringify(restored), /fixture-private-key-12345/);
    const after = await (await call(`/conversations/${c.id}`)).json();
    assert.deepEqual(after.messages, before.messages);
    assert.deepEqual(after.conversation.config, before.conversation.config);
    assert.equal(after.invocations[0].status, "complete");
    const snapshot = await (
      await call(`/invocations/${after.messages[1].invocationId}`)
    ).json();
    assert.match(
      JSON.stringify(snapshot.snapshot.payload),
      /PRODUCTION_RESTART_SENTINEL/,
    );
  } finally {
    await stop();
    await provider.close();
    await rm(temp, { recursive: true, force: true });
  }
});
