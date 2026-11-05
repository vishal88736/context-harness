import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  commandSpec,
  commandEnvironment,
  terminateCommand,
} from "../server/sandbox";

test("Windows commands are encoded as one PowerShell program and cannot enable disabled tools", () => {
  const command = "Write-Output 'spaces & | > % $ and café 😀'";
  const spec = commandSpec("host", command, ".", "win32");
  assert.match(spec.binary, /WindowsPowerShell\\v1\.0\\powershell\.exe$/);
  assert.ok(spec.args.includes("-NoProfile"));
  assert.ok(spec.args.includes("-NonInteractive"));
  assert.equal(spec.args.at(-2), "-EncodedCommand");
  assert.ok(
    Buffer.from(spec.args.at(-1)!, "base64")
      .toString("utf16le")
      .includes(command),
  );
  assert.throws(
    () => commandSpec("disabled", command, ".", "win32"),
    /disabled/,
  );
  assert.throws(
    () => commandSpec("sandbox", command, ".", "win32"),
    /requires Linux/,
  );
});

test("The native host shell preserves Unicode output and nonzero exit codes", () => {
  const command =
    process.platform === "win32"
      ? "Write-Output 'Canopy café 😀'; exit 7"
      : "printf 'Canopy café 😀'; exit 7";
  const spec = commandSpec("host", command, process.cwd());
  const result = spawnSync(spec.binary, spec.args, {
    env: commandEnvironment("host"),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(
    result.error,
    undefined,
    JSON.stringify({ stdout: result.stdout, stderr: result.stderr }),
  );
  assert.equal(result.status, 7, result.stderr);
  assert.match(result.stdout, /Canopy café 😀/);
  const executable =
    process.platform === "win32"
      ? `'${process.execPath.replaceAll("'", "''")}'`
      : `'${process.execPath.replaceAll("'", "'\\''")}'`;
  const external = commandSpec(
    "host",
    `${process.platform === "win32" ? "& " : ""}${executable} -e 'process.exit(9)'`,
    process.cwd(),
  );
  const exit = spawnSync(external.binary, external.args, {
    env: commandEnvironment("host"),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(exit.error, undefined, exit.stderr);
  assert.equal(
    exit.status,
    9,
    "Native program errors must remain failures in the shell result.",
  );
});

test(
  "Stopping a native command also terminates its descendants",
  { timeout: 45_000 },
  async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "Canopy process tree "));
    await writeFile(
      path.join(temp, "grandchild.cjs"),
      "const fs=require('node:fs');fs.writeFileSync('child-ready','yes');setTimeout(()=>fs.writeFileSync('escaped-write','bad'),2000);",
    );
    const program = path.join(temp, "parent.cjs");
    await writeFile(
      program,
      "require('node:child_process').spawn(process.execPath,['grandchild.cjs'],{stdio:'ignore'});setInterval(()=>{},1000);",
    );
    const quote = (value: string) =>
      process.platform === "win32"
        ? `'${value.replaceAll("'", "''")}'`
        : `'${value.replaceAll("'", "'\\''")}'`;
    const spec = commandSpec(
      "host",
      `${process.platform === "win32" ? "&" : "exec"} ${quote(process.execPath)} ${quote(program)}`,
      temp,
    );
    const child = spawn(spec.binary, spec.args, {
      cwd: temp,
      env: commandEnvironment("host"),
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let commandLog = "";
    child.stdout.on("data", (chunk) => (commandLog += chunk));
    child.stderr.on("data", (chunk) => (commandLog += chunk));
    const closed = once(child, "close");
    void closed.catch(() => {});
    try {
      let ready = false;
      for (let i = 0; i < 600; i++) {
        try {
          await access(path.join(temp, "child-ready"));
          ready = true;
          break;
        } catch {
          /* starting */
        }
        if (child.exitCode !== null)
          throw new Error("Native shell exited before starting its child.");
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(
        ready,
        true,
        `The descendant must have actually started. ${commandLog}`,
      );
      terminateCommand(child);
      await closed;
      await new Promise((resolve) => setTimeout(resolve, 2200));
      await assert.rejects(access(path.join(temp, "escaped-write")), /ENOENT/);
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        terminateCommand(child);
      await closed.catch(() => {});
      await rm(temp, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  },
);
