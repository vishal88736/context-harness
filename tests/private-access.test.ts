import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import http from "node:http";
import { hashPassword } from "../server/access";
import { createApp } from "../server/app";
import { commandSpec, assertSandboxAvailable } from "../server/sandbox";
import { runtimeConfig } from "../server/runtime";

test("private instances require HTTPS, owner login, per-session CSRF, and isolated data", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "canopy-private-"));
  const password = "owner-private-test-password";
  const hash = await hashPassword(password);
  const instances: {
    service: Awaited<ReturnType<typeof createApp>>;
    server: ReturnType<Awaited<ReturnType<typeof createApp>>["app"]["listen"]>;
    port: number;
    host: string;
  }[] = [];
  async function instance(name: string) {
    const root = path.join(temp, name, "projects");
    await mkdir(root, { recursive: true });
    const host = `${name}.canopy.example`;
    const service = await createApp({
      root,
      dataDir: path.join(temp, name, "data"),
      access: {
        mode: "private",
        publicOrigin: `https://${host}`,
        passwordHash: hash,
        trustedProxy: true,
      },
    });
    const server = service.app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const value = {
      service,
      server,
      port: (server.address() as { port: number }).port,
      host,
    };
    instances.push(value);
    return value;
  }
  try {
    const a = await instance("alice"),
      b = await instance("bob");
    const request = (i: typeof a, route: string, options: RequestInit = {}) =>
      new Promise<Response>((resolve, reject) => {
        const headers = new Headers({
          Host: i.host,
          Origin: `https://${i.host}`,
          "X-Forwarded-Proto": "https",
          "Content-Type": "application/json",
        });
        new Headers(options.headers).forEach((value, name) =>
          headers.set(name, value),
        );
        const req = http.request(
          `http://127.0.0.1:${i.port}/api${route}`,
          {
            method: options.method ?? "GET",
            headers: Object.fromEntries(headers),
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () =>
              resolve(
                new Response(Buffer.concat(chunks), {
                  status: res.statusCode,
                  headers: Object.fromEntries(
                    Object.entries(res.headers)
                      .filter(([, value]) => value !== undefined)
                      .map(([name, value]) => [
                        name,
                        Array.isArray(value) ? value.join(", ") : String(value),
                      ]),
                  ),
                }),
              ),
            );
          },
        );
        req.on("error", reject);
        req.end(options.body);
      });
    assert.equal((await request(a, "/bootstrap")).status, 401);
    assert.equal(
      (
        await request(a, "/bootstrap", {
          headers: { "X-Forwarded-Proto": "http" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await request(a, "/auth/status", { headers: { Host: "evil.example" } }))
        .status,
      403,
    );
    assert.equal(
      (
        await request(a, "/auth/login", {
          method: "POST",
          headers: { Origin: "https://evil.example" },
          body: JSON.stringify({ password }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(a, "/auth/login", {
          method: "POST",
          body: JSON.stringify({ password: "wrong" }),
        })
      ).status,
      401,
    );
    const login = async () => {
      const r = await request(a, "/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      assert.equal(r.status, 200);
      const cookie = r.headers.get("set-cookie")!;
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /Secure/);
      assert.match(cookie, /SameSite=Strict/);
      return cookie.split(";")[0];
    };
    const cookie = await login(),
      second = await login();
    const bootstrap = await (
      await request(a, "/bootstrap", { headers: { Cookie: cookie } })
    ).json();
    const other = await (
      await request(a, "/bootstrap", { headers: { Cookie: second } })
    ).json();
    assert.notEqual(bootstrap.csrf, other.csrf);
    assert.doesNotMatch(
      JSON.stringify(bootstrap),
      /scrypt\$|owner-private-test-password/,
    );
    const body = JSON.stringify({
      workspaceId: bootstrap.workspaces[0].id,
      title: "Alice private conversation",
    });
    assert.equal(
      (
        await request(a, "/conversations", {
          method: "POST",
          headers: { Cookie: cookie, "X-Canopy-CSRF": other.csrf },
          body,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(a, "/conversations", {
          method: "POST",
          headers: { Cookie: cookie, "X-Canopy-CSRF": bootstrap.csrf },
          body,
        })
      ).status,
      201,
    );
    assert.equal(
      (await request(b, "/bootstrap", { headers: { Cookie: cookie } })).status,
      401,
    );
    assert.equal(b.service.store.conversations().length, 0);
    assert.equal(
      (await request(a, "/folders?path=/", { headers: { Cookie: cookie } }))
        .status,
      403,
    );
    const folders = await (
      await request(a, "/folders", { headers: { Cookie: cookie } })
    ).json();
    assert.equal(folders.parentPath, null);
    assert.ok(
      folders.shortcuts.every((s: { path: string }) =>
        s.path.startsWith(path.join(temp, "alice", "projects")),
      ),
    );
    assert.equal(bootstrap.capabilities.terminal, "disabled");
    assert.equal(
      (
        await request(a, "/auth/logout", {
          method: "POST",
          headers: { Cookie: cookie, "X-Canopy-CSRF": bootstrap.csrf },
          body: "{}",
        })
      ).status,
      200,
    );
    assert.equal(
      (await request(a, "/bootstrap", { headers: { Cookie: cookie } })).status,
      401,
    );
    assert.equal(
      (await request(a, "/bootstrap", { headers: { Cookie: second } })).status,
      200,
    );
    assert.equal((await request(a, "/ready")).status, 200);
  } finally {
    for (const { service, server } of instances) {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      service.close();
    }
    await rm(temp, { recursive: true, force: true });
  }
});

test("network deployment configuration cannot silently enable unauthenticated access or host commands", async () => {
  await assert.rejects(runtimeConfig({ CANOPY_HOST: "0.0.0.0" }), /loopback/);
  await assert.rejects(
    runtimeConfig({ CANOPY_MODE: "private", CANOPY_TERMINAL_POLICY: "host" }),
    /disabled or sandbox/,
  );
  await assert.rejects(runtimeConfig({ CANOPY_MODE: "private" }), /requires/);
  assert.throws(
    () => commandSpec("disabled", "echo denied", "/tmp"),
    /disabled/,
  );
});

test("namespace commands cannot read runtime secrets, host files, or the host network", async (t) => {
  try {
    assertSandboxAvailable();
  } catch (e) {
    t.skip((e as Error).message);
    return;
  }
  const temp = await mkdtemp(path.join(tmpdir(), "canopy-sandbox-"));
  const project = path.join(temp, "project");
  await mkdir(project);
  await writeFile(path.join(project, "allowed.txt"), "project-data");
  const secret = path.join(temp, "vault.key");
  await writeFile(secret, "PRIVATE_OUTSIDE_WORKSPACE");
  const hostListener = http.createServer((_req, res) => res.end("HOST_ONLY"));
  hostListener.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => hostListener.once("listening", resolve));
  const hostPort = (hostListener.address() as { port: number }).port;
  try {
    const quotedSecret = "'" + secret.replaceAll("'", "'\\''") + "'";
    const command = `cat allowed.txt; if [ -e ${quotedSecret} ]; then exit 91; fi; test ! -d /app; printf isolated > result.txt; if (echo probe > /dev/tcp/127.0.0.1/${hostPort}) 2>/dev/null; then exit 92; fi`;
    const spec = commandSpec("sandbox", command, project);
    const result = spawnSync(spec.binary, spec.args, {
      encoding: "utf8",
      timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "project-data");
    const { readFile } = await import("node:fs/promises");
    assert.equal(
      await readFile(path.join(project, "result.txt"), "utf8"),
      "isolated",
    );
    assert.doesNotMatch(result.stdout, /PRIVATE_OUTSIDE_WORKSPACE/);
  } finally {
    hostListener.closeAllConnections();
    await new Promise<void>((resolve) => hostListener.close(() => resolve()));
    await rm(temp, { recursive: true, force: true });
  }
});
