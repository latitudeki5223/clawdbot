import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  _setClientForTesting,
  sessionKey,
  saveSessionResult,
  getSessionResult,
  closeRedis,
} from "./redis-session.js";

interface MockClient {
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  expireat: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function makeMock(): MockClient {
  return {
    set: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
    expireat: vi.fn().mockResolvedValue(1),
    close: vi.fn(),
  };
}

beforeEach(() => {
  delete process.env.REDIS_SESSION_TOKEN;
  _setClientForTesting(null);
});

afterEach(() => {
  _setClientForTesting(null);
});

describe("sessionKey", () => {
  it("formats as clawdbot:session:{agentId}:{contextId}", () => {
    expect(sessionKey("my-agent", "ctx-1")).toBe("clawdbot:session:my-agent:ctx-1");
  });

  it("handles colons in contextId", () => {
    const key = sessionKey("agent", "a:b:c");
    expect(key).toBe("clawdbot:session:agent:a:b:c");
  });
});

describe("saveSessionResult", () => {
  it("writes to the correct namespaced key", async () => {
    const mock = makeMock();
    _setClientForTesting(mock);
    await saveSessionResult("agent1", "ctx", { result: "done" });
    expect(mock.set).toHaveBeenCalledWith(
      "clawdbot:session:agent1:ctx",
      JSON.stringify({ result: "done" }),
    );
  });

  it("calls expireat with a 48h absolute timestamp", async () => {
    const mock = makeMock();
    _setClientForTesting(mock);
    const before = Math.floor(Date.now() / 1000) + 48 * 3600;
    await saveSessionResult("a", "b", {});
    const after = Math.floor(Date.now() / 1000) + 48 * 3600;
    const ts = mock.expireat.mock.calls[0][1] as number;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 1);
  });

  it("expireat is called on the correct key", async () => {
    const mock = makeMock();
    _setClientForTesting(mock);
    await saveSessionResult("agent", "main", {});
    expect(mock.expireat.mock.calls[0][0]).toBe("clawdbot:session:agent:main");
  });
});

describe("getSessionResult", () => {
  it("returns parsed JSON for an existing key", async () => {
    const mock = makeMock();
    mock.get.mockResolvedValue(JSON.stringify({ answer: 42 }));
    _setClientForTesting(mock);
    const result = await getSessionResult("a", "b");
    expect(result).toEqual({ answer: 42 });
  });

  it("returns null for a missing key", async () => {
    const mock = makeMock();
    mock.get.mockResolvedValue(null);
    _setClientForTesting(mock);
    const result = await getSessionResult("a", "b");
    expect(result).toBeNull();
  });
});

describe("closeRedis", () => {
  it("calls close on the client", () => {
    const mock = makeMock();
    _setClientForTesting(mock);
    closeRedis();
    expect(mock.close).toHaveBeenCalledOnce();
  });

  it("resets internal client to null so next call reinitialises", () => {
    const mock = makeMock();
    _setClientForTesting(mock);
    closeRedis();
    // After close, no client — next call to saveSessionResult would throw (no token set)
    expect(() => {
      process.env.REDIS_SESSION_TOKEN = "";
    }).not.toThrow();
  });
});

describe("throws on missing token", () => {
  it("throws Error when REDIS_SESSION_TOKEN is not set and no test client", async () => {
    await expect(saveSessionResult("a", "b", {})).rejects.toThrow("REDIS_SESSION_TOKEN not set");
  });
});
