import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
let commit = process.env.CANOPY_BUILD_COMMIT ?? null;
let dirty = true;
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  dirty = !!execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
} catch {
  // Container builds exclude .git and receive their source revision explicitly.
  if (commit && /^[a-f0-9]{40}$/.test(commit)) dirty = false;
  else commit = null;
}
await writeFile(
  "dist/release-build.json",
  JSON.stringify(
    {
      commit,
      dirty,
      builtAt: new Date().toISOString(),
      node: process.versions.node,
    },
    null,
    2,
  ) + "\n",
);
