import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashPassword } from "../server/access";
import { backupData, restoreData } from "../server/backup";
import { verifyLive } from "./verify-live";
import { redact } from "../server/security";

const [command, ...args] = process.argv.slice(2);
function option(name: string) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`--${name} requires a value.`);
  return value;
}
function required(name: string) {
  const value = option(name);
  if (!value) throw new Error(`--${name} is required.`);
  return path.resolve(value);
}
async function password() {
  if (!process.stdin.isTTY) {
    let value = "";
    for await (const chunk of process.stdin) {
      value += chunk;
      if (value.length > 2048) throw new Error("Password input is too long.");
    }
    return value.replace(/\r?\n$/, "");
  }
  process.stderr.write("New owner password (14+ characters, input hidden): ");
  const muted = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const reader = createInterface({
    input: process.stdin,
    output: muted,
    terminal: true,
  });
  try {
    const value = await reader.question("");
    process.stderr.write("\n");
    return value;
  } finally {
    reader.close();
  }
}
async function main() {
  const dataDir = option("data-dir") ?? process.env.CANOPY_DATA_DIR;
  if (command === "password") {
    const output = required("output");
    const hash = await hashPassword(await password());
    await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
    await writeFile(output, hash + "\n", { mode: 0o600, flag: "wx" });
    return {
      ok: true,
      file: output,
      note: "Keep this file private. It contains a salted password hash.",
    };
  }
  if (command === "backup") {
    if (!dataDir) throw new Error("Set CANOPY_DATA_DIR or --data-dir.");
    return { ok: true, ...(await backupData(dataDir, required("output"))) };
  }
  if (command === "restore") {
    if (!dataDir)
      throw new Error(
        "Set CANOPY_DATA_DIR or --data-dir to a NEW directory. Stop the service first.",
      );
    return { ok: true, ...(await restoreData(required("backup"), dataDir)) };
  }
  if (command === "live") return verifyLive(args.includes("--require-handoff"));
  if (command === "smoke") {
    const origin = new URL(option("url") ?? "http://127.0.0.1:4317");
    if (
      origin.protocol !== "https:" &&
      !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)
    )
      throw new Error("Remote deployment checks require HTTPS.");
    const get = (route: string) =>
      fetch(new URL(route, origin), {
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
    for (const route of ["/", "/workspace", "/api/health", "/api/ready"]) {
      const response = await get(route);
      if (!response.ok)
        throw new Error(
          `Deployment check failed for ${route}: ${response.status}`,
        );
      if (route === "/" || route === "/workspace") {
        if (!(await response.text()).includes("Canopy"))
          throw new Error("Unexpected deployed application.");
      }
    }
    const bootstrap = await get("/api/bootstrap");
    if (origin.protocol === "https:" && bootstrap.status !== 401)
      throw new Error(
        "Private deployment exposes bootstrap data without login.",
      );
    return {
      ok: true,
      origin: origin.origin,
      checks: ["home", "workspace", "health", "readiness", "access-boundary"],
    };
  }
  throw new Error(
    "Usage: canopy-admin password --output FILE | backup --data-dir DIR --output NEW_DIR | restore --backup DIR --data-dir NEW_DIR | live [--require-handoff] | smoke --url URL",
  );
}
main()
  .then((result) =>
    process.stdout.write(JSON.stringify(result, null, 2) + "\n"),
  )
  .catch((error) => {
    process.stderr.write(
      JSON.stringify({
        ok: false,
        error: redact((error as Error).message, [
          process.env.CANOPY_LIVE_API_KEY ?? "",
          process.env.CANOPY_LIVE_SECOND_API_KEY ?? "",
        ]),
      }) + "\n",
    );
    process.exitCode = 1;
  });
