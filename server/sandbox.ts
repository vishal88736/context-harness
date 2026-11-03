import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

export type TerminalPolicy = "host" | "disabled" | "sandbox";
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
) {
  if (policy === "disabled")
    throw new Error("Terminal execution is disabled by deployment policy.");
  if (policy === "host")
    return {
      binary: "/bin/bash",
      args: ["--noprofile", "--norc", "-c", command],
    };
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
