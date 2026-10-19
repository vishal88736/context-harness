import { z } from "zod";

export const sourceTypes = [
  "file",
  "folder",
  "project",
  "instruction",
  "chat",
  "memory",
  "attachment",
  "retrieved",
] as const;
export const sourceSchema = z.object({
  id: z.string().max(100).optional(),
  type: z.enum(sourceTypes),
  name: z.string().trim().min(1).max(160),
  enabled: z.boolean().default(true),
  path: z.string().max(4096).optional(),
  content: z.string().max(6_000_000).optional(),
  referenceId: z.string().max(100).optional(),
  mime: z.string().max(150).optional(),
  createdAt: z.string().optional(),
});
export const permissionsSchema = z.object({
  read: z.enum(["deny", "allow"]).default("allow"),
  search: z.enum(["deny", "allow"]).default("allow"),
  write: z.enum(["deny", "ask"]).default("ask"),
  terminal: z.enum(["deny", "ask"]).default("deny"),
});
export const configSchema = z.object({
  sources: z.array(sourceSchema).max(150).default([]),
  permissions: permissionsSchema.default({
    read: "allow",
    search: "allow",
    write: "ask",
    terminal: "deny",
  }),
  profileId: z.string().nullable().default(null),
});
export const modelSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(200),
  contextWindow: z.number().int().min(2048).max(10_000_000).default(8192),
  contextSource: z.enum(["provider", "user", "fallback"]).default("fallback"),
  tools: z.boolean().default(false),
  vision: z.boolean().default(false),
});
export const providerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["ollama", "compatible"]),
  baseUrl: z.string().url().max(2048),
  apiKey: z.string().max(4096).optional(),
  models: z.array(modelSchema).max(200).default([]),
});
export const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(100_000),
  instructions: z.string().max(30_000).default(""),
  attachments: z.array(sourceSchema).max(10).default([]),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  retryMessageId: z.string().optional(),
  previewHash: z.string().optional(),
});
export type Source = z.infer<typeof sourceSchema> & {
  id: string;
  createdAt: string;
};
export type Permissions = z.infer<typeof permissionsSchema>;
export type ContextConfig = {
  sources: Source[];
  permissions: Permissions;
  profileId: string | null;
};
export type Model = z.infer<typeof modelSchema>;
export type Provider = z.infer<typeof providerSchema> & {
  id: string;
  keyConfigured: boolean;
  apiKey?: never;
};
export type SendInput = z.infer<typeof requestSchema>;
export interface Workspace {
  id: string;
  name: string;
  root: string;
  instructions: string;
  createdAt: string;
}
export interface Conversation {
  id: string;
  workspaceId: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  config: ContextConfig;
  providerId: string | null;
  modelId: string | null;
  revision: number;
}
export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status: "complete" | "streaming" | "error" | "stopped";
  invocationId: string | null;
  error: string | null;
}
export interface Profile {
  id: string;
  name: string;
  description: string;
  config: ContextConfig;
  updatedAt: string;
}
export interface WireMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  images?: string[];
}
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
export interface SourceReport {
  id: string;
  name: string;
  type: string;
  path?: string;
  status: "included" | "excluded" | "available";
  reason?: string;
  excerpt?: string;
  tokens: number;
  hash?: string;
  content?: string;
}
export interface Snapshot {
  id: string;
  conversationId: string;
  providerId: string;
  providerName: string;
  model: Model;
  createdAt: string;
  fingerprint: string;
  previewHash: string;
  instructions: { base: string; workspace: string };
  sources: SourceReport[];
  history: { id: string; role: string; included: boolean; reason?: string }[];
  budget: {
    estimated: number;
    limit: number;
    outputReserve: number;
    remaining: number;
    method: string;
  };
  permissions: Permissions;
  payload: Record<string, unknown>;
  messages: WireMessage[];
  warnings: string[];
}
export interface ToolExecution {
  id: string;
  conversationId: string;
  invocationId: string;
  name: string;
  args: Record<string, unknown>;
  status: "pending" | "running" | "complete" | "denied" | "error";
  result: string | null;
  diff: string | null;
  createdAt: string;
  decidedAt: string | null;
  revision: number;
  fileHash: string | null;
}
export const defaultPermissions: Permissions = {
  read: "allow",
  search: "allow",
  write: "ask",
  terminal: "deny",
};
