import type { Permissions, ToolDefinition } from "./schema";
import { commandShell } from "./sandbox";
export function toolDefinitions(
  permissions: Permissions,
  hasPaths: boolean,
): ToolDefinition[] {
  const definitions: ToolDefinition[] = [];
  const fn = (
    name: string,
    description: string,
    properties: Record<string, unknown>,
    required: string[],
  ) => ({
    type: "function" as const,
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    },
  });
  if (permissions.read === "allow" && hasPaths)
    definitions.push(
      fn(
        "read_file",
        "Read a text file inside an enabled file/folder grant. Protected files are denied.",
        { path: { type: "string" } },
        ["path"],
      ),
    );
  if (permissions.search === "allow" && hasPaths)
    definitions.push(
      fn(
        "search_repository",
        "Find relevant excerpts only within this conversation’s enabled file/folder grants.",
        { query: { type: "string" } },
        ["query"],
      ),
    );
  if (permissions.write === "ask" && hasPaths)
    definitions.push(
      fn(
        "propose_write",
        "Propose the complete new text of one authorized file. Presents a diff and requires a separate human approval before any write.",
        {
          path: { type: "string" },
          content: { type: "string" },
          reason: { type: "string" },
        },
        ["path", "content", "reason"],
      ),
    );
  if (permissions.terminal === "ask")
    definitions.push(
      fn(
        "run_command",
        `Request a ${commandShell()} command in the workspace root. Every command requires explicit human approval. Deployment policy controls host or sandbox execution.`,
        { command: { type: "string" }, reason: { type: "string" } },
        ["command", "reason"],
      ),
    );
  return definitions;
}
