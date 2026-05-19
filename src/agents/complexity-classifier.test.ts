import { describe, expect, it } from "vitest";
import {
  type ComplexityClassifierParams,
  classifyComplexity,
  DEFAULT_THRESHOLDS,
  isComplexPrompt,
  isSimplePrompt,
} from "./complexity-classifier.js";

describe("complexity-classifier", () => {
  const defaultModelMap = {
    simple: "anthropic/claude-3-5-haiku-20241022",
    medium: "anthropic/claude-sonnet-4-5-20250514",
    complex: "anthropic/claude-opus-4-5-20250115",
  };

  describe("classifyComplexity", () => {
    const classify = (
      params: Partial<ComplexityClassifierParams> & { prompt: string },
    ) =>
      classifyComplexity(
        {
          contextTurns: 0,
          contextTokens: 0,
          hasImages: false,
          recentToolUse: false,
          ...params,
        },
        DEFAULT_THRESHOLDS,
        defaultModelMap,
      );

    describe("simple prompts", () => {
      it("classifies greetings as simple", () => {
        const result = classify({ prompt: "hi" });
        expect(result.level).toBe("simple");
        expect(result.factors).toContain("short-message");
        expect(result.factors).toContain("greeting-pattern");
        expect(result.model).toBe(defaultModelMap.simple);
      });

      it("classifies 'hello' as simple", () => {
        const result = classify({ prompt: "hello" });
        expect(result.level).toBe("simple");
      });

      it("classifies 'thanks' as simple", () => {
        const result = classify({ prompt: "thanks" });
        expect(result.level).toBe("simple");
      });

      it("classifies simple commands as simple", () => {
        const result = classify({ prompt: "/help" });
        expect(result.level).toBe("simple");
        expect(result.factors).toContain("simple-command");
      });

      it("classifies 'what time is it' as simple", () => {
        const result = classify({ prompt: "what time is it?" });
        expect(result.level).toBe("simple");
      });
    });

    describe("medium prompts", () => {
      it("classifies standard questions as medium", () => {
        const result = classify({
          prompt:
            "What's the best approach to implement user authentication in a Node.js app?",
        });
        expect(result.level).toBe("medium");
        expect(result.model).toBe(defaultModelMap.medium);
      });

      it("classifies moderate length messages without triggers as medium", () => {
        const result = classify({
          prompt:
            "I need help understanding how to use React hooks effectively. Can you explain the difference between useState and useEffect?",
        });
        expect(result.level).toBe("medium");
      });
    });

    describe("complex prompts", () => {
      it("classifies analysis requests as complex", () => {
        const result = classify({
          prompt:
            "Analyze the performance bottlenecks in this system architecture",
        });
        expect(result.level).toBe("complex");
        expect(result.factors).toContain("complex-keywords");
        expect(result.model).toBe(defaultModelMap.complex);
      });

      it("classifies debugging requests as complex", () => {
        const result = classify({
          prompt:
            "Debug this issue: the application crashes when users try to login",
        });
        expect(result.level).toBe("complex");
        expect(result.factors).toContain("complex-keywords");
      });

      it("classifies code blocks as complex", () => {
        const result = classify({
          prompt:
            "What's wrong with this code?\n```typescript\nconst foo = bar;\n```",
        });
        expect(result.level).toBe("complex");
        expect(result.factors).toContain("code-block");
      });

      it("classifies thinking directive as complex", () => {
        const result = classify({
          prompt: "/thinking high explain how databases work",
        });
        expect(result.level).toBe("complex");
        expect(result.factors).toContain("thinking-directive");
      });

      it("classifies error content as higher complexity", () => {
        const result = classify({
          prompt:
            "I'm getting this error: TypeError: Cannot read property 'foo' of undefined",
        });
        expect(result.factors).toContain("error-content");
        // Error alone may not push to complex, but increases score
        expect(result.score).toBeGreaterThan(35);
      });
    });

    describe("context factors", () => {
      it("increases score for large context turns", () => {
        const result = classify({
          prompt: "continue",
          contextTurns: 25,
        });
        expect(result.factors).toContain("large-context-turns");
        expect(result.score).toBeGreaterThan(35);
      });

      it("increases score for high token count", () => {
        const result = classify({
          prompt: "summarize our conversation",
          contextTokens: 60000,
        });
        expect(result.factors).toContain("high-tokens");
        expect(result.score).toBeGreaterThan(35);
      });

      it("increases score for images", () => {
        const result = classify({
          prompt: "what is this?",
          hasImages: true,
        });
        expect(result.factors).toContain("has-images");
        expect(result.score).toBeGreaterThan(20);
      });

      it("increases score for recent tool use", () => {
        const result = classify({
          prompt: "what happened?",
          recentToolUse: true,
        });
        expect(result.factors).toContain("recent-tool-use");
      });

      it("handles multiple context factors", () => {
        const result = classify({
          prompt: "analyze this code",
          contextTurns: 25,
          contextTokens: 60000,
          hasImages: true,
          recentToolUse: true,
        });
        expect(result.level).toBe("complex");
        expect(result.factors.length).toBeGreaterThan(3);
      });
    });

    describe("score clamping", () => {
      it("clamps score to minimum 0", () => {
        const result = classify({ prompt: "hi" });
        expect(result.score).toBeGreaterThanOrEqual(0);
      });

      it("clamps score to maximum 100", () => {
        const result = classify({
          prompt:
            "Please analyze and debug this complex architecture issue with detailed refactoring recommendations\n```\nfunction foo() { throw new Error('test'); }\n```",
          contextTurns: 30,
          contextTokens: 100000,
          hasImages: true,
          recentToolUse: true,
        });
        expect(result.score).toBeLessThanOrEqual(100);
      });
    });

    describe("custom thresholds", () => {
      it("uses custom thresholds", () => {
        const result = classifyComplexity(
          { prompt: "a medium length question about programming" },
          { simpleMax: 50, mediumMax: 80 },
          defaultModelMap,
        );
        // With higher thresholds, more prompts become "simple"
        expect(result.level).toBe("simple");
      });
    });
  });

  describe("isSimplePrompt", () => {
    it("returns true for greetings", () => {
      expect(isSimplePrompt("hi")).toBe(true);
      expect(isSimplePrompt("hello")).toBe(true);
      expect(isSimplePrompt("thanks")).toBe(true);
    });

    it("returns true for simple commands", () => {
      expect(isSimplePrompt("/help")).toBe(true);
      expect(isSimplePrompt("/status")).toBe(true);
    });

    it("returns false for longer messages", () => {
      expect(isSimplePrompt("a".repeat(150))).toBe(false);
    });

    it("returns false for non-simple content", () => {
      expect(isSimplePrompt("explain the architecture")).toBe(false);
    });
  });

  describe("isComplexPrompt", () => {
    it("returns true for analysis keywords", () => {
      expect(isComplexPrompt("analyze this code")).toBe(true);
      expect(isComplexPrompt("debug the issue")).toBe(true);
    });

    it("returns true for code blocks", () => {
      expect(isComplexPrompt("```\ncode here\n```")).toBe(true);
    });

    it("returns true for thinking directives", () => {
      expect(isComplexPrompt("/thinking high explain")).toBe(true);
    });

    it("returns true for very long messages", () => {
      expect(isComplexPrompt("a".repeat(1500))).toBe(true);
    });

    it("returns false for simple messages", () => {
      expect(isComplexPrompt("hello")).toBe(false);
    });
  });
});
