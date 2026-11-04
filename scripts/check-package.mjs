import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";
import { spawn, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const archive = path.resolve(
  process.argv[2] ??
    `artifacts/releases/canopy-${process.platform}-${process.arch}.tar.gz`,
);
const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
  .trim()
  .split("\n");
assert.ok(
  entries.every((e) => e.startsWith("canopy/") && !e.split("/").includes("..")),
);
assert.ok(
  !entries.some((e) =>
    /(^|\/)(vault\.key|owner-password\.hash|context-harness-data|\.env|LOCAL_CODEBASE_GUIDE\.md)(\/|$)/.test(
      e,
    ),
  ),
  "Private runtime files must never enter app downloads.",
);
const temp = await mkdtemp(path.join(tmpdir(), "canopy-package-check-"));
let child;
try {
  execFileSync("tar", ["-xzf", archive, "-C", temp]);
  const app = path.join(temp, "canopy"),
    project = path.join(temp, "project"),
    dataDir = path.join(temp, "data");
  await mkdir(project);
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((r) => reservation.close(r));
  const origin = `http://127.0.0.1:${port}`;
  let logs = "";
  const start = async () => {
    child = spawn(
      path.join(app, "runtime/node"),
      [path.join(app, "scripts/launcher.mjs")],
      {
        cwd: app,
        env: {
          ...process.env,
          CANOPY_NO_BROWSER: "1",
          CANOPY_DATA_DIR: dataDir,
          CANOPY_WORKSPACE: project,
          CANOPY_TERMINAL_POLICY: "disabled",
          PORT: String(port),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (c) => (logs += c));
    child.stderr.on("data", (c) => (logs += c));
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(logs);
      try {
        if ((await fetch(origin + "/api/ready")).ok) return;
      } catch {
        /* starting */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Packaged app did not become ready.");
  };
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const timeout = setTimeout(() => child.kill("SIGKILL"), 15000);
    try {
      await exited;
    } finally {
      clearTimeout(timeout);
    }
  };
  await start();
  const bootstrap = await fetch(origin + "/api/bootstrap");
  const body = await bootstrap.json();
  const response = await fetch(origin + "/api/conversations", {
    method: "POST",
    headers: {
      Cookie: bootstrap.headers.get("set-cookie").split(";")[0],
      "X-Canopy-CSRF": body.csrf,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ workspaceId: body.workspaces[0].id }),
  });
  assert.equal(response.status, 201);
  const conversation = await response.json();
  const collision = spawn(
    path.join(app, "runtime/node"),
    [path.join(app, "scripts/launcher.mjs")],
    {
      cwd: app,
      env: {
        ...process.env,
        CANOPY_NO_BROWSER: "1",
        CANOPY_DATA_DIR: path.join(temp, "second-data"),
        CANOPY_WORKSPACE: project,
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let collisionOutput = "";
  collision.stdout.on("data", (c) => (collisionOutput += c));
  collision.stderr.on("data", () => {});
  const collisionTimeout = setTimeout(() => collision.kill("SIGKILL"), 5000);
  try {
    const [exit] = await once(collision, "exit");
    assert.equal(exit, 1);
    assert.ok(!collisionOutput.includes("Canopy is open"));
  } finally {
    clearTimeout(collisionTimeout);
  }
  await stop();
  await start();
  const restored = await (await fetch(origin + "/api/bootstrap")).json();
  assert.ok(restored.conversations.some((c) => c.id === conversation.id));
  assert.equal((await fetch(origin + "/workspace")).status, 200);
  await stop();
  const release = JSON.parse(
    await readFile(path.join(app, "release.json"), "utf8"),
  );
  console.log(
    JSON.stringify({
      ok: true,
      archive,
      platform: release.platform,
      commit: release.commit,
      dirty: release.dirty,
      checks: [
        "bundled-runtime",
        "launcher",
        "assets",
        "private-files-excluded",
        "conversation-persistence",
        "restart",
        "occupied-port-rejected",
      ],
    }),
  );
} finally {
  if (child && child.exitCode === null) child.kill("SIGTERM");
  await rm(temp, { recursive: true, force: true });
}
