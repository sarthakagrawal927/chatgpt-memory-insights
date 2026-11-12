import type {
  AnalysisResolution,
  AnalysisSettings,
  ConfidencePreset,
  CountDatum,
  ModelProfile,
  ResolvedModelProfile,
  ThreadBoundary,
  ThreadPrompt,
  ThreadStrand,
  TrendState,
} from "./types";

const CONFIDENCE_PRESETS = {
  exploratory: 45,
  balanced: 65,
  conservative: 82,
} as const;

const THREAD_STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "been",
  "before",
  "being",
  "could",
  "from",
  "have",
  "into",
  "just",
  "like",
  "more",
  "need",
  "please",
  "should",
  "that",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "want",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your",
]);

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function confidencePreset(value: number): ConfidencePreset {
  const normalized = clampConfidence(value);
  const entry = Object.entries(CONFIDENCE_PRESETS).find(([, score]) => score === normalized);
  return (entry?.[0] as ConfidencePreset | undefined) ?? "custom";
}

export function confidenceThreshold(value: number): number {
  return clampConfidence(value) / 100;
}

export function evidenceConfidence(
  semanticSimilarity: number,
  lexicalSimilarity: number,
  cueBonus = 0
): number {
  return Math.max(
    0,
    Math.min(0.99, semanticSimilarity * 0.82 + Math.min(1, lexicalSimilarity * 3) * 0.18 + cueBonus)
  );
}

function countLetters(value: string): { letters: number; nonLatin: number } {
  let letters = 0;
  let nonLatin = 0;
  for (const character of value) {
    if (!/\p{L}/u.test(character)) continue;
    letters += 1;
    if (
      /[\p{Script=Arabic}\p{Script=Armenian}\p{Script=Bengali}\p{Script=Cyrillic}\p{Script=Devanagari}\p{Script=Georgian}\p{Script=Greek}\p{Script=Gujarati}\p{Script=Gurmukhi}\p{Script=Han}\p{Script=Hangul}\p{Script=Hebrew}\p{Script=Hiragana}\p{Script=Kannada}\p{Script=Katakana}\p{Script=Malayalam}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Thai}]/u.test(
        character
      )
    ) {
      nonLatin += 1;
    }
  }
  return { letters, nonLatin };
}

export function resolveAnalysisSettings(
  settings: AnalysisSettings,
  promptTexts: string[]
): AnalysisResolution {
  const confidence = clampConfidence(settings.confidence);
  let resolvedModelProfile: ResolvedModelProfile;
  let profileReason: string;

  if (settings.modelProfile !== "auto") {
    resolvedModelProfile = settings.modelProfile;
    profileReason =
      settings.modelProfile === "multilingual"
        ? "You selected multilingual semantic analysis."
        : "You selected the smaller English semantic model.";
  } else {
    const sampled = promptTexts.slice(0, 1_200).join("\n").slice(0, 240_000);
    const { letters, nonLatin } = countLetters(sampled);
    const nonLatinShare = letters ? nonLatin / letters : 0;
    resolvedModelProfile = letters >= 80 && nonLatinShare >= 0.04 ? "multilingual" : "compact";
    profileReason =
      resolvedModelProfile === "multilingual"
        ? `Automatic mode found ${Math.round(nonLatinShare * 100)}% supported non-Latin-script letters in its sample.`
        : "Automatic mode found a predominantly Latin-script history. Choose multilingual manually for non-English Latin-script histories.";
  }

  return {
    modelProfile: settings.modelProfile,
    resolvedModelProfile,
    confidence,
    confidencePreset: confidencePreset(confidence),
    profileReason,
  };
}

export function monthKey(timestamp: number): string {
  return new Date(timestamp * 1_000).toISOString().slice(0, 7);
}

export function classifyTrend(
  series: CountDatum[],
  totals: Map<string, number> | null = null
): { trend: TrendState; momentum: number } {
  const ordered = [...series].sort((left, right) => left.label.localeCompare(right.label));
  const sum = ordered.reduce((total, datum) => total + datum.value, 0);
  if (ordered.length < 3 || sum < 4) return { trend: "insufficient", momentum: 0 };

  const normalized = ordered.map((datum) =>
    totals ? datum.value / Math.max(1, totals.get(datum.label) ?? 0) : datum.value
  );
  const third = Math.max(1, Math.floor(normalized.length / 3));
  const early = normalized.slice(0, third);
  const middle = normalized.slice(third, -third);
  const recent = normalized.slice(-third);
  const earlyCount = ordered.slice(0, third).reduce((total, datum) => total + datum.value, 0);
  const recentCount = ordered.slice(-third).reduce((total, datum) => total + datum.value, 0);
  const average = (values: number[]) =>
    values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
  const earlyAverage = average(early);
  const recentAverage = average(recent);
  const momentum = Math.max(
    -1,
    Math.min(1, (recentAverage - earlyAverage) / Math.max(0.01, earlyAverage || recentAverage))
  );

  if (
    early.some((value) => value > 0) &&
    recent.some((value) => value > 0) &&
    middle.length >= 2 &&
    middle.every((value) => value === 0)
  ) {
    return { trend: "resurfacing", momentum };
  }
  if (recentCount >= 2 && momentum >= 0.45) {
    return { trend: "emerging", momentum };
  }
  if (earlyCount >= 2 && momentum <= -0.45) {
    return { trend: "fading", momentum };
  }
  return { trend: "steady", momentum };
}

function strandLabel(prompts: ThreadPrompt[], fallback: string): string {
  const counts = new Map<string, number>();
  for (const prompt of prompts) {
    const terms = new Set(
      prompt.text
        .toLocaleLowerCase()
        .normalize("NFKC")
        .match(/[\p{L}\p{N}]{4,}/gu)
        ?.filter((term) => !THREAD_STOP_WORDS.has(term) && !/^\d+$/u.test(term)) ?? []
    );
    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  const terms = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([term]) => term.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase()));
  return terms.join(" · ") || fallback;
}

export function buildThreadStrands(
  prompts: ThreadPrompt[],
  boundaries: ThreadBoundary[],
  threshold: number
): ThreadStrand[] {
  if (prompts.length === 0) return [];
  const splitPoints = boundaries
    .filter((boundary) => boundary.confidence >= threshold)
    .map((boundary) => boundary.at)
    .filter((at) => at > 0 && at < prompts.length)
    .sort((left, right) => left - right);
  const points = [0, ...new Set(splitPoints), prompts.length];
  const strands: ThreadStrand[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const firstPrompt = points[index];
    const lastPrompt = points[index + 1] - 1;
    const members = prompts.slice(firstPrompt, lastPrompt + 1);
    strands.push({
      id: `strand-${index}`,
      label: strandLabel(members, `Thread ${index + 1}`),
      promptCount: members.length,
      firstPrompt,
      lastPrompt,
      snippets: members.slice(0, 3).map((prompt) => prompt.text),
      sources: members.slice(0, 6).map((prompt) => prompt.source),
    });
  }
  return strands;
}

export function normalizeSettings(input?: Partial<AnalysisSettings>): AnalysisSettings {
  const modelProfile: ModelProfile =
    input?.modelProfile === "compact" || input?.modelProfile === "multilingual"
      ? input.modelProfile
      : "auto";
  return {
    modelProfile,
    confidence: clampConfidence(input?.confidence ?? CONFIDENCE_PRESETS.balanced),
  };
}
