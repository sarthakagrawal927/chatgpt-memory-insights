import { describe, expect, it } from "vitest";
import { buildReflectionQuestions } from "./reflections";
import type { FullReport, UserPrompt } from "./types";

const source = {
  conversationId: "conversation-1",
  title: "A synthetic conversation",
  date: 1_700_000_000,
};

const prompt: UserPrompt = {
  ...source,
  id: "prompt-1",
  text: "Why is this broken again?",
};

function report(): FullReport {
  return {
    generatedAt: 1_800_000_000_000,
    fileName: "synthetic.zip",
    analysis: {
      modelProfile: "compact",
      resolvedModelProfile: "compact",
      confidence: 65,
      confidencePreset: "balanced",
      profileReason: "test",
    },
    deterministic: {
      totals: {
        conversations: 2,
        messages: 4,
        userPrompts: 2,
        words: 20,
        activeDays: 2,
        longestStreak: 1,
      },
      dateRange: { start: 1_600_000_000, end: 1_750_000_000 },
      activityByMonth: [],
      activityByWeekday: [],
      modelUsage: [],
      depth: { medianMessages: 2, short: 2, medium: 0, deep: 0 },
      recurringTerms: [],
      exactRepeats: [
        {
          id: "repeat-1",
          representative: "How should I structure this project?",
          count: 3,
          firstAsked: 1_600_000_000,
          lastAsked: 1_700_000_000,
          sources: [source],
        },
      ],
      tone: {
        counts: { positive: 0, neutral: 1, negative: 1 },
        byMonth: [],
        negativeRate: 0.5,
        method: "test",
      },
      emotions: {
        counts: {
          curiosity: 1,
          frustration: 1,
          urgency: 0,
          uncertainty: 0,
          excitement: 0,
          appreciation: 0,
          neutral: 0,
        },
        byMonth: [],
        sources: {
          curiosity: [source],
          frustration: [source],
          urgency: [],
          uncertainty: [],
          excitement: [],
          appreciation: [],
          neutral: [],
        },
        method: "test",
      },
      lenses: {
        categories: [],
        typos: {
          totalSignals: 0,
          affectedQueries: 0,
          signals: [],
          method: "test",
        },
        threads: {
          eligibleConversations: 0,
          likelyMultiThreaded: 0,
          candidates: [],
          method: "test",
        },
      },
    },
    semantic: {
      model: {
        id: "test",
        revision: "test",
        requestedProfile: "compact",
        resolvedProfile: "compact",
        approximateDownloadMb: 1,
        profileReason: "test",
        embeddedConversations: 2,
        totalConversations: 2,
        embeddedQuestions: 2,
        totalQuestions: 2,
        embeddedFacts: 2,
        totalFacts: 2,
        embeddedThreadPrompts: 0,
        totalThreadPrompts: 0,
      },
      repeats: [],
      topics: [],
      edges: [],
      threads: [],
      facts: [
        {
          id: "updated",
          status: "updated",
          statement: "I work from an office now.",
          firstSeen: 1_600_000_000,
          lastSeen: 1_700_000_000,
          confidence: 0.9,
          similarity: 0.9,
          lexicalSimilarity: 0.5,
          reason: "test",
          history: [{ ...source, id: "fact-1", text: "I work from an office now.", cue: "update" }],
          sources: [source],
        },
        {
          id: "stale",
          status: "current",
          statement: "I use paper notes.",
          firstSeen: 1_600_000_000,
          lastSeen: 1_600_000_000,
          confidence: 0.99,
          similarity: 1,
          lexicalSimilarity: 1,
          reason: "test",
          history: [{ ...source, id: "fact-2", text: "I use paper notes.", cue: "statement" }],
          sources: [{ ...source, date: 1_600_000_000 }],
        },
      ],
    },
    reflections: [],
  };
}

describe("reflection questions", () => {
  it("turns evidence-backed patterns into questions rather than conclusions", () => {
    const questions = buildReflectionQuestions(report(), [prompt]);

    expect(questions.map((question) => question.kind)).toEqual([
      "repeat",
      "changed-memory",
      "stale-memory",
    ]);
    expect(questions.every((question) => question.question.endsWith("?"))).toBe(true);
    expect(questions.every((question) => question.sources.length > 0)).toBe(true);
  });
});
