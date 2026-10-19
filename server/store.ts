import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  configSchema,
  defaultPermissions,
  type ContextConfig,
  type Conversation,
  type Message,
  type Profile,
  type Workspace,
  type Provider,
  type Snapshot,
  type ToolExecution,
} from "./schema";

export const id = () => randomUUID();
export const now = () => new Date().toISOString();
const json = (v: unknown) => JSON.stringify(v);
const decode = <T>(s: unknown): T => JSON.parse(String(s));

export class Store {
  db: DatabaseSync;
  constructor(
    public filename: string,
    root = process.cwd(),
  ) {
    if (filename !== ":memory:") {
      mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    }
    this.db = new DatabaseSync(filename);
    if (filename !== ":memory:") chmodSync(filename, 0o600);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    this.migrate();
    if (!this.workspaces().length)
      this.createWorkspace({
        name: path.basename(root),
        root,
        instructions: "",
      });
    if (!this.profiles().length) {
      for (const [name, description, content] of [
        [
          "Coding",
          "Build with intent. Read before you change.",
          "Read relevant authorized files before proposing changes. Keep changes focused, explain tradeoffs, and verify behavior.",
        ],
        [
          "Debugging",
          "Follow the evidence to the root cause.",
          "Investigate concrete evidence. Reproduce the failure, explain the root cause, then make the smallest reliable fix.",
        ],
        [
          "Research",
          "Explore, compare, and cite your sources.",
          "Separate facts from assumptions. Cite source paths and lines. Compare alternatives and explicitly identify missing evidence.",
        ],
        [
          "Code Review",
          "A second pair of eyes, grounded in code.",
          "Review correctness, security, edge cases, and maintainability. Prioritize actionable findings with file references. Do not edit files.",
        ],
        [
          "Custom",
          "A clean slate for your own workflow.",
          "Be precise, candid, and helpful. Ask when essential details are missing.",
        ],
      ])
        this.saveProfile({
          name,
          description,
          config: {
            sources: [
              {
                id: id(),
                type: "instruction",
                name: `${name} guidance`,
                content,
                enabled: true,
                createdAt: now(),
              },
            ],
            permissions: {
              ...defaultPermissions,
              ...(name === "Research" || name === "Code Review"
                ? { write: "deny" as const }
                : {}),
            },
            profileId: null,
          },
        });
    }
    // An interrupted process never silently resumes model or tool execution.
    this.db.exec(
      "UPDATE messages SET status='stopped', error='Application restarted during generation.' WHERE status='streaming'; UPDATE executions SET status='denied', result='Application restarted; request a new approval.' WHERE status IN ('pending','running'); UPDATE invocations SET status='stopped' WHERE status='running';",
    );
  }
  migrate() {
    const version = Number(
      (this.db.prepare("PRAGMA user_version").get() as Record<string, unknown>)
        .user_version,
    );
    if (version > 1)
      throw new Error("Database schema is newer than this application.");
    if (version === 1) return;
    this.db.exec(`BEGIN;
      CREATE TABLE workspaces(id TEXT PRIMARY KEY, name TEXT NOT NULL, root TEXT NOT NULL, instructions TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE conversations(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, config TEXT NOT NULL, provider_id TEXT, model_id TEXT, revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE messages(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, status TEXT NOT NULL, invocation_id TEXT, error TEXT, created_at TEXT NOT NULL);
      CREATE INDEX messages_conversation ON messages(conversation_id,created_at);
      CREATE TABLE profiles(id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, config TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE providers(id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, base_url TEXT NOT NULL, models TEXT NOT NULL, key_cipher TEXT);
      CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE memories(id TEXT PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE invocations(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, snapshot TEXT NOT NULL, status TEXT NOT NULL, usage TEXT, created_at TEXT NOT NULL);
      CREATE INDEX invocations_conversation ON invocations(conversation_id,created_at);
      CREATE TABLE executions(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, invocation_id TEXT NOT NULL REFERENCES invocations(id) ON DELETE CASCADE, name TEXT NOT NULL, args TEXT NOT NULL, status TEXT NOT NULL, result TEXT, diff TEXT, created_at TEXT NOT NULL, decided_at TEXT, revision INTEGER NOT NULL, file_hash TEXT);
      CREATE TABLE approvals(id TEXT PRIMARY KEY, execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE, decision TEXT NOT NULL, created_at TEXT NOT NULL);
      PRAGMA user_version=1; COMMIT;`);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  workspaces(): Workspace[] {
    return this.db
      .prepare(
        "SELECT id,name,root,instructions,created_at AS createdAt FROM workspaces ORDER BY created_at",
      )
      .all() as unknown as Workspace[];
  }
  workspace(workspaceId: string) {
    const w = this.workspaces().find((w) => w.id === workspaceId);
    if (!w) throw new Error("Workspace not found");
    return w;
  }
  createWorkspace(input: { name: string; root: string; instructions: string }) {
    const w = { id: id(), ...input, createdAt: now() };
    this.db
      .prepare("INSERT INTO workspaces VALUES(?,?,?,?,?)")
      .run(w.id, w.name, w.root, w.instructions, w.createdAt);
    return w;
  }
  updateWorkspace(w: Workspace) {
    this.db
      .prepare("UPDATE workspaces SET name=?,instructions=? WHERE id=?")
      .run(w.name, w.instructions, w.id);
    this.db
      .prepare(
        "UPDATE conversations SET revision=revision+1 WHERE workspace_id=?",
      )
      .run(w.id);
    return w;
  }
  conversations(workspaceId?: string): Conversation[] {
    const rows = workspaceId
      ? this.db
          .prepare(
            "SELECT * FROM conversations WHERE workspace_id=? ORDER BY pinned DESC,updated_at DESC",
          )
          .all(workspaceId)
      : this.db
          .prepare(
            "SELECT * FROM conversations ORDER BY pinned DESC,updated_at DESC",
          )
          .all();
    return rows.map((r) => this.conversationRow(r));
  }
  private conversationRow(r: Record<string, unknown>): Conversation {
    return {
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      title: String(r.title),
      pinned: Boolean(r.pinned),
      config: decode(r.config),
      providerId: r.provider_id as string | null,
      modelId: r.model_id as string | null,
      revision: Number(r.revision),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }
  conversation(conversationId: string) {
    const r = this.db
      .prepare("SELECT * FROM conversations WHERE id=?")
      .get(conversationId);
    if (!r) throw new Error("Conversation not found");
    return this.conversationRow(r);
  }
  createConversation(workspaceId: string) {
    this.workspace(workspaceId);
    const c: Conversation = {
      id: id(),
      workspaceId,
      title: "New conversation",
      pinned: false,
      config: {
        sources: [],
        permissions: { ...defaultPermissions },
        profileId: null,
      },
      providerId: null,
      modelId: null,
      revision: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    this.db
      .prepare("INSERT INTO conversations VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(
        c.id,
        c.workspaceId,
        c.title,
        0,
        json(c.config),
        null,
        null,
        0,
        c.createdAt,
        c.updatedAt,
      );
    return c;
  }
  updateConversation(
    conversationId: string,
    changes: Partial<
      Pick<
        Conversation,
        "title" | "pinned" | "config" | "providerId" | "modelId"
      >
    >,
    expectedRevision?: number,
  ) {
    const c = this.conversation(conversationId);
    if (expectedRevision !== undefined && c.revision !== expectedRevision)
      throw new Error(
        "Context changed in another window. Reload and try again.",
      );
    const revision = c.revision + (changes.config ? 1 : 0);
    const next = { ...c, ...changes, revision, updatedAt: now() };
    if (changes.config) configSchema.parse(changes.config);
    this.db
      .prepare(
        "UPDATE conversations SET title=?,pinned=?,config=?,provider_id=?,model_id=?,revision=?,updated_at=? WHERE id=?",
      )
      .run(
        next.title,
        Number(next.pinned),
        json(next.config),
        next.providerId,
        next.modelId,
        revision,
        next.updatedAt,
        conversationId,
      );
    return next;
  }
  deleteConversation(conversationId: string) {
    this.db.prepare("DELETE FROM conversations WHERE id=?").run(conversationId);
  }
  messages(conversationId: string): Message[] {
    return this.db
      .prepare(
        "SELECT id,conversation_id AS conversationId,role,content,status,invocation_id AS invocationId,error,created_at AS createdAt FROM messages WHERE conversation_id=? ORDER BY rowid",
      )
      .all(conversationId) as unknown as Message[];
  }
  addMessage(
    conversationId: string,
    role: Message["role"],
    content: string,
    invocationId: string | null = null,
    status: Message["status"] = "complete",
  ): Message {
    const m: Message = {
      id: id(),
      conversationId,
      role,
      content,
      invocationId,
      status,
      error: null,
      createdAt: now(),
    };
    this.db
      .prepare("INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)")
      .run(
        m.id,
        conversationId,
        role,
        content,
        status,
        invocationId,
        null,
        m.createdAt,
      );
    this.db
      .prepare("UPDATE conversations SET updated_at=? WHERE id=?")
      .run(now(), conversationId);
    return m;
  }
  updateMessage(
    messageId: string,
    content: string,
    status: Message["status"],
    error: string | null = null,
  ) {
    this.db
      .prepare("UPDATE messages SET content=?,status=?,error=? WHERE id=?")
      .run(content, status, error, messageId);
  }
  profiles(): Profile[] {
    return this.db
      .prepare(
        "SELECT id,name,description,config,updated_at AS updatedAt FROM profiles ORDER BY rowid",
      )
      .all()
      .map((r) => ({ ...r, config: decode(r.config) })) as unknown as Profile[];
  }
  saveProfile(input: Omit<Profile, "id" | "updatedAt"> & { id?: string }) {
    const p: Profile = { ...input, id: input.id ?? id(), updatedAt: now() };
    configSchema.parse(p.config);
    this.db
      .prepare(
        "INSERT INTO profiles VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,config=excluded.config,updated_at=excluded.updated_at",
      )
      .run(p.id, p.name, p.description, json(p.config), p.updatedAt);
    return p;
  }
  deleteProfile(profileId: string) {
    this.db.prepare("DELETE FROM profiles WHERE id=?").run(profileId);
  }
  providers(): Provider[] {
    return this.db
      .prepare(
        "SELECT id,name,kind,base_url AS baseUrl,models,key_cipher FROM providers ORDER BY rowid",
      )
      .all()
      .map((r) => ({
        id: String(r.id),
        name: String(r.name),
        kind: r.kind,
        baseUrl: String(r.baseUrl),
        models: decode(r.models),
        keyConfigured: !!r.key_cipher,
      })) as unknown as Provider[];
  }
  saveProvider(p: Provider, cipher?: string) {
    const old = this.db
      .prepare("SELECT key_cipher FROM providers WHERE id=?")
      .get(p.id);
    this.db
      .prepare(
        "INSERT INTO providers VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,base_url=excluded.base_url,models=excluded.models,key_cipher=excluded.key_cipher",
      )
      .run(
        p.id,
        p.name,
        p.kind,
        p.baseUrl,
        json(p.models),
        cipher === undefined
          ? ((old?.key_cipher as string) ?? null)
          : cipher || null,
      );
    return this.providers().find((x) => x.id === p.id)!;
  }
  providerCipher(providerId: string): string | null {
    return (
      (this.db
        .prepare("SELECT key_cipher FROM providers WHERE id=?")
        .get(providerId)?.key_cipher as string) ?? null
    );
  }
  deleteProvider(providerId: string) {
    this.db.prepare("DELETE FROM providers WHERE id=?").run(providerId);
  }
  setting<T>(key: string, fallback: T): T {
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key=?")
      .get(key);
    return row ? decode<T>(row.value) : fallback;
  }
  setSetting(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, json(value));
  }
  memories() {
    return this.db
      .prepare(
        "SELECT id,name,content,created_at AS createdAt FROM memories ORDER BY created_at DESC",
      )
      .all() as unknown as {
      id: string;
      name: string;
      content: string;
      createdAt: string;
    }[];
  }
  saveMemory(name: string, content: string) {
    const m = { id: id(), name, content, createdAt: now() };
    this.db
      .prepare("INSERT INTO memories VALUES(?,?,?,?)")
      .run(m.id, name, content, m.createdAt);
    return m;
  }
  deleteMemory(memoryId: string) {
    this.db.prepare("DELETE FROM memories WHERE id=?").run(memoryId);
  }
  saveInvocation(snapshot: Snapshot) {
    this.db
      .prepare("INSERT INTO invocations VALUES(?,?,?,?,?,?)")
      .run(
        snapshot.id,
        snapshot.conversationId,
        json(snapshot),
        "running",
        null,
        snapshot.createdAt,
      );
  }
  finishInvocation(invocationId: string, status: string, usage?: unknown) {
    this.db
      .prepare("UPDATE invocations SET status=?,usage=? WHERE id=?")
      .run(status, usage ? json(usage) : null, invocationId);
  }
  invocation(invocationId: string) {
    const r = this.db
      .prepare("SELECT * FROM invocations WHERE id=?")
      .get(invocationId);
    if (!r) throw new Error("Invocation not found");
    return {
      snapshot: decode<Snapshot>(r.snapshot),
      status: String(r.status),
      usage: r.usage ? decode(r.usage) : null,
    };
  }
  invocations(conversationId: string) {
    return this.db
      .prepare(
        "SELECT id,status,created_at AS createdAt,usage FROM invocations WHERE conversation_id=? ORDER BY rowid DESC",
      )
      .all(conversationId)
      .map((r) => ({ ...r, usage: r.usage ? decode(r.usage) : null }));
  }
  saveExecution(e: ToolExecution) {
    this.db
      .prepare("INSERT INTO executions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        e.id,
        e.conversationId,
        e.invocationId,
        e.name,
        json(e.args),
        e.status,
        e.result,
        e.diff,
        e.createdAt,
        e.decidedAt,
        e.revision,
        e.fileHash,
      );
    return e;
  }
  executions(conversationId: string): ToolExecution[] {
    return this.db
      .prepare(
        "SELECT id,conversation_id AS conversationId,invocation_id AS invocationId,name,args,status,result,diff,created_at AS createdAt,decided_at AS decidedAt,revision,file_hash AS fileHash FROM executions WHERE conversation_id=? ORDER BY rowid",
      )
      .all(conversationId)
      .map((r) => ({
        ...r,
        args: decode(r.args),
      })) as unknown as ToolExecution[];
  }
  execution(executionId: string) {
    const r = this.db
      .prepare("SELECT conversation_id FROM executions WHERE id=?")
      .get(executionId);
    if (!r) throw new Error("Tool request not found");
    return this.executions(String(r.conversation_id)).find(
      (e) => e.id === executionId,
    )!;
  }
  updateExecution(
    executionId: string,
    status: ToolExecution["status"],
    result: string | null,
  ) {
    this.db
      .prepare("UPDATE executions SET status=?,result=? WHERE id=?")
      .run(status, result, executionId);
  }
  recordApproval(executionId: string, decision: "approve" | "deny") {
    this.db
      .prepare("INSERT INTO approvals VALUES(?,?,?,?)")
      .run(id(), executionId, decision, now());
    this.db
      .prepare("UPDATE executions SET decided_at=? WHERE id=?")
      .run(now(), executionId);
  }
  close() {
    this.db.close();
  }
}
