import {
  readFile,
  readdir,
  stat,
  writeFile,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { aws, deployment, exists } from "./aws-common.mjs";
const directory = path.resolve(process.argv[2] ?? "artifacts/releases");
const entries = (await readdir(directory)).filter((name) =>
  /^(linux-x64|darwin-arm64|darwin-x64)-manifest\.json$/.test(name),
);
if (!entries.length)
  throw new Error("No verified app package manifests found.");
const artifacts = [];
let version, commit;
for (const entry of entries) {
  const m = JSON.parse(await readFile(path.join(directory, entry), "utf8"));
  if (
    m.dirty !== false ||
    m.standalone !== true ||
    !/^v\d+\.\d+\.\d+$/.test(m.version) ||
    !/^[a-f0-9]{40}$/.test(m.commit) ||
    !/^(linux-x64|darwin-arm64|darwin-x64)$/.test(m.platform) ||
    m.filename !== `canopy-${m.platform}.tar.gz`
  )
    throw new Error("Unreleased, dirty or malformed package manifest.");
  if (entry !== `${m.platform}-manifest.json`)
    throw new Error("Package platform metadata does not match its file.");
  if ((version && version !== m.version) || (commit && commit !== m.commit))
    throw new Error("All packages must belong to one version and commit.");
  version = m.version;
  commit = m.commit;
  const filename = path.join(directory, m.filename),
    hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  if (
    hash.digest("hex") !== m.sha256 ||
    (await stat(filename)).size !== m.bytes
  )
    throw new Error("Package integrity check failed.");
  artifacts.push({
    platform: m.platform,
    url: `/downloads/${version}/${m.filename}`,
    sha256: m.sha256,
    bytes: m.bytes,
  });
}
const {
  BucketName: bucket,
  DistributionId: distribution,
  WebsiteUrl: url,
} = deployment();
for (const artifact of artifacts) {
  const key = artifact.url.slice(1),
    previous = exists(bucket, key);
  if (previous && previous.Metadata?.sha256 !== artifact.sha256)
    throw new Error(
      "A different package already exists at this version. Choose a new version.",
    );
  if (!previous)
    aws([
      "s3api",
      "put-object",
      "--bucket",
      bucket,
      "--key",
      key,
      "--body",
      path.join(directory, path.basename(key)),
      "--content-type",
      "application/gzip",
      "--content-disposition",
      `attachment; filename="${path.basename(key)}"`,
      "--metadata",
      `sha256=${artifact.sha256}`,
      "--if-none-match",
      "*",
    ]);
}
for (const artifact of artifacts) {
  const response = await fetch(url + artifact.url, {
    method: "HEAD",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) !== artifact.bytes
  )
    throw new Error(
      "A public package is unavailable or has the wrong size. Latest release was not changed.",
    );
}
const temporary = await mkdtemp(path.join(tmpdir(), "canopy-downloads-"));
try {
  const filename = path.join(temporary, "latest.json");
  await writeFile(
    filename,
    JSON.stringify({ version, commit, artifacts }, null, 2),
  );
  aws([
    "s3",
    "cp",
    filename,
    `s3://${bucket}/downloads/latest.json`,
    "--cache-control",
    "no-cache",
    "--content-type",
    "application/json",
  ]);
  aws([
    "cloudfront",
    "create-invalidation",
    "--distribution-id",
    distribution,
    "--paths",
    "/downloads/latest.json",
  ]);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.log(
  JSON.stringify({
    ok: true,
    website: `${url}/#download`,
    version,
    commit,
    platforms: artifacts.map((a) => a.platform),
  }),
);
