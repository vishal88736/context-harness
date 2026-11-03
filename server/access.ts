import {
  randomBytes,
  scrypt as derive,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import type { Express, Request, Response, RequestHandler } from "express";
import { safeEqual } from "./security";

export interface AccessOptions {
  mode?: "local" | "private";
  publicOrigin?: string;
  passwordHash?: string;
  trustedProxy?: boolean;
  logRequests?: boolean;
  sessionTtlMs?: number;
  loginLimit?: number;
}
const loopback = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const passwordPattern = /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/;
async function key(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    derive(
      password,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, result) => (error ? reject(error) : resolve(result)),
    ),
  );
}
export async function hashPassword(password: string) {
  if (password.length < 14 || password.length > 1024)
    throw new Error("Use a password between 14 and 1024 characters.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await key(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, hash: string) {
  if (!passwordPattern.test(hash) || password.length > 1024) return false;
  const [, salt, expected] = hash.split("$");
  return timingSafeEqual(
    await key(password, salt),
    Buffer.from(expected, "hex"),
  );
}
type Session = { csrf: string; expires: number };
type Bucket = { count: number; reset: number };

/** Each private instance has one owner; identities and storage never span instances. */
export class AccessController {
  readonly mode: "local" | "private";
  readonly origin?: URL;
  private cookieName: string;
  private localToken = randomBytes(32).toString("hex");
  private localCsrf = randomBytes(32).toString("hex");
  private sessions = new Map<string, Session>();
  private buckets = new Map<string, Bucket>();
  private loggingIn = 0;
  constructor(
    private options: AccessOptions = {},
    private frontendPort = 5173,
  ) {
    this.mode = options.mode ?? "local";
    this.cookieName =
      this.mode === "private" ? "__Host-canopy-session" : "canopy-session";
    if (this.mode === "private") {
      this.origin = new URL(options.publicOrigin ?? "invalid:");
      if (
        this.origin.protocol !== "https:" ||
        this.origin.username ||
        this.origin.password ||
        this.origin.pathname !== "/" ||
        this.origin.search ||
        this.origin.hash
      )
        throw new Error(
          "Private mode requires CANOPY_PUBLIC_ORIGIN with an HTTPS origin and no path.",
        );
      if (!passwordPattern.test(options.passwordHash ?? ""))
        throw new Error(
          "Private mode requires a valid owner password hash file. Run the password setup command.",
        );
    }
  }
  private token(req: Request) {
    return (
      (req.get("Cookie") ?? "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith(`${this.cookieName}=`))
        ?.slice(this.cookieName.length + 1) ?? ""
    );
  }
  private session(req: Request): Session | undefined {
    const token = this.token(req);
    const session = this.sessions.get(token);
    if (session && session.expires > Date.now()) return session;
    this.sessions.delete(token);
  }
  private limited(name: string, max: number, window: number) {
    const now = Date.now();
    let bucket = this.buckets.get(name);
    if (!bucket || bucket.reset <= now) {
      if (this.buckets.size >= 2048)
        this.buckets.delete(this.buckets.keys().next().value!);
      bucket = { count: 0, reset: now + window };
      this.buckets.set(name, bucket);
    }
    return ++bucket.count > max ? Math.ceil((bucket.reset - now) / 1000) : 0;
  }
  readonly middleware: RequestHandler = (req, res, next) => {
    const host = (req.headers.host ?? "").toLowerCase();
    const hostname = (req.hostname ?? "").toLowerCase();
    const probe =
      ["/api/health", "/api/ready"].includes(req.path) &&
      ["GET", "HEAD"].includes(req.method);
    if (
      this.mode === "local"
        ? !loopback.has(hostname)
        : host !== this.origin!.host && !(probe && loopback.has(hostname))
    )
      return void res
        .status(403)
        .json({ error: "Host is not allowed for this Canopy instance." });
    const origin = req.get("Origin");
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (this.mode === "private") {
      if (!probe && !req.secure)
        return void res.status(403).json({ error: "HTTPS is required." });
      if ((origin && origin !== this.origin!.origin) || (mutation && !origin))
        return void res
          .status(403)
          .json({ error: "Cross-origin access denied." });
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
    } else if (origin) {
      try {
        const url = new URL(origin);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          !loopback.has(url.hostname) ||
          ![String(this.frontendPort), String(req.socket.localPort)].includes(
            url.port,
          )
        )
          return void res
            .status(403)
            .json({ error: "Cross-origin access denied." });
      } catch {
        return void res.status(403).json({ error: "Invalid origin" });
      }
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    const requestId = randomUUID();
    res.setHeader("X-Request-ID", requestId);
    if (this.options.logRequests) {
      const start = performance.now();
      res.once("finish", () =>
        process.stdout.write(
          JSON.stringify({
            event: "http",
            requestId,
            method: req.method,
            route:
              req.route?.path ??
              (req.path.startsWith("/api/") ? "/api/unmatched" : "/static"),
            status: res.statusCode,
            durationMs: Math.round(performance.now() - start),
          }) + "\n",
        ),
      );
    }
    if (!req.path.startsWith("/api")) return next();
    res.setHeader("Cache-Control", "no-store");
    if (this.mode === "private" && !probe) {
      const retry = this.limited(`api:${req.ip}`, 600, 60_000);
      if (retry)
        return void res
          .set("Retry-After", String(retry))
          .status(429)
          .json({ error: "Too many requests. Try again shortly." });
    }
    if (probe || ["/api/auth/status", "/api/auth/login"].includes(req.path))
      return next();
    if (
      this.mode === "private"
        ? !this.session(req)
        : req.path !== "/api/bootstrap" &&
          !safeEqual(this.token(req), this.localToken)
    )
      return void res
        .status(401)
        .json({ error: "Sign in to your workspace.", code: "AUTH_REQUIRED" });
    if (mutation && !safeEqual(req.get("X-Canopy-CSRF") ?? "", this.csrf(req)))
      return void res
        .status(403)
        .json({ error: "Invalid request token. Reload the application." });
    next();
  };
  csrf(req: Request) {
    return this.mode === "local"
      ? this.localCsrf
      : (this.session(req)?.csrf ?? "");
  }
  bootstrap(req: Request, res: Response) {
    if (this.mode === "local")
      res.cookie(this.cookieName, this.localToken, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
      });
  }
  routes(app: Express, onLogout: () => void) {
    app.get("/api/auth/status", (req, res) =>
      res.json({
        mode: this.mode,
        authenticated: this.mode === "local" || !!this.session(req),
      }),
    );
    app.post("/api/auth/login", async (req, res) => {
      if (this.mode !== "private")
        return void res
          .status(400)
          .json({ error: "Local mode does not use a password." });
      const retry = this.limited(
        `login:${req.ip}`,
        this.options.loginLimit ?? 5,
        15 * 60_000,
      );
      if (retry)
        return void res
          .set("Retry-After", String(retry))
          .status(429)
          .json({ error: "Too many sign-in attempts. Try again later." });
      if (this.loggingIn >= 2)
        return void res
          .status(429)
          .json({ error: "Sign-in is busy. Try again shortly." });
      const password =
        typeof req.body?.password === "string" ? req.body.password : "";
      if (!password || password.length > 1024)
        return void res
          .status(400)
          .json({ error: "Enter your owner password." });
      this.loggingIn++;
      let valid: boolean;
      try {
        valid = await verifyPassword(password, this.options.passwordHash!);
      } finally {
        this.loggingIn--;
      }
      if (!valid)
        return void res
          .status(401)
          .json({ error: "The password is incorrect." });
      const now = Date.now();
      for (const [token, session] of this.sessions)
        if (session.expires <= now) this.sessions.delete(token);
      if (this.sessions.size >= 32)
        this.sessions.delete(this.sessions.keys().next().value!);
      this.sessions.delete(this.token(req));
      const token = randomBytes(32).toString("hex");
      const ttl = this.options.sessionTtlMs ?? 8 * 60 * 60_000;
      this.sessions.set(token, {
        csrf: randomBytes(32).toString("hex"),
        expires: now + ttl,
      });
      res.cookie(this.cookieName, token, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: ttl,
      });
      res.json({ ok: true });
    });
    app.post("/api/auth/logout", (req, res) => {
      this.sessions.delete(this.token(req));
      res.clearCookie(this.cookieName, {
        httpOnly: true,
        secure: this.mode === "private",
        sameSite: "strict",
        path: "/",
      });
      onLogout();
      res.json({ ok: true });
    });
  }
  close() {
    this.sessions.clear();
    this.buckets.clear();
  }
}
