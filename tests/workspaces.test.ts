import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
  readdir,
  stat,
  chmod,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../server/app";
import { digest } from "../server/security";
import { Store } from "../server/store";

async function fixture(t: TestContext) {
  const temp = await mkdtemp(path.join(tmpdir(), "canopy-workspaces-"));
  const externalBase = await mkdtemp(path.join(tmpdir(), "canopy-external-"));
  const root = path.join(temp, "initial-project");
  const external = path.join(externalBase, "External project with spaces");
  const dataDir = path.join(temp, "private-data");
  await mkdir(root);
  await mkdir(external);
  await mkdir(path.join(external, "src"));
  await writeFile(path.join(root, "same.ts"), "INITIAL_WORKSPACE_SENTINEL\n");
  await writeFile(
    path.join(external, "same.ts"),
    "EXTERNAL_WORKSPACE_SENTINEL\n",
  );
  await writeFile(path.join(external, ".env"), "PRIVATE_CREDENTIAL_SENTINEL\n");
  let service: Awaited<ReturnType<typeof createApp>>;
  let server: Server;
  let origin = "";
  let csrf = "";
  let cookie = "";
  async function stop() {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    service.close();
  }
  async function start() {
    service = await createApp({ root, dataDir });
    server = service.app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(origin + "/api/bootstrap");
    cookie = response.headers.get("set-cookie")!.split(";")[0];
    const bootstrap = await response.json();
    csrf = bootstrap.csrf;
    return bootstrap;
  }
  const initial = await start();
  t.after(async () => {
    await stop();
    await rm(temp, { recursive: true, force: true });
    await rm(externalBase, { recursive: true, force: true });
  });
  async function call(
    route: string,
    method = "GET",
    body?: unknown,
    authenticate = true,
    token = true,
  ) {
    return fetch(origin + "/api" + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(authenticate
          ? { Cookie: cookie, ...(token ? { "X-Canopy-CSRF": csrf } : {}) }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function connect(directory = external) {
    const response = await call("/workspaces", "POST", { root: directory });
    assert.ok(response.ok, await response.clone().text());
    return response.json();
  }
  return {
    temp,
    root,
    external,
    externalBase,
    dataDir,
    initial,
    call,
    connect,
    get service() {
      return service;
    },
    get origin() {
      return origin;
    },
    async restart() {
      await stop();
      return start();
    },
  };
}

test("Authenticated OS folder browsing connects external folders, expands home paths, and reuses canonical roots", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call("/folders", "GET", undefined, false)).status, 401);
  const listingResponse = await f.call(
    `/folders?path=${encodeURIComponent(f.externalBase)}`,
  );
  assert.equal(listingResponse.status, 200);
  const listing = await listingResponse.json();
  assert.equal(listing.path, f.externalBase);
  assert.equal(listing.parentPath, path.dirname(f.externalBase));
  assert.deepEqual(listing.entries, [
    { name: "External project with spaces", path: f.external },
  ]);
  assert.ok(
    listing.shortcuts.some((entry: { name: string }) => entry.name === "Home"),
  );
  assert.doesNotMatch(
    JSON.stringify(listing),
    /EXTERNAL_WORKSPACE_SENTINEL|PRIVATE_CREDENTIAL_SENTINEL/,
  );
  const home = await (await f.call("/folders?path=~")).json();
  assert.equal(home.path, homedir());
  assert.equal(home.selectable, false);
  const connected = await f.connect();
  assert.equal(connected.root, f.external);
  assert.equal(connected.name, "External project with spaces");
  const alias = path.join(f.externalBase, "project-alias");
  await symlink(f.external, alias);
  const repeated = await f.call("/workspaces", "POST", {
    root: alias,
    name: "Duplicate name",
  });
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).id, connected.id);
  assert.equal(f.service.store.workspaces().length, 2);
  for (const root of [
    homedir(),
    path.parse(f.external).root,
    path.join(f.external, "missing"),
    "relative/project",
    path.join(f.external, "same.ts"),
  ])
    assert.equal((await f.call("/workspaces", "POST", { root })).status, 400);
  assert.equal(
    (await f.call("/workspaces", "POST", { root: f.dataDir })).status,
    403,
  );
  assert.equal((await f.call("/folders?path=relative")).status, 400);
  assert.equal(
    (
      await f.call(
        `/folders?path=${encodeURIComponent(path.join(f.external, "missing"))}`,
      )
    ).status,
    400,
  );
  const externalListing = await (
    await f.call(`/folders?path=${encodeURIComponent(f.external)}`)
  ).json();
  assert.deepEqual(externalListing.entries, [
    { name: "src", path: path.join(f.external, "src") },
  ]);
});

