# Canopy on Windows

The Windows x64 package is a portable ZIP containing Canopy, its matching `node.exe`, runtime dependencies, and a native command launcher. The coding workspace opens in your browser and accesses folders through the local backend. It does not require WSL, Git Bash, PowerShell 7, or a separate Node installation.

## Download and launch

1. Download `canopy-win32-x64.zip` from a published release or the website. GitHub releases also provide a `.sha256` file; the website shows the hash under **Verify checksum**. Actions artifacts contain an outer ZIP with the app ZIP, checksum, and manifest; unpack that outer artifact first.
2. Verify the app ZIP's SHA-256, then use **Extract All**. Do not run the launcher from inside Explorer's ZIP preview.
3. Open **Launch Canopy.cmd** inside the extracted `canopy` folder. Keep its terminal window running. Use Ctrl+C to stop the app.

With the GitHub release's checksum file, use these Windows PowerShell commands from the download directory. For a website download, compare `Get-FileHash` with the hash displayed on the download card instead.

```powershell
$canopyExpected = (Get-Content '.\canopy-win32-x64.zip.sha256').Split(' ')[0]
$canopyActual = (Get-FileHash '.\canopy-win32-x64.zip' -Algorithm SHA256).Hash
if ($canopyActual -ne $canopyExpected) { throw 'The Canopy download checksum does not match.' }
Expand-Archive -LiteralPath '.\canopy-win32-x64.zip' -DestinationPath '.\Canopy-app'
& '.\Canopy-app\canopy\Launch Canopy.cmd'
```

The workspace opens at `http://127.0.0.1:4317/workspace`. If the browser does not open automatically, enter that URL yourself. The launcher rejects an occupied port rather than opening another process's workspace.

## Connect projects and providers

Choose **Open folder** and enter an existing project, for example `C:\Projects\my-app` or `D:\Work\my-app`. Files opened in the editor are not automatically shared with a model: select sources in **Context**, then preview the effective request. Providers, conversation history, profiles, request inspection, and model switching work through the same application services as the other platforms.

The agent uses **Windows PowerShell** in the selected project directory. It tells the model which shell is available, preserves Unicode output and program exit codes, and requires human approval for each command. Stopping a running command terminates its process tree. A local approved command has your Windows account's access; it is not an OS sandbox. The optional namespace sandbox is Linux-only.

Install your project's own tools, such as Git, npm, Python, or compilers, when needed. The app's bundled runtime is for running Canopy and does not install a global development toolchain. PowerShell commands are not automatically translated from Bash syntax.

## Data and backups

App data defaults to `%LOCALAPPDATA%\Canopy\data`, outside the extracted installation. It contains SQLite, conversations, provider settings, invocation records, and the matching `vault.key`. The initial project directory is `%USERPROFILE%\Canopy Projects`. `CANOPY_DATA_DIR` and `CANOPY_WORKSPACE` can override these paths.

Windows protection relies on the directory's NTFS access controls; POSIX `chmod` values do not enforce Windows ACLs. Keep data and backups in your private user profile and check the Security tab when choosing a custom/shared location. Provider keys are encrypted, but anyone who can read both the database and `vault.key` can decrypt them.

From the extracted `canopy` directory:

```powershell
$canopyData = Join-Path $env:LOCALAPPDATA 'Canopy\data'
$canopyBackup = Join-Path $env:USERPROFILE 'Canopy Backups\snapshot-001'
.\runtime\node.exe .\dist-server\canopy-admin.js backup --data-dir $canopyData --output $canopyBackup
```

Stop the app before restoring into a new directory:

```powershell
$canopyRestored = Join-Path $env:LOCALAPPDATA 'Canopy\data-restored'
.\runtime\node.exe .\dist-server\canopy-admin.js restore --backup $canopyBackup --data-dir $canopyRestored
$env:CANOPY_DATA_DIR = $canopyRestored
& '.\Launch Canopy.cmd'
```

Backup/restore refuses existing destinations and verifies checksums, SQLite integrity, schema compatibility, and the matching encryption key. Project repositories need their own backups. See [upgrades and rollback](local-app.md#upgrade-or-roll-back).

## Troubleshooting and scope

| Symptom                     | What to check                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Bundled runtime missing     | Extract the complete app ZIP before launching. `runtime\node.exe` must remain beside the app files.                          |
| Port already in use         | Stop the existing instance. For separate parallel instances, choose both a different `PORT` and a different data directory.  |
| File cannot be saved        | Close programs holding an exclusive file lock and check the folder's write permissions, then reload and review a fresh diff. |
| Command not found           | Install that project's required tool and restart Canopy so its PATH reflects the installation.                               |
| Windows blocks the launcher | These are unsigned portable packages. Follow your organization's application policy; signed installers are not supplied.     |

The release target is Windows x64. Native Windows ARM64, a signed MSI installer, automatic updates, and Windows ACL isolation of approved commands are not implemented. Read [VERIFICATION.md](../VERIFICATION.md) for observed native Windows CI results; a Linux test or a download-card fixture does not prove Windows execution.

The [verified Windows artifact](https://github.com/vishal88736/context-harness/actions/runs/42057057828) is named **canopy-win32-x64**. Its clean `83e1b6f` build passed native ZIP extraction, `.cmd` launch from a path with spaces and Unicode, restart persistence, occupied-port rejection, and graceful IPC shutdown. The separate [Windows browser/backend run](https://github.com/vishal88736/context-harness/actions/runs/42057061369) passed 78 backend cases and all 26 browser workflows, with two explicitly recorded platform skips.

Platform references: [Node child-process behavior on Windows](https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows), [Windows PowerShell command-line options](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_powershell_exe?view=powershell-5.1), and [Windows process-tree termination](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill).
