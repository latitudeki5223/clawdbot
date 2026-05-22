import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ComposerHttpError,
  composeAndQueueSocialPost,
} from "./social-composer.js";

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  process.env.L36_API_BASE = "http://test-host:5050";
  process.env.L36_AGENT_ADMIN_KEY = "test-admin-key";
  process.env.L36_CONTEXT_ID = "1";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const okResponse = (data: Record<string, unknown>) => ({
  ok: true,
  status: 201,
  json: async () => ({ success: true, data }),
});

describe("composeAndQueueSocialPost — request shape", () => {
  it("POSTs to /api/social/compose-and-queue with required headers and body", async () => {
    fetchSpy.mockResolvedValue(
      okResponse({
        post_id: 42,
        platform: "instagram",
        social_account_id: 7,
        status: "pending_approval",
        scheduled_for: null,
        preview: { caption: "hi", hashtags: ["#test"] },
        content_id: 99,
      }),
    );

    await composeAndQueueSocialPost({
      topic: "Friday tasting",
      tone: "playful",
      target_account: "latitude_36",
      platform: "instagram",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("http://test-host:5050/api/social/compose-and-queue");

    const initObj = init as { method: string; headers: Record<string, string>; body: string };
    expect(initObj.method).toBe("POST");
    expect(initObj.headers["X-API-Key"]).toBe("test-admin-key");
    expect(initObj.headers["X-Context-ID"]).toBe("1");
    expect(initObj.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(initObj.body);
    expect(body).toEqual({
      topic: "Friday tasting",
      tone: "playful",
      target_account: "latitude_36",
      platform: "instagram",
    });
  });

  it("omits platform and schedule_at when not provided", async () => {
    fetchSpy.mockResolvedValue(
      okResponse({
        post_id: 1,
        platform: "instagram",
        social_account_id: 7,
        status: "pending_approval",
        scheduled_for: null,
        preview: { caption: "", hashtags: [] },
        content_id: 1,
      }),
    );

    await composeAndQueueSocialPost({
      topic: "x",
      tone: "playful",
      target_account: "latitude_36",
    });

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    expect(body).not.toHaveProperty("platform");
    expect(body).not.toHaveProperty("schedule_at");
  });

  it("includes schedule_at when provided", async () => {
    fetchSpy.mockResolvedValue(
      okResponse({
        post_id: 2,
        platform: "instagram",
        social_account_id: 7,
        status: "pending_approval",
        scheduled_for: "2026-05-25T09:00:00+10:00",
        preview: { caption: "", hashtags: [] },
        content_id: 2,
      }),
    );

    await composeAndQueueSocialPost({
      topic: "x",
      tone: "urgent",
      target_account: "latitude_36",
      schedule_at: "2026-05-25T09:00:00+10:00",
    });

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    expect(body.schedule_at).toBe("2026-05-25T09:00:00+10:00");
  });
});

describe("composeAndQueueSocialPost — response handling", () => {
  it("returns the parsed data payload on 201", async () => {
    const data = {
      post_id: 9999,
      platform: "instagram",
      social_account_id: 77,
      status: "pending_approval",
      scheduled_for: null,
      preview: { caption: "caption text", hashtags: ["#a"] },
      content_id: 555,
    };
    fetchSpy.mockResolvedValue(okResponse(data));

    const result = await composeAndQueueSocialPost({
      topic: "x",
      tone: "playful",
      target_account: "latitude_36",
    });

    expect(result).toEqual(data);
  });
});

describe("composeAndQueueSocialPost — error mapping", () => {
  it("throws ComposerHttpError with status + body error on 4xx", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        success: false,
        error: "No active social account matches target_account='bogus'",
        code: "ACCOUNT_NOT_FOUND",
      }),
    });

    await expect(
      composeAndQueueSocialPost({
        topic: "x",
        tone: "playful",
        target_account: "bogus",
      }),
    ).rejects.toMatchObject({
      name: "ComposerHttpError",
      status: 404,
      code: "ACCOUNT_NOT_FOUND",
    });
  });

  it("throws ComposerHttpError with status 502 on LangGraph upstream failure", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({
        success: false,
        error: "Upstream content generation failed",
        code: "LANGGRAPH_UPSTREAM_ERROR",
      }),
    });

    await expect(
      composeAndQueueSocialPost({
        topic: "x",
        tone: "playful",
        target_account: "latitude_36",
      }),
    ).rejects.toMatchObject({
      status: 502,
      code: "LANGGRAPH_UPSTREAM_ERROR",
    });
  });

  it("throws ComposerHttpError when body is not JSON", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(
      composeAndQueueSocialPost({
        topic: "x",
        tone: "playful",
        target_account: "latitude_36",
      }),
    ).rejects.toBeInstanceOf(ComposerHttpError);
  });

  it("throws when L36_AGENT_ADMIN_KEY is unset", async () => {
    delete process.env.L36_AGENT_ADMIN_KEY;
    await expect(
      composeAndQueueSocialPost({
        topic: "x",
        tone: "playful",
        target_account: "latitude_36",
      }),
    ).rejects.toThrow(/L36_AGENT_ADMIN_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("wraps fetch network errors with a clear message", async () => {
    fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      composeAndQueueSocialPost({
        topic: "x",
        tone: "playful",
        target_account: "latitude_36",
      }),
    ).rejects.toThrow(/L36 composer request failed/);
  });
});
