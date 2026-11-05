# Download and run Canopy

Canopy runs locally and opens its coding workspace in your browser. Choose project folders your OS account can access, connect a supported provider, and configure each conversation's context independently. Selected context goes to the provider you choose.

## Portable package

Download the archive for your platform from a published release or the website:

| Package                      | Target                    |
| ---------------------------- | ------------------------- |
| `canopy-linux-x64.tar.gz`    | Linux, Intel/AMD 64-bit   |
| `canopy-darwin-arm64.tar.gz` | macOS, Apple silicon      |
| `canopy-darwin-x64.tar.gz`   | macOS, Intel              |
| `canopy-win32-x64.zip`       | Windows, Intel/AMD 64-bit |

The [four-platform package validation](https://github.com/vishal88736/context-harness/actions/runs/42057057828) passed at revision `83e1b6f`, including the native Windows ZIP and `.cmd` launcher. It was an artifact-only run, without a public release. Current releases must pass every target's package check before publishing. See [the dated verification record](../VERIFICATION.md) for exact counts and [Windows setup](windows.md) for native ZIP instructions.

Archives contain the app, runtime dependencies, matching Node runtime/license, launcher, and administrative commands. A separate Node installation is unnecessary for a normal portable launch. Project-specific compilers, interpreters, Git, and other developer tools remain your responsibility.

Verify the archive against its published SHA-256, then extract it:

```bash
sha256sum -c canopy-linux-x64.tar.gz.sha256
tar -xzf canopy-linux-x64.tar.gz
cd canopy
./"Launch Canopy.command"
```

On macOS use `shasum -a 256` for the checksum, then open **Launch Canopy.command** or run it from Terminal. These are portable apps, not signed native installers. The launcher opens `http://127.0.0.1:4317/workspace`. Keep its terminal running; Ctrl+C stops the service.

On Windows, verify the ZIP with `Get-FileHash -Algorithm SHA256`, use **Extract All**, and open **Launch Canopy.cmd** inside the extracted `canopy` folder. No WSL, Git Bash, or separate Node installation is required for the app. Approved agent commands use Windows PowerShell; project-specific tools remain separate. [Full Windows instructions](windows.md).

## Projects and data

The launcher initially opens `~/Canopy Projects`. Use **Open folder** to connect other project folders. Normal browsing does not automatically add files to AI context.

The launcher stores app data in `%LOCALAPPDATA%\Canopy\data` on Windows or `${XDG_DATA_HOME:-~/.local/share}/canopy/data` on Linux/macOS, unless `CANOPY_DATA_DIR` is set. This directory contains SQLite, its matching encryption key, conversations, settings, and invocation records. It lives outside the extracted app, so replacing the app directory does not delete conversations.

Optional launch configuration:

```bash
CANOPY_DATA_DIR="/private/canopy-data" \
CANOPY_WORKSPACE="/path/to/project" \
PORT=4317 ./"Launch Canopy.command"
```

Use one app process per data directory. If the port is occupied, stop the other instance or choose a different port and data directory. The launcher rejects startup failure instead of opening another service's workspace.

## Backups and recovery

From an extracted package:

```bash
./runtime/node dist-server/canopy-admin.js backup --data-dir "/private/canopy-data" --output "/private/backups/snapshot-001"
```

The backup command creates a consistent online SQLite snapshot, includes `vault.key` and an in-directory owner password hash when present, checks SQLite integrity and encrypted-provider-key recovery, and writes SHA-256 metadata. It refuses to overwrite an existing backup.

To recover, stop Canopy and restore into a **new** directory:

```bash
./runtime/node dist-server/canopy-admin.js restore --backup "/private/backups/snapshot-001" --data-dir "/private/canopy-restored"
CANOPY_DATA_DIR="/private/canopy-restored" ./"Launch Canopy.command"
```

Restore rejects tampered files, symlinks, unsupported schemas, mismatched keys, and existing destination directories. Project source files are separate: back up your repositories independently. Backups contain sensitive content; keep private permissions and encrypt any off-device copy.

### Scheduled backups on Linux

The supplied user-service templates expect the app at `~/.local/opt/canopy/current`. After installing the app there, install the templates yourself:

```bash
mkdir -p ~/.config/systemd/user
cp deploy/canopy-backup.service deploy/canopy-backup.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now canopy-backup.timer
```

Use a systemd override/environment file if your data directory differs. The daily job uses `scripts/scheduled-backup.mjs`, creates a new timestamped backup, and does not automatically delete older snapshots. Check available disk space and arrange your retention/off-device policy. On other systems, schedule the same helper with your OS scheduler.

## Upgrade or roll back

Stop the app, take a backup, extract the new package to a new directory, and launch it with the same `CANOPY_DATA_DIR`. Keep the older package until the new one works. To return to an older version after a schema change, restore its compatible backup into a new directory; do not overwrite a newer database blindly.

## Building packages from source

```bash
npm ci
npm run verify
npm run release:bundle -- --require-clean
npm run test:package
```

Commit changes before the final build. The build records its source revision; clean packaging refuses dirty or stale outputs. The package builder takes only tracked documentation/deployment templates and explicit app outputs, and the package check rejects private runtime files.

For CI releases, use **Build downloadable apps** on `main`. A requested public release is created only after every platform's package test passes. Live-provider calls are optional and were explicitly skipped for this release work.
