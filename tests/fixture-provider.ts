/** A deterministic HTTP protocol fixture, never an application provider or a neural model. */
import http from "node:http";
import type { AddressInfo } from "node:net";

export async function fixtureProvider() {
  const requests: Record<string, any>[] = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === "/v1/models") {
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          data: [
            {
              id: "fixture-coder",
              name: "Fixture Coder",
              context_window: 32768,
              supported_parameters: ["tools"],
            },
            {
              id: "fixture-reviewer",
              name: "Fixture Reviewer",
              context_window: 8192,
              supported_parameters: ["tools"],
            },
          ],
        }),
      );
    }
    if (req.url === "/api/tags")
      return res.end(JSON.stringify({ models: [{ name: "fixture-local" }] }));
    if (req.url === "/api/show")
      return res.end(
        JSON.stringify({
          capabilities: ["completion", "tools"],
          model_info: { "fixture.context_length": 32768 },
        }),
      );
    let body = "";
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body || "{}");
    requests.push(payload);
    if (req.url === "/api/chat") {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.write(
        JSON.stringify({
          message: { content: "Native Ollama " },
          done: false,
        }) + "\n",
      );
      return res.end(
        JSON.stringify({
          message: { content: "protocol fixture." },
          done: true,
          prompt_eval_count: 20,
          eval_count: 6,
        }) + "\n",
      );
    }
    if (req.url !== "/v1/chat/completions") {
      res.statusCode = 404;
      return res.end("Unknown fixture route");
    }
    res.setHeader("Content-Type", "text/event-stream");
    const prompt = String(
      payload.messages?.filter((m: any) => m.role === "user").at(-1)?.content ??
        "",
    );
    const toolResult = payload.messages?.find((m: any) => m.role === "tool");
    const emit = (packet: unknown) =>
      res.write(`data: ${JSON.stringify(packet)}\n\n`);
    if (prompt.includes("LEAK_STREAM_SECRET")) {
      const secret =
        req.headers.authorization?.replace(/^Bearer /, "") ?? "no-secret";
      for (const content of [
        "A private value: ",
        secret.slice(0, 12),
        secret.slice(12),
        " was removed.",
      ])
        emit({ choices: [{ delta: { content }, finish_reason: null }] });
      emit({ choices: [{ delta: {}, finish_reason: "stop" }] });
    } else if (prompt.includes("LEAK_TOOL_SECRET") && !toolResult) {
      const secret =
        req.headers.authorization?.replace(/^Bearer /, "") ?? "no-secret";
      emit({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "fixture-secret-call",
                  type: "function",
                  function: {
                    name: "read_file",
                    arguments: JSON.stringify({ path: `src/${secret}.ts` }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      });
    } else if (prompt.includes("TOOL_WRITE") && !toolResult) {
      emit({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "fixture-call",
                  type: "function",
                  function: {
                    name: "propose_write",
                    arguments: JSON.stringify({
                      path: "src/alpha.ts",
                      content: "export const alpha = 2;\n",
                      reason: "Fixture proposes a controlled edit.",
                    }),
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      });
      emit({ choices: [{ delta: {}, finish_reason: "tool_calls" }] });
    } else if (prompt.includes("TOOL_DENIED") && !toolResult) {
      emit({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "fixture-denied",
                  type: "function",
                  function: {
                    name: "run_command",
                    arguments: JSON.stringify({
                      command: "touch forbidden-output",
                      reason: "A malicious model tries to bypass denial.",
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      });
    } else if (prompt.includes("WAIT_FOR_STOP")) {
      let count = 0;
      const timer = setInterval(() => {
        emit({
          choices: [
            { delta: { content: `word${count++} ` }, finish_reason: null },
          ],
        });
        if (count >= 100) {
          clearInterval(timer);
          res.end("data: [DONE]\n\n");
        }
      }, 100);
      res.on("close", () => clearInterval(timer));
      return;
    } else if (prompt.includes("BROKEN_STREAM")) {
      emit({
        choices: [{ delta: { content: "Partial " }, finish_reason: null }],
      });
      return res.end();
    } else {
      const answer = `Protocol fixture response from ${payload.model}. ${toolResult ? `Tool result: ${toolResult.content}` : `Received ${payload.messages?.length} composed messages.`}\n\n\`\`\`typescript\nconst verified = true;\n\`\`\``;
      for (const chunk of answer.match(/.{1,24}|\n/g) ?? [])
        emit({ choices: [{ delta: { content: chunk }, finish_reason: null }] });
      emit({
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 91, completion_tokens: 32 },
      });
    }
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    baseUrl: `${origin}/v1`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
