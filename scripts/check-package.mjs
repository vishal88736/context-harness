import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import platforms from "../shared/release-platforms.json" with { type: "json" };
import { archiveEntries, extractArchive } from "./archives.mjs";
import {
  powershellBinary,
  powershellArguments,
  terminateWindowsTree,
} from "../shared/windows.mjs";
const target = platforms[`${process.platform}-${process.arch}`];
assert.ok(target, "This package target is unsupported.");
const archive = path.resolve(
  process.argv[2] ??
    `artifacts/releases/canopy-${process.platform}-${process.arch}.${target.extension}`,
);
const entries = archiveEntries(archive).map((entry) =>
  entry.replaceAll("\\", "/"),
);
assert.ok(
  entries.length &&
    entries.every(
      (e) =>
        e.startsWith("canopy/") &&
        !e.split("/").includes("..") &&
        !e.includes(":"),
    ),
);
assert.ok(
  !entries.some((e) =>
    /(^|\/)(vault\.key|owner-password\.hash|context-harness-data|\.env|LOCAL_CODEBASE_GUIDE\.md)(\/|$)/.test(
      e,
    ),
  ),
  "Private runtime files must never enter app downloads.",
);
const temp = await mkdtemp(path.join(tmpdir(), "Canopy package é ! "));
let child;
try {
  extractArchive(archive, temp);
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
      path.join(app, "runtime", target.runtime),
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
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        windowsHide: true,
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
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.send({ type: "canopy:shutdown" });
    const timeout = setTimeout(
      () =>
        process.platform === "win32"
          ? terminateWindowsTree(child)
          : child.kill("SIGKILL"),
      15000,
    );
    try {
      const [code] = await exited;
      assert.equal(code, 0, "The launcher must shut down cleanly through IPC.");
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
    path.join(app, "runtime", target.runtime),
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
    assert.ok(!collisionOutput.includes("Canopy is ready"));
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
  if (process.platform === "win32") {
    const native = spawn(
      powershellBinary,
      powershellArguments("& $env:CANOPY_NATIVE_LAUNCHER; exit $LASTEXITCODE"),
      {
        cwd: app,
        env: {
          ...process.env,
          CANOPY_NATIVE_LAUNCHER: path.join(app, target.launcher),
          CANOPY_NO_PAUSE: "1",
          CANOPY_NO_BROWSER: "1",
          CANOPY_DATA_DIR: dataDir,
          CANOPY_WORKSPACE: project,
          PORT: String(port),
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let nativeLogs = "",
      nativeReady = false;
    native.stdout.on("data", (chunk) => (nativeLogs += chunk));
    native.stderr.on("data", (chunk) => (nativeLogs += chunk));
    try {
      for (let i = 0; i < 200; i++) {
        if (native.exitCode !== null) throw new Error(nativeLogs);
        if (nativeLogs.includes("Canopy is open")) {
          try {
            if ((await fetch(origin + "/api/ready")).ok) {
              nativeReady = true;
              break;
            }
          } catch {
            /* starting */
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(nativeReady, nativeLogs);
      const nativeState = await (await fetch(origin + "/api/bootstrap")).json();
      assert.ok(
        nativeState.conversations.some((c) => c.id === conversation.id),
      );
    } finally {
      if (native.exitCode === null && native.signalCode === null) {
        const ended = once(native, "close");
        terminateWindowsTree(native);
        await ended;
      }
    }
  }
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
        "graceful-ipc-shutdown",
        ...(process.platform === "win32"
          ? ["native-cmd-launcher", "unicode-and-spaced-install-path"]
          : []),
      ],
    }),
  );
} finally {
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    const ended = once(child, "exit");
    if (process.platform === "win32") terminateWindowsTree(child);
    else child.kill("SIGKILL");
    await ended;
  }
  await rm(temp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
