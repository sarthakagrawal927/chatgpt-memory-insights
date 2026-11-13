import { classifyTrend } from "./analysis";
import { buildHistoricalShifts } from "./historical-shifts";
import { buildDeterministicReport, classifyQuestionLensIds } from "./insights";
import type {
  ConversationRecord,
  DeterministicReport,
  EmotionBucket,
  FullReport,
  QuestionLens,
  TopicEdge,
  TopicNode,
} from "./types";

const LENSES = buildDeterministicReport([]).report.lenses.categories;
const LENS_IDS = LENSES.map(({ id }) => id);
const EMOTIONS: EmotionBucket[] = [
  "curiosity",
  "frustration",
  "urgency",
  "uncertainty",
  "excitement",
  "appreciation",
  "neutral",
];
const COLORS = ["#2157d5", "#168579", "#7554c8", "#d69a17", "#e44b33"];
type Pair = [number, number];
type Rhythm = [number, number, number, number, number];
type LensId = QuestionLens["id"];
type Lens = { id: LensId; queries: number; conversations: number; months: Pair[] };

/** The public artifact has only enumerated strings and numeric aggregates. */
export type DemoData = {
  version: 1;
  privacy: "aggregate-only";
  generatedAt: number;
  totals: DeterministicReport["totals"];
  dateRange: DeterministicReport["dateRange"];
  days: Pair[];
  months: Pair[];
  weekdays: number[];
  depth: DeterministicReport["depth"];
  rhythms: Array<{ id: "all" | LensId; months: Rhythm[] }>;
  lenses: Lens[];
  tone: { counts: number[]; months: Array<[number, number, number, number]> };
  emotions: { counts: number[]; months: number[][] };
  overlaps: Array<{ source: LensId; target: LensId; count: number }>;
};

function monthNumber(label: string): number {
  const [year, month] = label.split("-").map(Number);
  return year * 12 + month - 1;
}

function monthLabel(month: number): string {
  return `${Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, "0")}`;
}

function pairs(values: Array<{ label: string; value: number }>): Pair[] {
  return values.map(({ label, value }) => [monthNumber(label), value]);
}

export function createDemoData(
  conversations: ConversationRecord[],
  generatedAt = Date.now()
): DemoData {
  const { report } = buildDeterministicReport(conversations);
  const overlapCounts = new Map<string, number>();
  for (const conversation of conversations) {
    const ids = classifyQuestionLensIds(conversation.prompts.map(({ text }) => text)).sort();
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        const key = `${ids[left]}:${ids[right]}`;
        overlapCounts.set(key, (overlapCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const data: DemoData = {
    version: 1,
    privacy: "aggregate-only",
    generatedAt,
    totals: { ...report.totals },
    dateRange: { ...report.dateRange },
    days: (report.activityByDay ?? []).map(({ label, value }) => [
      Date.parse(label) / 86_400_000,
      value,
    ]),
    months: pairs(report.activityByMonth),
    weekdays: report.activityByWeekday.map(({ value }) => value),
    depth: { ...report.depth },
    rhythms: (report.activityRhythms ?? []).map(({ id, byMonth }) => ({
      id,
      months: byMonth.map(({ label, conversations: count, messages, userPrompts, words }) => [
        monthNumber(label),
        count,
        messages,
        userPrompts,
        words,
      ]),
    })),
    lenses: report.lenses.categories.map(({ id, queryCount, conversationCount, byMonth }) => ({
      id,
      queries: queryCount,
      conversations: conversationCount,
      months: pairs(byMonth),
    })),
    tone: {
      counts: [
        report.tone.counts.positive,
        report.tone.counts.neutral,
        report.tone.counts.negative,
      ],
      months: report.tone.byMonth.map(({ month, positive, neutral, negative }) => [
        monthNumber(month),
        positive,
        neutral,
        negative,
      ]),
    },
    emotions: {
      counts: EMOTIONS.map((id) => report.emotions.counts[id]),
      months: report.emotions.byMonth.map(({ month, counts }) => [
        monthNumber(month),
        ...EMOTIONS.map((id) => counts[id]),
      ]),
    },
    overlaps: [...overlapCounts].map(([key, count]) => {
      const [source, target] = key.split(":") as [LensId, LensId];
      return { source, target, count };
    }),
  };
  return parseDemoData(data);
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid demo object");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key)))
    throw new Error("Unexpected demo fields");
  return record;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1e14)
    throw new Error("Invalid demo count");
  return value;
}

function timestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10_000_000_000)
    throw new Error("Invalid demo timestamp");
  return value;
}

function list(value: unknown, limit = 30_000): unknown[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error("Invalid demo list");
  return value;
}

function numericRows(value: unknown, width: number): number[][] {
  const rows = list(value).map((row) => {
    const cells = list(row, width);
    if (cells.length !== width) throw new Error("Invalid demo row");
    return cells.map(count);
  });
  if (rows.some((row, index) => index > 0 && row[0] <= rows[index - 1][0]))
    throw new Error("Demo dates must be unique and ordered");
  return rows;
}

