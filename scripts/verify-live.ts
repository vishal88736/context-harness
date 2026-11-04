import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app";
import { providerSchema, requestSchema } from "../server/schema";
import type { ToolExecution } from "../server/schema";
import { Vault, redact } from "../server/security";

/** Explicit opt-in real-provider validation. Never starts or substitutes a fixture. */
export async function verifyLive(requireHandoff = false) {
  const env = process.env;
  const keys: string[] = [];
  const settings = async (second = false) => {
    const prefix = second ? "CANOPY_LIVE_SECOND_" : "CANOPY_LIVE_";
    const kind = env[prefix + "PROVIDER"] ?? (second ? undefined : "ollama");
    if (!kind) return undefined;
    const baseUrl =
      env[prefix + "BASE_URL"] ??
      (kind === "ollama" ? "http://127.0.0.1:11434" : undefined);
    if (!baseUrl)
      throw new Error(`${prefix}BASE_URL is required for this provider.`);
    const apiKey = env[prefix + "API_KEY_FILE"]
      ? (await readFile(env[prefix + "API_KEY_FILE"]!, "utf8")).trim()
      : (env[prefix + "API_KEY"] ?? "");
    keys.push(apiKey);
    return {
      ...providerSchema.parse({
        name: second
          ? "Live review connection"
          : "Live verification connection",
        kind,
        baseUrl,
        apiKey,
      }),
      selected: env[prefix + "MODEL"],
    };
  };
  const first = await settings(),
    second = await settings(true);
  if (requireHandoff && !second)
    throw new Error(
      "BLOCKED: configure CANOPY_LIVE_SECOND_PROVIDER and its real connection for the required handoff test.",
    );
  if (!env.CANOPY_LIVE_PROVIDER) {
    try {
      const r = await fetch("http://127.0.0.1:11434/api/tags", {
        signal: AbortSignal.timeout(1500),
      });
      if (!r.ok) throw new Error();
    } catch {
      throw new Error(
        "BLOCKED: no reachable local Ollama. Configure CANOPY_LIVE_PROVIDER, BASE_URL and credentials for a real model. No inference was performed.",
      );
    }
  }
  const temp = await mkdtemp(path.join(tmpdir(), "canopy-live-"));
  const root = path.join(temp, "project"),
    dataDir = path.join(temp, "data");
  await mkdir(root);
  const markers = [`LIVE_A_${randomUUID()}`, `LIVE_B_${randomUUID()}`];
  await writeFile(path.join(root, "a.txt"), `REFERENCE_MARKER=${markers[0]}\n`);
  await writeFile(path.join(root, "b.txt"), `REFERENCE_MARKER=${markers[1]}\n`);
  const service = await createApp({
    root,
    dataDir,
    terminalPolicy: "disabled",
  });
  try {
    const vault = await Vault.create(dataDir);
    const connect = async (input: NonNullable<typeof first>) => {
      const { apiKey, selected, ...p } = input;
      const provider = service.store.saveProvider(
        { ...p, id: randomUUID(), keyConfigured: false },
        vault.encrypt(apiKey ?? ""),
      );
      const models = await service.providers.discover(provider.id);
      const model = selected
        ? models.find((m) => m.id === selected)
        : models[0];
      if (!model)
        throw new Error(
          "No selected/discovered model is available. Supply an actual model ID from discovery.",
        );
      service.store.saveProvider({
        ...provider,
        models: models.map((m) => ({
          ...m,
          maxOutputTokens: Math.min(m.maxOutputTokens ?? 512, 512),
        })),
      });
      return { providerId: provider.id, modelId: model.id, tools: model.tools };
    };
    const primary = await connect(first!);
    const chats = ["a.txt", "b.txt"].map((name) => {
      const c = service.store.createConversation(
        service.store.workspaces()[0].id,
      );
      return service.store.updateConversation(c.id, {
        ...primary,
        config: {
          ...c.config,
          sources: [
            {
              id: randomUUID(),
              type: "file",
              name,
              path: name,
              enabled: true,
              createdAt: new Date().toISOString(),
            },
          ],
          permissions: {
            read: "allow",
            search: "allow",
            write: "ask",
            terminal: "deny",
          },
        },
      });
    });
    let deltas = 0,
      approvals = 0;
    const turn = async (id: string, prompt: string) => {
      const timeout = setTimeout(() => service.agent.stop(id), 120_000);
      try {
        await service.agent.run(
          id,
          requestSchema.parse({ prompt }),
          (event) => {
            if (event.type === "delta") deltas++;
            if (
              event.type === "tool" &&
              (event.execution as ToolExecution).status === "pending"
            ) {
              const e = event.execution as ToolExecution;
              const approve =
                e.name === "propose_write" &&
                e.args.path === "a.txt" &&
                String(e.args.content).includes(markers[0]);
              queueMicrotask(() => {
                try {
                  service.tools.decide(e.id, approve);
                  if (approve) approvals++;
                } catch {
                  service.agent.stop(id);
                }
              });
            }
          },
        );
      } finally {
        clearTimeout(timeout);
      }
      const message = service.store.messages(id).at(-1)!;
      if (message.status !== "complete")
        throw new Error(
          message.error ?? "Live model request did not complete.",
        );
      const snapshot = service.store.invocation(message.invocationId!).snapshot;
      return {
        text: message.content,
        payload: JSON.stringify(snapshot.payload),
      };
    };
    for (let i = 0; i < 2; i++) {
      const result = await turn(
        chats[i].id,
        "Return only the exact REFERENCE_MARKER value from the selected reference file.",
      );
      if (
        !result.text.includes(markers[i]) ||
        !result.payload.includes(markers[i]) ||
        result.payload.includes(markers[1 - i])
      )
        throw new Error("Live context-isolation verification failed.");
    }
    let toolWrite: string = "not supported by discovered model";
    if (primary.tools) {
      const beforeWrite = await readFile(path.join(root, "a.txt"), "utf8");
      await turn(
        chats[0].id,
        "Use propose_write to append a blank line to a.txt. Preserve its exact existing reference marker. This temporary verification file may be edited only through the approval tool.",
      );
      if (
        !approvals ||
        (await readFile(path.join(root, "a.txt"), "utf8")) === beforeWrite
      )
        throw new Error(
          "The real model did not complete the required reviewed write.",
        );
      toolWrite = "passed";
    }
    const current = service.store.conversation(chats[0].id);
    service.store.updateConversation(current.id, {
      config: {
        ...current.config,
        sources: current.config.sources.map((s) => ({ ...s, enabled: false })),
      },
    });
    const revoked = await turn(
      current.id,
      "Reply only READY. Do not use tools.",
    );
    if (revoked.payload.includes(markers[0]))
      throw new Error(
        "Revoked source material appeared in the next actual invocation.",
      );
    let handoff = "not configured";
    if (second) {
      const reviewer = await connect(second);
      const before = JSON.stringify(
        service.store.conversation(chats[1].id).config,
      );
      service.store.updateConversation(chats[1].id, {
        providerId: reviewer.providerId,
        modelId: reviewer.modelId,
      });
      const next = await turn(
        chats[1].id,
        "Return only the exact REFERENCE_MARKER value from the selected file.",
      );
      if (
        !next.text.includes(markers[1]) ||
        !next.payload.includes(markers[1]) ||
        JSON.stringify(service.store.conversation(chats[1].id).config) !==
          before
      )
        throw new Error(
          "Live provider handoff did not retain the selected context.",
        );
      handoff = "passed";
    }
    if (!deltas) throw new Error("No real streaming deltas were received.");
    return {
      ok: true,
      verifiedAt: new Date().toISOString(),
      provider: first!.kind,
      model: primary.modelId,
      checks: {
        streaming: "passed",
        conversationIsolation: "passed",
        revokedContext: "passed",
        reviewedToolWrite: toolWrite,
        providerHandoff: handoff,
      },
      note: "Temporary projects only; this is real endpoint validation, not a reasoning-quality benchmark.",
    };
  } catch (error) {
    throw new Error(redact((error as Error).message, keys));
  } finally {
    service.close();
    await rm(temp, { recursive: true, force: true });
  }
}
