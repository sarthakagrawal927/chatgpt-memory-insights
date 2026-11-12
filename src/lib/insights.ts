import { buildHistoricalShifts } from "./historical-shifts";
import type {
  ConversationRecord,
  DeterministicReport,
  EmotionBucket,
  ExactRepeat,
  FactCandidate,
  QuestionLens,
  QuestionLensReport,
  SourceRef,
  ToneBucket,
  UserPrompt,
} from "./types";

const STOP_WORDS = new Set(
  "about after again against also and anything are because been before being between both but can could details did does doing down during each few for from further good had has have having here how into its itself just know like make maybe more most much need okay other our out over own please really right same should show some something such tell than that the their theirs them themselves then there these they thing things think this those through too under until use using very want was way were what when where which while who why will with would yes you your yours yourself yourselves give explain create build".split(
    " "
  )
);

const POSITIVE_WORDS = new Set(
  "awesome best better calm clear confident effective excited excellent good great happy helpful improve improved love nice perfect progress proud ready relieved success useful win wonderful".split(
    " "
  )
);

const NEGATIVE_WORDS = new Set(
  "angry annoyed anxious awful bad broken confused difficult disappointed error fail failed failing frustrated hate hard horrible issue negative problem sad scared stuck terrible tired unhappy useless worse worst wrong".split(
    " "
  )
);

const NEGATIONS = new Set(["not", "never", "no", "hardly", "without", "isn't", "don't", "can't"]);

