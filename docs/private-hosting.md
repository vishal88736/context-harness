# Optional private workspace hosting

The normal release is a public download website plus a local coding app. Private hosting is an optional mode for one owner working with project files on a server. Use a separate instance, data volume, project volume, password, and hostname for each owner. This is not a shared multi-user account service.

## Private access

Set `CANOPY_MODE=private`, a public HTTPS origin, a private owner password-hash file, and a trusted HTTPS reverse proxy. Missing or unsafe settings fail startup. Private bootstrap requires login, sessions have separate CSRF tokens, cookies use `Secure`/`HttpOnly`/`SameSite=Strict`, login attempts are rate-limited, and logout revokes the session and stops active agent work. Active sessions are deliberately invalidated by a restart.

Project browsing and connections remain inside `CANOPY_PROJECTS_ROOT`. Keep projects and app data in separate directories. The API rejects a local-mode configuration bound to all network interfaces, and rejects private mode with unrestricted host terminal execution.

## Container setup

The container uses a non-root process, a read-only root filesystem, dropped capabilities, no-new-privileges, bounded memory/PIDs, persistent volumes, and readiness checks. Terminal commands are disabled in the container template; context configuration cannot override deployment policy.

From the repository:

```bash
export CANOPY_DOMAIN=workspace.example.com
docker compose -f deploy/compose.yml build
docker compose -f deploy/compose.yml run --rm --no-deps --entrypoint node canopy dist-server/canopy-admin.js password --output /var/lib/canopy/owner-password.hash
docker compose -f deploy/compose.yml up -d
```

The setup command prompts for a 14-character-or-longer password without echoing it. The password file is created exclusively; it will not replace an existing owner password silently. Point DNS at the host and allow Caddy to obtain its HTTPS certificate. Only the proxy exposes ports; do not mount a Docker socket or unrelated host directories into the app.

The default project volume contains `/projects/default`. Copy or clone repositories into the project volume as its non-root owner, or adapt the mount to a deliberately selected project directory with correct ownership. Files on visitors' laptops are not accessible to this server instance.

## Isolated terminal on a Linux host

Outside this container template, Linux operators may set `CANOPY_TERMINAL_POLICY=sandbox` if `/usr/bin/bwrap` is installed and its startup isolation probe succeeds. The namespace runner exposes the selected project at `/workspace`, read-only system binaries/libraries, isolated process/network namespaces, temporary storage, and an empty agent home. App data must be outside every project.

The runner never falls back to a host shell. Each command still requires human approval. `CANOPY_TERMINAL_POLICY=disabled` denies commands even if a model requests one or saved conversation permissions say “ask”. In normal local mode, `host` remains available and an approved command runs with the OS account's access.

## Operations

- `GET /api/health` identifies a running service; `GET /api/ready` checks SQLite availability. Probes contain no workspace content.
- `CANOPY_LOG_REQUESTS=1` enables JSON request logs containing request ID, method, route, status, and duration, without bodies, cookies, keys, or query strings. Private mode enables these logs by default.
- Caddy forwards streaming responses without buffering. Shutdown stops agent work, closes idle connections, and allows a bounded graceful exit.
- Use the bundled backup/restore commands described in [local-app.md](local-app.md). Keep matching data and vault keys, verify restoration, and protect off-device copies.
- Before upgrading, back up data and retain the old image/package. Use an explicit image tag or digest in controlled deployments; template base images track their supported major versions.

Run `npm run smoke:deployment -- --url https://workspace.example.com` after deployment. This checks home/workspace assets, health, readiness, and unauthorized bootstrap. It does not make model calls.

CI builds the image and runs `scripts/check-container.mjs` against a disposable container/volume. That check exercises private login, bootstrap protection, read-only root, effective terminal denial, and restart persistence. AWS public-site deployment is a separate workflow and contains no private coding backend.
