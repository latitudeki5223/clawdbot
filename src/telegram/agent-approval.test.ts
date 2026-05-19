import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { botApi } = vi.hoisted(() => ({
  botApi: {
    answerCallbackQuery: vi.fn(async () => undefined),
    editMessageText: vi.fn(async () => undefined),
  },
}));

vi.mock("grammy", () => ({
  Bot: class {
    api = botApi;
  },
}));

import {
  handleAgentApprovalCallback,
  isAgentApprovalCallback,
} from "./agent-approval.js";

const fetchSpy = vi.fn();

const buildCallback = (overrides: Partial<{ id: string; text: string }> = {}) => ({
  id: overrides.id ?? "cb-1",
  data: undefined as string | undefined,
  from: { id: 1, first_name: "Tony" },
  message: {
    chat: { id: 12345 },
    message_id: 99,
    text: overrides.text ?? "Original notification body",
  },
});

describe("isAgentApprovalCallback", () => {
  it("returns true for agent_approve / agent_revise prefixes", () => {
    expect(isAgentApprovalCallback("agent_approve:42")).toBe(true);
    expect(isAgentApprovalCallback("agent_revise:42")).toBe(true);
  });

  it("returns false for other prefixes", () => {
    expect(isAgentApprovalCallback("social_approve:42")).toBe(false);
    expect(isAgentApprovalCallback("save_high")).toBe(false);
    expect(isAgentApprovalCallback("")).toBe(false);
  });
});

describe("handleAgentApprovalCallback", () => {
  beforeEach(() => {
    botApi.answerCallbackQuery.mockClear();
    botApi.editMessageText.mockClear();
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts approved status to L36 notifications/action endpoint", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    const callback = buildCallback();
    await handleAgentApprovalCallback(
      // biome-ignore lint/suspicious/noExplicitAny: stub Bot
      { api: botApi } as any,
      callback,
      "agent_approve:42",
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/api/notifications/42/action");
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toEqual({ status: "approved" });
    const headers = (init as { headers: Record<string, string> }).headers;
    expect(headers["X-Context-ID"]).toBe("1");
    expect(headers).toHaveProperty("X-Admin-Token");
    expect(botApi.answerCallbackQuery).toHaveBeenCalledWith(
      "cb-1",
      expect.objectContaining({ text: expect.stringContaining("Approved") }),
    );
    expect(botApi.editMessageText).toHaveBeenCalled();
  });

  it("posts revise status when agent_revise is tapped", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    await handleAgentApprovalCallback(
      // biome-ignore lint/suspicious/noExplicitAny: stub Bot
      { api: botApi } as any,
      buildCallback({ id: "cb-2" }),
      "agent_revise:7",
    );
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toEqual({ status: "revise" });
    expect(botApi.answerCallbackQuery).toHaveBeenCalledWith(
      "cb-2",
      expect.objectContaining({ text: expect.stringContaining("Revise") }),
    );
  });

  it("rejects invalid notification IDs without calling fetch", async () => {
    await handleAgentApprovalCallback(
      // biome-ignore lint/suspicious/noExplicitAny: stub Bot
      { api: botApi } as any,
      buildCallback({ id: "cb-3" }),
      "agent_approve:not-a-number",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(botApi.answerCallbackQuery).toHaveBeenCalledWith(
      "cb-3",
      expect.objectContaining({ text: "Invalid notification ID" }),
    );
  });

  it("surfaces backend error message back to Telegram", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ success: false, error: "Notification not found" }),
    });
    await handleAgentApprovalCallback(
      // biome-ignore lint/suspicious/noExplicitAny: stub Bot
      { api: botApi } as any,
      buildCallback({ id: "cb-4" }),
      "agent_approve:999",
    );
    expect(botApi.answerCallbackQuery).toHaveBeenCalledWith(
      "cb-4",
      expect.objectContaining({
        text: expect.stringContaining("Notification not found"),
      }),
    );
    expect(botApi.editMessageText).not.toHaveBeenCalled();
  });

  it("handles network failure gracefully", async () => {
    fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));
    await handleAgentApprovalCallback(
      // biome-ignore lint/suspicious/noExplicitAny: stub Bot
      { api: botApi } as any,
      buildCallback({ id: "cb-5" }),
      "agent_revise:5",
    );
    expect(botApi.answerCallbackQuery).toHaveBeenCalledWith(
      "cb-5",
      expect.objectContaining({ text: "Error contacting L36" }),
    );
  });
});
