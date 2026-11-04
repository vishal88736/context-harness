import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  stat,
  chmod,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const dirty = !!execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
}).trim();
if (dirty && process.argv.includes("--require-clean"))
  throw new Error("Release packaging requires a clean working tree.");
const build = JSON.parse(await readFile("dist/release-build.json", "utf8"));
if (
  process.argv.includes("--require-clean") &&
  (build.commit !== sha || build.dirty)
)
  throw new Error(
    "Build outputs do not match this clean commit. Run npm run build first.",
  );
const platform = `${process.platform}-${process.arch}`;
if (!["linux-x64", "darwin-arm64", "darwin-x64"].includes(platform))
  throw new Error("This release target is not supported yet.");
const version =
  process.env.CANOPY_RELEASE_VERSION ??
  `v${JSON.parse(await readFile("package.json", "utf8")).version}`;
if (!/^v\d+\.\d+\.\d+$/.test(version))
  throw new Error("CANOPY_RELEASE_VERSION must be vMAJOR.MINOR.PATCH.");
for (const file of [
  "dist/index.html",
  "dist-server/index.js",
  "dist-server/canopy-admin.js",
])
  await stat(file);
const destination = path.resolve("artifacts/releases");
await mkdir(destination, { recursive: true });
const temporary = await mkdtemp(path.join(destination, ".package-"));
try {
  const bundle = path.join(temporary, "canopy");
  await mkdir(bundle);
  for (const file of [
    "dist",
    "dist-server",
    "package.json",
    "package-lock.json",
    "README.md",
    "VERIFICATION.md",
  ])
    await cp(file, path.join(bundle, file), { recursive: true });
  for (const file of execFileSync("git", ["ls-files", "docs", "deploy"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean)) {
    await mkdir(path.dirname(path.join(bundle, file)), { recursive: true });
    await cp(file, path.join(bundle, file));
  }
  await mkdir(path.join(bundle, "scripts"), { recursive: true });
  await cp("scripts/launcher.mjs", path.join(bundle, "scripts/launcher.mjs"));
  await cp(
    "scripts/scheduled-backup.mjs",
    path.join(bundle, "scripts/scheduled-backup.mjs"),
  );
  await cp(
    "deploy/Launch Canopy.command",
    path.join(bundle, "Launch Canopy.command"),
  );
  await chmod(path.join(bundle, "Launch Canopy.command"), 0o755);
  if (!process.argv.includes("--thin")) {
    await mkdir(path.join(bundle, "runtime"));
    await cp(process.execPath, path.join(bundle, "runtime/node"));
    await chmod(path.join(bundle, "runtime/node"), 0o755);
    const license = await fetch(
      `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!license.ok)
      throw new Error(
        "Could not obtain the matching Node.js license; distribution refused.",
      );
    await writeFile(
      path.join(bundle, "runtime/LICENSE-node"),
      await license.text(),
    );
    execFileSync(
      "npm",
      ["ci", "--omit=dev", "--ignore-scripts", "--no-fund", "--no-audit"],
      { cwd: bundle, stdio: "inherit" },
    );
  }
  await writeFile(
    path.join(bundle, "release.json"),
    JSON.stringify(
      {
        format: 1,
        commit: sha,
        dirty,
        builtAt: new Date().toISOString(),
        node: process.versions.node,
        platform,
        version,
        standalone: !process.argv.includes("--thin"),
      },
      null,
      2,
    ) + "\n",
  );
  const archive = path.join(destination, `canopy-${platform}.tar.gz`);
  execFileSync("tar", ["-czf", archive, "-C", temporary, "canopy"]);
  const digest = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  await writeFile(
    archive + ".sha256",
    `${digest}  ${path.basename(archive)}\n`,
  );
  await writeFile(
    path.join(destination, `${platform}-manifest.json`),
    JSON.stringify(
      {
        version,
        platform,
        commit: sha,
        sha256: digest,
        bytes: (await stat(archive)).size,
        filename: path.basename(archive),
        dirty,
        standalone: !process.argv.includes("--thin"),
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(
    JSON.stringify({ archive, sha256: digest, commit: sha, dirty }) + "\n",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
