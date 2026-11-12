import type {
  EfficiencyBucket,
  EfficiencyFinding,
  EfficiencyReport,
  EfficiencySession,
} from "./types";

// Session-length bands. Context is re-read every turn, so cost per turn rises
// with how long a session has already run — these bands make that visible.
const BANDS: Array<{ label: string; upTo: number }> = [
  { label: "Under 25 turns", upTo: 25 },
  { label: "25–74 turns", upTo: 75 },
  { label: "75–249 turns", upTo: 250 },
  { label: "250 turns and up", upTo: Number.POSITIVE_INFINITY },
];

function plural(count: number, singular: string): string {
  return `${count.toLocaleString()} ${singular}${count === 1 ? "" : "s"}`;
}

// Compact units, so a finding never reads "5766M".
function compact(value: number, unit: "tokens" | "bytes"): string {
  const steps: Array<[number, string]> =
    unit === "bytes"
      ? [
          [1e9, "GB"],
          [1e6, "MB"],
          [1e3, "kB"],
        ]
      : [
          [1e9, "B"],
          [1e6, "M"],
          [1e3, "k"],
        ];
  for (const [size, suffix] of steps) {
    if (value >= size) {
      const scaled = value / size;
      return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(1)}${suffix}`;
    }
  }
  return unit === "bytes" ? `${Math.round(value)} bytes` : `${Math.round(value)}`;
}

function numberAt(value: unknown, key: string): number {
  if (!value || typeof value !== "object") return 0;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

function pairs(value: unknown): Array<[string, number]> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is [string, number] =>
        Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "number"
    )
    .map((entry) => [entry[0], entry[1]] as [string, number]);
}

// Reads `efficiency.json`. Absent or malformed input yields no sessions rather
// than an error, so an older archive still produces a report.
export function parseEfficiency(value: unknown): EfficiencySession[] {
  if (!value || typeof value !== "object") return [];
  const raw = (value as { sessions?: unknown }).sessions;
  if (!Array.isArray(raw)) return [];

  const sessions: EfficiencySession[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== "string") continue;
    const tokens = record.tokens;
    sessions.push({
      id: record.id,
      source: typeof record.source === "string" ? record.source : "unknown",
      startedAt: numberAt(record, "started_at"),
      turns: numberAt(record, "turns"),
      tokens: {
        input: numberAt(tokens, "input"),
        output: numberAt(tokens, "output"),
        cacheRead: numberAt(tokens, "cache_read"),
        cacheWrite: numberAt(tokens, "cache_write"),
        reasoning: numberAt(tokens, "reasoning"),
      },
      toolCalls: numberAt(record, "tool_calls"),
      repeatedCalls: numberAt(record, "repeated_calls"),
      failedCalls: numberAt(record, "failed_calls"),
      toolResultBytes: numberAt(record, "tool_result_bytes"),
      wholeFileReads: numberAt(record, "whole_file_reads"),
      topTools: pairs(record.top_tools),
      topCommands: pairs(record.top_commands),
    });
  }
  return sessions;
}

function contextRead(session: EfficiencySession): number {
  return session.tokens.cacheRead + session.tokens.input;
}

function sum(sessions: EfficiencySession[], pick: (s: EfficiencySession) => number): number {
  return sessions.reduce((total, session) => total + pick(session), 0);
}

function concentrationOf(sorted: EfficiencySession[], total: number) {
  if (total === 0) return [];
  return [1, 5, 10, 25].map((percent) => {
    const count = Math.max(1, Math.floor((sorted.length * percent) / 100));
    const share = sum(sorted.slice(0, count), contextRead) / total;
    return { label: `Top ${percent}%`, sessions: count, share };
  });
}

function scalingOf(sessions: EfficiencySession[]): EfficiencyBucket[] {
  const buckets: EfficiencyBucket[] = [];
  let lower = 0;
  for (const band of BANDS) {
    // A session with no token record would drag the band's average down
    // without carrying any cost, so only measured sessions count.
    const inBand = sessions.filter(
      (session) =>
        session.turns >= lower &&
        session.turns < band.upTo &&
        session.turns > 0 &&
        contextRead(session) > 0
    );
    lower = band.upTo;
    if (inBand.length === 0) continue;
    const turns = sum(inBand, (session) => session.turns);
    buckets.push({
      label: band.label,
      sessions: inBand.length,
      tokensPerTurn: turns === 0 ? 0 : sum(inBand, contextRead) / turns,
    });
  }
  return buckets;
}

function commandTotals(sessions: EfficiencySession[]): Array<[string, number]> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    for (const [name, count] of session.topCommands) {
      totals.set(name, (totals.get(name) ?? 0) + count);
    }
  }
  return [...totals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 12);
}

function finding(
  id: string,
  severity: EfficiencyFinding["severity"],
  issue: string,
  cause: string,
  action: string,
  evidence: string
): EfficiencyFinding {
  return { id, severity, issue, cause, action, evidence };
}

function scalingFinding(scaling: EfficiencyBucket[]): EfficiencyFinding | null {
  if (scaling.length < 2) return null;
  const cheapest = scaling[0];
  const dearest = scaling.at(-1);
  if (!dearest || cheapest.tokensPerTurn === 0) return null;
  const ratio = dearest.tokensPerTurn / cheapest.tokensPerTurn;
  if (ratio < 2) return null;
  return finding(
    "session-length",
    ratio > 10 ? "high" : "medium",
    `A turn in your longest sessions costs ${Math.round(ratio)}× a turn in your shortest`,
    "Every turn re-reads the whole session so far, so the cost of one turn grows with how long the session has already run.",
    "End a session when the task ends. Starting a fresh one for the next task is the single largest saving available to you.",
    `${dearest.label}: ${compact(dearest.tokensPerTurn, "tokens")} tokens per turn against ${compact(cheapest.tokensPerTurn, "tokens")} for ${cheapest.label.toLowerCase()}.`
  );
}

// Below this, a "top 10%" share describes one or two sessions and says
// nothing: of course a handful of sessions holds most of a handful's cost.
const CONCENTRATION_MINIMUM_SESSIONS = 20;

function concentrationFinding(
  concentration: EfficiencyReport["concentration"],
  costliest: EfficiencyReport["costliest"],
  measured: number
): EfficiencyFinding | null {
  if (measured < CONCENTRATION_MINIMUM_SESSIONS) return null;
  const band = concentration.find((entry) => entry.label === "Top 10%");
  if (!band || band.share < 0.4) return null;
  const worst = costliest[0];
  return finding(
    "concentration",
    band.share > 0.6 ? "high" : "medium",
    `${Math.round(band.share * 100)}% of everything you spent went to ${plural(band.sessions, "session")}`,
    "A few very long threads dominate the bill. They are usually several tasks that never got separate sessions.",
    "Look at those sessions and find the point where the subject changed. That point is where a new session belonged.",
    worst
      ? `Costliest: ${worst.turns.toLocaleString()} turns in one session, ${compact(worst.contextRead, "tokens")} tokens of context re-read.`
      : `${plural(band.sessions, "session")} account for the majority of context reads.`
  );
}

function repeatFinding(totals: EfficiencyReport["totals"]): EfficiencyFinding | null {
  if (totals.repeatedCalls < 50) return null;
  const share = totals.toolCalls === 0 ? 0 : totals.repeatedCalls / totals.toolCalls;
  return finding(
    "repeated-calls",
    share > 0.05 ? "high" : "medium",
    `${totals.repeatedCalls.toLocaleString()} tool calls repeated work already done`,
    "These calls ran with arguments identical to an earlier call in the same session. The work was redone and its output re-read by every later turn.",
    "When you notice a re-read, say so: point at the earlier result instead of letting it be fetched again. Long sessions repeat most, which is another reason to end them sooner.",
    `${totals.repeatedCalls.toLocaleString()} of ${totals.toolCalls.toLocaleString()} calls (${(share * 100).toFixed(1)}%) were exact repeats.`
  );
}

function failureFinding(totals: EfficiencyReport["totals"]): EfficiencyFinding | null {
  if (totals.failedCalls < 25) return null;
  return finding(
    "failed-calls",
    "medium",
    `${totals.failedCalls.toLocaleString()} tool calls failed`,
    "A failed call costs its own tokens, its error output, and usually a retry — and the error stays in context for the rest of the session.",
    "Failures cluster around a few commands. Telling the agent the working directory, the package manager, and the test command up front removes most of them.",
    `${totals.failedCalls.toLocaleString()} calls returned an error.`
  );
}

function readFinding(totals: EfficiencyReport["totals"]): EfficiencyFinding | null {
  if (totals.wholeFileReads < 25) return null;
  return finding(
    "whole-file-reads",
    "low",
    `${totals.wholeFileReads.toLocaleString()} reads pulled in an entire file`,
    "A whole file entering context stays there, and every later turn pays to re-read it. Tool output is the bulk of what gets re-read.",
    "Ask for the part you need. A ranged read or a grep costs a fraction of the file and answers the same question.",
    `${totals.wholeFileReads.toLocaleString()} calls read a file with no range, and ${compact(totals.toolResultBytes, "bytes")} of tool output was returned in total.`
  );
}

export function buildEfficiencyReport(sessions: EfficiencySession[]): EfficiencyReport | null {
  const measured = sessions.filter((session) => session.turns > 0 || session.toolCalls > 0);
  if (measured.length === 0) return null;

  const sorted = [...measured].sort((left, right) => contextRead(right) - contextRead(left));
  const totalContext = sum(measured, contextRead);
  const totals: EfficiencyReport["totals"] = {
    sessions: measured.length,
    turns: sum(measured, (session) => session.turns),
    contextRead: totalContext,
    output: sum(measured, (session) => session.tokens.output + session.tokens.reasoning),
    toolCalls: sum(measured, (session) => session.toolCalls),
    repeatedCalls: sum(measured, (session) => session.repeatedCalls),
    failedCalls: sum(measured, (session) => session.failedCalls),
    wholeFileReads: sum(measured, (session) => session.wholeFileReads),
    toolResultBytes: sum(measured, (session) => session.toolResultBytes),
  };

  const costliest = sorted.slice(0, 5).map((session) => ({
    id: session.id,
    source: session.source,
    turns: session.turns,
    contextRead: contextRead(session),
  }));
  const scaling = scalingOf(measured);
  const concentration = concentrationOf(sorted, totalContext);

  const findings = [
    scalingFinding(scaling),
    concentrationFinding(concentration, costliest, measured.length),
    repeatFinding(totals),
    failureFinding(totals),
    readFinding(totals),
  ].filter((entry): entry is EfficiencyFinding => entry !== null);

  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((left, right) => order[left.severity] - order[right.severity]);

  return {
    totals,
    concentration,
    scaling,
    costliest,
    commands: commandTotals(measured),
    findings,
  };
}
