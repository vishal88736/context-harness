import { constants } from "node:fs";
import {
  access,
  open,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createTwoFilesPatch } from "diff";
import { Store, id, now } from "./store";
import {
  checkedPath,
  digest,
  HttpError,
  isSensitive,
  isWithin,
  readText,
  redact,
} from "./security";
import type { Workspace } from "./schema";

export interface FolderEntry {
  name: string;
  path: string;
}

function folderError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EACCES" || code === "EPERM")
    throw new HttpError(
      403,
      "The selected folder is not accessible to this OS account.",
    );
  if (["ENOENT", "ENOTDIR", "ELOOP"].includes(code ?? ""))
    throw new HttpError(400, "Choose an existing, accessible folder.");
  throw new HttpError(500, "The selected folder could not be opened.");
}

function expandedPath(input?: string) {
  const value = input || homedir();
  const expanded =
    value === "~"
      ? homedir()
      : value.startsWith("~/")
        ? path.join(homedir(), value.slice(2))
        : value;
  if (!path.isAbsolute(expanded) || expanded.includes("\0"))
    throw new HttpError(
      400,
      "Enter an absolute folder path or a path beginning with ~/.",
    );
  return path.resolve(expanded);
}

async function accessibleFolder(input?: string) {
  try {
    const canonical = await realpath(expandedPath(input));
    if (!(await stat(canonical)).isDirectory())
      throw new HttpError(400, "The selected path is a file. Choose a folder.");
    await access(canonical, constants.R_OK | constants.X_OK);
    return canonical;
  } catch (error) {
    return folderError(error);
  }
}

export async function projectFolder(input: string, dataDir: string) {
  const canonical = await accessibleFolder(input);
  const home = await realpath(homedir()).catch(() => path.resolve(homedir()));
  if (canonical === path.parse(canonical).root || canonical === home)
    throw new HttpError(
      400,
      "Choose a project folder rather than your home folder or filesystem root.",
    );
  const privateData = await realpath(dataDir).catch(() =>
    path.resolve(dataDir),
  );
  if (isSensitive(canonical) || isWithin(privateData, canonical))
    throw new HttpError(
      403,
      "Credentials and application runtime folders cannot be connected as projects.",
    );
  return canonical;
}