test("Connected workspace file reads stay isolated and block credentials, runtime data, traversal, and escaping symlinks", async (t) => {
  const f = await fixture(t);
  const connected = await f.connect();
  const initial = await (
    await f.call(`/workspaces/${f.initial.workspaces[0].id}/file?path=same.ts`)
  ).json();
  const external = await (
    await f.call(`/workspaces/${connected.id}/file?path=same.ts`)
  ).json();
  assert.equal(initial.content, "INITIAL_WORKSPACE_SENTINEL\n");
  assert.equal(external.content, "EXTERNAL_WORKSPACE_SENTINEL\n");
  assert.equal(external.hash, digest(external.content));
  assert.equal(external.path, "same.ts");
  assert.equal(external.redacted, false);
  await symlink(
    path.join(f.root, "same.ts"),
    path.join(f.external, "escape.ts"),
  );
  for (const source of [
    ".env",
    "escape.ts",
    path.join(f.root, "same.ts"),
    "../outside.ts",
  ])
    assert.equal(
      (
        await f.call(
          `/workspaces/${connected.id}/file?path=${encodeURIComponent(source)}`,
        )
      ).status,
      403,
    );
  const files = await (
    await f.call(`/workspaces/${connected.id}/files`)
  ).json();
  assert.ok(
    files.entries.some((entry: { name: string }) => entry.name === "same.ts"),
  );
  assert.ok(
    !files.entries.some((entry: { name: string }) =>
      [".env", "escape.ts"].includes(entry.name),
    ),
  );
  assert.equal(
    (await f.call(`/workspaces/${connected.id}/files?path=same.ts`)).status,
    400,
  );
});

