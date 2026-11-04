import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../server/store";
import { Vault } from "../server/security";
import { backupData, restoreData } from "../server/backup";

test("online backup restores committed WAL data, settings and matching encrypted credentials without overwriting existing data", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "canopy-backup-"));
  const data = path.join(temp, "data");
  const vault = await Vault.create(data);
  const store = new Store(path.join(data, "canopy.sqlite"), temp);
  try {
    store.setSetting("backup-marker", "COMMITTED_WAL_VALUE");
    store.saveProvider(
      {
        id: "backup-provider",
        name: "Backup provider",
        kind: "compatible",
        baseUrl: "https://provider.example/v1",
        models: [],
        keyConfigured: false,
      },
      vault.encrypt("private-backup-test-key"),
    );
    const original = store.createConversation(store.workspaces()[0].id);
    const backup = path.join(temp, "snapshot");
    await backupData(data, backup);
    store.setSetting("backup-marker", "NEWER_AFTER_SNAPSHOT");
    const restored = path.join(temp, "restored");
    await restoreData(backup, restored);
    const copy = new Store(path.join(restored, "canopy.sqlite"), temp);
    try {
      assert.equal(copy.setting("backup-marker", ""), "COMMITTED_WAL_VALUE");
      assert.equal(copy.conversation(original.id).title, original.title);
      assert.equal(
        (await Vault.create(restored)).decrypt(
          copy.providerCipher("backup-provider"),
        ),
        "private-backup-test-key",
      );
    } finally {
      copy.close();
    }
    if (process.platform !== "win32")
      assert.equal(
        (await stat(path.join(restored, "vault.key"))).mode & 0o777,
        0o600,
      );
    await assert.rejects(restoreData(backup, restored), /EEXIST/);
    await assert.rejects(backupData(data, backup), /EEXIST/);
    await writeFile(path.join(backup, "vault.key"), Buffer.alloc(32, 7));
    await assert.rejects(
      restoreData(backup, path.join(temp, "tampered")),
      /checksum/,
    );
    assert.equal(store.setting("backup-marker", ""), "NEWER_AFTER_SNAPSHOT");
    assert.doesNotMatch(
      await readFile(path.join(backup, "manifest.json"), "utf8"),
      /private-backup-test-key/,
    );
  } finally {
    store.close();
    await rm(temp, { recursive: true, force: true });
  }
});
