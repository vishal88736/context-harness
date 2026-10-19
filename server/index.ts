import path from "node:path";
import { existsSync } from "node:fs";
import { createApp } from "./app";

const root = path.resolve(process.env.CANOPY_WORKSPACE ?? process.cwd());
const dataDir = path.resolve(
  process.env.CANOPY_DATA_DIR ?? path.join(root, "context-harness-data"),
);
const port = Number(process.env.PORT ?? 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("PORT must be an integer between 1024 and 65535.");
const staticDir = path.resolve("dist");
const service = await createApp({
  root,
  dataDir,
  ...(existsSync(path.join(staticDir, "index.html")) ? { staticDir } : {}),
});
const server = service.app.listen(port, "127.0.0.1", () =>
  console.log(
    `\nCanopy is ready at http://127.0.0.1:${port}\nWorkspace: ${root}\nData: ${dataDir}\n`,
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
    service.store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
