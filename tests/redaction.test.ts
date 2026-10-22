import { test } from "node:test";
import assert from "node:assert/strict";
import { StreamingRedactor, redactValue } from "../server/security";

test("Known credentials stay private at every possible streaming split", () => {
  const key = "fixture-stream-private-key-987654";
  const text = `Before ${key} after.`;
  for (let split = 0; split <= text.length; split++) {
    const stream = new StreamingRedactor([key]);
    const parts = [
      stream.push(text.slice(0, split)),
      stream.push(text.slice(split)),
      stream.finish(),
    ];
    assert.equal(parts.join(""), "Before [REDACTED] after.");
  }
  const stream = new StreamingRedactor([key]);
  let rendered = "";
  for (const char of text) rendered += stream.push(char);
  assert.equal(rendered + stream.finish(), "Before [REDACTED] after.");
});
test("Known overlapping keys and split credential markers are redacted", () => {
  const overlap = new StreamingRedactor(["abcabc"]);
  assert.equal(overlap.push("abcabc") + overlap.finish(), "[REDACTED]");
  const stream = new StreamingRedactor([]);
  const output =
    ["The pass", "word: ", "super-private-value", "\nDone."]
      .map((chunk) => stream.push(chunk))
      .join("") + stream.finish();
  assert.doesNotMatch(output, /super-private-value/);
  assert.match(output, /REDACTED/);
});
test("Structured sanitization cleans keys and values while preserving designated image bytes", () => {
  const key = "private-key";
  assert.deepEqual(redactValue({ args: { nested: key }, [key]: "ok" }, [key]), {
    args: { nested: "[REDACTED]" },
    "[REDACTED]": "ok",
  });
  const payload = {
    messages: [
      {
        images: ["abcd"],
        content: "abcd",
        image_url: { url: "data:image/png;base64,abcd" },
      },
    ],
  };
  const safe = redactValue(payload, ["abcd"], true);
  assert.equal(safe.messages[0].content, "[REDACTED]");
  assert.equal(safe.messages[0].images[0], "abcd");
  assert.equal(
    safe.messages[0].image_url.url,
    payload.messages[0].image_url.url,
  );
});