const EMOTION_TERMS: Record<Exclude<EmotionBucket, "neutral">, RegExp[]> = {
  curiosity: [/\b(?:why|how|what|wonder|curious|explain|understand|learn|explore|discover)\b/i],
  frustration: [
    /\b(?:stuck|broken|fail(?:ed|ing)?|error|annoyed|frustrat(?:ed|ing)|hate|wrong|again|useless|doesn'?t work|not working)\b/i,
  ],
  urgency: [/\b(?:urgent|asap|quickly|right now|immediately|deadline|hurry|today)\b/i],
  uncertainty: [/\b(?:unsure|maybe|might|could|perhaps|confused|not sure|uncertain|i guess)\b/i],
  excitement: [/\b(?:excited|amazing|awesome|love|can'?t wait|great|wonderful|super excited)\b/i],
  appreciation: [/\b(?:thanks|thank you|appreciate|helpful|grateful)\b/i],
};

const EMOTION_PRIORITY: EmotionBucket[] = [
  "frustration",
  "urgency",
  "uncertainty",
  "excitement",
  "appreciation",
  "curiosity",
  "neutral",
];

const QUESTION_LENSES: Array<
  Pick<QuestionLens, "id" | "label" | "description"> & { patterns: RegExp[] }
> = [
  {
    id: "math",
    label: "Math & quantitative",
    description:
      "Calculations, equations, probability, statistics, ratios, and mathematical notation",
    patterns: [
      /\b(?:calculate|calculation|equation|algebra|geometry|probability|statistics|derivative|integral|matrix|percentage|percent|ratio|average|median|maths?|arithmetic)\b/i,
      /\d+(?:\.\d+)?\s*(?:[+\-*/^=]|percent of)\s*\d+/i,
    ],
  },
  {
    id: "health",
    label: "Health & body",
    description: "Symptoms, medicine, nutrition, sleep, mental health, and care questions",
    patterns: [
      /\b(?:health|symptom|doctor|medicine|medical|pain|sleep|calories|protein|nutrition|diet|injury|anxiety|depression|therapy|blood|heart|body|disease|diagnosis)\b/i,
    ],
  },
  {
    id: "software",
    label: "Software & debugging",
    description: "Code, architecture, databases, errors, tooling, and technical implementation",
    patterns: [
      /\b(?:code|coding|programming|software|bug|debug|error|database|api|typescript|javascript|python|rust|react|astro|repository|git|deploy|server|frontend|backend)\b/i,
    ],
  },
  {
    id: "money",
    label: "Money & investing",
    description: "Investing, companies, budgeting, tax, valuation, and purchase decisions",
    patterns: [
      /\b(?:money|invest|investing|stock|portfolio|market|company|valuation|earnings|budget|tax|finance|financial|buy|sell|expense|salary)\b/i,
    ],
  },
  {
    id: "career",
    label: "Career & work",
    description: "Jobs, interviews, workplace decisions, management, and professional growth",
    patterns: [
      /\b(?:career|job|interview|resume|workplace|manager|promotion|professional|engineer|employment|hiring|role)\b/i,
    ],
  },
  {
    id: "learning",
    label: "Learning & explanation",
    description: "Requests to learn, understand, compare, study, or practice a subject",
    patterns: [
      /\b(?:learn|learning|understand|explain|teach|study|course|practice|tutorial|difference between|compare)\b/i,
    ],
  },
  {
    id: "creative",
    label: "Writing & creative work",
    description: "Writing, stories, design, naming, images, and other creative production",
    patterns: [
      /\b(?:write|writing|story|essay|design|creative|image|illustration|name|naming|poem|script|character|visual)\b/i,
    ],
  },
  {
    id: "relationships",
    label: "Relationships & communication",
    description: "Friends, family, dating, conflict, social dynamics, and communication",
    patterns: [
      /\b(?:relationship|friend|family|dating|partner|girlfriend|boyfriend|marriage|social|communicat|conflict|conversation)\b/i,
    ],
  },
  {
    id: "travel",
    label: "Travel & places",
    description: "Trips, cities, transport, hotels, itineraries, and geographic comparisons",
    patterns: [
      /\b(?:travel|trip|flight|hotel|city|country|itinerary|visa|train|airport|tourism|vacation)\b/i,
    ],
  },
  {
    id: "planning",
    label: "Planning & decisions",
    description: "Plans, priorities, schedules, habits, trade-offs, and what to do next",
    patterns: [
      /\b(?:plan|planning|priority|prioritize|schedule|routine|habit|decision|decide|roadmap|next step|todo|goal)\b/i,
    ],
  },
];

export function classifyQuestionLensIds(values: Iterable<string>): QuestionLens["id"][] {
  const texts = [...values];
  return QUESTION_LENSES.filter(({ patterns }) =>
    texts.some((value) => patterns.some((pattern) => pattern.test(value)))
  ).map(({ id }) => id);
}

const TYPO_SUGGESTIONS: Record<string, string> = {
  alot: "a lot",
  becuase: "because",
  calender: "calendar",
  definately: "definitely",
  enviroment: "environment",
  goverment: "government",
  lenght: "length",
  recieve: "receive",
  seperate: "separate",
  strenght: "strength",
  teh: "the",
  thier: "their",
  untill: "until",
  wierd: "weird",
  wieght: "weight",
  accomodate: "accommodate",
  adress: "address",
  arguement: "argument",
  begining: "beginning",
  comming: "coming",
  concious: "conscious",
  cueries: "queries",
  dependancy: "dependency",
  existance: "existence",
  occured: "occurred",
  prefered: "preferred",
  relevent: "relevant",
  sucess: "success",
};

const FACT_PATTERNS = [
  /\b(?:i am|i'm|i have|i've|i use|i prefer|i like|i dislike|i love|i hate|i want|i need|i work|i live|i own|i believe|i value)\b/i,
  /\bmy\s+[\p{L}\p{N}'’-]{2,}(?:\s+[\p{L}\p{N}'’-]{2,}){0,5}\s+(?:is|are|was|were)\b/iu,
  /\b(?:remember that|from now on|for future reference)\s+i\b/i,
  /\bi\s+(?:no longer|do not|don't|never)\s+(?:have|use|prefer|like|want|need|work|live|own|believe|value)\b/i,
];

const UPDATE_CUES = /\b(?:actually|now|instead|from now on|changed?|correction|update|used to)\b/i;
const REFUTATION_CUES =
  /\b(?:no longer|(?:do not|don't|never)\s+(?:have|use|prefer|like|want|need|work|live|own|believe|value)|not true|isn't true|incorrect|wrong about|stop(?:ped)?|refute|reject)\b/i;

function normalizeText(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function monthKey(timestamp: number): string {
  if (!timestamp) return "Unknown";
  return new Date(timestamp * 1_000).toISOString().slice(0, 7);
}

function dateKey(timestamp: number): string {
  if (!timestamp) return "unknown";
  return new Date(timestamp * 1_000).toISOString().slice(0, 10);
}

function countLongestStreak(timestamps: number[]): number {
  const days = [...new Set(timestamps.filter(Boolean).map(dateKey))]
    .filter((day) => day !== "unknown")
    .sort();
  let longest = 0;
  let current = 0;
  let previous = 0;

  for (const day of days) {
    const value = Date.parse(`${day}T00:00:00Z`) / 86_400_000;
    current = previous && value === previous + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = value;
  }
  return longest;
}

function promptTone(text: string): ToneBucket {
  const words = normalizeText(text).split(" ").filter(Boolean);
  let score = 0;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const negated = words
      .slice(Math.max(0, index - 3), index)
      .some((candidate) => NEGATIONS.has(candidate));
    const weight = words[index - 1] === "very" || words[index - 1] === "really" ? 2 : 1;
    if (POSITIVE_WORDS.has(word)) score += negated ? -weight : weight;
    if (NEGATIVE_WORDS.has(word)) score += negated ? weight : -weight;
  }
  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return "neutral";
}

function buildTone(prompts: UserPrompt[]): DeterministicReport["tone"] {
  const counts = { positive: 0, neutral: 0, negative: 0 };
  const monthly = new Map<string, typeof counts>();

  for (const prompt of prompts) {
    const tone = promptTone(prompt.text);
    counts[tone] += 1;
    const key = monthKey(prompt.date);
    const bucket = monthly.get(key) ?? { positive: 0, neutral: 0, negative: 0 };
    bucket[tone] += 1;
    monthly.set(key, bucket);
  }

  return {
    counts,
    byMonth: [...monthly.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, value]) => ({ month, ...value })),
    negativeRate: prompts.length === 0 ? 0 : counts.negative / prompts.length,
    method:
      "Local lexical estimate with negation handling. It measures wording in your queries, not mood or personality.",
  };
}

export function promptEmotion(text: string): EmotionBucket {
  const scores = new Map<EmotionBucket, number>();
  for (const [bucket, patterns] of Object.entries(EMOTION_TERMS) as Array<
    [Exclude<EmotionBucket, "neutral">, RegExp[]]
  >) {
    scores.set(
      bucket,
      patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0)
    );
  }
  return EMOTION_PRIORITY.reduce((best, candidate) => {
    const bestScore = scores.get(best) ?? 0;
    const candidateScore = scores.get(candidate) ?? 0;
    return candidateScore > bestScore ? candidate : best;
  }, "neutral" as EmotionBucket);
}

function emptyEmotionCounts(): Record<EmotionBucket, number> {
  return {
    curiosity: 0,
    frustration: 0,
    urgency: 0,
    uncertainty: 0,
    excitement: 0,
    appreciation: 0,
    neutral: 0,
  };
}

function buildEmotions(prompts: UserPrompt[]): DeterministicReport["emotions"] {
  const counts = emptyEmotionCounts();
  const monthly = new Map<string, Record<EmotionBucket, number>>();
  const sourcePrompts = new Map<EmotionBucket, UserPrompt[]>(
    (Object.keys(counts) as EmotionBucket[]).map((bucket) => [bucket, []])
  );
  for (const prompt of prompts) {
    const emotion = promptEmotion(prompt.text);
    counts[emotion] += 1;
    sourcePrompts.get(emotion)?.push(prompt);
    const key = monthKey(prompt.date);
    const bucket = monthly.get(key) ?? emptyEmotionCounts();
    bucket[emotion] += 1;
    monthly.set(key, bucket);
  }
  return {
    counts,
    byMonth: [...monthly.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, monthCounts]) => ({ month, counts: monthCounts })),
    sources: Object.fromEntries(
      (Object.keys(counts) as EmotionBucket[]).map((bucket) => {
        const seen = new Set<string>();
        const sources = (sourcePrompts.get(bucket) ?? [])
          .slice()
          .sort((left, right) => right.date - left.date)
          .filter((prompt) => {
            if (seen.has(prompt.conversationId)) return false;
            seen.add(prompt.conversationId);
            return true;
          })
          .slice(0, 12)
          .map(({ conversationId, title, date }) => ({ conversationId, title, date }));
        return [bucket, sources];
      })
    ) as Record<EmotionBucket, SourceRef[]>,
    method:
      "Local vocabulary cues assign one dominant language signal per query. They describe wording—not your feelings, mood, personality, or mental state.",
  };
}