function counts(value: unknown, width: number): number[] {
  const values = list(value, width).map(count);
  if (values.length !== width) throw new Error("Invalid demo distribution");
  return values;
}

function lensId(value: unknown): LensId {
  if (!LENS_IDS.includes(value as LensId)) throw new Error("Invalid demo category");
  return value as LensId;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function reconcile(data: DemoData): void {
  const { totals } = data;
  const all = data.rhythms.find(({ id }) => id === "all");
  const same = (actual: number, expected: number) => {
    if (actual !== expected) throw new Error("Demo totals do not reconcile");
  };
  same(sum(data.months.map((row) => row[1])), totals.conversations);
  same(sum(data.days.map((row) => row[1])), totals.conversations);
  same(sum(data.weekdays), totals.conversations);
  same(data.days.length, totals.activeDays);
  same(data.depth.short + data.depth.medium + data.depth.deep, totals.conversations);
  same(sum(data.tone.counts), totals.userPrompts);
  same(sum(data.emotions.counts), totals.userPrompts);
  same(sum(data.tone.months.map((row) => sum(row.slice(1)))), totals.userPrompts);
  same(sum(data.emotions.months.map((row) => sum(row.slice(1)))), totals.userPrompts);
  if (!all) throw new Error("Demo is missing activity totals");
  [totals.conversations, totals.messages, totals.userPrompts, totals.words].forEach(
    (total, index) => {
      same(sum(all.months.map((row) => row[index + 1])), total);
    }
  );
  if (data.dateRange.start > data.dateRange.end || totals.longestStreak > totals.activeDays)
    throw new Error("Invalid demo range");
  for (const lens of data.lenses) {
    same(sum(lens.months.map((row) => row[1])), lens.queries);
    if (lens.queries > totals.userPrompts || lens.conversations > totals.conversations)
      throw new Error("Invalid demo category totals");
  }
  for (const overlap of data.overlaps) {
    const maximum = Math.min(
      ...[overlap.source, overlap.target].map(
        (id) => data.lenses.find((lens) => lens.id === id)?.conversations ?? 0
      )
    );
    if (overlap.source >= overlap.target || overlap.count > maximum)
      throw new Error("Invalid demo overlap");
  }
}

export function parseDemoData(value: unknown): DemoData {
  const source = object(value, [
    "version",
    "privacy",
    "generatedAt",
    "totals",
    "dateRange",
    "days",
    "months",
    "weekdays",
    "depth",
    "rhythms",
    "lenses",
    "tone",
    "emotions",
    "overlaps",
  ]);
  if (source.version !== 1 || source.privacy !== "aggregate-only")
    throw new Error("Unsupported demo version");
  const totals = object(source.totals, [
    "conversations",
    "messages",
    "userPrompts",
    "words",
    "activeDays",
    "longestStreak",
  ]);
  const range = object(source.dateRange, ["start", "end"]);
  const depth = object(source.depth, ["medianMessages", "short", "medium", "deep"]);
  const parseDistribution = (value: unknown, width: number) => {
    const distribution = object(value, ["counts", "months"]);
    return {
      counts: counts(distribution.counts, width),
      months: numericRows(distribution.months, width + 1),
    };
  };
  const data: DemoData = {
    version: 1,
    privacy: "aggregate-only",
    generatedAt: count(source.generatedAt),
    totals: Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [key, count(value)])
    ) as DemoData["totals"],
    dateRange: { start: timestamp(range.start), end: timestamp(range.end) },
    days: numericRows(source.days, 2) as Pair[],
    months: numericRows(source.months, 2) as Pair[],
    weekdays: counts(source.weekdays, 7),
    depth: {
      medianMessages: Number(depth.medianMessages),
      short: count(depth.short),
      medium: count(depth.medium),
      deep: count(depth.deep),
    },
    rhythms: list(source.rhythms, 11).map((value) => {
      const rhythm = object(value, ["id", "months"]);
      return {
        id: rhythm.id === "all" ? "all" : lensId(rhythm.id),
        months: numericRows(rhythm.months, 5) as Rhythm[],
      };
    }),
    lenses: list(source.lenses, 10).map((value) => {
      const lens = object(value, ["id", "queries", "conversations", "months"]);
      return {
        id: lensId(lens.id),
        queries: count(lens.queries),
        conversations: count(lens.conversations),
        months: numericRows(lens.months, 2) as Pair[],
      };
    }),
    tone: parseDistribution(source.tone, 3) as DemoData["tone"],
    emotions: parseDistribution(source.emotions, EMOTIONS.length),
    overlaps: list(source.overlaps, 45).map((value) => {
      const overlap = object(value, ["source", "target", "count"]);
      return {
        source: lensId(overlap.source),
        target: lensId(overlap.target),
        count: count(overlap.count),
      };
    }),
  };
  if (
    typeof depth.medianMessages !== "number" ||
    !Number.isFinite(depth.medianMessages) ||
    depth.medianMessages < 0
  )
    throw new Error("Invalid demo median");
  if (
    data.lenses.length !== 10 ||
    new Set(data.lenses.map(({ id }) => id)).size !== 10 ||
    data.rhythms.length !== 11 ||
    new Set(data.rhythms.map(({ id }) => id)).size !== 11
  )
    throw new Error("Missing or duplicate demo categories");
  if (
    new Set(data.overlaps.map(({ source, target }) => `${source}:${target}`)).size !==
    data.overlaps.length
  )
    throw new Error("Duplicate demo overlaps");
  reconcile(data);
  return data;
}

