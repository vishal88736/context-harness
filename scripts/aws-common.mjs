import { execFileSync } from "node:child_process";
export function aws(args) {
  return execFileSync(
    "aws",
    [
      ...args,
      "--region",
      process.env.CANOPY_AWS_REGION ?? process.env.AWS_REGION ?? "us-east-1",
      "--output",
      "json",
    ],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
}
export function deployment() {
  const stack = process.env.CANOPY_STACK ?? "canopy-site";
  if (!/^[A-Za-z][A-Za-z0-9-]{0,127}$/.test(stack))
    throw new Error("Invalid CANOPY_STACK.");
  const result = JSON.parse(
    aws(["cloudformation", "describe-stacks", "--stack-name", stack]),
  );
  const outputs = Object.fromEntries(
    result.Stacks[0].Outputs.map((o) => [o.OutputKey, o.OutputValue]),
  );
  if (
    !/^[a-z0-9.-]+$/.test(outputs.BucketName) ||
    !/^[A-Z0-9]+$/.test(outputs.DistributionId) ||
    !outputs.WebsiteUrl?.startsWith("https://")
  )
    throw new Error("Unexpected stack outputs. Publish refused.");
  return outputs;
}
export function exists(bucket, key) {
  try {
    return JSON.parse(
      aws(["s3api", "head-object", "--bucket", bucket, "--key", key]),
    );
  } catch (error) {
    if (/404|NotFound/.test(String(error.stderr))) return null;
    throw error;
  }
}