export async function browseFolders(
  input: string | undefined,
  dataDir: string,
  workspaces: Workspace[],
) {
  const current = await accessibleFolder(input);
  const privateData = await realpath(dataDir).catch(() =>
    path.resolve(dataDir),
  );
  const protectedFolder = (target: string) =>
    isSensitive(target) || isWithin(privateData, target);
  if (protectedFolder(current))
    throw new HttpError(
      403,
      "Credentials and application runtime folders cannot be browsed.",
    );
  let children;
  try {
    children = await readdir(current, { withFileTypes: true });
  } catch (error) {
    return folderError(error);
  }
  const entries: FolderEntry[] = [];
  for (const entry of children) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const target = path.join(current, entry.name);
    if (protectedFolder(target)) continue;
    try {
      const canonical = await accessibleFolder(target);
      if (!protectedFolder(canonical))
        entries.push({ name: entry.name, path: canonical });
    } catch {
      // A folder picker should still work when a neighboring folder is unreadable.
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const shortcuts: FolderEntry[] = [];
  const candidates = [
    { name: "Home", path: homedir() },
    { name: "File system", path: path.parse(current).root },
    ...["/mnt", "/media", "/Volumes"].map((target) => ({
      name: path.basename(target),
      path: target,
    })),
    ...workspaces.map((workspace) => ({
      name: workspace.name,
      path: workspace.root,
    })),
  ];
  for (const candidate of candidates) {
    try {
      const canonical = await accessibleFolder(candidate.path);
      if (
        !protectedFolder(canonical) &&
        !shortcuts.some((s) => s.path === canonical)
      )
        shortcuts.push({ name: candidate.name, path: canonical });
    } catch {
      // Optional mount points and old workspaces may no longer be available.
    }
  }
  const home = await realpath(homedir()).catch(() => path.resolve(homedir()));
  const parent = path.dirname(current);
  return {
    path: current,
    parentPath: parent === current ? null : parent,
    entries: entries.slice(0, 500),
    shortcuts,
    selectable: current !== home && current !== path.parse(current).root,
    truncated: entries.length > 500,
  };
}

interface PendingFileChange {
  id: string;
  workspaceId: string;
  workspaceRoot: string;
  target: string;
  path: string;
  content: string;
  beforeHash: string;
  afterHash: string;
  expiresAt: string;
}

export class WorkspaceFiles {
  private proposals = new Map<string, PendingFileChange>();
  constructor(
    private store: Store,
    private dataDir: string,
    private secrets: () => string[],
  ) {}

  async read(workspace: Workspace, input: string) {
    const target = await checkedPath(workspace, input, {
      dataDir: this.dataDir,
    });
    let original: string;
    try {
      original = await readText(target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM")
        throw new HttpError(
          403,
          "This file is not readable by the current OS account.",
        );
      if (code === "ENOENT")
        throw new HttpError(404, "The file no longer exists.");
      throw new HttpError(
        400,
        (error as Error).message || "The file cannot be opened as text.",
      );
    }
    const content = redact(original, this.secrets());
    return {
      path: path.relative(workspace.root, target),
      hash: digest(original),
      content,
      redacted: content !== original,
    };
  }

  private expire() {
    for (const [changeId, proposal] of this.proposals) {
      if (Date.parse(proposal.expiresAt) > Date.now()) continue;
      this.proposals.delete(changeId);
      this.store.finishFileChange(changeId, "expired");
    }
  }

  async propose(
    workspace: Workspace,
    input: { path: string; content: string; expectedHash: string },
  ) {
    this.expire();
    if (Buffer.byteLength(input.content, "utf8") > 250_000)
      throw new HttpError(413, "Edits are limited to 250 KB of UTF-8 text.");
    if (this.proposals.size >= 128)
      throw new HttpError(
        429,
        "Too many pending changes. Apply a change or wait for proposals to expire.",
      );
    const current = await this.read(workspace, input.path);
    if (current.hash !== input.expectedHash)
      throw new HttpError(
        409,
        "The file changed since it was opened. Reload it before proposing an edit.",
      );
    if (
      current.redacted ||
      redact(input.content, this.secrets()) !== input.content
    )
      throw new HttpError(
        403,
        "Files containing redacted credentials must be edited outside this workspace editor.",
      );
    const proposal: PendingFileChange = {
      id: id(),
      workspaceId: workspace.id,
      workspaceRoot: await realpath(workspace.root),
      target: await checkedPath(workspace, input.path, {
        dataDir: this.dataDir,
      }),
      path: current.path,
      content: input.content,
      beforeHash: current.hash,
      afterHash: digest(input.content),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
    this.store.recordFileChange({
      id: proposal.id,
      workspaceId: workspace.id,
      path: proposal.path,
      beforeHash: proposal.beforeHash,
      afterHash: proposal.afterHash,
      decision: "pending",
      createdAt: now(),
      appliedAt: null,
    });
    this.proposals.set(proposal.id, proposal);
    return {
      id: proposal.id,
      path: proposal.path,
      diff: createTwoFilesPatch(
        proposal.path,
        proposal.path,
        current.content,
        input.content,
        "current",
        "proposed",
      ),
      beforeHash: proposal.beforeHash,
      afterHash: proposal.afterHash,
      expiresAt: proposal.expiresAt,
    };
  }

  async apply(workspace: Workspace, changeId: string) {
    this.expire();
    const proposal = this.proposals.get(changeId);
    if (!proposal || proposal.workspaceId !== workspace.id)
      throw new HttpError(
        409,
        "This file change has expired or is unavailable. Preview a new change.",
      );
    // Consume before awaiting I/O so two approval requests cannot apply one proposal twice.
    this.proposals.delete(changeId);
    let temporary: string | undefined;
    try {
      if ((await realpath(workspace.root)) !== proposal.workspaceRoot)
        throw new HttpError(
          409,
          "The workspace folder changed. Preview a new change.",
        );
      const target = await checkedPath(workspace, proposal.path, {
        dataDir: this.dataDir,
      }).catch(() => {
        throw new HttpError(
          409,
          "The approved file target changed. Reload it and preview a new change.",
        );
      });
      const current = await this.read(workspace, proposal.path);
      if (target !== proposal.target || current.hash !== proposal.beforeHash)
        throw new HttpError(
          409,
          "The file changed after preview. Reload it and preview a new change.",
        );
      if (
        current.redacted ||
        redact(proposal.content, this.secrets()) !== proposal.content
      )
        throw new HttpError(
          403,
          "The file change now contains recognized credentials. Review it outside this workspace editor.",
        );
      const originalMode = (await stat(target)).mode & 0o777;
      temporary = path.join(path.dirname(target), `.canopy-${id()}.tmp`);
      const handle = await open(temporary, "wx", originalMode);
      try {
        await handle.writeFile(proposal.content);
        await handle.chmod(originalMode);
        await handle.sync();
      } finally {
        await handle.close();
      }
      const again = await checkedPath(workspace, proposal.path, {
        dataDir: this.dataDir,
      }).catch(() => {
        throw new HttpError(
          409,
          "The file target changed before applying the edit.",
        );
      });
      if (
        again !== target ||
        digest(await readText(again)) !== proposal.beforeHash ||
        (await realpath(path.dirname(target))) !== path.dirname(proposal.target)
      )
        throw new HttpError(
          409,
          "The file or its parent changed before applying the edit.",
        );
      await rename(temporary, target);
      this.store.finishFileChange(changeId, "applied");
      return {
        path: proposal.path,
        hash: proposal.afterHash,
        content: proposal.content,
      };
    } catch (error) {
      this.store.finishFileChange(changeId, "invalidated");
      if (error instanceof HttpError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM")
        throw new HttpError(403, "The OS account cannot write this file.");
      throw new HttpError(
        409,
        "The file or workspace changed. Reload it and preview a new change.",
      );
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
    }
  }
}
