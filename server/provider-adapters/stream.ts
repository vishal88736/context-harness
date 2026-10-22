/** Decode SSE events (including multiline data) or Ollama's newline JSON. */
export async function readPackets(
  response: Response,
  format: "sse" | "ndjson",
  signal: AbortSignal,
  consume: (packet: unknown) => boolean | void,
) {
  if (!response.body) throw new Error("The provider returned no stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  let complete = false;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  const parse = (raw: string) => {
    if (!raw.trim()) return;
    if (raw.trim() === "[DONE]") {
      complete = true;
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("Provider sent malformed streaming JSON.");
    }
    if (consume(value) === true) complete = true;
  };
  const line = (value: string) => {
    if (format === "ndjson") {
      parse(value);
      return;
    }
    if (!value) {
      if (data.length) parse(data.join("\n"));
      data = [];
    } else if (value.startsWith("data:")) {
      data.push(value.slice(5).replace(/^ /, ""));
    }
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    while (!complete) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length + data.join("\n").length > 2_000_000)
        throw new Error("Provider stream event exceeds the safety limit.");
      let end: number;
      while (!complete && (end = buffer.indexOf("\n")) >= 0) {
        line(buffer.slice(0, end).replace(/\r$/, ""));
        buffer = buffer.slice(end + 1);
      }
    }
    if (!complete) {
      buffer += decoder.decode();
      if (buffer.trim()) line(buffer.replace(/\r$/, ""));
      if (format === "sse" && data.length) parse(data.join("\n"));
    }
    return complete;
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
  }
}
