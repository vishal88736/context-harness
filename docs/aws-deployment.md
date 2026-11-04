# AWS website and app downloads

Canopy's public website runs on S3 and CloudFront. Users download the coding app and run it on their own machines. The website contains product information, previews, and release metadata; provider keys, projects, conversations, and coding tools stay in the local app.

The owner will provision AWS from CloudShell. These instructions do not require sharing AWS keys or model credentials. The stack creates billable S3, CloudFront, and CloudWatch resources; review [the template](../deploy/aws-site.yml) before running it.

## 1. Prepare CloudShell

Open AWS CloudShell in the account that should own the website:

```bash
git clone https://github.com/vishal88736/context-harness.git
cd context-harness
git switch main
node --version
```

Use Node 24. If CloudShell has an older Node installation, this optional helper installs an official, checksum-verified Node 24 archive inside the checkout:

```bash
bash deploy/setup-cloudshell-node.sh
source .cache/cloudshell-node/env.sh
node --version
```

Build the public website:

```bash
npm ci
npm run build:site
```

The output is `dist-site/`. Do not upload `dist/`, `dist-server/`, your data directory, or project folders to the website bucket.

## 2. Create and publish the website

```bash
export CANOPY_STACK=canopy-site
export CANOPY_AWS_REGION=us-east-1
bash deploy/aws-cloudshell.sh
```

The script prints the AWS identity, validates the CloudFormation template, deploys it, uploads the static site, invalidates its entry pages, and checks the public HTTPS page. CloudFront provisioning can take several minutes. An initial site has no app packages advertised until verified packages are published.

The stack includes:

- A versioned, encrypted S3 bucket with public access blocked and TLS required.
- CloudFront origin access control with SigV4 signing; only this distribution receives permission to read the bucket.
- HTTPS redirects, security headers, compression, and origin-controlled caching.
- A CloudWatch CloudFront 5xx alarm. Use `us-east-1` for the global CloudFront metric. Configure your notification destination in CloudWatch if alerts are wanted; no email subscription is created automatically.
- Retained storage on stack deletion, so removing infrastructure does not silently delete release archives.

The final JSON contains the CloudFront website URL. No custom domain is necessary for the first deployment.

### Optional custom domain

Request or select an ACM certificate **in us-east-1**, covering your hostname. Set these before deploying:

```bash
export CANOPY_DOMAIN=canopy.example.com
export CANOPY_CERTIFICATE_ARN=arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID
bash deploy/aws-cloudshell.sh
```

Create the corresponding DNS alias/CNAME to the distribution hostname. Certificate validation and DNS ownership require your AWS/domain account. If DNS is not ready, the publish smoke check may need to be rerun after propagation.

## 3. Build the downloadable apps

In GitHub Actions, run **Build downloadable apps** on `main`:

1. Set a new semantic version such as `v1.0.0`.
2. Leave **publish** off for an artifact-only rehearsal, or enable it to publish a GitHub release after every platform's checks pass.
3. Wait for Linux x64, macOS Apple silicon, and macOS Intel jobs to finish. Each job builds the app, includes its matching Node runtime and runtime dependencies, then extracts and starts the resulting archive and tests persistence after restart.

Published releases cannot overwrite an existing version or tag. Packages and manifests must come from the same clean commit. Native Windows packages and signed native installers are not supplied by this workflow.

For an artifact-only run, download each `canopy-...` artifact from Actions and extract its files into one `release-files/` directory in CloudShell. Each platform supplies its archive, `.sha256`, and `PLATFORM-manifest.json`.

If you published a GitHub release, CloudShell can download its public assets without GitHub credentials. Replace the version with the release you actually published:

```bash
export CANOPY_VERSION=v1.0.0
mkdir -p release-files
for canopy_platform in linux-x64 darwin-arm64 darwin-x64; do
  curl --fail --location "https://github.com/vishal88736/context-harness/releases/download/$CANOPY_VERSION/canopy-$canopy_platform.tar.gz" --output "release-files/canopy-$canopy_platform.tar.gz"
  curl --fail --location "https://github.com/vishal88736/context-harness/releases/download/$CANOPY_VERSION/$canopy_platform-manifest.json" --output "release-files/$canopy_platform-manifest.json"
done
```

## 4. Publish verified downloads

```bash
export CANOPY_STACK=canopy-site
export CANOPY_AWS_REGION=us-east-1
node scripts/publish-downloads.mjs release-files
```

The publisher checks manifest version/platform/commit, rejects dirty builds, computes every archive's SHA-256, verifies sizes, and refuses to replace a different package at an existing version. It uploads versioned objects and verifies their public HTTPS availability before updating `downloads/latest.json`. The website shows buttons only for valid, published artifacts. If you publish only one platform, the others remain unavailable.

Always preserve versioned packages and their manifests. Uploading a new website does not delete downloads or overwrite the current download manifest.

## 5. Update or roll back the website

Update from `main`, build, and publish:

```bash
git pull --ff-only origin main
npm ci
npm run build:site
node scripts/publish-site.mjs
```

Each website build is archived under `site-releases/FULL_COMMIT_SHA/`. Dependencies are copied before `index.html`, and older hashed assets are retained. To roll back, use a full commit SHA that was previously published:

```bash
node scripts/publish-site.mjs --rollback FULL_PREVIOUS_COMMIT_SHA
```

A site rollback preserves the current app download release. App release promotion is a separate operation.

## Optional GitHub-to-AWS publishing

The **Publish AWS website** workflow is manual and restricted to `main`. It uses short-lived GitHub OIDC credentials, an environment named `production`, and repository variables `AWS_ROLE_ARN`, `CANOPY_STACK`, and `AWS_REGION`. CloudShell remains sufficient for initial setup and ongoing publishing.

For this optional publisher role, restrict OIDC trust to audience `sts.amazonaws.com` and subject `repo:vishal88736/context-harness:environment:production`. Restrict the environment's deployment branches to `main` in GitHub settings.

The role needs `cloudformation:DescribeStacks` for this stack, `s3:ListBucket` on its bucket, `s3:GetObject`/`s3:PutObject` on its objects, and `cloudfront:CreateInvalidation` on this distribution. It does not need account-wide administrator access, IAM changes, or object deletion. Initial stack creation uses your CloudShell identity, not this publishing role.

## Validation scope

`tests/site.smoke.ts` checks the real static frontend, responsive downloads, invalid release URLs, and the absence of coding API bootstrap requests. Its sample release manifest is a UI fixture, not evidence of a published binary. Package smoke tests separately execute the real extracted app.

CI runs `cfn-lint` against the AWS template and separately builds/tests the optional private container. An actual CloudFormation deployment, certificate, and CDN download check are performed only when you run the CloudShell commands in your AWS account. Live AI calls were skipped at the owner's request.

References: [CloudFront S3 origin access control](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html), [GitHub OIDC on AWS](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services).
