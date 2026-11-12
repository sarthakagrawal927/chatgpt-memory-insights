import { describe, expect, it } from "vitest";
import { buildHistoricalShifts } from "./historical-shifts";
import type { CountDatum, DeterministicReport, EmotionBucket, ShiftFinding } from "./types";

const EMOTION_BUCKETS: EmotionBucket[] = [
  "curiosity",
  "frustration",
  "urgency",
  "uncertainty",
  "excitement",
  "appreciation",
  "neutral",
];

function emotionCounts(partial: Partial<Record<EmotionBucket, number>>) {
  const counts = Object.fromEntries(EMOTION_BUCKETS.map((bucket) => [bucket, 0])) as Record<
    EmotionBucket,
    number
  >;
  return { ...counts, ...partial };
}

function reportWith(overrides: Partial<DeterministicReport>): DeterministicReport {
  return {
    totals: {
      conversations: 0,
      messages: 0,
      userPrompts: 0,
      words: 0,
      activeDays: 0,
      longestStreak: 0,
    },
    dateRange: { start: 0, end: 0 },
    activityByMonth: [],
    activityByWeekday: [],
    modelUsage: [],
    depth: { medianMessages: 0, short: 0, medium: 0, deep: 0 },
    recurringTerms: [],
    exactRepeats: [],
    tone: { counts: { positive: 0, neutral: 0, negative: 0 }, sources: {}, method: "test" },
    emotions: { counts: emotionCounts({}), byMonth: [], sources: {}, method: "test" },
    lenses: { categories: [], method: "test" },
    ...overrides,
  } as DeterministicReport;
}

function months(values: number[], from = 1): CountDatum[] {
  return values.map((value, index) => ({
    label: `2026-${String(from + index).padStart(2, "0")}`,
    value,
  }));
}

function rhythm(id: string, label: string, values: number[]) {
  return {
    id,
    label,
    byMonth: months(values).map(({ label: month, value }) => ({
      label: month,
      conversations: value,
      messages: value * 3,
      userPrompts: value,
      words: value * 20,
    })),
  };
}

function find(findings: ShiftFinding[], id: string): ShiftFinding | undefined {
  return findings.find((finding) => finding.id === id);
}

describe("buildHistoricalShifts", () => {
  it("reports no findings for a history too short to compare", () => {
    const result = buildHistoricalShifts(reportWith({ activityByMonth: months([5, 6]) }));

    expect(result.findings).toEqual([]);
    expect(result.months).toBe(2);
  });

  it("classifies a growing cadence as emerging and a shrinking one as fading", () => {
    const growing = buildHistoricalShifts(
      reportWith({ activityByMonth: months([2, 3, 9, 14, 20, 26]) })
    );
    const shrinking = buildHistoricalShifts(
      reportWith({ activityByMonth: months([26, 20, 14, 9, 3, 2]) })
    );

    expect(find(growing.findings, "cadence-conversations")?.trend).toBe("emerging");
    expect(find(shrinking.findings, "cadence-conversations")?.trend).toBe("fading");
  });

  it("normalizes a lens against total activity so a share drop is not read as growth", () => {
    // The lens count rises 2 -> 6 while total activity rises 4 -> 60, so its
    // share of attention actually collapses. Absolute counts would say "emerging".
    const result = buildHistoricalShifts(
      reportWith({
        activityByMonth: months([4, 8, 20, 40, 50, 60]),
        activityRhythms: [
          rhythm("all", "All conversations", [4, 8, 20, 40, 50, 60]),
          rhythm("software", "Software", [2, 4, 8, 8, 7, 6]),
        ] as DeterministicReport["activityRhythms"],
      })
    );
    const lens = find(result.findings, "lens-software");

    expect(lens?.trend).toBe("fading");
    expect(lens?.earlyShare).toBeGreaterThan(lens?.recentShare ?? 1);
  });

  it("excludes the aggregate rhythm so 'all' is not reported as its own shift", () => {
    const result = buildHistoricalShifts(
      reportWith({
        activityByMonth: months([2, 4, 8, 12, 18, 24]),
        activityRhythms: [
          rhythm("all", "All conversations", [2, 4, 8, 12, 18, 24]),
        ] as DeterministicReport["activityRhythms"],
      })
    );

    expect(result.findings.filter((finding) => finding.family === "lens")).toEqual([]);
  });

  it("tracks each emotion as a share of that month's prompts and skips neutral", () => {
    const result = buildHistoricalShifts(
      reportWith({
        activityByMonth: months([1, 1, 1, 1, 1, 1]),
        emotions: {
          counts: emotionCounts({ frustration: 42, neutral: 60, curiosity: 6 }),
          byMonth: [
            { month: "2026-01", counts: emotionCounts({ frustration: 1, neutral: 19 }) },
            { month: "2026-02", counts: emotionCounts({ frustration: 2, neutral: 18 }) },
            { month: "2026-03", counts: emotionCounts({ frustration: 5, neutral: 15 }) },
            { month: "2026-04", counts: emotionCounts({ frustration: 10, neutral: 10 }) },
            { month: "2026-05", counts: emotionCounts({ frustration: 12, neutral: 8 }) },
            { month: "2026-06", counts: emotionCounts({ frustration: 12, neutral: 8 }) },
          ],
          sources: {},
          method: "test",
        } as DeterministicReport["emotions"],
      })
    );

    expect(find(result.findings, "emotion-frustration")?.trend).toBe("emerging");
    expect(find(result.findings, "emotion-neutral")).toBeUndefined();
    // curiosity has a nonzero total but no monthly evidence, so it stays unclassified
    expect(find(result.findings, "emotion-curiosity")).toBeUndefined();
  });

  it("orders findings by the size of the change, not by family", () => {
    const result = buildHistoricalShifts(
      reportWith({
        activityByMonth: months([10, 10, 10, 11, 10, 11]),
        activityRhythms: [
          rhythm("all", "All conversations", [10, 10, 10, 11, 10, 11]),
          rhythm("money", "Money", [1, 1, 1, 1, 1, 1]),
          rhythm("career", "Career", [0, 1, 2, 6, 8, 9]),
        ] as DeterministicReport["activityRhythms"],
      })
    );
    const magnitudes = result.findings.map((finding) => Math.abs(finding.momentum));

    expect(result.findings.length).toBeGreaterThan(1);
    expect(magnitudes).toEqual([...magnitudes].sort((left, right) => right - left));
    expect(result.findings[0]?.id).toBe("lens-career");
  });

  it("returns months sorted and a method that promises no model or network use", () => {
    const result = buildHistoricalShifts(
      reportWith({ activityByMonth: months([2, 4, 8, 12, 18, 24]).reverse() })
    );
    const labels = find(result.findings, "cadence-conversations")?.byMonth.map(
      (datum) => datum.label
    );

    expect(labels).toEqual([...(labels ?? [])].sort());
    expect(result.method).toMatch(/no embedding model, network call, or generated text/i);
  });
});
