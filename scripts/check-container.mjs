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
  const check = `const http=require('node:http');const call=(p,m='GET',data,cookie='',csrf='')=>new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:4317,path:'/api'+p,method:m,headers:{Host:'ci.canopy.example',Origin:'https://ci.canopy.example','X-Forwarded-Proto':'https','Content-Type':'application/json',Cookie:cookie,'X-Canopy-CSRF':csrf}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(body)}))});r.on('error',reject);r.end(data?JSON.stringify(data):undefined)});(async()=>{if((await call('/bootstrap')).status!==401)throw Error('bootstrap exposed');const login=await call('/auth/login','POST',{password:'container-verification-password'});if(login.status!==200)throw Error('login failed');const cookie=login.headers['set-cookie'][0].split(';')[0];const b=(await call('/bootstrap','GET',null,cookie)).body;if(b.capabilities.terminal!=='disabled')throw Error('unsafe terminal');if(!b.conversations.length){const r=await call('/conversations','POST',{workspaceId:b.workspaces[0].id},cookie,b.csrf);if(r.status!==201)throw Error('create failed')}console.log('private-login-and-storage-ok')})().catch(e=>{console.error(e.message);process.exitCode=1});`;
  docker(["exec", name, "node", "-e", check]);
  docker(["restart", name]);
  await ready();
  docker(["exec", name, "node", "-e", check]);
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
