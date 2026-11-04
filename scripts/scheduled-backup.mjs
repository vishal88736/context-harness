import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const state =
  process.env.CANOPY_DATA_DIR ??
  path.join(
    process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local/share"),
    "canopy/data",
  );
const backups =
  process.env.CANOPY_BACKUP_DIR ?? path.join(path.dirname(state), "backups");
const target = path.join(
  backups,
  new Date().toISOString().replaceAll(":", "-"),
);
const result = spawnSync(
  process.execPath,
  [
    path.join(root, "dist-server/canopy-admin.js"),
    "backup",
    "--data-dir",
    state,
    "--output",
    target,
  ],
  { cwd: root, stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
