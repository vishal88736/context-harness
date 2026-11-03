import path from "node:path";
import { existsSync } from "node:fs";
import { createApp } from "./app";
import { runtimeConfig } from "./runtime";

const config = await runtimeConfig();
const { root, dataDir, port, host } = config;
const staticDir = path.resolve("dist");
const service = await createApp({
  ...config,
  ...(existsSync(path.join(staticDir, "index.html")) ? { staticDir } : {}),
});
const server = service.app.listen(port, host, () =>
  console.log(
    config.access.mode === "private"
      ? JSON.stringify({
          event: "ready",
          mode: "private",
          origin: config.access.publicOrigin,
          port,
        })
      : `\nCanopy is ready at http://127.0.0.1:${port}\nWorkspace: ${root}\nData: ${dataDir}\n`,
  ),
);
server.on("error", (error) => {
  console.error(error.message);
  service.close();
  process.exitCode = 1;
});
const shutdown = () => {
  service.agent.stopAll();
  server.close(() => {
    service.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
