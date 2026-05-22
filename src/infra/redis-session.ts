/**
 * ClawdBot native Redis session store.
 * db=7, namespace clawdbot:session:{agentId}:{contextId}, 48h TTL.
 * Password sourced from REDIS_SESSION_TOKEN env — no hardcoded fallback.
 */

interface RedisLike {
  set(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  expireat(key: string, timestamp: number): Promise<unknown>;
  close(): void;
}

const TTL_SECONDS = 48 * 60 * 60;
let _client: RedisLike | null = null;

function client(): RedisLike {
  if (_client) return _client;
  const token = process.env.REDIS_SESSION_TOKEN;
  if (!token) throw new Error("REDIS_SESSION_TOKEN not set");
  const host = process.env.REDIS_HOST ?? "redis";
  const url = `redis://default:${token}@${host}:6379/7`;
  // Dynamic require defers Bun import to runtime — keeps module importable in Vitest/Node
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { RedisClient } = require("bun") as { RedisClient: new (url: string) => RedisLike };
  _client = new RedisClient(url);
  return _client;
}

/** For testing only — inject a mock client (pass null to reset). */
export function _setClientForTesting(c: RedisLike | null): void {
  _client = c;
}

export function sessionKey(agentId: string, contextId: string): string {
  return `clawdbot:session:${agentId}:${contextId}`;
}

export async function saveSessionResult(
  agentId: string,
  contextId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const key = sessionKey(agentId, contextId);
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  await client().set(key, JSON.stringify(data));
  await client().expireat(key, expiresAt);
}

export async function getSessionResult(
  agentId: string,
  contextId: string,
): Promise<Record<string, unknown> | null> {
  const raw = await client().get(sessionKey(agentId, contextId));
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

export function closeRedis(): void {
  _client?.close();
  _client = null;
}
