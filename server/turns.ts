import { HttpError } from "./security";
import type { Message, SendInput } from "./schema";

/** Retries replace the latest turn's effective answer, while preserving earlier attempts for display. */
export function retryCutoff(
  messages: Message[],
  input: Pick<SendInput, "retryMessageId" | "prompt">,
): number | undefined {
  if (!input.retryMessageId) return undefined;
  const target = messages.findIndex(
    (message) =>
      message.id === input.retryMessageId && message.role === "assistant",
  );
  if (target < 0) throw new HttpError(400, "Cannot retry this message.");
  let user = target - 1;
  while (user >= 0 && messages[user].role !== "user") user--;
  if (user < 0)
    throw new HttpError(
      400,
      "Cannot retry a response without an originating user turn.",
    );
  if (messages.slice(user + 1).some((message) => message.role === "user"))
    throw new HttpError(
      400,
      "Only the latest user turn can be retried. Send a new message to revisit earlier work.",
    );
  if (messages[user].content !== input.prompt)
    throw new HttpError(
      400,
      "Retry prompt does not match the original user message.",
    );
  return user;
}

export function supersededAttempts(messages: Message[]): Set<string> {
  const superseded = new Set<string>();
  let previous: Message | undefined;
  for (const message of messages) {
    if (message.role === "user") previous = undefined;
    else {
      if (previous) superseded.add(previous.id);
      previous = message;
    }
  }
  return superseded;
}
