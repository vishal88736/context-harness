import { existsSync } from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";

export type TerminalPolicy = "host" | "disabled" | "sandbox";
export const commandShell = () =>
  process.platform === "win32" ? "Windows PowerShell" : "Bash";
export const windowsSystemFile = (...parts: string[]) =>
  path.win32.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    ...parts,
  );

export function commandEnvironment(policy: TerminalPolicy) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: policy === "sandbox" ? "/home/agent" : process.env.HOME,
    LANG: "C.UTF-8",
    TERM: "dumb",
    CANOPY_TOOL: "1",
  };
  if (process.platform === "win32") {
    for (const key of [
      "SystemRoot",
      "WINDIR",
      "ComSpec",
      "PATHEXT",
      "USERPROFILE",
      "HOMEDRIVE",
      "HOMEPATH",
      "LOCALAPPDATA",
      "APPDATA",
      "TEMP",
      "TMP",
    ])
      if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

export function terminateCommand(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    // Terminate this approved command and its descendants, never unrelated tasks.
    const killer = spawn(
      windowsSystemFile("taskkill.exe"),
      ["/PID", String(child.pid), "/T", "/F"],
      { windowsHide: true, stdio: "ignore" },
    );
    killer.on("error", () => child.kill("SIGKILL"));
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}
function base() {
  const args = [
    "--unshare-all",
    "--die-with-parent",
    "--new-session",
    "--clearenv",
  ];
  for (const directory of ["/usr", "/bin", "/lib", "/lib64"])
    if (existsSync(directory)) args.push("--ro-bind", directory, directory);
  return [
    ...args,
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    "--dir",
    "/home/agent",
    "--setenv",
    "HOME",
    "/home/agent",
    "--setenv",
    "PATH",
    "/usr/bin:/bin",
    "--setenv",
    "LANG",
    "C.UTF-8",
  ];
}
export function assertSandboxAvailable() {
  if (process.platform !== "linux" || !existsSync("/usr/bin/bwrap"))
    throw new Error(
      "Sandbox terminal requires Linux and /usr/bin/bwrap. Install bubblewrap or use disabled terminal policy.",
    );
  const result = spawnSync("/usr/bin/bwrap", [...base(), "--", "/bin/true"], {
    timeout: 5000,
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error(
      "The bubblewrap isolation probe failed. Terminal execution will not fall back to the host.",
    );
}
export function commandSpec(
  policy: TerminalPolicy,
  command: string,
  cwd: string,
  platform: NodeJS.Platform = process.platform,
) {
  if (policy === "disabled")
    throw new Error("Terminal execution is disabled by deployment policy.");
  if (policy === "host" && platform === "win32") {
    const script = `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; $OutputEncoding = [Console]::OutputEncoding; $ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; $global:LASTEXITCODE = 0;\n& {\n${command}\n}\nexit $LASTEXITCODE`;
    return {
      binary: windowsSystemFile("WindowsPowerShell", "v1.0", "powershell.exe"),
      args: [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-OutputFormat",
        "Text",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
    };
  }
  if (policy === "host")
    return {
      binary: "/bin/bash",
      args: ["--noprofile", "--norc", "-c", command],
    };
  if (platform !== "linux")
    throw new Error(
      "Sandbox terminal requires Linux; host execution is not a fallback.",
    );
  return {
    binary: "/usr/bin/bwrap",
    args: [
      ...base(),
      "--bind",
      cwd,
      "/workspace",
      "--chdir",
      "/workspace",
      "--",
      "/bin/bash",
      "--noprofile",
      "--norc",
      "-c",
      command,
    ],
  };
}
