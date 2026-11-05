import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  powershellBinary,
  powershellArguments,
  terminateWindowsTree,
} from "../shared/windows.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const state =
  process.env.CANOPY_DATA_DIR ??
  (process.platform === "win32"
    ? path.join(
        process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"),
        "Canopy",
        "data",
      )
    : path.join(
        process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local/share"),
        "canopy/data",
      ));
const project =
  process.env.CANOPY_WORKSPACE ?? path.join(homedir(), "Canopy Projects");
await mkdir(project, { recursive: true });
await mkdir(state, { recursive: true, mode: 0o700 });
const port = Number(process.env.PORT ?? 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid PORT.");
const env = {
  ...process.env,
  CANOPY_MODE: "local",
  CANOPY_HOST: "127.0.0.1",
  CANOPY_DATA_DIR: state,
  CANOPY_WORKSPACE: project,
  PATH: `${path.join(root, "runtime")}${path.delimiter}${process.env.PATH ?? ""}`,
};
let started = false,
  stopping = false,
  opened = false,
  failed = false,
  stopTimer;
const child = spawn(
  process.execPath,
  [path.join(root, "dist-server/index.js")],
  {
    cwd: root,
    env,
    stdio: ["inherit", "pipe", "inherit", "ipc"],
    windowsHide: true,
  },
);
let startupOutput = "";
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  startupOutput = (startupOutput + chunk).slice(-2048);
  if (startupOutput.includes(`Canopy is ready at http://127.0.0.1:${port}`))
    started = true;
});
child.once("error", (error) => {
  failed = stopping = true;
  console.error(error.message);
  process.exitCode = 1;
  if (process.connected) process.disconnect();
});
child.once("exit", (code) => {
  clearTimeout(stopTimer);
  process.exitCode =
    failed || (!opened && !stopping) ? 1 : (code ?? (stopping ? 0 : 1));
  if (process.connected) process.disconnect();
});
function stop(failure = false) {
  if (failure) failed = true;
  if (stopping || child.exitCode !== null || child.signalCode !== null) return;
  stopping = true;
  const force = () =>
    process.platform === "win32"
      ? terminateWindowsTree(child)
      : child.kill("SIGKILL");
  if (child.connected)
    child.send({ type: "canopy:shutdown" }, (error) => {
      if (error) force();
    });
  else force();
  stopTimer = setTimeout(force, 12_000);
  stopTimer.unref();
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop());
if (process.send) {
  process.on("message", (message) => {
    if (message?.type === "canopy:shutdown") stop();
  });
  process.once("disconnect", () => stop());
}
const url = `http://127.0.0.1:${port}/workspace`;
for (let i = 0; i < 100 && child.exitCode === null && !stopping; i++) {
  if (!started) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    continue;
  }
  try {
    const result = await fetch(`http://127.0.0.1:${port}/api/ready`, {
      signal: AbortSignal.timeout(500),
    });
    if (result.ok && !stopping && child.exitCode === null) {
      opened = true;
      if (process.env.CANOPY_NO_BROWSER !== "1") {
        const opener =
          process.platform === "win32"
            ? spawn(
                powershellBinary,
                powershellArguments(
                  "Start-Process -FilePath $env:CANOPY_BROWSER_URL",
                ),
                {
                  env: { ...process.env, CANOPY_BROWSER_URL: url },
                  windowsHide: true,
                  stdio: "ignore",
                },
              )
            : spawn(
                process.platform === "darwin" ? "open" : "xdg-open",
                [url],
                { stdio: "ignore" },
              );
        opener.on("error", () => console.log(`Open ${url}`));
        opener.unref();
      }
      console.log(
        `Canopy is open at ${url}. Close this terminal or press Ctrl+C to stop. Your data is in ${state}.`,
      );
      break;
    }
  } catch {
    /* The local service is starting. */
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (!opened && !stopping && child.exitCode === null) {
  stop(true);
  console.error(
    "Canopy did not become ready. Check the startup error and whether its port is already in use.",
  );
  process.exitCode = 1;
}
