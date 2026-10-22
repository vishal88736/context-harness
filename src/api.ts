import type {
  Conversation,
  Message,
  Profile,
  Provider,
  Snapshot,
  Source,
  ToolExecution,
  Workspace,
} from "../server/schema";
export type {
  Conversation,
  ContextConfig,
  Message,
  Model,
  Permissions,
  Profile,
  Provider,
  Snapshot,
  Source,
  SourceReport,
  ToolExecution,
  Workspace,
} from "../server/schema";
export interface Bootstrap {
  csrf: string;
  workspaces: Workspace[];
  conversations: Conversation[];
  profiles: Profile[];
  providers: Provider[];
  memories: { id: string; name: string; content: string; createdAt: string }[];
  settings: {
    defaultModel: { providerId: string; modelId: string } | null;
    theme: "light";
  };
}
export interface Detail {
  conversation: Conversation;
  messages: Message[];
  executions: ToolExecution[];
  invocations: { id: string; status: string; createdAt: string }[];
  running: boolean;
}
let csrf = "";
export function setToken(value: string) {
  csrf = value;
}
export async function api<T>(
  endpoint: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(`/api${endpoint}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Canopy-CSRF": csrf },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result as T;
}
export async function streamChat(
  conversationId: string,
  input: unknown,
  onEvent: (event: any) => void,
  signal: AbortSignal,
) {
  const response = await fetch(`/api/conversations/${conversationId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Canopy-CSRF": csrf },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error ?? "Generation failed");
  }
  if (!response.body) throw new Error("Server returned no response stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const packet = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        for (const line of packet.split("\n"))
          if (line.startsWith("data: ")) onEvent(JSON.parse(line.slice(6)));
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export const shortNumber = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
export function makeSource(
  type: Source["type"],
  name: string,
  extra: Partial<Source> = {},
): Source {
  return {
    id: crypto.randomUUID(),
    type,
    name,
    enabled: true,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}
export function activeModel(
  b: Bootstrap,
  c?: Conversation | null,
  override?: string,
) {
  const providerId =
    override?.split("::")[0] ??
    c?.providerId ??
    b.settings.defaultModel?.providerId;
  const modelId =
    override?.split("::").slice(1).join("::") ??
    c?.modelId ??
    b.settings.defaultModel?.modelId;
  const provider = b.providers.find((p) => p.id === providerId);
  return { provider, model: provider?.models.find((m) => m.id === modelId) };
}