function sourceOfPrompt(prompt: UserPrompt): SourceRef {
  return {
    conversationId: prompt.conversationId,
    title: prompt.title,
    date: prompt.date,
  };
}

function uniqueSources(prompts: UserPrompt[], limit = 12): SourceRef[] {
  const seen = new Set<string>();
  return prompts
    .slice()
    .sort((left, right) => right.date - left.date)
    .filter((prompt) => {
      if (seen.has(prompt.conversationId)) return false;
      seen.add(prompt.conversationId);
      return true;
    })
    .slice(0, limit)
    .map(sourceOfPrompt);
}

function contentTerms(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((term) => term.length > 2 && !STOP_WORDS.has(term) && !/^\d+$/.test(term))
  );
}

function termOverlap(left: Set<string>, right: Set<string>): number {
  const intersection = [...left].filter((term) => right.has(term)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function buildQuestionLenses(
  conversations: ConversationRecord[],
  prompts: UserPrompt[]
): QuestionLensReport {
  const categories = QUESTION_LENSES.map(({ patterns, ...lens }) => {
    const matches = prompts.filter((prompt) =>
      patterns.some((pattern) => pattern.test(prompt.text))
    );
    const monthly = new Map<string, number>();
    for (const prompt of matches) {
      const month = monthKey(prompt.date);
      monthly.set(month, (monthly.get(month) ?? 0) + 1);
    }
    return {
      ...lens,
      queryCount: matches.length,
      conversationCount: new Set(matches.map((prompt) => prompt.conversationId)).size,
      byMonth: [...monthly.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, value]) => ({ label, value })),
      sources: uniqueSources(matches),
    };
  }).sort((left, right) => right.queryCount - left.queryCount);

  const typoGroups = new Map<string, { prompts: UserPrompt[]; suggestion: string }>();
  const affectedQueries = new Set<string>();
  for (const prompt of prompts) {
    const tokens = prompt.text.toLocaleLowerCase().match(/\b[a-z]+\b/g) ?? [];
    for (const token of new Set(tokens)) {
      const suggestion = Object.hasOwn(TYPO_SUGGESTIONS, token)
        ? TYPO_SUGGESTIONS[token]
        : undefined;
      if (!suggestion) continue;
      const group = typoGroups.get(token) ?? { prompts: [], suggestion };
      group.prompts.push(prompt);
      typoGroups.set(token, group);
      affectedQueries.add(prompt.id);
    }
    if (/\b([a-z]{2,})\s+\1\b/i.test(prompt.text)) {
      const token = "repeated word";
      const group = typoGroups.get(token) ?? { prompts: [], suggestion: "remove the duplicate" };
      group.prompts.push(prompt);
      typoGroups.set(token, group);
      affectedQueries.add(prompt.id);
    }
  }
  const signals = [...typoGroups.entries()]
    .map(([token, group]) => ({
      token,
      suggestion: group.suggestion,
      count: group.prompts.length,
      sources: uniqueSources(group.prompts),
    }))
    .sort((left, right) => right.count - left.count || left.token.localeCompare(right.token))
    .slice(0, 24);

  const threadCandidates = conversations.map((conversation) => {
    const ordered = conversation.prompts.slice().sort((left, right) => left.date - right.date);
    let compared = 0;
    let shiftCount = 0;
    for (let index = 1; index < ordered.length; index += 1) {
      const left = contentTerms(ordered[index - 1].text);
      const right = contentTerms(ordered[index].text);
      if (left.size < 4 || right.size < 4) continue;
      compared += 1;
      if (termOverlap(left, right) < 0.035) shiftCount += 1;
    }
    const likely =
      ordered.length >= 6 && compared >= 3 && shiftCount >= 3 && shiftCount / compared >= 0.6;
    return {
      candidate: {
        id: conversation.conversationId,
        title: conversation.title,
        date: conversation.date,
        promptCount: ordered.length,
        shiftCount,
        estimatedThreads: Math.min(Math.max(2, Math.round(1 + Math.sqrt(shiftCount))), 8),
        sources: [
          {
            conversationId: conversation.conversationId,
            title: conversation.title,
            date: conversation.date,
          },
        ],
      },
      eligible: ordered.length >= 6 && compared >= 3,
      likely,
    };
  });
  const eligible = threadCandidates.filter((item) => item.eligible);
  const likely = eligible
    .filter((item) => item.likely)
    .map((item) => item.candidate)
    .sort(
      (left, right) =>
        right.shiftCount - left.shiftCount ||
        right.promptCount - left.promptCount ||
        right.date - left.date
    )
    .slice(0, 40);

  return {
    categories,
    typos: {
      totalSignals: signals.reduce((sum, signal) => sum + signal.count, 0),
      affectedQueries: affectedQueries.size,
      signals,
      method:
        "Conservative local checks for a small disclosed misspelling list and immediately repeated words. This is not a grammar score.",
    },
    threads: {
      eligibleConversations: eligible.length,
      likelyMultiThreaded: eligible.filter((item) => item.likely).length,
      candidates: likely,
      method:
        "A likely thread change is a low-overlap jump between two substantial adjacent prompts. Short follow-ups are ignored; results are candidates, not judgments.",
    },
  };
}

