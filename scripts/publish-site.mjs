import { execFileSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { aws, deployment, exists } from "./aws-common.mjs";
const {
  BucketName: bucket,
  DistributionId: distribution,
  WebsiteUrl: url,
} = deployment();
const rollback = process.argv.indexOf("--rollback");
const sha =
  rollback >= 0
    ? process.argv[rollback + 1]
    : execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/.test(sha ?? ""))
  throw new Error("Use a full commit SHA for a site release or rollback.");
const root = `s3://${bucket}`;
const archive = `${root}/site-releases/${sha}/`;
if (rollback < 0) {
  await stat("dist-site/index.html");
  aws([
    "s3",
    "sync",
    "dist-site/",
    archive,
    "--exclude",
    "downloads/*",
    "--cache-control",
    "public,max-age=31536000,immutable",
  ]);
} else if (!exists(bucket, `site-releases/${sha}/index.html`))
  throw new Error("The requested site release does not exist.");
// Keep old hashed assets and all app downloads; publish HTML only after its dependencies.
aws([
  "s3",
  "sync",
  archive,
  root + "/",
  "--exclude",
  "index.html",
  "--exclude",
  "downloads/*",
  "--cache-control",
  "public,max-age=3600",
]);
aws([
  "s3",
  "cp",
  archive + "index.html",
  root + "/index.html",
  "--cache-control",
  "no-cache,no-store,must-revalidate",
  "--content-type",
  "text/html",
]);
if (!exists(bucket, "downloads/latest.json"))
  aws([
    "s3",
    "cp",
    "public/downloads/latest.json",
    root + "/downloads/latest.json",
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
  "/",
  "/index.html",
  "/mascots/*",
]);
const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
if (!response.ok || !(await response.text()).includes("Canopy"))
  throw new Error(
    "The site was uploaded, but the public HTTPS smoke check failed. Check CloudFront propagation.",
  );
console.log(
  JSON.stringify({ ok: true, site: url, commit: sha, rollback: rollback >= 0 }),
);
