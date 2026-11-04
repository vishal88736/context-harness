import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const state =
  process.env.CANOPY_DATA_DIR ??
  path.join(
    process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local/share"),
    "canopy/data",
  );
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
  opened = false;
const child = spawn(
  process.execPath,
  [path.join(root, "dist-server/index.js")],
  { cwd: root, env, stdio: ["inherit", "pipe", "inherit"] },
);
let startupOutput = "";
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  startupOutput = (startupOutput + chunk).slice(-2048);
  if (startupOutput.includes(`Canopy is ready at http://127.0.0.1:${port}`))
    started = true;
});
child.once("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = !opened && !stopping ? 1 : (code ?? (stopping ? 0 : 1));
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    stopping = true;
    child.kill(signal);
  });
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
    if (result.ok) {
      opened = true;
      if (process.env.CANOPY_NO_BROWSER !== "1")
        spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
          stdio: "ignore",
        }).on("error", () => console.log(`Open ${url}`));
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
  child.kill("SIGTERM");
  console.error(
    "Canopy did not become ready. Check the startup error and whether its port is already in use.",
  );
  process.exitCode = 1;
}
