import { describe, expect, it } from "vitest";
import {
  buildDeterministicReport,
  extractFactCandidates,
  lexicalSimilarity,
  promptEmotion,
} from "./insights";
import type { ConversationRecord, UserPrompt } from "./types";

function prompt(
  id: string,
  text: string,
  date: number,
  conversationId = `conversation-${id}`
): UserPrompt {
  return {
    id,
    text,
    date,
    conversationId,
    title: `Conversation ${id}`,
  };
}

function conversation(
  id: string,
  date: number,
  prompts: UserPrompt[],
  messageCount = prompts.length * 2
): ConversationRecord {
  return {
    conversationId: id,
    title: `Conversation ${id}`,
    date,
    updatedAt: date,
    model: "gpt-test",
    messageCount,
    userMessageCount: prompts.length,
    assistantMessageCount: prompts.length,
    wordCount: 100,
    prompts,
  };
}

describe("deterministic insights", () => {
  it("counts exact repeats and query-tone wording", () => {
    const repeated = "How can I fix this broken build?";
    const conversations = [
      conversation("a", 1_700_000_000, [prompt("a", repeated, 1_700_000_000, "a")]),
      conversation("b", 1_700_086_400, [prompt("b", repeated, 1_700_086_400, "b")]),
      conversation("c", 1_700_172_800, [
        prompt("c", "I love how clear this result is.", 1_700_172_800, "c"),
      ]),
    ];

    const { report } = buildDeterministicReport(conversations);

    expect(report.totals.conversations).toBe(3);
    expect(report.totals.longestStreak).toBe(3);
    expect(report.activityByDay).toEqual([
      {
        label: "2023-11-14",
        value: 1,
        sources: [
          {
            conversationId: "a",
            title: "Conversation a",
            date: 1_700_000_000,
          },
        ],
      },
      {
        label: "2023-11-15",
        value: 1,
        sources: [
          {
            conversationId: "b",
            title: "Conversation b",
            date: 1_700_086_400,
          },
        ],
      },
      {
        label: "2023-11-16",
        value: 1,
        sources: [
          {
            conversationId: "c",
            title: "Conversation c",
            date: 1_700_172_800,
          },
        ],
      },
    ]);
    expect(report.exactRepeats).toHaveLength(1);
    expect(report.exactRepeats[0].count).toBe(2);
    expect(report.tone.counts.negative).toBe(2);
    expect(report.tone.counts.positive).toBe(1);
    expect(report.emotions.counts.frustration).toBe(2);
    expect(report.emotions.counts.excitement).toBe(1);
  });

  it("classifies dominant query language signals without treating them as mental states", () => {
    expect(promptEmotion("Why does this broken build fail again?")).toBe("frustration");
    expect(promptEmotion("Could this maybe work with a smaller model?")).toBe("uncertainty");
    expect(promptEmotion("Thank you, this was really helpful.")).toBe("appreciation");
    expect(promptEmotion("Ship this immediately before today's deadline.")).toBe("urgency");
    expect(promptEmotion("List the repository files.")).toBe("neutral");
  });

  it("detects statement, update, and refutation cues from visitor wording", () => {
    const prompts = [
      prompt("one", "I prefer remote work with clear boundaries.", 100),
      prompt("two", "Actually, I prefer working from an office now.", 200),
      prompt("three", "I no longer use paper notes.", 300),
      prompt("four", "Can you explain paper notes?", 400),
      prompt("five", "If I want a repository-level memory, what are my options?", 500),
      prompt("six", "I don't know.", 600),
    ];

    const facts = extractFactCandidates(prompts);

    expect(facts.map((fact) => fact.cue)).toEqual(["statement", "update", "refutation"]);
    expect(facts.some((fact) => fact.text.includes("Can you explain"))).toBe(false);
    expect(facts.some((fact) => fact.text.includes("repository-level memory"))).toBe(false);
    expect(facts.some((fact) => fact.text.includes("don't know"))).toBe(false);
  });

  it("does not turn repeated pasted logs into repeated questions", () => {
    const longText = `Traceback ${"stack frame ".repeat(100)}`;
    const conversations = [
      conversation("a", 100, [prompt("a", longText, 100, "a")]),
      conversation("b", 200, [prompt("b", longText, 200, "b")]),
    ];

    expect(buildDeterministicReport(conversations).report.exactRepeats).toHaveLength(0);
  });

  it("builds question-domain, typo, and likely thread-change lenses", () => {
    const prompts = [
      prompt("one", "Calculate the probability and average for these six values.", 101, "mixed"),
      prompt("two", "My sleep and nutrition plan needs more protein and calories.", 102, "mixed"),
      prompt("three", "Debug this TypeScript database migration and API error.", 103, "mixed"),
      prompt("four", "Plan a train itinerary through three cities and hotels.", 104, "mixed"),
      prompt("five", "I definately want a better portfolio valuation strategy.", 105, "mixed"),
      prompt("six", "Write a character story with a visual illustration.", 106, "mixed"),
      prompt("seven", "Explain this class constructor and object prototype.", 107, "mixed"),
    ];

    const { report } = buildDeterministicReport([conversation("mixed", 100, prompts, 12)]);

    expect(report.lenses.categories.find((lens) => lens.id === "math")?.queryCount).toBe(1);
    expect(report.lenses.categories.find((lens) => lens.id === "health")?.queryCount).toBe(1);
    expect(report.lenses.typos.signals[0]).toMatchObject({
      token: "definately",
      suggestion: "definitely",
    });
    expect(report.lenses.threads.likelyMultiThreaded).toBe(1);
    expect(report.lenses.threads.candidates[0].estimatedThreads).toBeGreaterThan(1);
    expect(() => structuredClone(report)).not.toThrow();
  });

  it("bounds daily evidence while preserving the full activity count", () => {
    const day = 1_700_000_000;
    const conversations = Array.from({ length: 15 }, (_, index) =>
      conversation(`day-${index}`, day + index, [
        prompt(`day-${index}`, `Question number ${index}?`, day + index, `day-${index}`),
      ])
    );

    const { report } = buildDeterministicReport(conversations);

    expect(report.activityByDay).toHaveLength(1);
    expect(report.activityByDay?.[0].value).toBe(15);
    expect(report.activityByDay?.[0].sources).toHaveLength(12);
  });

  it("builds overlapping monthly activity rhythms for route and measure filtering", () => {
    const november = 1_700_000_000;
    const december = 1_701_388_800;
    const conversations = [
      conversation(
        "mixed",
        november,
        [
          prompt(
            "mixed",
            "Calculate the average calories for this nutrition plan.",
            november,
            "mixed"
          ),
        ],
        6
      ),
      conversation(
        "software",
        december,
        [prompt("software", "Debug this TypeScript API.", december, "software")],
        4
      ),
    ];
    conversations[0].wordCount = 240;
    conversations[1].wordCount = 120;

    const { report } = buildDeterministicReport(conversations);
    const all = report.activityRhythms?.find((series) => series.id === "all");
    const math = report.activityRhythms?.find((series) => series.id === "math");
    const health = report.activityRhythms?.find((series) => series.id === "health");
    const software = report.activityRhythms?.find((series) => series.id === "software");

    expect(all?.byMonth).toEqual([
      {
        label: "2023-11",
        conversations: 1,
        messages: 6,
        userPrompts: 1,
        words: 240,
      },
      {
        label: "2023-12",
        conversations: 1,
        messages: 4,
        userPrompts: 1,
        words: 120,
      },
    ]);
    expect(math?.byMonth[0]).toMatchObject({ conversations: 1, words: 240 });
    expect(health?.byMonth[0]).toMatchObject({ conversations: 1, words: 240 });
    expect(software?.byMonth[0]).toMatchObject({ conversations: 1, words: 120 });
  });

  it("keeps lexical overlap transparent", () => {
    expect(
      lexicalSimilarity(
        "How do I improve focus while working?",
        "What helps me focus better at work?"
      )
    ).toBeGreaterThan(0);
    expect(lexicalSimilarity("Plan a trip", "Debug this database")).toBe(0);
  });
});
