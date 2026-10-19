import express from "express";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { realpath, stat, readdir } from "node:fs/promises";
import { z, ZodError } from "zod";
import { Store, id, now } from "./store";
import {
  Vault,
  HttpError,
  checkedPath,
  isSensitive,
  isWithin,
  redact,
  safeEqual,
  readText,
} from "./security";
import {
  configSchema,
  providerSchema,
  requestSchema,
  type ContextConfig,
  type Source,
} from "./schema";
import { Providers, validateProviderUrl } from "./providers";
import { ContextEngine } from "./context";
import { ToolRunner } from "./tools";
import { Agent, publicSnapshot } from "./agent";

export async function createApp(options: {
  dataDir: string;
  root: string;
  staticDir?: string;
  dbFile?: string;
  frontendPort?: number;
}) {
  const root = await realpath(options.root);
  const dataDir = path.resolve(options.dataDir);
  const vault = await Vault.create(dataDir);
  const store = new Store(
    options.dbFile ?? path.join(dataDir, "canopy.sqlite"),
    root,
  );
  const providers = new Providers(store, vault);
  const engine = new ContextEngine(store, providers, dataDir);
  const tools = new ToolRunner(store, dataDir, providers);
  const agent = new Agent(store, engine, providers, tools);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  const csrf = randomBytes(32).toString("hex");
  const session = randomBytes(32).toString("hex");
  app.use((req, res, next) => {
    const host = (req.hostname || "").toLowerCase();
    if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host))
      return res
        .status(403)
        .json({ error: "Canopy accepts loopback hosts only." });
    const origin = req.get("Origin");
    if (origin) {
      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        return res.status(403).json({ error: "Invalid origin" });
      }
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        ![
          String(options.frontendPort ?? 5173),
          String(req.socket.localPort),
        ].includes(url.port)
      )
        return res.status(403).json({ error: "Cross-origin access denied." });
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    if (req.path.startsWith("/api")) {
      res.setHeader("Cache-Control", "no-store");
      const cookies = req.get("Cookie") ?? "";
      const cookie =
        cookies
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("canopy-session="))
          ?.slice("canopy-session=".length) ?? "";
      if (
        req.path !== "/api/bootstrap" &&
        req.path !== "/api/health" &&
        !safeEqual(cookie, session)
      )
        return res
          .status(401)
          .json({ error: "Session expired. Reload the application." });
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        !safeEqual(req.get("X-Canopy-CSRF") ?? "", csrf)
      )
        return res
          .status(403)
          .json({ error: "Invalid request token. Reload the application." });
    }
    next();
  });
  app.use(express.json({ limit: "16mb" }));
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, app: "canopy", schema: 1 }),
  );
  app.get("/api/bootstrap", (_req, res) => {
    res.cookie("canopy-session", session, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    res.json({
      csrf,
      workspaces: store.workspaces(),
      conversations: store.conversations(),
      profiles: store.profiles(),
      providers: store.providers(),
      memories: store.memories(),
      settings: {
        defaultModel: store.setting("defaultModel", null),
        theme: store.setting("theme", "dark"),
      },
    });
  });
  app.post("/api/workspaces", async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(1).max(100),
        root: z.string().min(1).max(4096),
        instructions: z.string().max(30_000).default(""),
      })
      .parse(req.body);
    const canonical = await realpath(input.root);
    if (!(await stat(canonical)).isDirectory())
      throw new HttpError(400, "Workspace root must be a folder.");
    if (
      canonical === path.parse(canonical).root ||
      canonical === process.env.HOME
    )
      throw new HttpError(
        400,
        "Choose a project folder rather than your home folder or filesystem root.",
      );
    res.status(201).json(store.createWorkspace({ ...input, root: canonical }));
  });
  app.patch("/api/workspaces/:id", (req, res) => {
    const w = store.workspace(req.params.id);
    const changes = z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        instructions: z.string().max(30_000).optional(),
      })
      .parse(req.body);
    for (const c of store.conversations(w.id)) agent.stop(c.id);
    res.json(store.updateWorkspace({ ...w, ...changes }));
  });
  app.get("/api/workspaces/:id/files", async (req, res) => {
    const w = store.workspace(req.params.id);
    const target = await checkedPath(w, String(req.query.path ?? "."), {
      dataDir,
    });
    const entries = await readdir(target, { withFileTypes: true });
    res.json({
      path: path.relative(w.root, target) || ".",
      entries: entries
        .filter(
          (e) =>
            !e.isSymbolicLink() &&
            !isSensitive(path.relative(w.root, path.join(target, e.name))) &&
            !isWithin(dataDir, path.join(target, e.name)),
        )
        .map((e) => ({
          name: e.name,
          path: path.relative(w.root, path.join(target, e.name)),
          directory: e.isDirectory(),
        }))
        .sort(
          (a, b) =>
            Number(b.directory) - Number(a.directory) ||
            a.name.localeCompare(b.name),
        )
        .slice(0, 500),
    });
  });
  app.get("/api/workspaces/:id/file", async (req, res) => {
    const w = store.workspace(req.params.id);
    res.json({
      content: redact(
        await readText(
          await checkedPath(w, String(req.query.path ?? ""), { dataDir }),
        ),
        providers.secrets(),
      ),
    });
  });
  app.post("/api/conversations", (req, res) => {
    const input = z.object({ workspaceId: z.string() }).parse(req.body);
    res.status(201).json(store.createConversation(input.workspaceId));
  });
  app.get("/api/conversations/:id", (req, res) =>
    res.json({
      conversation: store.conversation(req.params.id),
      messages: store.messages(req.params.id),
      executions: store.executions(req.params.id),
      invocations: store.invocations(req.params.id),
      running: agent.isRunning(req.params.id),
    }),
  );
  app.patch("/api/conversations/:id", (req, res) => {
    const input = z
      .object({
        title: z.string().trim().min(1).max(160).optional(),
        pinned: z.boolean().optional(),
        providerId: z.string().nullable().optional(),
        modelId: z.string().nullable().optional(),
        config: configSchema.optional(),
        revision: z.number().int().optional(),
      })
      .parse(req.body);
    if (input.config) agent.stop(req.params.id);
    const { revision, ...changes } = input;
    if (changes.config)
      changes.config.sources = changes.config.sources.map((s) => ({
        ...s,
        id: s.id ?? id(),
        createdAt: s.createdAt ?? now(),
      }));
    res.json(
      store.updateConversation(
        req.params.id,
        changes as Partial<ReturnType<Store["conversation"]>>,
        revision,
      ),
    );
  });
  app.delete("/api/conversations/:id", (req, res) => {
    if (agent.isRunning(req.params.id))
      throw new HttpError(
        409,
        "Stop generation before deleting this conversation.",
      );
    store.deleteConversation(req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/conversations/:id/preview", async (req, res) =>
    res.json(
      publicSnapshot(
        await engine.compose(req.params.id, requestSchema.parse(req.body)),
      ),
    ),
  );
  app.post("/api/conversations/:id/send", async (req, res) => {
    const input = requestSchema.parse(req.body);
    store.conversation(req.params.id);
    if (agent.isRunning(req.params.id))
      throw new HttpError(409, "A response is already running.");
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
    const close = () => {
      if (!res.writableEnded) agent.stop(req.params.id);
    };
    res.on("close", close);
    try {
      await agent.run(req.params.id, input, (event) => {
        if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
      });
    } catch (e) {
      if (!res.destroyed)
        res.write(
          `data: ${JSON.stringify({ type: "error", message: redact((e as Error).message, providers.secrets()) })}\n\n`,
        );
    } finally {
      clearInterval(heartbeat);
      res.removeListener("close", close);
      res.end();
    }
  });
  app.post("/api/conversations/:id/stop", (req, res) => {
    agent.stop(req.params.id);
    res.json({ ok: true });
  });
  app.get("/api/invocations/:id", (req, res) => {
    const invocation = store.invocation(req.params.id);
    res.json({ ...invocation, snapshot: publicSnapshot(invocation.snapshot) });
  });
  app.post("/api/executions/:id/decision", (req, res) => {
    const { approve } = z
      .object({ approve: z.boolean() })
      .strict()
      .parse(req.body);
    res.json(tools.decide(req.params.id, approve));
  });
  app.post("/api/profiles", (req, res) => {
    const p = z
      .object({
        name: z.string().trim().min(1).max(100),
        description: z.string().max(300).default(""),
        config: configSchema,
      })
      .parse(req.body);
    const config = {
      ...p.config,
      sources: p.config.sources.map((s) => ({
        ...s,
        id: s.id ?? id(),
        createdAt: s.createdAt ?? now(),
      })),
    } as ContextConfig;
    res.status(201).json(store.saveProfile({ ...p, config }));
  });
  app.put("/api/profiles/:id", (req, res) => {
    const p = store.profiles().find((p) => p.id === req.params.id);
    if (!p) throw new HttpError(404, "Profile not found");
    const changes = z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        description: z.string().max(300).optional(),
        config: configSchema.optional(),
      })
      .parse(req.body);
    const config = changes.config
      ? ({
          ...changes.config,
          sources: changes.config.sources.map((s) => ({
            ...s,
            id: s.id ?? id(),
            createdAt: s.createdAt ?? now(),
          })),
        } as ContextConfig)
      : p.config;
    res.json(store.saveProfile({ ...p, ...changes, config }));
  });
  app.delete("/api/profiles/:id", (req, res) => {
    store.deleteProfile(req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/conversations/:id/apply-profile", (req, res) => {
    const input = z
      .object({
        profileId: z.string(),
        mode: z.enum(["merge", "replace"]).default("merge"),
      })
      .parse(req.body);
    const c = store.conversation(req.params.id);
    const p = store.profiles().find((p) => p.id === input.profileId);
    if (!p) throw new HttpError(404, "Profile not found");
    const old = store.profiles().find((p) => p.id === c.config.profileId);
    const oldIds = new Set(old?.config.sources.map((s) => s.id) ?? []);
    const additions =
      input.mode === "merge"
        ? c.config.sources.filter((s) => !oldIds.has(s.id))
        : [];
    const sources = [
      ...structuredClone(p.config.sources),
      ...additions.filter(
        (s) => !p.config.sources.some((ps) => ps.id === s.id),
      ),
    ];
    agent.stop(c.id);
    res.json(
      store.updateConversation(c.id, {
        config: {
          sources,
          permissions: { ...p.config.permissions },
          profileId: p.id,
        },
      }),
    );
  });
  app.post("/api/memories", (req, res) => {
    const { name, content } = z
      .object({
        name: z.string().trim().min(1).max(160),
        content: z.string().trim().min(1).max(100_000),
      })
      .parse(req.body);
    res
      .status(201)
      .json(store.saveMemory(name, redact(content, providers.secrets())));
  });
  app.delete("/api/memories/:id", (req, res) => {
    store.deleteMemory(req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/providers", (req, res) => {
    const input = providerSchema.parse(req.body);
    const providerId = id();
    res.status(201).json(
      store.saveProvider(
        {
          ...input,
          id: providerId,
          baseUrl: validateProviderUrl(input.baseUrl),
          keyConfigured: !!input.apiKey,
          apiKey: undefined,
        },
        vault.encrypt(input.apiKey ?? ""),
      ),
    );
  });
  app.put("/api/providers/:id", (req, res) => {
    const old = store.providers().find((p) => p.id === req.params.id);
    if (!old) throw new HttpError(404, "Provider not found");
    const input = providerSchema.parse(req.body);
    res.json(
      store.saveProvider(
        {
          ...input,
          id: old.id,
          baseUrl: validateProviderUrl(input.baseUrl),
          keyConfigured:
            input.apiKey === undefined ? old.keyConfigured : !!input.apiKey,
          apiKey: undefined,
        },
        input.apiKey === undefined ? undefined : vault.encrypt(input.apiKey),
      ),
    );
  });
  app.post("/api/providers/:id/discover", async (req, res) =>
    res.json({ models: await providers.discover(req.params.id) }),
  );
  app.delete("/api/providers/:id", (req, res) => {
    store.deleteProvider(req.params.id);
    res.json({ ok: true });
  });
  app.put("/api/settings", (req, res) => {
    const input = z
      .object({
        defaultModel: z
          .object({ providerId: z.string(), modelId: z.string() })
          .nullable()
          .optional(),
        theme: z.enum(["dark", "light", "system"]).optional(),
      })
      .parse(req.body);
    if (input.defaultModel) {
      const p = store
        .providers()
        .find((p) => p.id === input.defaultModel!.providerId);
      if (!p?.models.some((m) => m.id === input.defaultModel!.modelId))
        throw new HttpError(
          400,
          "Select a discovered or explicitly configured model.",
        );
    }
    for (const [key, value] of Object.entries(input))
      store.setSetting(key, value);
    res.json({ ok: true });
  });
  app.post("/api/attachments", async (req, res) => {
    const { name, data } = z
      .object({
        name: z.string().min(1).max(160),
        data: z.string().max(6_000_000),
      })
      .parse(req.body);
    const match = /^data:([^;,]*)(?:;base64),([A-Za-z0-9+/=]+)$/.exec(data);
    if (!match) throw new HttpError(400, "Attachment must be base64 encoded.");
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 4_000_000)
      throw new HttpError(413, "Attachments are limited to 4 MB.");
    const ext = path.extname(name).toLowerCase();
    let content = "";
    let mime = match[1] || "text/plain";
    if (["image/png", "image/jpeg", "image/webp"].includes(mime)) {
      const isImage =
        (mime === "image/png" &&
          buffer
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
        (mime === "image/jpeg" && buffer[0] === 255 && buffer[1] === 216) ||
        (mime === "image/webp" &&
          buffer.subarray(0, 4).toString() === "RIFF" &&
          buffer.subarray(8, 12).toString() === "WEBP");
      if (!isImage)
        throw new HttpError(400, "Image contents do not match its type.");
      content = data;
    } else if (ext === ".pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        content = (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
      mime = "text/plain";
    } else if (ext === ".docx") {
      const mammoth = await import("mammoth");
      content = (await mammoth.extractRawText({ buffer })).value;
      mime = "text/plain";
    } else {
      if (buffer.includes(0))
        throw new HttpError(
          400,
          "Unsupported binary attachment. Use text, PDF, DOCX, PNG, JPEG, or WebP.",
        );
      content = redact(buffer.toString("utf8"), providers.secrets());
      mime = "text/plain";
    }
    if (content.length > 500_000 && !mime.startsWith("image/"))
      throw new HttpError(
        413,
        "Extracted document exceeds 500,000 characters. Attach an excerpt.",
      );
    res.json({
      id: id(),
      type: "attachment",
      name,
      content,
      mime,
      enabled: true,
      createdAt: now(),
    } satisfies Source);
  });
  if (options.staticDir) {
    app.use((req, res, next) => {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
      next();
    });
    app.use(express.static(options.staticDir));
    app.get("/{*path}", (req, res, next) =>
      req.path.startsWith("/api/")
        ? next()
        : res.sendFile(path.join(options.staticDir!, "index.html")),
    );
  }
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const error = err as Error & { status?: number };
      const status =
        error instanceof ZodError
          ? 400
          : (error.status ?? (error.message.includes("not found") ? 404 : 500));
      const message =
        error instanceof ZodError
          ? error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")
          : error.message;
      res.status(status).json({
        error: redact(
          message || "Unexpected server error",
          providers.secrets(),
        ),
      });
    },
  );
  return {
    app,
    store,
    engine,
    providers,
    tools,
    agent,
    close: () => {
      agent.stopAll();
      store.close();
    },
  };
}
