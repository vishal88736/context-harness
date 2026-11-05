import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("download publishing rejects unverified packages before accessing AWS", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "canopy-release-gate-"));
  const archive = Buffer.from("release-integrity-fixture");
  const valid = {
    dirty: false,
    standalone: true,
    version: "v1.0.0",
    commit: "a".repeat(40),
    platform: "linux-x64",
    filename: "canopy-linux-x64.tar.gz",
    bytes: archive.length,
    sha256: createHash("sha256").update(archive).digest("hex"),
  };
  const { dirty: _dirty, ...withoutCleanFlag } = valid;
  const cases = [
    {
      name: "dirty build",
      manifest: { ...valid, dirty: true },
      error: /Unreleased, dirty or malformed/,
    },
    {
      name: "missing clean-build provenance",
      manifest: withoutCleanFlag,
      error: /Unreleased, dirty or malformed/,
    },
    {
      name: "missing bundled runtime",
      manifest: { ...valid, standalone: false },
      error: /Unreleased, dirty or malformed/,
    },
    {
      name: "invalid source revision",
      manifest: { ...valid, commit: "main" },
      error: /Unreleased, dirty or malformed/,
    },
    {
      name: "archive filename mismatch",
      manifest: { ...valid, filename: "different-app.tar.gz" },
      error: /Unreleased, dirty or malformed/,
    },
    {
      name: "corrupted archive",
      manifest: { ...valid, sha256: "0".repeat(64) },
      error: /Package integrity check failed/,
    },
    {
      name: "archive size mismatch",
      manifest: { ...valid, bytes: archive.length + 1 },
      error: /Package integrity check failed/,
    },
  ];
  try {
    await writeFile(path.join(directory, valid.filename), archive);
    for (const entry of cases) {
      await t.test(entry.name, async () => {
        await writeFile(
          path.join(directory, "linux-x64-manifest.json"),
          JSON.stringify(entry.manifest),
        );
        const result = spawnSync(
          process.execPath,
          [path.resolve("scripts/publish-downloads.mjs"), directory],
          {
            encoding: "utf8",
            // No AWS executable can run, even if a regression reaches deployment.
            env: {
              ...process.env,
              PATH: path.join(directory, "no-executables"),
            },
            timeout: 10_000,
          },
        );
        assert.equal(result.error, undefined);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, entry.error);
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Windows publishing accepts only ZIP filenames and checks their bytes before AWS access", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "canopy-windows-release-"),
  );
  const filename = "canopy-win32-x64.zip";
  const archive = Buffer.from("invalid-zip-integrity-fixture");
  const manifest = {
    dirty: false,
    standalone: true,
    version: "v1.0.0",
    commit: "a".repeat(40),
    platform: "win32-x64",
    filename,
    bytes: archive.length,
    sha256: "0".repeat(64),
  };
  try {
    await writeFile(path.join(directory, filename), archive);
    for (const [name, expected] of [
      ["canopy-win32-x64.tar.gz", /Unreleased, dirty or malformed/],
      [filename, /Package integrity check failed/],
    ] as const) {
      await writeFile(
        path.join(directory, "win32-x64-manifest.json"),
        JSON.stringify({ ...manifest, filename: name }),
      );
      const result = spawnSync(
        process.execPath,
        [path.resolve("scripts/publish-downloads.mjs"), directory],
        {
          encoding: "utf8",
          env: { ...process.env, PATH: path.join(directory, "no-executables") },
          timeout: 10_000,
        },
      );
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