test("Manual file changes show a real diff without writing and apply only after authenticated explicit approval", async (t) => {
  const f = await fixture(t);
  const workspace = await f.connect();
  const filename = path.join(f.external, "same.ts");
  await chmod(filename, 0o664);
  const opened = await (
    await f.call(`/workspaces/${workspace.id}/file?path=same.ts`)
  ).json();
  const endpoint = `/workspaces/${workspace.id}/file-changes`;
  const content = "APPROVED_MANUAL_EDIT_SENTINEL\n";
  const stagedResponse = await f.call(endpoint, "POST", {
    path: "same.ts",
    content,
    expectedHash: opened.hash,
  });
  assert.equal(stagedResponse.status, 201);
  const staged = await stagedResponse.json();
  assert.match(staged.diff, /-EXTERNAL_WORKSPACE_SENTINEL/);
  assert.match(staged.diff, /\+APPROVED_MANUAL_EDIT_SENTINEL/);
  assert.equal(await readFile(filename, "utf8"), opened.content);
  assert.equal(
    (
      await f.call(
        `${endpoint}/${staged.id}/apply`,
        "POST",
        { approved: true },
        false,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await f.call(`${endpoint}/${staged.id}/apply`, "POST", {
        approved: false,
      })
    ).status,
    400,
  );
  assert.equal(await readFile(filename, "utf8"), opened.content);
  assert.equal(
    (
      await f.call(
        `${endpoint}/${staged.id}/apply`,
        "POST",
        { approved: true },
        true,
        false,
      )
    ).status,
    403,
  );
  const previousUmask = process.umask(0o022);
  let appliedResponse: Response;
  try {
    appliedResponse = await f.call(`${endpoint}/${staged.id}/apply`, "POST", {
      approved: true,
    });
  } finally {
    process.umask(previousUmask);
  }
  assert.equal(appliedResponse.status, 200);
  assert.deepEqual(await appliedResponse.json(), {
    path: "same.ts",
    hash: digest(content),
    content,
  });
  assert.equal(await readFile(filename, "utf8"), content);
  assert.equal((await stat(filename)).mode & 0o777, 0o664);
  assert.equal(
    (await f.call(`${endpoint}/${staged.id}/apply`, "POST", { approved: true }))
      .status,
    409,
  );
  assert.ok(
    !(await readdir(f.external)).some((name) => name.startsWith(".canopy-")),
  );
  const audit = f.service.store.fileChanges(workspace.id);
  assert.equal(audit[0].decision, "applied");
  assert.ok(audit[0].appliedAt);
  assert.doesNotMatch(
    JSON.stringify(audit),
    /APPROVED_MANUAL_EDIT_SENTINEL|EXTERNAL_WORKSPACE_SENTINEL/,
  );
  assert.deepEqual(
    (await (await f.call(endpoint)).json()).changes,
    audit.map((record) => ({ ...record })),
  );
});

test("Stale edits and changed targets cannot overwrite newer content or escape the selected workspace", async (t) => {
  const f = await fixture(t);
  const workspace = await f.connect();
  const endpoint = `/workspaces/${workspace.id}/file-changes`;
  const opened = await (
    await f.call(`/workspaces/${workspace.id}/file?path=same.ts`)
  ).json();
  const staged = await (
    await f.call(endpoint, "POST", {
      path: "same.ts",
      content: "proposed edit",
      expectedHash: opened.hash,
    })
  ).json();
  assert.equal(
    (
      await f.call(
        `/workspaces/${f.initial.workspaces[0].id}/file-changes/${staged.id}/apply`,
        "POST",
        { approved: true },
      )
    ).status,
    409,
  );
  await writeFile(path.join(f.external, "same.ts"), "NEWER_EXTERNAL_EDIT\n");
  assert.equal(
    (await f.call(`${endpoint}/${staged.id}/apply`, "POST", { approved: true }))
      .status,
    409,
  );
  assert.equal(
    await readFile(path.join(f.external, "same.ts"), "utf8"),
    "NEWER_EXTERNAL_EDIT\n",
  );
  assert.equal(
    f.service.store.fileChanges(workspace.id)[0].decision,
    "invalidated",
  );
  assert.equal(
    (
      await f.call(endpoint, "POST", {
        path: "same.ts",
        content: "old edit",
        expectedHash: opened.hash,
      })
    ).status,
    409,
  );
  for (const source of [".env", "../outside.ts"])
    assert.equal(
      (
        await f.call(endpoint, "POST", {
          path: source,
          content: "bad edit",
          expectedHash: opened.hash,
        })
      ).status,
      403,
    );
  const large = await f.call(endpoint, "POST", {
    path: "same.ts",
    content: "界".repeat(100_000),
    expectedHash: opened.hash,
  });
  assert.equal(large.status, 413);
  await writeFile(
    path.join(f.external, "redacted.ts"),
    'const password = "private-example-value";\n',
  );
  const redacted = await (
    await f.call(`/workspaces/${workspace.id}/file?path=redacted.ts`)
  ).json();
  assert.equal(redacted.redacted, true);
  assert.doesNotMatch(redacted.content, /private-example-value/);
  assert.equal(
    (
      await f.call(endpoint, "POST", {
        path: "redacted.ts",
        content: "replacement",
        expectedHash: redacted.hash,
      })
    ).status,
    403,
  );
});

test("Manual proposals recheck newly configured credentials before applying an edit", async (t) => {
  const f = await fixture(t);
  const workspace = await f.connect();
  const endpoint = `/workspaces/${workspace.id}/file-changes`;
  for (const location of ["current", "proposed"]) {
    const value = `unrecognized-${randomUUID()}`;
    const filename = `${location}.ts`;
    const before =
      location === "current"
        ? `const opaque = "${value}";\n`
        : 'const value = "before";\n';
    const content =
      location === "proposed"
        ? `const opaque = "${value}";\n`
        : 'const value = "after";\n';
    await writeFile(path.join(f.external, filename), before);
    const opened = await (
      await f.call(`/workspaces/${workspace.id}/file?path=${filename}`)
    ).json();
    assert.equal(opened.redacted, false);
    const stagedResponse = await f.call(endpoint, "POST", {
      path: filename,
      content,
      expectedHash: opened.hash,
    });
    assert.equal(stagedResponse.status, 201);
    const staged = await stagedResponse.json();
    assert.equal(
      (
        await f.call("/providers", "POST", {
          name: `Credential policy ${location}`,
          kind: "compatible",
          baseUrl: "http://127.0.0.1:19823/v1",
          apiKey: value,
        })
      ).status,
      201,
    );
    const response = await f.call(`${endpoint}/${staged.id}/apply`, "POST", {
      approved: true,
    });
    assert.equal(response.status, 403);
    assert.doesNotMatch(await response.text(), new RegExp(value));
    assert.equal(
      await readFile(path.join(f.external, filename), "utf8"),
      before,
    );
    assert.equal(
      f.service.store
        .fileChanges(workspace.id)
        .find((change) => change.id === staged.id)?.decision,
      "invalidated",
    );
  }
});

test("Changed file targets invalidate proposals before any escaping write", async (t) => {
  const f = await fixture(t);
  const workspace = await f.connect();
  const endpoint = `/workspaces/${workspace.id}/file-changes`;
  const latest = await (
    await f.call(`/workspaces/${workspace.id}/file?path=same.ts`)
  ).json();
  const changedTarget = await (
    await f.call(endpoint, "POST", {
      path: "same.ts",
      content: "should not escape",
      expectedHash: latest.hash,
    })
  ).json();
  await rm(path.join(f.external, "same.ts"));
  await symlink(path.join(f.root, "same.ts"), path.join(f.external, "same.ts"));
  assert.equal(
    (
      await f.call(`${endpoint}/${changedTarget.id}/apply`, "POST", {
        approved: true,
      })
    ).status,
    409,
  );
  assert.equal(
    await readFile(path.join(f.root, "same.ts"), "utf8"),
    "INITIAL_WORKSPACE_SENTINEL\n",
  );
});

test("Folder picker reports permission errors and skips unreadable siblings", async (t) => {
  if (process.getuid?.() === 0)
    return t.skip("OS root bypasses directory mode restrictions.");
  const f = await fixture(t);
  const locked = path.join(f.externalBase, "unreadable-project");
  await mkdir(locked);
  await chmod(locked, 0);
  try {
    assert.equal(
      (await f.call(`/folders?path=${encodeURIComponent(locked)}`)).status,
      403,
    );
    assert.equal(
      (await f.call("/workspaces", "POST", { root: locked })).status,
      403,
    );
    const listing = await (
      await f.call(`/folders?path=${encodeURIComponent(f.externalBase)}`)
    ).json();
    assert.ok(
      !listing.entries.some((entry: { path: string }) => entry.path === locked),
    );
  } finally {
    await chmod(locked, 0o700);
  }
});

test("External folders, conversations, theme preferences, and hash-only edit audits survive restart", async (t) => {
  const f = await fixture(t);
  const workspace = await f.connect();
  const conversation = await (
    await f.call("/conversations", "POST", { workspaceId: workspace.id })
  ).json();
  f.service.store.addMessage(
    conversation.id,
    "user",
    "Persistent external conversation",
  );
  f.service.store.setSetting("custom-preserved", { value: 42 });
  const endpoint = `/workspaces/${workspace.id}/file-changes`;
  const opened = await (
    await f.call(`/workspaces/${workspace.id}/file?path=same.ts`)
  ).json();
  const applied = await (
    await f.call(endpoint, "POST", {
      path: "same.ts",
      content: "persisted edit",
      expectedHash: opened.hash,
    })
  ).json();
  assert.equal(
    (
      await f.call(`${endpoint}/${applied.id}/apply`, "POST", {
        approved: true,
      })
    ).status,
    200,
  );
  const pending = await (
    await f.call(endpoint, "POST", {
      path: "same.ts",
      content: "unsaved pending edit",
      expectedHash: digest("persisted edit"),
    })
  ).json();
  // An existing preference must survive startup without being reset.
  f.service.store.db
    .prepare(
      "INSERT INTO settings VALUES('theme','\"dark\"') ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run();
  const restored = await f.restart();
  assert.equal(restored.settings.theme, "dark");
  assert.ok(
    restored.workspaces.some(
      (entry: { id: string; root: string }) =>
        entry.id === workspace.id && entry.root === f.external,
    ),
  );
  assert.equal(
    f.service.store.messages(conversation.id)[0].content,
    "Persistent external conversation",
  );
  assert.deepEqual(f.service.store.setting("custom-preserved", null), {
    value: 42,
  });
  assert.deepEqual(
    f.service.store.fileChanges(workspace.id).map((record) => record.decision),
    ["applied", "expired"],
  );
  assert.equal(
    (
      await f.call(`${endpoint}/${pending.id}/apply`, "POST", {
        approved: true,
      })
    ).status,
    409,
  );
  assert.equal(
    await readFile(path.join(f.external, "same.ts"), "utf8"),
    "persisted edit",
  );
  for (const theme of ["dark", "system", "light"]) {
    assert.equal((await f.call("/settings", "PUT", { theme })).status, 200);
    assert.equal(
      (await (await f.call("/bootstrap")).json()).settings.theme,
      theme,
    );
    assert.equal(f.service.store.setting("theme", ""), theme);
    assert.equal((await f.restart()).settings.theme, theme);
  }
});

test("Schema version 1 migrates workspace edit audits and light preference without deleting older messages", async (t) => {
  const temp = await mkdtemp(path.join(tmpdir(), "canopy-migration-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const filename = path.join(temp, "legacy.sqlite");
  const legacy = new Store(filename, temp);
  const workspace = legacy.workspaces()[0];
  const conversation = legacy.createConversation(workspace.id);
  legacy.addMessage(conversation.id, "user", "Preserve schema one history");
  legacy.db.exec("DROP TABLE file_changes; PRAGMA user_version=1;");
  legacy.close();
  const restored = new Store(filename, temp);
  try {
    assert.equal(
      (
        restored.db.prepare("PRAGMA user_version").get() as {
          user_version: number;
        }
      ).user_version,
      2,
    );
    assert.equal(
      restored.messages(conversation.id)[0].content,
      "Preserve schema one history",
    );
    assert.deepEqual(restored.fileChanges(workspace.id), []);
    assert.equal(restored.setting("theme", ""), "light");
  } finally {
    restored.close();
  }
});
