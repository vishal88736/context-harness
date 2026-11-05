import { execFileSync } from "node:child_process";
import path from "node:path";
import { powershellBinary, powershellArguments } from "../shared/windows.mjs";

function zipOperation(script, archive, extra = {}) {
  return execFileSync(
    powershellBinary,
    powershellArguments(
      `Add-Type -AssemblyName System.IO.Compression.FileSystem;\n${script}`,
    ),
    {
      encoding: "utf8",
      windowsHide: true,
      timeout: 180_000,
      env: { ...process.env, CANOPY_ARCHIVE: archive, ...extra },
      maxBuffer: 16 * 1024 * 1024,
    },
  ).trim();
}
export function createArchive(source, archive) {
  if (archive.endsWith(".zip")) {
    zipOperation(
      "[IO.Compression.ZipFile]::CreateFromDirectory($env:CANOPY_PACKAGE_SOURCE, $env:CANOPY_ARCHIVE, [IO.Compression.CompressionLevel]::Optimal, $true)",
      archive,
      { CANOPY_PACKAGE_SOURCE: source },
    );
  } else
    execFileSync("tar", [
      "-czf",
      archive,
      "-C",
      path.dirname(source),
      path.basename(source),
    ]);
}
export function archiveEntries(archive) {
  if (archive.endsWith(".zip"))
    return JSON.parse(
      zipOperation(
        "$zip = [IO.Compression.ZipFile]::OpenRead($env:CANOPY_ARCHIVE); try { ConvertTo-Json -Compress -InputObject @($zip.Entries | ForEach-Object { $_.FullName }) } finally { $zip.Dispose() }",
        archive,
      ),
    );
  return execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
    .trim()
    .split(/\r?\n/);
}
export function extractArchive(archive, destination) {
  if (archive.endsWith(".zip"))
    zipOperation(
      "[IO.Compression.ZipFile]::ExtractToDirectory($env:CANOPY_ARCHIVE, $env:CANOPY_EXTRACT_DESTINATION)",
      archive,
      { CANOPY_EXTRACT_DESTINATION: destination },
    );
  else execFileSync("tar", ["-xzf", archive, "-C", destination]);
}
