import type { FullReport, ReflectionQuestion, SourceRef, UserPrompt } from "./types";
import { promptEmotion } from "./insights";

const SIX_MONTHS = 60 * 60 * 24 * 183;
const ONE_YEAR = 60 * 60 * 24 * 365;

function clip(value: string, length = 120): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > length ? `${singleLine.slice(0, length - 1).trimEnd()}…` : singleLine;
}

function monthLabel(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, monthIndex - 1, 1))
  );
}

function uniqueSources(sources: SourceRef[], limit = 12): SourceRef[] {
  const seen = new Set<string>();
  return sources
    .filter((source) => {
      const key = `${source.conversationId}:${source.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function buildReflectionQuestions(
  report: FullReport,
  prompts: UserPrompt[]
): ReflectionQuestion[] {
  const questions: ReflectionQuestion[] = [];
  const latestDate = report.deterministic.dateRange.end;
  const exact = report.deterministic.exactRepeats[0];
  const semantic = report.semantic?.repeats[0];
  const strongestRepeat =
    semantic && (!exact || semantic.count > exact.count)
      ? {
          id: semantic.id,
          wording: semantic.representative,
          count: semantic.count,
          confidence: semantic.confidence,
          sources: semantic.sources,
          kind: "similar intent",
        }
      : exact
        ? {
            id: exact.id,
            wording: exact.representative,
            count: exact.count,
            confidence: 0.99,
            sources: exact.sources,
            kind: "nearly the same wording",
          }
        : null;

  if (strongestRepeat) {
    questions.push({
      id: `repeat:${strongestRepeat.id}`,
      kind: "repeat",
      eyebrow: "A question you return to",
      question: `You asked “${clip(strongestRepeat.wording, 92)}” ${strongestRepeat.count} times. Are you looking for a different answer—or postponing a decision?`,
      reason: `Detected from ${strongestRepeat.kind}.`,
      confidence: strongestRepeat.confidence,
      sources: uniqueSources(strongestRepeat.sources),
    });
  }

  const facts = report.semantic?.facts ?? [];
  const updated = facts
    .filter((fact) => fact.status === "updated")
    .sort((left, right) => right.lastSeen - left.lastSeen)[0];
  if (updated) {
    const linkedStatements = `${updated.history.length} linked statement${updated.history.length === 1 ? "" : "s"}`;
    questions.push({
      id: `updated:${updated.id}`,
      kind: "changed-memory",
      eyebrow: "A memory that moved",
      question: `“${clip(updated.statement, 105)}” changed over time. What should a future answer assume now?`,
      reason: `${linkedStatements} include update wording.`,
      confidence: updated.confidence,
      sources: uniqueSources(updated.sources),
    });
  }

  const refuted = facts
    .filter((fact) => fact.status === "refuted")
    .sort((left, right) => right.lastSeen - left.lastSeen)[0];
  if (refuted) {
    const linkedStatements = `${refuted.history.length} linked statement${refuted.history.length === 1 ? "" : "s"}`;
    questions.push({
      id: `refuted:${refuted.id}`,
      kind: "refuted-memory",
      eyebrow: "An assumption you pushed back on",
      question: `You explicitly rejected “${clip(refuted.statement, 105)}” — is there an older assumption you want to retire completely?`,
      reason: `${linkedStatements} include explicit correction or refutation wording.`,
      confidence: refuted.confidence,
      sources: uniqueSources(refuted.sources),
    });
  }

  const contradicted = facts
    .filter((fact) => fact.status === "contradicted")
    .sort((left, right) => right.confidence - left.confidence || right.lastSeen - left.lastSeen)[0];
  if (contradicted) {
    questions.push({
      id: `contradicted:${contradicted.id}`,
      kind: "contradicted-memory",
      eyebrow: "Two memories may disagree",
      question: `Your history links differing versions of “${clip(contradicted.statement, 96)}”. Which version should future answers trust?`,
      reason: contradicted.reason,
      confidence: contradicted.confidence,
      sources: uniqueSources(contradicted.sources),
    });
  }

  const frustrationMonths = report.deterministic.emotions.byMonth
    .map(({ month, counts }) => {
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
      return {
        month,
        count: counts.frustration,
        rate: total ? counts.frustration / total : 0,
        total,
      };
    })
    .filter((item) => item.count >= 3 && item.total >= 8)
    .sort((left, right) => right.rate - left.rate || right.count - left.count)[0];
  if (frustrationMonths) {
    const sources = prompts
      .filter(
        (prompt) =>
          new Date(prompt.date * 1_000).toISOString().slice(0, 7) === frustrationMonths.month &&
          promptEmotion(prompt.text) === "frustration"
      )
      .map(({ conversationId, title, date }) => ({ conversationId, title, date }));
    questions.push({
      id: `wording:${frustrationMonths.month}`,
      kind: "wording-spike",
      eyebrow: "A month with more friction-shaped language",
      question: `Frustration-shaped wording peaked in ${monthLabel(frustrationMonths.month)}. Which topic was creating friction—and did it get resolved?`,
      reason: `${frustrationMonths.count} of ${frustrationMonths.total} queries that month matched the disclosed local vocabulary.`,
      confidence: Math.min(0.92, 0.58 + frustrationMonths.rate),
      sources: uniqueSources(sources),
    });
  }

  const stale = facts
    .filter(
      (fact) =>
        fact.status === "current" &&
        latestDate > 0 &&
        fact.lastSeen > 0 &&
        latestDate - fact.lastSeen >= ONE_YEAR
    )
    .sort((left, right) => left.lastSeen - right.lastSeen)[0];
  if (stale) {
    questions.push({
      id: `stale:${stale.id}`,
      kind: "stale-memory",
      eyebrow: "A memory worth rechecking",
      question: `“${clip(stale.statement, 110)}” has not been restated in over a year. Is it still true?`,
      reason: "Shown because this current-looking memory is old relative to the export.",
      confidence: 0.78,
      sources: uniqueSources(stale.sources),
    });
  }

  const dormant = (report.semantic?.topics ?? [])
    .map((topic) => ({
      topic,
      lastSeen: Math.max(0, ...topic.sources.map((source) => source.date)),
    }))
    .filter(
      ({ topic, lastSeen }) =>
        topic.count >= 3 && latestDate > 0 && lastSeen > 0 && latestDate - lastSeen >= SIX_MONTHS
    )
    .sort((left, right) => right.topic.count - left.topic.count)[0];
  if (dormant) {
    questions.push({
      id: `dormant:${dormant.topic.id}`,
      kind: "dormant-theme",
      eyebrow: "A line that went quiet",
      question: `You explored ${dormant.topic.label} across ${dormant.topic.count} conversations, then the trail went quiet. Finished—or dormant?`,
      reason:
        "This substantial topic has no supporting conversation in the final six months of the export.",
      confidence: Math.min(0.92, 0.62 + dormant.topic.count / 100),
      sources: uniqueSources(dormant.topic.sources),
    });
  }

  const recurringTerm = report.deterministic.recurringTerms.find((term) => term.value >= 5);
  if (recurringTerm) {
    const termPattern = new RegExp(
      `\\b${recurringTerm.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    );
    const sources = prompts
      .filter((prompt) => termPattern.test(`${prompt.title} ${prompt.text}`))
      .map(({ conversationId, title, date }) => ({ conversationId, title, date }));
    questions.push({
      id: `term:${recurringTerm.label}`,
      kind: "recurring-term",
      eyebrow: "A word that connects many routes",
      question: `“${recurringTerm.label}” appeared across ${recurringTerm.value} conversations. Is it a durable priority, a recurring obstacle, or simply background vocabulary?`,
      reason: "This is the most widespread distinctive term in conversation titles and prompts.",
      confidence: Math.min(0.94, 0.62 + recurringTerm.value / 100),
      sources: uniqueSources(sources),
    });
  }

  const busiestMonth = report.deterministic.activityByMonth
    .filter((month) => month.label !== "Unknown")
    .sort((left, right) => right.value - left.value)[0];
  if (busiestMonth && report.deterministic.activityByMonth.length > 1) {
    const sources = prompts
      .filter(
        (prompt) => new Date(prompt.date * 1_000).toISOString().slice(0, 7) === busiestMonth.label
      )
      .map(({ conversationId, title, date }) => ({ conversationId, title, date }));
    questions.push({
      id: `activity:${busiestMonth.label}`,
      kind: "activity-peak",
      eyebrow: "Your busiest station",
      question: `${monthLabel(busiestMonth.label)} held ${busiestMonth.value} conversations—your busiest month here. What changed in what you were building, learning, or deciding?`,
      reason: "This month contains the most conversations in the export.",
      confidence: 0.82,
      sources: uniqueSources(sources),
    });
  }

  return questions.slice(0, 6);
}
