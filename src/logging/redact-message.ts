import { redactSensitiveText } from "./redact.js";

/**
 * Deep-clone a message-shaped value, running redactSensitiveText on every
 * string. Used at the session-persistence boundary so tool-result payloads,
 * thinking blocks, and tool-call arguments are scrubbed before JSONL append.
 */
export function redactAgentMessage<T>(message: T): T {
  return redactValue(message) as T;
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(v);
    }
    return out;
  }
  return value;
}
