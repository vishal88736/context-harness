import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import type { AccessOptions } from "./access";
import { assertSandboxAvailable, type TerminalPolicy } from "./sandbox";

export async function runtimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.CANOPY_MODE ?? "local";
  if (mode !== "local" && mode !== "private")
    throw new Error("CANOPY_MODE must be local or private.");
  const port = Number(env.PORT ?? 4317);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("PORT must be an integer between 1024 and 65535.");
  const host = env.CANOPY_HOST ?? "127.0.0.1";
  if (
    !["127.0.0.1", "::1", "0.0.0.0"].includes(host) ||
    (mode === "local" && host === "0.0.0.0")
  )
    throw new Error(
      "Local mode must bind to loopback. Use private mode for network access.",
    );
  const root = path.resolve(env.CANOPY_WORKSPACE ?? process.cwd());
  const dataDir = path.resolve(
    env.CANOPY_DATA_DIR ?? path.join(root, "context-harness-data"),
  );
  const terminal =
    env.CANOPY_TERMINAL_POLICY ?? (mode === "private" ? "disabled" : "host");
  if (
    !["host", "disabled", "sandbox"].includes(terminal) ||
    (mode === "private" && terminal === "host")
  )
    throw new Error(
      "Private mode requires disabled or sandbox terminal policy.",
    );
  if (terminal === "sandbox") assertSandboxAvailable();
  const access: AccessOptions = {
    mode,
    logRequests:
      env.CANOPY_LOG_REQUESTS === "1" ||
      (mode === "private" && env.CANOPY_LOG_REQUESTS !== "0"),
  };
  if (mode === "private") {
    if (
      !env.CANOPY_PASSWORD_FILE ||
      !env.CANOPY_PUBLIC_ORIGIN ||
      env.CANOPY_TRUST_PROXY !== "1"
    )
      throw new Error(
        "Private mode requires CANOPY_PASSWORD_FILE, CANOPY_PUBLIC_ORIGIN, and CANOPY_TRUST_PROXY=1 behind a trusted HTTPS proxy.",
      );
    const filename = path.resolve(env.CANOPY_PASSWORD_FILE);
    const info = await stat(filename);
    if (
      !info.isFile() ||
      info.size > 1024 ||
      (process.platform !== "win32" && info.mode & 0o007)
    )
      throw new Error(
        "Owner password hash must be a small private file, with no world permissions.",
      );
    access.passwordHash = (await readFile(filename, "utf8")).trim();
    access.publicOrigin = env.CANOPY_PUBLIC_ORIGIN;
    access.trustedProxy = true;
  }
  return {
    host,
    port,
    root,
    dataDir,
    access,
    terminalPolicy: terminal as TerminalPolicy,
    projectsRoot: path.resolve(env.CANOPY_PROJECTS_ROOT ?? root),
  };
}
