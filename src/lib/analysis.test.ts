import { describe, expect, it } from "vitest";
import {
  buildThreadStrands,
  classifyTrend,
  confidencePreset,
  evidenceConfidence,
  resolveAnalysisSettings,
} from "./analysis";
import type { ThreadBoundary, ThreadPrompt } from "./types";

const source = { conversationId: "conversation", title: "Conversation", date: 1 };

describe("analysis settings", () => {
  it("resolves supported non-Latin script histories to multilingual in auto mode", () => {
    const result = resolveAnalysisSettings({ modelProfile: "auto", confidence: 65 }, [
      "मैं अपने स्वास्थ्य और व्यायाम के बारे में कई सवाल पूछता हूं।".repeat(8),
    ]);

    expect(result.resolvedModelProfile).toBe("multilingual");
    expect(result.confidencePreset).toBe("balanced");
  });

  it("keeps explicit model choices and custom confidence", () => {
    const result = resolveAnalysisSettings({ modelProfile: "multilingual", confidence: 71 }, [
      "Only English text",
    ]);

    expect(result.resolvedModelProfile).toBe("multilingual");
    expect(result.confidence).toBe(71);
    expect(confidencePreset(result.confidence)).toBe("custom");
  });
});

describe("evidence confidence", () => {
  it("rewards aligned semantic and lexical evidence", () => {
    expect(evidenceConfidence(0.82, 0.3)).toBeGreaterThan(evidenceConfidence(0.72, 0.02));
    expect(evidenceConfidence(1, 1, 0.2)).toBeLessThanOrEqual(0.99);
  });
});

describe("trend classification", () => {
  it("identifies resurfacing activity after a quiet middle", () => {
    const result = classifyTrend([
      { label: "2025-01", value: 3 },
      { label: "2025-02", value: 0 },
      { label: "2025-03", value: 0 },
      { label: "2025-04", value: 4 },
    ]);

    expect(result.trend).toBe("resurfacing");
  });

  it("uses monthly share instead of raw volume when totals are supplied", () => {
    const result = classifyTrend(
      [
        { label: "2026-01", value: 2 },
        { label: "2026-02", value: 2 },
        { label: "2026-03", value: 1 },
        { label: "2026-04", value: 5 },
        { label: "2026-05", value: 4 },
        { label: "2026-06", value: 4 },
      ],
      new Map([
        ["2026-01", 10],
        ["2026-02", 10],
        ["2026-03", 10],
        ["2026-04", 100],
        ["2026-05", 100],
        ["2026-06", 100],
      ])
    );

    expect(result.trend).toBe("fading");
  });
});

describe("thread strands", () => {
  it("merges or reveals boundaries as confidence changes", () => {
    const prompts: ThreadPrompt[] = [
      { id: "1", text: "Debug the TypeScript build error", date: 1, source },
      { id: "2", text: "Fix the frontend compiler error", date: 2, source },
      { id: "3", text: "Plan a protein meal for the gym", date: 3, source },
      { id: "4", text: "Estimate calories and protein", date: 4, source },
    ];
    const boundaries: ThreadBoundary[] = [
      {
        at: 2,
        confidence: 0.78,
        continuity: 0.22,
        lexicalSimilarity: 0,
        semanticSimilarity: 0.31,
      },
    ];

    expect(buildThreadStrands(prompts, boundaries, 0.65)).toHaveLength(2);
    expect(buildThreadStrands(prompts, boundaries, 0.82)).toHaveLength(1);
  });
});