function buildExactRepeats(prompts: UserPrompt[]): ExactRepeat[] {
  const groups = new Map<string, UserPrompt[]>();
  for (const prompt of prompts) {
    const normalized = normalizeText(prompt.text);
    if (normalized.length < 12 || normalized.length > 600) continue;
    const group = groups.get(normalized) ?? [];
    group.push(prompt);
    groups.set(normalized, group);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([id, group]) => ({
      id,
      representative: group[0].text,
      count: group.length,
      firstAsked: Math.min(...group.map((prompt) => prompt.date)),
      lastAsked: Math.max(...group.map((prompt) => prompt.date)),
      sources: group.slice(0, 12).map(({ conversationId, title, date }) => ({
        conversationId,
        title,
        date,
      })),
    }))
    .sort((left, right) => right.count - left.count || right.lastAsked - left.lastAsked)
    .slice(0, 100);
}

function buildRecurringTerms(conversations: ConversationRecord[]) {
  const documentFrequency = new Map<string, number>();
  for (const conversation of conversations) {
    const text = `${conversation.title} ${conversation.prompts.map((prompt) => prompt.text).join(" ")}`;
    const terms = new Set(
      normalizeText(text)
        .split(" ")
        .filter((term) => term.length > 3 && !STOP_WORDS.has(term) && !/^\d+$/.test(term))
    );
    for (const term of terms) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  return [...documentFrequency.entries()]
    .filter(([, value]) => value > 1)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 24)
    .map(([label, value]) => ({ label, value }));
}

