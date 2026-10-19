import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { constants } from "node:fs";
import {
  readFile,
  writeFile,
  mkdir,
  realpath,
  stat,
  open,
  readdir,
  chmod,
} from "node:fs/promises";
import path from "node:path";
import type { Conversation, Source, Workspace } from "./schema";

export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class Vault {
  private constructor(private key: Buffer) {}
  static async create(dataDir: string) {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const filename = path.join(dataDir, "vault.key");
    let key: Buffer;
    try {
      key = await readFile(filename);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      key = randomBytes(32);
      await writeFile(filename, key, { mode: 0o600, flag: "wx" });
    }
    if (key.length !== 32)
      throw new Error("Invalid vault key. Restore the vault.key backup.");
    await chmod(filename, 0o600);
    return new Vault(key);
  }
  encrypt(value: string) {
    if (!value) return "";
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    return Buffer.concat([
      iv,
      cipher.update(value, "utf8"),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString("base64");
  }
  decrypt(value: string | null) {
    if (!value) return "";
    const b = Buffer.from(value, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      b.subarray(0, 12),
    );
    decipher.setAuthTag(b.subarray(-16));
    return Buffer.concat([
      decipher.update(b.subarray(12, -16)),
      decipher.final(),
    ]).toString("utf8");
  }
}
export function redact(text: string, keys: string[] = []) {
  let result = text;
  for (const key of keys.filter((k) => k.length >= 4))
    result = result.split(key).join("[REDACTED]");
  return result
    .replace(
      /\b(?:sk|ghp|gho|github_pat)[-_][A-Za-z0-9_-]{16,}\b/g,
      "[REDACTED]",
    )
    .replace(
      /((?:api[_-]?key|access[_-]?token|secret|password|authorization)\s*[=:]\s*["']?)([^\s"'`,;]{8,})/gi,
      "$1[REDACTED]",
    )
    .replace(
      /-----BEGIN [\w ]*PRIVATE KEY-----[\s\S]*?-----END [\w ]*PRIVATE KEY-----/g,
      "[REDACTED PRIVATE KEY]",
    );
}
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-server",
  ".next",
  ".venv",
  "venv",
  "__pycache__",
  ".cache",
  ".openai",
  ".opencode",
  ".codex",
  "context-harness-data",
  "playwright-report",
  "test-results",
]);
export function isSensitive(filename: string) {
  return filename
    .split(/[\\/]/)
    .some(
      (segment) =>
        ignoredDirs.has(segment) ||
        /^(?:\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|\.npmrc|\.netrc|auth\.json|credentials(?:\.json)?|vault\.key|.*\.(?:pem|key|sqlite|sqlite3|db)(?:-wal|-shm)?)$/i.test(
          segment,
        ),
    );
}
export function isWithin(root: string, target: string) {
  const rel = path.relative(root, target);
  return (
    rel === "" ||
    (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel))
  );
}
export async function checkedPath(
  workspace: Workspace,
  input: string,
  options: { allowMissing?: boolean; dataDir?: string } = {},
) {
  const root = await realpath(workspace.root);
  const lexical = path.resolve(root, input);
  if (!isWithin(root, lexical) || isSensitive(path.relative(root, lexical)))
    throw new HttpError(
      403,
      "Path is outside the workspace or contains protected credentials/runtime data.",
    );
  let resolved: string;
  try {
    resolved = await realpath(lexical);
  } catch (e) {
    if (!options.allowMissing || (e as NodeJS.ErrnoException).code !== "ENOENT")
      throw new HttpError(404, "Path does not exist.");
    resolved = path.join(
      await realpath(path.dirname(lexical)),
      path.basename(lexical),
    );
  }
  if (!isWithin(root, resolved) || isSensitive(path.relative(root, resolved)))
    throw new HttpError(
      403,
      "Symlink target is outside the workspace or protected.",
    );
  if (options.dataDir && isWithin(path.resolve(options.dataDir), resolved))
    throw new HttpError(403, "Application data cannot be added as context.");
  return resolved;
}
export function grants(conversation: Conversation): Source[] {
  return conversation.config.sources.filter(
    (s) =>
      s.enabled &&
      (s.type === "file" ||
        s.type === "folder" ||
        (s.type === "project" && s.path)),
  );
}
export async function authorizedPath(
  workspace: Workspace,
  conversation: Conversation,
  input: string,
  dataDir: string,
  allowMissing = false,
) {
  const target = await checkedPath(workspace, input, { dataDir, allowMissing });
  for (const source of conversation.config.sources.filter(
    (s) => !s.enabled && s.path,
  )) {
    const blocked = await checkedPath(workspace, source.path!, {
      dataDir,
    }).catch(() => path.resolve(workspace.root, source.path!));
    if (
      source.type === "folder" ? isWithin(blocked, target) : blocked === target
    )
      throw new HttpError(
        403,
        "This path is explicitly disabled in the current conversation.",
      );
  }
  for (const source of grants(conversation)) {
    if (!source.path) continue;
    const grant = await checkedPath(workspace, source.path!, { dataDir }).catch(
      () => "",
    );
    if (
      grant &&
      (source.type === "folder" ? isWithin(grant, target) : grant === target)
    )
      return target;
  }
  throw new HttpError(
    403,
    "This path has no enabled file or folder authorization in this conversation. Add it in Context first.",
  );
}
export async function readText(filename: string, maxBytes = 256_000) {
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const st = await handle.stat();
    if (!st.isFile()) throw new Error("Select a regular file.");
    if (st.size > maxBytes)
      throw new Error(
        `File exceeds ${Math.round(maxBytes / 1000)} KB. Select an excerpt instead.`,
      );
    const buffer = await handle.readFile();
    if (buffer.includes(0))
      throw new Error(
        "Binary file is not a supported text source. Attach an image or supported document instead.",
      );
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}
export async function listFiles(
  workspace: Workspace,
  folder: string,
  dataDir: string,
  max = 2000,
) {
  const start = await checkedPath(workspace, folder, { dataDir });
  const found: string[] = [];
  let scanned = 0;
  async function walk(dir: string, depth: number) {
    if (depth > 18 || found.length >= max || scanned > 5000) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (found.length >= max || ++scanned > 5000) return;
      const file = path.join(dir, entry.name);
      if (
        isSensitive(path.relative(workspace.root, file)) ||
        isWithin(path.resolve(dataDir), file) ||
        entry.isSymbolicLink()
      )
        continue;
      if (entry.isDirectory()) await walk(file, depth + 1);
      else if (entry.isFile()) found.push(path.relative(workspace.root, file));
    }
  }
  if ((await stat(start)).isDirectory()) await walk(start, 0);
  else found.push(path.relative(workspace.root, start));
  return found;
}
