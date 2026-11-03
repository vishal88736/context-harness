import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  lstat,
  chmod,
  rm,
  copyFile,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Vault } from "./security";

const names = ["canopy.sqlite", "vault.key", "owner-password.hash"] as const;
const manifestSchema = z
  .object({
    format: z.literal(1),
    createdAt: z.string(),
    schema: z.number().int().min(1).max(2),
    files: z
      .array(
        z.object({
          name: z.enum(names),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      )
      .min(2)
      .max(3),
  })
  .strict();
async function checksum(filename: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}
async function regular(filename: string) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error(
      "Backup input must be a regular file; symlinks are not accepted.",
    );
  return info;
}
async function verifyPair(directory: string) {
  await regular(path.join(directory, "canopy.sqlite"));
  await regular(path.join(directory, "vault.key"));
  if ((await readFile(path.join(directory, "vault.key"))).length !== 32)
    throw new Error("Invalid backup vault key.");
  const db = new DatabaseSync(path.join(directory, "canopy.sqlite"), {
    readOnly: true,
  });
  try {
    const check = db.prepare("PRAGMA quick_check").all();
    if (check.some((row) => row.quick_check !== "ok"))
      throw new Error("SQLite integrity check failed.");
    const schema = Number(
      db.prepare("PRAGMA user_version").get()?.user_version,
    );
    if (schema < 1 || schema > 2)
      throw new Error("Unsupported backup schema version.");
    const vault = Vault.fromKey(
      await readFile(path.join(directory, "vault.key")),
    );
    for (const row of db
      .prepare("SELECT key_cipher FROM providers WHERE key_cipher IS NOT NULL")
      .all())
      if (row.key_cipher) vault.decrypt(String(row.key_cipher));
    return schema;
  } finally {
    db.close();
  }
}

/** VACUUM INTO makes a consistent online SQLite snapshot, including committed WAL data. */
export async function backupData(dataDir: string, output: string) {
  const source = path.resolve(dataDir),
    target = path.resolve(output);
  await regular(path.join(source, "canopy.sqlite"));
  await regular(path.join(source, "vault.key"));
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await mkdir(target, { mode: 0o700 }); // Exclusive: never overwrite a previous backup.
  try {
    const db = new DatabaseSync(path.join(source, "canopy.sqlite"), {
      readOnly: true,
    });
    try {
      db.exec("PRAGMA busy_timeout=5000");
      db.prepare("VACUUM INTO ?").run(path.join(target, "canopy.sqlite"));
    } finally {
      db.close();
    }
    await chmod(path.join(target, "canopy.sqlite"), 0o600);
    await writeFile(
      path.join(target, "vault.key"),
      await readFile(path.join(source, "vault.key")),
      { mode: 0o600, flag: "wx" },
    );
    try {
      await regular(path.join(source, "owner-password.hash"));
      await writeFile(
        path.join(target, "owner-password.hash"),
        await readFile(path.join(source, "owner-password.hash")),
        { mode: 0o600, flag: "wx" },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const schema = await verifyPair(target);
    const files = [];
    for (const name of names) {
      try {
        files.push({ name, sha256: await checksum(path.join(target, name)) });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const manifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      schema,
      files,
    };
    await writeFile(
      path.join(target, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    return { directory: target, schema, files: files.map((f) => f.name) };
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}

/** Restore only into a new directory, while the application is stopped. */
export async function restoreData(backupDir: string, dataDir: string) {
  const source = path.resolve(backupDir),
    target = path.resolve(dataDir);
  if ((await regular(path.join(source, "manifest.json"))).size > 16_384)
    throw new Error("Invalid backup manifest size.");
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8")),
  );
  const selected = new Set(manifest.files.map((f) => f.name));
  if (
    selected.size !== manifest.files.length ||
    !selected.has("canopy.sqlite") ||
    !selected.has("vault.key")
  )
    throw new Error(
      "Backup must contain a unique database and matching vault key.",
    );
  for (const { name, sha256 } of manifest.files) {
    await regular(path.join(source, name));
    if ((await checksum(path.join(source, name))) !== sha256)
      throw new Error("Backup checksum mismatch. Restore refused.");
  }
  if ((await verifyPair(source)) !== manifest.schema)
    throw new Error("Backup schema does not match its manifest.");
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await mkdir(target, { mode: 0o700 }); // A running or existing data directory cannot be overwritten.
  try {
    for (const { name, sha256 } of manifest.files) {
      await copyFile(
        path.join(source, name),
        path.join(target, name),
        constants.COPYFILE_EXCL,
      );
      await chmod(path.join(target, name), 0o600);
      if ((await checksum(path.join(target, name))) !== sha256)
        throw new Error("Restored checksum mismatch.");
    }
    await verifyPair(target);
    return { directory: target, schema: manifest.schema };
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}