function sentenceCandidates(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12 && sentence.length <= 600);
}

export function extractFactCandidates(prompts: UserPrompt[]): FactCandidate[] {
  const candidates: FactCandidate[] = [];
  for (const prompt of prompts) {
    for (const sentence of sentenceCandidates(prompt.text)) {
      if (
        sentence.includes("?") ||
        /^(?:if|what|when|where|why|how|can|could|would|should|do|does|did|is|are|will)\b/i.test(
          sentence
        ) ||
        /\bif\s+i\s+(?:am|have|use|prefer|like|want|need|work|live|own|believe|value)\b/i.test(
          sentence
        )
      ) {
        continue;
      }
      if (!FACT_PATTERNS.some((pattern) => pattern.test(sentence))) continue;
      const cue = REFUTATION_CUES.test(sentence)
        ? "refutation"
        : UPDATE_CUES.test(sentence)
          ? "update"
          : "statement";
      candidates.push({
        id: `${prompt.id}:fact:${candidates.length}`,
        text: sentence,
        cue,
        conversationId: prompt.conversationId,
        title: prompt.title,
        date: prompt.date,
      });
    }
  }
  return candidates;
}

export function buildDeterministicReport(conversations: ConversationRecord[]): {
  report: DeterministicReport;
  prompts: UserPrompt[];
  facts: FactCandidate[];
} {
  const prompts = conversations.flatMap((conversation) => conversation.prompts);
  const dates = conversations.map((conversation) => conversation.date).filter(Boolean);
  const activity = new Map<string, number>();
  const activityRhythms = new Map<
    "all" | QuestionLens["id"],
    Map<
      string,
      {
        conversations: number;
        messages: number;
        userPrompts: number;
        words: number;
      }
    >
  >();
  const dailyActivity = new Map<string, ConversationRecord[]>();
  const weekday = new Map<string, number>();
  const models = new Map<string, number>();
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const addRhythm = (id: "all" | QuestionLens["id"], conversation: ConversationRecord) => {
    const month = monthKey(conversation.date);
    const series = activityRhythms.get(id) ?? new Map();
    const current = series.get(month) ?? {
      conversations: 0,
      messages: 0,
      userPrompts: 0,
      words: 0,
    };
    current.conversations += 1;
    current.messages += conversation.messageCount;
    current.userPrompts += conversation.userMessageCount;
    current.words += conversation.wordCount;
    series.set(month, current);
    activityRhythms.set(id, series);
  };

  for (const conversation of conversations) {
    activity.set(monthKey(conversation.date), (activity.get(monthKey(conversation.date)) ?? 0) + 1);
    addRhythm("all", conversation);
    for (const routeId of classifyQuestionLensIds(
      conversation.prompts.map((prompt) => prompt.text)
    )) {
      addRhythm(routeId, conversation);
    }
    if (conversation.date) {
      const day = dateKey(conversation.date);
      const dayConversations = dailyActivity.get(day) ?? [];
      dayConversations.push(conversation);
      dailyActivity.set(day, dayConversations);
      const label = weekdays[new Date(conversation.date * 1_000).getUTCDay()];
      weekday.set(label, (weekday.get(label) ?? 0) + 1);
    }
    models.set(conversation.model, (models.get(conversation.model) ?? 0) + 1);
  }

  const short = conversations.filter((conversation) => conversation.messageCount <= 4).length;
  const medium = conversations.filter(
    (conversation) => conversation.messageCount > 4 && conversation.messageCount <= 14
  ).length;
  const deep = conversations.filter((conversation) => conversation.messageCount > 14).length;

  const report: DeterministicReport = {
    totals: {
      conversations: conversations.length,
      messages: conversations.reduce((sum, conversation) => sum + conversation.messageCount, 0),
      userPrompts: prompts.length,
      words: conversations.reduce((sum, conversation) => sum + conversation.wordCount, 0),
      activeDays: new Set(dates.map(dateKey)).size,
      longestStreak: countLongestStreak(dates),
    },
    dateRange: {
      start: dates.length ? Math.min(...dates) : 0,
      end: dates.length ? Math.max(...dates) : 0,
    },
    activityByDay: [...dailyActivity.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, dayConversations]) => ({
        label,
        value: dayConversations.length,
        sources: dayConversations
          .slice()
          .sort((left, right) => right.date - left.date)
          .slice(0, 12)
          .map(({ conversationId, title, date }) => ({ conversationId, title, date })),
      })),
    activityByMonth: [...activity.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, value]) => ({ label, value })),
    activityRhythms: [
      { id: "all" as const, label: "All conversations" },
      ...QUESTION_LENSES.map(({ id, label }) => ({ id, label })),
    ].map(({ id, label }) => ({
      id,
      label,
      byMonth: [...(activityRhythms.get(id)?.entries() ?? [])]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([month, values]) => ({ label: month, ...values })),
    })),
    activityByWeekday: weekdays.map((label) => ({ label, value: weekday.get(label) ?? 0 })),
    modelUsage: [...models.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([label, value]) => ({ label, value })),
    depth: {
      medianMessages: median(conversations.map((conversation) => conversation.messageCount)),
      short,
      medium,
      deep,
    },
    recurringTerms: buildRecurringTerms(conversations),
    exactRepeats: buildExactRepeats(prompts),
    tone: buildTone(prompts),
    emotions: buildEmotions(prompts),
    lenses: buildQuestionLenses(conversations, prompts),
  };

  return {
    report: { ...report, shifts: buildHistoricalShifts(report) },
    prompts,
    facts: extractFactCandidates(prompts),
  };
}

export function lexicalSimilarity(left: string, right: string): number {
  const leftTerms = new Set(
    normalizeText(left)
      .split(" ")
      .filter((term) => !STOP_WORDS.has(term))
  );
  const rightTerms = new Set(
    normalizeText(right)
      .split(" ")
      .filter((term) => !STOP_WORDS.has(term))
  );
  if (leftTerms.size === 0 || rightTerms.size === 0) return 0;
  const intersection = [...leftTerms].filter((term) => rightTerms.has(term)).length;
  const union = new Set([...leftTerms, ...rightTerms]).size;
  return intersection / union;
}

export function distinctiveTerms(records: ConversationRecord[]): string[] {
  return buildRecurringTerms(records)
    .slice(0, 4)
    .map((term) => term.label);
}

export function distinctiveTitleTerms(records: ConversationRecord[]): string[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const terms = new Set(
      normalizeText(record.title)
        .split(" ")
        .filter((term) => term.length > 3 && !STOP_WORDS.has(term) && !/^\d+$/.test(term))
    );
    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([term]) => term);
}