export function demoTopics(data: DemoData): { topics: TopicNode[]; edges: TopicEdge[] } {
  const totals = new Map(data.months.map(([month, count]) => [monthLabel(month), count]));
  const topics = data.lenses
    .filter(({ conversations }) => conversations > 0)
    .map((lens, index, all): TopicNode => {
      const series = data.rhythms.find(({ id }) => id === lens.id)?.months ?? [];
      const activityByMonth = data.months.map(([month]) => ({
        label: monthLabel(month),
        value: series.find((row) => row[0] === month)?.[1] ?? 0,
      }));
      const angle = (index / all.length) * Math.PI * 2 - Math.PI / 2;
      return {
        id: lens.id,
        label: LENSES.find(({ id }) => id === lens.id)!.label,
        count: lens.conversations,
        x: 400 + Math.cos(angle) * 270,
        y: 240 + Math.sin(angle) * 165,
        color: COLORS[index % COLORS.length],
        terms: [],
        activityByMonth,
        ...classifyTrend(activityByMonth, totals),
        sources: [],
      };
    });
  const edges = data.overlaps
    .filter(({ count }) => count > 0)
    .map(
      ({ source, target, count }): TopicEdge => ({
        source,
        target,
        similarity:
          count /
          Math.max(
            1,
            Math.min(
              data.lenses.find(({ id }) => id === source)!.conversations,
              data.lenses.find(({ id }) => id === target)!.conversations
            )
          ),
      })
    );
  return { topics, edges };
}

export function demoReport(data: DemoData): FullReport & {
  demo: {
    privacy: "aggregate-only";
    graphMethod: "question-domain-cooccurrence";
    topics: TopicNode[];
    edges: TopicEdge[];
  };
} {
  const empty = buildDeterministicReport([]).report;
  const byMonth = (values: Pair[]) =>
    values.map(([month, value]) => ({ label: monthLabel(month), value }));
  const emotionCounts = (values: number[]) =>
    Object.fromEntries(EMOTIONS.map((id, index) => [id, values[index]])) as Record<
      EmotionBucket,
      number
    >;
  const deterministic: DeterministicReport = {
    ...empty,
    totals: { ...data.totals },
    dateRange: { ...data.dateRange },
    depth: { ...data.depth },
    activityByDay: data.days.map(([day, value]) => ({
      label: new Date(day * 86_400_000).toISOString().slice(0, 10),
      value,
      sources: [],
    })),
    activityByMonth: byMonth(data.months),
    activityByWeekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, index) => ({
      label,
      value: data.weekdays[index],
    })),
    activityRhythms: data.rhythms.map(({ id, months }) => ({
      id,
      label: id === "all" ? "All conversations" : LENSES.find((lens) => lens.id === id)!.label,
      byMonth: months.map(([month, conversations, messages, userPrompts, words]) => ({
        label: monthLabel(month),
        conversations,
        messages,
        userPrompts,
        words,
      })),
    })),
    lenses: {
      ...empty.lenses,
      categories: data.lenses.map((lens) => ({
        ...LENSES.find(({ id }) => id === lens.id)!,
        queryCount: lens.queries,
        conversationCount: lens.conversations,
        byMonth: byMonth(lens.months),
        sources: [],
      })),
    },
    tone: {
      ...empty.tone,
      counts: {
        positive: data.tone.counts[0],
        neutral: data.tone.counts[1],
        negative: data.tone.counts[2],
      },
      byMonth: data.tone.months.map(([month, positive, neutral, negative]) => ({
        month: monthLabel(month),
        positive,
        neutral,
        negative,
      })),
      negativeRate: data.totals.userPrompts ? data.tone.counts[2] / data.totals.userPrompts : 0,
    },
    emotions: {
      ...empty.emotions,
      counts: emotionCounts(data.emotions.counts),
      byMonth: data.emotions.months.map(([month, ...values]) => ({
        month: monthLabel(month),
        counts: emotionCounts(values),
      })),
    },
  };
  deterministic.shifts = buildHistoricalShifts(deterministic);
  return {
    generatedAt: data.generatedAt,
    fileName: "Privacy-safe demo",
    analysis: {
      modelProfile: "auto",
      confidence: 65,
      resolvedModelProfile: "compact",
      confidencePreset: "balanced",
      profileReason: "Aggregate demo; no embedding model is used.",
    },
    deterministic,
    semantic: null,
    reflections: [],
    demo: {
      privacy: "aggregate-only",
      graphMethod: "question-domain-cooccurrence",
      ...demoTopics(data),
    },
  };
}
