import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const image = process.argv[2] ?? "canopy-ci";
const name = `canopy-check-${randomUUID()}`,
  volume = `${name}-data`;
const docker = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
docker(["info", "--format", "{{.ServerVersion}}"]);
docker(["volume", "create", volume]);
try {
  const setup = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-i",
      "--mount",
      `type=volume,source=${volume},target=/var/lib/canopy`,
      "--entrypoint",
      "node",
      image,
      "dist-server/canopy-admin.js",
      "password",
      "--output",
      "/var/lib/canopy/owner-password.hash",
    ],
    {
      input: "container-verification-password\n",
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  if (setup.status !== 0) throw new Error(setup.stderr);
  docker([
    "run",
    "--detach",
    "--name",
    name,
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--pids-limit",
    "128",
    "--memory",
    "768m",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=128m",
    "--mount",
    `type=volume,source=${volume},target=/var/lib/canopy`,
    "--env",
    "CANOPY_PUBLIC_ORIGIN=https://ci.canopy.example",
    image,
  ]);
  const ready = async () => {
    for (let i = 0; i < 60; i++) {
      const probe = spawnSync(
        "docker",
        [
          "exec",
          name,
          "node",
          "-e",
          "fetch('http://127.0.0.1:4317/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
        ],
        { stdio: "ignore", timeout: 5000 },
      );
      if (probe.status === 0) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("Container readiness failed. " + docker(["logs", name]));
  };
  await ready();
  docker([
    "exec",
    name,
    "node",
    "-e",
    "try {require('node:fs').writeFileSync('/app/forbidden-write','x');process.exit(1)}catch(e){process.exit(e.code==='EROFS'?0:1)}",
  ]);
  const check = `(${checkInstance.toString()})(process.argv[1]).catch(e=>{console.error(e.message);process.exitCode=1});`;
  const conversationId = docker(["exec", name, "node", "-e", check]);
  if (!conversationId)
    throw new Error("The first boot did not create a conversation.");
  docker(["restart", name]);
  await ready();
  const restoredId = docker([
    "exec",
    name,
    "node",
    "-e",
    check,
    conversationId,
  ]);
  if (restoredId !== conversationId)
    throw new Error("The original conversation did not survive the restart.");
  console.log(
    JSON.stringify({
      ok: true,
      image,
      checks: [
        "non-root-runtime",
        "read-only-root",
        "readiness",
        "private-login",
        "bootstrap-protected",
        "terminal-disabled",
        "persistent-volume",
        "restart",
      ],
    }),
  );
} finally {
  try {
    docker(["rm", "--force", name]);
  } catch {
    /* setup may have failed before container creation */
  }
  docker(["volume", "rm", volume]);
}

// This function runs inside the container and must not capture host variables.
async function checkInstance(expectedConversationId) {
  const { default: assert } = await import("node:assert/strict");
  const http = await import("node:http");
  assert.notEqual(process.getuid(), 0, "The app must run as a non-root user.");
  const call = (route, method = "GET", data, cookie = "", csrf = "") =>
    new Promise((resolve, reject) => {
      const request = http.request(
        {
          host: "127.0.0.1",
          port: 4317,
          path: "/api" + route,
          method,
          headers: {
            Host: "ci.canopy.example",
            Origin: "https://ci.canopy.example",
            "X-Forwarded-Proto": "https",
            "Content-Type": "application/json",
            Cookie: cookie,
            "X-Canopy-CSRF": csrf,
          },
        },
        (response) => {
          let body = "";
          response.on("data", (chunk) => (body += chunk));
          response.on("end", () => {
            try {
              resolve({
                status: response.statusCode,
                headers: response.headers,
                body: JSON.parse(body),
              });
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      request.on("error", reject);
      request.setTimeout(5000, () => request.destroy(new Error("API timeout")));
      request.end(data ? JSON.stringify(data) : undefined);
    });
  assert.equal(
    (await call("/bootstrap")).status,
    401,
    "Bootstrap was exposed.",
  );
  const login = await call("/auth/login", "POST", {
    password: "container-verification-password",
  });
  assert.equal(login.status, 200, "Owner login failed.");
  const cookie = login.headers["set-cookie"][0].split(";")[0];
  const bootstrap = await call("/bootstrap", "GET", null, cookie);
  assert.equal(bootstrap.status, 200);
  const state = bootstrap.body;
  assert.equal(
    state.capabilities.terminal,
    "disabled",
    "Unsafe terminal policy.",
  );
  if (expectedConversationId) {
    assert.ok(
      state.conversations.some((entry) => entry.id === expectedConversationId),
      "The original conversation is missing after restart.",
    );
    console.log(expectedConversationId);
    return;
  }
  const created = await call(
    "/conversations",
    "POST",
    { workspaceId: state.workspaces[0].id },
    cookie,
    state.csrf,
  );
  assert.equal(created.status, 201, "Conversation creation failed.");
  assert.equal(typeof created.body.id, "string");
  console.log(created.body.id);
}
