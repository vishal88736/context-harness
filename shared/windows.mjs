import path from "node:path";
import { spawn } from "node:child_process";

export const windowsSystemFile = (...parts) =>
  path.win32.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    ...parts,
  );
export const powershellBinary = windowsSystemFile(
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);
export function powershellArguments(script) {
  const program = `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; $OutputEncoding = [Console]::OutputEncoding; $ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';\n${script}`;
  return [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-OutputFormat",
    "Text",
    "-EncodedCommand",
    Buffer.from(program, "utf16le").toString("base64"),
  ];
}
export function terminateWindowsTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  const killer = spawn(
    windowsSystemFile("taskkill.exe"),
    ["/PID", String(child.pid), "/T", "/F"],
    { windowsHide: true, stdio: "ignore" },
  );
  killer.on("error", () => child.kill("SIGKILL"));
}
