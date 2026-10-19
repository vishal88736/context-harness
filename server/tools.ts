import { z } from "zod";
import { spawn } from "node:child_process";
import { open, rename, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { createTwoFilesPatch } from "diff";
import { Store, id, now } from "./store";
import {
  authorizedPath,
  checkedPath,
  digest,
  HttpError,
  readText,
  redact,
  isWithin,
} from "./security";
import { searchRepository } from "./retrieval";
import type { Providers } from "./providers";
import type {
  ToolExecution,
  WireMessage,
  Workspace,
  Conversation,
} from "./schema";

const argsSchemas = {
  read_file: z.object({ path: z.string().min(1).max(4096) }).strict(),
  search_repository: z.object({ query: z.string().min(2).max(300) }).strict(),
  propose_write: z
    .object({
      path: z.string().min(1).max(4096),
      content: z.string().max(250_000),
      reason: z.string().min(1).max(1000),
    })
    .strict(),
  run_command: z
    .object({
      command: z.string().min(1).max(10_000),
      reason: z.string().min(1).max(1000),
    })
    .strict(),
};
type ToolName = keyof typeof argsSchemas;
type Pending = {
  resolve: (approved: boolean) => void;
  controller: AbortSignal;
};
export class ToolRunner {
  private pending = new Map<string, Pending>();
  constructor(
    private store: Store,
    private dataDir: string,
    private providers: Providers,
  ) {}
  private clean(s: string) {
    return redact(s, this.providers.secrets());
  }
  private checkPermission(c: Conversation, name: ToolName) {
    const p = c.config.permissions;
    if (
      (name === "read_file" && p.read !== "allow") ||
      (name === "search_repository" && p.search !== "allow") ||
      (name === "propose_write" && p.write !== "ask") ||
      (name === "run_command" && p.terminal !== "ask")
    )
      throw new HttpError(
        403,
        `Tool ${name} is denied by this conversation’s permissions.`,
      );
  }
  private async checked(
    c: Conversation,
    w: Workspace,
    name: ToolName,
    args: Record<string, unknown>,
  ) {
    this.checkPermission(c, name);
    if (name === "read_file" || name === "propose_write")
      return authorizedPath(
        w,
        c,
        String(args.path),
        this.dataDir,
        name === "propose_write",
      );
    return null;
  }
  async execute(
    conversationId: string,
    invocationId: string,
    name: string,
    rawArgs: string,
    signal: AbortSignal,
    emit: (e: ToolExecution) => void,
  ): Promise<string> {
    let e: ToolExecution = {
      id: id(),
      conversationId,
      invocationId,
      name,
      args: {},
      status: "running",
      result: null,
      diff: null,
      createdAt: now(),
      decidedAt: null,
      revision: this.store.conversation(conversationId).revision,
      fileHash: null,
    };
    try {
      if (!(name in argsSchemas))
        throw new HttpError(403, `Unknown tool: ${name}`);
      const tool = name as ToolName;
      const args = argsSchemas[tool].parse(JSON.parse(rawArgs)) as Record<
        string,
        unknown
      >;
      // Secrets are never persisted in tool arguments or sent as file content.
      for (const key of Object.keys(args))
        if (typeof args[key] === "string")
          args[key] = this.clean(String(args[key]));
      e.args = args;
      const c = this.store.conversation(conversationId);
      const workspace = this.store.workspace(c.workspaceId);
      const target = await this.checked(c, workspace, tool, args);
      signal.throwIfAborted();
      if (tool === "propose_write") {
        let old = "";
        try {
          old = await readText(target!);
          e.fileHash = digest(old);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          e.fileHash = "missing";
        }
        e.diff = this.clean(
          createTwoFilesPatch(
            String(args.path),
            String(args.path),
            old,
            String(args.content),
            "current",
            "proposed",
          ),
        );
      }
      if (tool === "propose_write" || tool === "run_command")
        e.status = "pending";
      this.store.saveExecution(e);
      emit(e);
      if (e.status === "pending") {
        const approved = await this.waitApproval(e, signal);
        if (!approved) {
          e.status = "denied";
          e.result = "Human approval denied, expired, or generation stopped.";
          this.store.updateExecution(e.id, e.status, e.result);
          emit(e);
          return e.result;
        }
        const current = this.store.conversation(conversationId);
        if (current.revision !== e.revision)
          throw new HttpError(
            409,
            "Context changed after this tool was proposed. Request a new approval.",
          );
        await this.checked(current, workspace, tool, args);
        signal.throwIfAborted();
        e.status = "running";
        this.store.updateExecution(e.id, e.status, null);
        emit(e);
      }
      let result: string;
      if (tool === "read_file") {
        const text = this.clean(await readText(target!));
        result = `${args.path}\n${text.slice(0, 10_000)}${text.length > 10_000 ? "\n[File explicitly truncated at 10,000 characters.]" : ""}`;
      } else if (tool === "search_repository") {
        const roots = c.config.sources
          .filter(
            (s) =>
              s.enabled &&
              s.path &&
              ["file", "folder", "project"].includes(s.type),
          )
          .map((s) => s.path!);
        const blocked = c.config.sources
          .filter((s) => !s.enabled && s.path)
          .map((s) => ({
            path: path.resolve(workspace.root, s.path!),
            folder: s.type === "folder",
          }));
        const hits = (
          await searchRepository(
            workspace,
            roots,
            String(args.query),
            this.dataDir,
            10,
            signal,
          )
        ).filter(
          (h) =>
            !blocked.some((b) =>
              b.folder
                ? isWithin(b.path, path.resolve(workspace.root, h.path))
                : b.path === path.resolve(workspace.root, h.path),
            ),
        );
        result = this.clean(JSON.stringify(hits)).slice(0, 12_000);
      } else if (tool === "propose_write") {
        const checked = await authorizedPath(
          workspace,
          this.store.conversation(conversationId),
          String(args.path),
          this.dataDir,
          true,
        );
        let currentHash = "missing";
        try {
          currentHash = digest(await readText(checked));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (currentHash !== e.fileHash)
          throw new HttpError(
            409,
            "The file changed after the diff was proposed. Request a fresh diff.",
          );
        const temporary = path.join(
          path.dirname(checked),
          `.canopy-${id()}.tmp`,
        );
        const mode = await stat(checked)
          .then((s) => s.mode & 0o777)
          .catch(() => 0o644);
        const handle = await open(temporary, "wx", mode);
        try {
          await handle.writeFile(String(args.content));
          await handle.sync();
        } finally {
          await handle.close();
        }
        try {
          const again = await checkedPath(workspace, String(args.path), {
            dataDir: this.dataDir,
            allowMissing: true,
          });
          if (again !== checked)
            throw new Error("File target changed before write.");
          signal.throwIfAborted();
          await rename(temporary, checked);
        } finally {
          await unlink(temporary).catch(() => {});
        }
        result = `Applied approved diff to ${args.path}. SHA-256: ${digest(String(args.content))}`;
      } else
        result = await this.command(
          String(args.command),
          workspace.root,
          signal,
        );
      e.status = "complete";
      e.result = result;
      this.store.updateExecution(e.id, e.status, result);
      emit(e);
      return result;
    } catch (error) {
      e.status = "error";
      e.result = this.clean((error as Error).message);
      try {
        this.store.execution(e.id);
        this.store.updateExecution(e.id, e.status, e.result);
      } catch {
        this.store.saveExecution(e);
      }
      emit(e);
      return `Tool error: ${e.result}`;
    }
  }
  private waitApproval(
    e: ToolExecution,
    signal: AbortSignal,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const settle = (approved: boolean) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        this.pending.delete(e.id);
        resolve(approved);
      };
      const abort = () => settle(false);
      timer = setTimeout(() => settle(false), 5 * 60_000);
      this.pending.set(e.id, { resolve: settle, controller: signal });
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) settle(false);
    });
  }
  decide(executionId: string, approve: boolean) {
    const pending = this.pending.get(executionId);
    const execution = this.store.execution(executionId);
    if (
      !pending ||
      execution.status !== "pending" ||
      pending.controller.aborted
    )
      throw new HttpError(
        409,
        "This approval has expired or was already decided.",
      );
    const current = this.store.conversation(execution.conversationId);
    if (approve && current.revision !== execution.revision)
      throw new HttpError(409, "Context changed. Request a fresh tool action.");
    this.checkPermission(current, execution.name as ToolName);
    this.store.recordApproval(executionId, approve ? "approve" : "deny");
    pending.resolve(approve);
    return { ok: true };
  }
  private command(
    command: string,
    cwd: string,
    signal: AbortSignal,
  ): Promise<string> {
    return new Promise((resolve) => {
      const child = spawn(
        "/bin/bash",
        ["--noprofile", "--norc", "-c", command],
        {
          cwd,
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            LANG: "C.UTF-8",
            TERM: "dumb",
            CANOPY_TOOL: "1",
          },
          detached: process.platform !== "win32",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let out = "";
      let truncated = false;
      let timedOut = false;
      const append = (chunk: Buffer) => {
        if (out.length < 50_000) out += chunk.toString();
        else truncated = true;
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      const kill = () => {
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      };
      const timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, 60_000);
      signal.addEventListener("abort", kill, { once: true });
      if (signal.aborted) kill();
      child.on("error", (error) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", kill);
        resolve(`Command error: ${this.clean(error.message)}`);
      });
      child.on("close", (code, termSignal) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", kill);
        resolve(
          this.clean(
            `Exit: ${code ?? termSignal}${timedOut ? " (60-second timeout)" : ""}\n${out}${truncated ? "\n[Output truncated at 50 KB]" : ""}`,
          ),
        );
      });
    });
  }
}
