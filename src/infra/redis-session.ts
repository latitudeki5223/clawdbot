/**
 * ClawdBot native Redis session store.
 * db=7, namespace clawdbot:session:{agentId}:{contextId}, 48h TTL.
 * Password sourced from REDIS_SESSION_TOKEN env — no hardcoded fallback.
 */
interface RedisLike {
  set(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  expireat(key: string, timestamp: number | string): Promise<unknown>;
  quit(): Promise<unknown>;
}

const TTL_SECONDS = 48 * 60 * 60;
let _client: RedisLike | null = null;

/** For testing only — inject a mock client (pass null to reset). */
export function _setClientForTesting(c: RedisLike | null): void {
  _client = c;
}

async function getClient(): Promise<RedisLike> {
  if (_client) return _client;
  const token = process.env.REDIS_SESSION_TOKEN;
  if (!token) throw new Error("REDIS_SESSION_TOKEN not set");
  const host = process.env.REDIS_HOST ?? "redis";
  const { Redis } = await import("ioredis");
  const r = new Redis({
    host: host === "redis" ? "127.0.0.1" : host,
    port: 6379,
    db: 7,
    password: token,
    connectTimeout: 5000,
  }) as unknown as RedisLike;
  _client = r;
  return r;
}

export function sessionKey(agentId: string, contextId: string): string {
  return `clawdbot:session:${agentId}:${contextId}`;
}

export async function saveSessionResult(
  agentId: string,
  contextId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const r = await getClient();
  const key = sessionKey(agentId, contextId);
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  await r.set(key, JSON.stringify(data));
  await r.expireat(key, expiresAt);
}

export async function getSessionResult(
  agentId: string,
  contextId: string,
): Promise<Record<string, unknown> | null> {
  const r = await getClient();
  const raw = await r.get(sessionKey(agentId, contextId));
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

export function closeRedis(): void {
  const c = _client as (RedisLike & { quit?: () => Promise<unknown> }) | null;
  void c?.quit?.();
  _client = null;
}
