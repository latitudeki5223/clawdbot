import { describe, expect, it } from "vitest";

import { redactAgentMessage } from "./redact-message.js";

describe("redactAgentMessage", () => {
  it("redacts secrets inside tool-result content blocks", () => {
    const msg = {
      role: "toolResult",
      toolCallId: "abc",
      toolName: "exec",
      content: [
        {
          type: "text",
          text: "PERPLEXITY_API_KEY=pplx-fakefakefakefakefakefakefakefakefakefakefakefake",
        },
      ],
      details: {
        aggregated:
          "OPENAI_API_KEY=sk-proj-1234567890abcdefghij\nFOO=bar",
        cwd: "/home/admin/l36",
      },
      isError: false,
    };

    const out = redactAgentMessage(msg) as typeof msg;

    expect(out.content[0].text).not.toContain(
      "pplx-fakefakefakefakefakefakefakefakefakefakefakefake",
    );
    expect(out.content[0].text).toContain("pplx-r");
    expect(out.details.aggregated).not.toContain(
      "sk-proj-1234567890abcdefghij",
    );
    expect(out.details.aggregated).toContain("FOO=bar");
    expect(out.details.cwd).toBe("/home/admin/l36");
  });

  it("redacts secrets inside assistant thinking + tool-call arguments", () => {
    const msg = {
      role: "assistant",
      content: [
        {
          type: "thinking",
          thinking:
            "I can see PERPLEXITY_API_KEY=pplx-fakefakefakefakefakefakefakefakefakefakefakefake in the env",
        },
        {
          type: "toolCall",
          id: "call_1",
          name: "exec",
          arguments: {
            command:
              "curl -H 'Authorization: Bearer sk-ant-api03-fakekey00000000000000000000000000000000000000000000' https://x",
          },
        },
      ],
    };

    const out = redactAgentMessage(msg) as typeof msg;
    const thinkingBlock = out.content[0] as { thinking: string };
    const toolCall = out.content[1] as {
      arguments: { command: string };
    };

    expect(thinkingBlock.thinking).not.toContain(
      "pplx-fakefakefakefakefakefakefakefakefakefakefakefake",
    );
    expect(toolCall.arguments.command).not.toContain(
      "sk-ant-api03-fakekey00000000000000000000000000000000000000000000",
    );
    expect(toolCall.arguments.command).toContain("Bearer ");
  });

  it("does not mutate the input object", () => {
    const msg = {
      role: "toolResult",
      content: [
        { type: "text", text: "OPENAI_API_KEY=sk-1234567890abcdef" },
      ],
    };
    const before = JSON.stringify(msg);
    redactAgentMessage(msg);
    expect(JSON.stringify(msg)).toBe(before);
  });

  it("passes through non-sensitive content unchanged", () => {
    const msg = {
      role: "user",
      content: [{ type: "text", text: "hello world" }],
    };
    const out = redactAgentMessage(msg) as typeof msg;
    expect(out.content[0].text).toBe("hello world");
  });
});
