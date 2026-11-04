#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_REGION="${CANOPY_AWS_REGION:-us-east-1}"
export AWS_DEFAULT_REGION="$AWS_REGION"
export CANOPY_STACK="${CANOPY_STACK:-canopy-site}"
command -v aws >/dev/null || { echo 'AWS CLI is required. Run this in AWS CloudShell.' >&2; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || { echo 'Use Node.js 24, then npm ci and npm run build:site.' >&2; exit 1; }
test -f dist-site/index.html || { echo 'Run npm ci and npm run build:site first.' >&2; exit 1; }
if [[ -n "${CANOPY_DOMAIN:-}" && -z "${CANOPY_CERTIFICATE_ARN:-}" ]]; then echo 'A custom hostname needs its ACM certificate ARN in us-east-1.' >&2; exit 1; fi
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json
aws cloudformation validate-template --template-body file://deploy/aws-site.yml >/dev/null
aws cloudformation deploy --stack-name "$CANOPY_STACK" --template-file deploy/aws-site.yml \
  --parameter-overrides "DomainName=${CANOPY_DOMAIN:-}" "CertificateArn=${CANOPY_CERTIFICATE_ARN:-}" \
  --tags Project=Canopy --no-fail-on-empty-changeset
node scripts/publish-site.mjs
