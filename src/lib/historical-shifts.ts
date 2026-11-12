import { classifyTrend } from "./analysis";
import type {
  CountDatum,
  DeterministicReport,
  EmotionBucket,
  HistoricalShiftReport,
  ShiftFamily,
  ShiftFinding,
} from "./types";

const METHOD =
  "Deterministic period-over-period comparison of the report's own monthly series. " +
  "Each series is normalized to its share of that month's activity, then classified by " +
  "the shared trend rule. No embedding model, network call, or generated text is involved.";

function totalsFor(series: CountDatum[]): Map<string, number> {
  return new Map(series.map(({ label, value }) => [label, value]));
}

function shareAt(series: CountDatum[], totals: Map<string, number> | null): number[] {
  return series.map(({ label, value }) =>
    totals ? value / Math.max(1, totals.get(label) ?? 0) : value
  );
}

function averageOf(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function edgeShares(
  series: CountDatum[],
  totals: Map<string, number> | null
): { earlyShare: number; recentShare: number } {
  const ordered = [...series].sort((left, right) => left.label.localeCompare(right.label));
  const shares = shareAt(ordered, totals);
  const edge = Math.max(1, Math.floor(shares.length / 3));
  return {
    earlyShare: averageOf(shares.slice(0, edge)),
    recentShare: averageOf(shares.slice(-edge)),
  };
}

function toFinding(
  family: ShiftFamily,
  id: string,
  label: string,
  series: CountDatum[],
  totals: Map<string, number> | null
): ShiftFinding {
  const { trend, momentum } = classifyTrend(series, totals);
  const { earlyShare, recentShare } = edgeShares(series, totals);
  return {
    id,
    family,
    label,
    trend,
    momentum,
    earlyShare,
    recentShare,
    byMonth: [...series].sort((left, right) => left.label.localeCompare(right.label)),
  };
}

function cadenceFinding(report: DeterministicReport): ShiftFinding {
  return toFinding(
    "cadence",
    "cadence-conversations",
    "Conversations per month",
    report.activityByMonth,
    null
  );
}

function lensFindings(report: DeterministicReport): ShiftFinding[] {
  const totals = totalsFor(report.activityByMonth);
  const rhythms = report.activityRhythms ?? [];
  return rhythms
    .filter((rhythm) => rhythm.id !== "all")
    .map((rhythm) =>
      toFinding(
        "lens",
        `lens-${rhythm.id}`,
        rhythm.label,
        rhythm.byMonth.map(({ label, conversations }) => ({ label, value: conversations })),
        totals
      )
    );
}

function emotionTotals(report: DeterministicReport): Map<string, number> {
  return new Map(
    report.emotions.byMonth.map(({ month, counts }) => [
      month,
      Object.values(counts).reduce((total, value) => total + value, 0),
    ])
  );
}

function emotionFindings(report: DeterministicReport): ShiftFinding[] {
  const byMonth = report.emotions.byMonth;
  if (byMonth.length === 0) return [];
  const totals = emotionTotals(report);
  const buckets = Object.keys(report.emotions.counts) as EmotionBucket[];
  return buckets
    .filter((bucket) => bucket !== "neutral" && report.emotions.counts[bucket] > 0)
    .map((bucket) =>
      toFinding(
        "emotion",
        `emotion-${bucket}`,
        bucket,
        byMonth.map(({ month, counts }) => ({ label: month, value: counts[bucket] })),
        totals
      )
    );
}

/**
 * Surfaces how a history changed rather than only what it contains.
 *
 * This reuses the same trend rule the semantic topic graph uses, but reads the
 * deterministic report's existing monthly series instead of embedding clusters,
 * so historical shifts are available before — and without — any model download.
 */
export function buildHistoricalShifts(report: DeterministicReport): HistoricalShiftReport {
  const findings = [
    cadenceFinding(report),
    ...lensFindings(report),
    ...emotionFindings(report),
  ].filter((finding) => finding.trend !== "insufficient");

  return {
    months: report.activityByMonth.length,
    method: METHOD,
    findings: findings.sort(
      (left, right) =>
        Math.abs(right.momentum) - Math.abs(left.momentum) || left.id.localeCompare(right.id)
    ),
  };
}
