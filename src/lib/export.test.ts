import { describe, expect, it } from "vitest";
import { normalizeConversation, normalizeConversationChunk, type RawConversation } from "./export";

function message(id: string, role: "user" | "assistant", text: string, date: number) {
  return {
    id,
    author: { role },
    create_time: date,
    content: { content_type: "text", parts: [text] },
    metadata: {},
  };
}

describe("normalizeConversation", () => {
  it("follows the current path and ignores abandoned branch messages", () => {
    const raw: RawConversation = {
      id: "conversation-1",
      title: "Branch test",
      create_time: 100,
      update_time: 130,
      current_node: "assistant-current",
      default_model_slug: "gpt-test",
      mapping: {
        root: { id: "root", parent: null, message: null },
        "user-current": {
          id: "user-current",
          parent: "root",
          message: message("message-1", "user", "How should I organize this?", 110),
        },
        "assistant-current": {
          id: "assistant-current",
          parent: "user-current",
          message: message("message-2", "assistant", "Use a small index.", 120),
        },
        abandoned: {
          id: "abandoned",
          parent: "root",
          message: message("message-3", "user", "This branch should not count.", 115),
        },
      },
    };

    const result = normalizeConversation(raw);

    expect(result).not.toBeNull();
    expect(result?.messageCount).toBe(2);
    expect(result?.userMessageCount).toBe(1);
    expect(result?.assistantMessageCount).toBe(1);
    expect(result?.prompts.map((prompt) => prompt.text)).toEqual(["How should I organize this?"]);
    expect(result?.model).toBe("gpt-test");
  });

  it("rejects non-array conversation chunks", () => {
    expect(() => normalizeConversationChunk({ conversations: [] })).toThrow(
      "Conversation JSON must contain an array."
    );
  });
});
