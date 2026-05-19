import { describe, expect, it } from "vitest";
import type { ClawdbotConfig } from "../config/config.js";
import type { SessionEntry } from "../config/sessions.js";
import {
  extractSessionContext,
  formatRoutingDecision,
  hasModelOverride,
  isModelRoutingEnabled,
  resolveModelRouterConfig,
  resolveRoutedModel,
  shouldSkipRouting,
} from "./model-router.js";

describe("model-router", () => {
  const createConfig = (
    routerConfig?: NonNullable<
      NonNullable<ClawdbotConfig["agents"]>["defaults"]
    >["modelRouter"],
  ): ClawdbotConfig => ({
    agents: {
      defaults: {
        modelRouter: routerConfig,
      },
    },
  });

  describe("resolveModelRouterConfig", () => {
    it("returns undefined when no config", () => {
      const cfg: ClawdbotConfig = {};
      expect(resolveModelRouterConfig(cfg)).toBeUndefined();
    });

    it("returns router config when present", () => {
      const cfg = createConfig({ enabled: true });
      const result = resolveModelRouterConfig(cfg);
      expect(result?.enabled).toBe(true);
    });
  });

  describe("isModelRoutingEnabled", () => {
    it("returns false when no config", () => {
      expect(isModelRoutingEnabled({})).toBe(false);
    });

    it("returns false when routing disabled", () => {
      const cfg = createConfig({ enabled: false });
      expect(isModelRoutingEnabled(cfg)).toBe(false);
    });

    it("returns true when routing enabled", () => {
      const cfg = createConfig({ enabled: true });
      expect(isModelRoutingEnabled(cfg)).toBe(true);
    });
  });

  describe("hasModelOverride", () => {
    it("returns false when no session", () => {
      expect(hasModelOverride(undefined)).toBe(false);
    });

    it("returns false when no overrides", () => {
      const entry: SessionEntry = {
        sessionId: "test",
        updatedAt: Date.now(),
      };
      expect(hasModelOverride(entry)).toBe(false);
    });

    it("returns true when provider override", () => {
      const entry: SessionEntry = {
        sessionId: "test",
        updatedAt: Date.now(),
        providerOverride: "openai",
      };
      expect(hasModelOverride(entry)).toBe(true);
    });

    it("returns true when model override", () => {
      const entry: SessionEntry = {
        sessionId: "test",
        updatedAt: Date.now(),
        modelOverride: "gpt-4",
      };
      expect(hasModelOverride(entry)).toBe(true);
    });
  });

  describe("shouldSkipRouting", () => {
    it("returns true when routing disabled", () => {
      expect(shouldSkipRouting({ cfg: {} })).toBe(true);
    });

    it("returns true when user has model override", () => {
      const cfg = createConfig({ enabled: true });
      const sessionEntry: SessionEntry = {
        sessionId: "test",
        updatedAt: Date.now(),
        modelOverride: "custom-model",
      };
      expect(shouldSkipRouting({ cfg, sessionEntry })).toBe(true);
    });

    it("returns true for heartbeat", () => {
      const cfg = createConfig({ enabled: true });
      expect(shouldSkipRouting({ cfg, isHeartbeat: true })).toBe(true);
    });

    it("returns true when model directive used", () => {
      const cfg = createConfig({ enabled: true });
      expect(shouldSkipRouting({ cfg, hasModelDirective: true })).toBe(true);
    });

    it("returns false when routing should proceed", () => {
      const cfg = createConfig({ enabled: true });
      expect(shouldSkipRouting({ cfg })).toBe(false);
    });
  });

  describe("extractSessionContext", () => {
    it("handles undefined session", () => {
      const result = extractSessionContext(undefined);
      expect(result.turnCount).toBe(0);
      expect(result.contextTokens).toBe(0);
      expect(result.hasImages).toBe(false);
      expect(result.lastAssistantHadToolUse).toBe(false);
    });

    it("extracts context from session entry", () => {
      const entry: SessionEntry = {
        sessionId: "test",
        updatedAt: Date.now(),
        inputTokens: 5000,
        outputTokens: 3000,
        contextTokens: 8000,
      };
      const result = extractSessionContext(entry);
      expect(result.turnCount).toBe(16); // (5000+3000) / 500
      expect(result.contextTokens).toBe(8000);
    });
  });

  describe("resolveRoutedModel", () => {
    it("returns undefined when routing disabled", () => {
      const result = resolveRoutedModel({
        cfg: {},
        prompt: "hello",
      });
      expect(result).toBeUndefined();
    });

    it("routes simple prompts to haiku", () => {
      const cfg = createConfig({
        enabled: true,
        models: {
          simple: "anthropic/claude-3-5-haiku-20241022",
          medium: "anthropic/claude-sonnet-4-5-20250514",
          complex: "anthropic/claude-opus-4-5-20250115",
        },
      });
      const result = resolveRoutedModel({
        cfg,
        prompt: "hi",
      });
      expect(result).toBeDefined();
      expect(result?.complexity.level).toBe("simple");
      expect(result?.model).toContain("haiku");
    });

    it("routes complex prompts to opus", () => {
      const cfg = createConfig({
        enabled: true,
        models: {
          simple: "anthropic/claude-3-5-haiku-20241022",
          medium: "anthropic/claude-sonnet-4-5-20250514",
          complex: "anthropic/claude-opus-4-5-20250115",
        },
      });
      const result = resolveRoutedModel({
        cfg,
        prompt:
          "Analyze and debug this complex code:\n```\nfunction foo() {}\n```",
      });
      expect(result).toBeDefined();
      expect(result?.complexity.level).toBe("complex");
      expect(result?.model).toContain("opus");
    });

    it("routes medium prompts to sonnet", () => {
      const cfg = createConfig({
        enabled: true,
        models: {
          simple: "anthropic/claude-3-5-haiku-20241022",
          medium: "anthropic/claude-sonnet-4-5-20250514",
          complex: "anthropic/claude-opus-4-5-20250115",
        },
      });
      const result = resolveRoutedModel({
        cfg,
        prompt:
          "What's the best approach to implement user authentication in Node.js?",
      });
      expect(result).toBeDefined();
      expect(result?.complexity.level).toBe("medium");
      expect(result?.model).toContain("sonnet");
    });

    it("uses custom thresholds", () => {
      const cfg = createConfig({
        enabled: true,
        thresholds: {
          simpleMax: 50,
          mediumMax: 80,
        },
        models: {
          simple: "anthropic/claude-3-5-haiku-20241022",
          medium: "anthropic/claude-sonnet-4-5-20250514",
          complex: "anthropic/claude-opus-4-5-20250115",
        },
      });
      // With higher thresholds, this should be simple
      const result = resolveRoutedModel({
        cfg,
        prompt: "Tell me about TypeScript",
      });
      expect(result).toBeDefined();
      expect(result?.complexity.level).toBe("simple");
    });

    it("considers images in routing", () => {
      const cfg = createConfig({
        enabled: true,
        models: {
          simple: "anthropic/claude-3-5-haiku-20241022",
          medium: "anthropic/claude-sonnet-4-5-20250514",
          complex: "anthropic/claude-opus-4-5-20250115",
        },
      });
      const result = resolveRoutedModel({
        cfg,
        prompt: "what is this?",
        hasImages: true,
      });
      expect(result?.complexity.factors).toContain("has-images");
    });
  });

  describe("formatRoutingDecision", () => {
    it("formats routing decision", () => {
      const result = formatRoutingDecision({
        provider: "anthropic",
        model: "claude-3-5-haiku-20241022",
        complexity: {
          level: "simple",
          score: 15,
          factors: ["short-message", "greeting-pattern"],
          model: "anthropic/claude-3-5-haiku-20241022",
        },
      });
      expect(result).toContain("simple");
      expect(result).toContain("score: 15");
      expect(result).toContain("short-message");
      expect(result).toContain("anthropic/claude-3-5-haiku-20241022");
    });
  });
});
