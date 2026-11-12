import { distinctiveTerms, distinctiveTitleTerms, lexicalSimilarity } from "./insights";
import { buildThreadStrands, classifyTrend, evidenceConfidence, monthKey } from "./analysis";
import type {
  AnalysisResolution,
  AnalysisRuntime,
  ConversationRecord,
  FactCandidate,
  FactGroup,
  LexicalSearchEntry,
  SearchEntry,
  SemanticRepeat,
  SemanticReport,
  SourceRef,
  ThreadBoundary,
  ThreadPrompt,
  ThreadSegmentation,
  TopicEdge,
  TopicNode,
  UserPrompt,
} from "./types";

export const MODEL_PROFILES = {
  compact: {
    id: "Xenova/all-MiniLM-L6-v2",
    revision: "751bff37182d3f1213fa05d7196b954e230abad9",
    approximateDownloadMb: 24,
  },
  multilingual: {
    id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    revision: "2c4055b12046f11709e9df2c122e59ffbdc2f900",
    approximateDownloadMb: 135,
  },
} as const;
const CONVERSATION_CAP = 600;
const QUESTION_CAP = 800;
const FACT_CAP = 1_500;
const THREAD_CONVERSATION_CAP = 16;
const THREAD_PROMPT_CAP = 1_200;
const COLORS = ["#2157d5", "#e44b33", "#168579", "#d69a17", "#7554c8", "#2f7aa3"];
const TOPIC_ANCHORS = [
  ["Software engineering", "programming software engineering code frontend backend database bugs"],
  [
    "AI & machine learning",
    "artificial intelligence machine learning language models agents embeddings",
  ],
  ["Product & startups", "startup product strategy saas business ideas customers growth"],
  ["Investing & markets", "stocks investing market portfolio companies earnings valuation"],
  ["Personal finance", "money budgeting taxes savings debt insurance personal finance"],
  ["Health & nutrition", "health nutrition protein calories sleep symptoms medicine food"],
  ["Fitness & training", "exercise gym strength running training workout mobility"],
  ["Learning & education", "learning studying courses education explanations skills practice"],
  ["Career & work", "career jobs interviews work workplace management professional growth"],
  ["Productivity & planning", "productivity planning focus habits tasks time management"],
  ["Design & creativity", "design user interface visual creativity art writing"],
  ["Books & writing", "books reading writing stories essays literature"],
  ["Entertainment & anime", "anime manga films television games entertainment characters"],
  ["Travel & places", "travel cities countries transport hotels itineraries"],
  ["Relationships & communication", "relationships friends family communication dating conflict"],
  ["Philosophy & reflection", "philosophy values meaning identity self reflection beliefs"],
  ["News & current affairs", "news politics policy current affairs society events"],
  ["Research & analysis", "research evidence papers analysis comparison evaluation data"],
  ["Food & cooking", "food cooking recipes meals ingredients restaurants"],
  ["Home & lifestyle", "home shopping clothes devices lifestyle routines"],
] as const;

type Progress = (
  phase: "model" | "embed" | "cluster",
  label: string,
  current: number,
  total: number,
  runtime?: AnalysisRuntime
) => void;

type TensorLike = {
  data: Float32Array | number[];
  dims: number[];
};

type Extractor = {
  (input: string | string[], options: { pooling: "mean"; normalize: true }): Promise<TensorLike>;
  dispose(): Promise<void>;
};

let extractorPromise: Promise<Extractor> | null = null;
let extractorProfile: AnalysisResolution["resolvedModelProfile"] | null = null;
let extractorRuntimeKey: string | null = null;

export const INFERENCE_BATCH_SIZE = {
  webgpu: 128,
  wasm: 32,
} as const;

type GpuScope = {
  navigator?: {
    gpu?: { requestAdapter: (options: { powerPreference: string }) => Promise<unknown> };
  };
};

export async function supportsWebGpu(scope: GpuScope = globalThis as GpuScope): Promise<boolean> {
  try {
    // An exposed API can still return no adapter (for example, headless Chrome).
    // Avoid poisoning Transformers.js 3.8.1's shared initialization promise.
    return Boolean(
      await scope.navigator?.gpu?.requestAdapter({ powerPreference: "high-performance" })
    );
  } catch {
    return false;
  }
}

export function preferredRuntime(
  webGpuAvailable = false,
  profile: AnalysisResolution["resolvedModelProfile"] = "compact"
): AnalysisRuntime {
  return webGpuAvailable && profile === "compact"
    ? {
        device: "webgpu",
        dtype: "fp32",
        batchSize: INFERENCE_BATCH_SIZE.webgpu,
      }
    : {
        device: "wasm",
        dtype: "q8",
        batchSize: INFERENCE_BATCH_SIZE.wasm,
      };
}

export function isMemoryPressure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /allocation|array buffer|memory|out of bounds|too large/i.test(message);
}

export function prepareEmbeddingWork(texts: string[]): Array<{
  text: string;
  indexes: number[];
}> {
  const unique = new Map<string, number[]>();
  texts.forEach((text, index) => {
    const indexes = unique.get(text) ?? [];
    indexes.push(index);
    unique.set(text, indexes);
  });
  return [...unique.entries()]
    .map(([text, indexes]) => ({ text, indexes }))
    .sort(
      (left, right) => left.text.length - right.text.length || left.indexes[0] - right.indexes[0]
    );
}

function sourceOf(value: ConversationRecord | UserPrompt | FactCandidate): SourceRef {
  return {
    conversationId: value.conversationId,
    title: value.title,
    date: value.date,
  };
}

function normalizedKey(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableSample<T extends { date: number }>(items: T[], cap: number): T[] {
  if (items.length <= cap) return [...items];
  const sorted = [...items].sort((left, right) => left.date - right.date);
  const recentCount = Math.min(Math.floor(cap * 0.35), sorted.length);
  const selected = new Set<T>(sorted.slice(-recentCount));
  const remaining = cap - selected.size;
  const stride = (sorted.length - recentCount) / Math.max(1, remaining);
  for (let index = 0; index < remaining; index += 1) {
    selected.add(sorted[Math.min(sorted.length - recentCount - 1, Math.floor(index * stride))]);
  }
  return [...selected].sort((left, right) => left.date - right.date).slice(0, cap);
}

function sampleQuestions(prompts: UserPrompt[]): UserPrompt[] {
  const unique = new Map<string, UserPrompt>();
  const frequency = new Map<string, number>();
  for (const prompt of prompts) {
    const key = normalizedKey(prompt.text);
    if (key.length < 12 || key.length > 800) continue;
    frequency.set(key, (frequency.get(key) ?? 0) + 1);
    const current = unique.get(key);
    if (!current || prompt.date > current.date) unique.set(key, prompt);
  }
  const ranked = [...unique.values()].sort((left, right) => {
    const countDifference =
      (frequency.get(normalizedKey(right.text)) ?? 0) -
      (frequency.get(normalizedKey(left.text)) ?? 0);
    return countDifference || right.date - left.date;
  });
  if (ranked.length <= QUESTION_CAP) return ranked;
  const repeated = ranked.filter((prompt) => (frequency.get(normalizedKey(prompt.text)) ?? 0) > 1);
  const keep = repeated.slice(0, Math.floor(QUESTION_CAP * 0.35));
  const rest = stableSample(
    ranked.filter((prompt) => !keep.includes(prompt)),
    QUESTION_CAP - keep.length
  );
  return [...keep, ...rest];
}

async function getExtractor(
  profile: AnalysisResolution["resolvedModelProfile"],
  progress: Progress,
  runtime: AnalysisRuntime
): Promise<Extractor> {
  const runtimeKey = `${runtime.device}:${runtime.dtype}`;
  if (extractorPromise && (extractorProfile !== profile || extractorRuntimeKey !== runtimeKey)) {
    await disposeExtractor();
  }
  if (!extractorPromise) {
    extractorProfile = profile;
    extractorRuntimeKey = runtimeKey;
    extractorPromise = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      env.useBrowserCache = true;
      const model = MODEL_PROFILES[profile];
      progress(
        "model",
        runtime.device === "webgpu"
          ? "Starting accelerated browser inference"
          : "Starting compatibility browser inference",
        0,
        100,
        runtime
      );
      return (await pipeline("feature-extraction", model.id, {
        revision: model.revision,
        dtype: runtime.dtype,
        ...(runtime.device === "webgpu" ? { device: "webgpu" as const } : {}),
        progress_callback: (event: {
          status: string;
          file?: string;
          progress?: number;
          loaded?: number;
          total?: number;
        }) => {
          if (event.status === "progress") {
            progress(
              "model",
              event.file ? `Downloading ${event.file}` : "Downloading embedding model",
              event.loaded ?? event.progress ?? 0,
              event.total ?? 100,
              runtime
            );
          }
        },
      })) as unknown as Extractor;
    })().catch((error) => {
      extractorPromise = null;
      extractorProfile = null;
      extractorRuntimeKey = null;
      throw error;
    });
  }
  return extractorPromise;
}

export async function disposeExtractor(): Promise<void> {
  if (!extractorPromise) return;
  const extractor = await extractorPromise;
  await extractor.dispose();
  extractorPromise = null;
  extractorProfile = null;
  extractorRuntimeKey = null;
}

async function embedWithRuntime(
  texts: string[],
  profile: AnalysisResolution["resolvedModelProfile"],
  progress: Progress,
  initialRuntime: AnalysisRuntime
): Promise<{ vectors: Float32Array[]; runtime: AnalysisRuntime }> {
  const extractor = await getExtractor(profile, progress, initialRuntime);
  const embeddings = new Array<Float32Array>(texts.length);
  const work = prepareEmbeddingWork(texts);
  let runtime = initialRuntime;
  let start = 0;
  let processedCandidates = 0;

  while (start < work.length) {
    const batchItems = work.slice(start, start + runtime.batchSize);
    const batch = batchItems.map((item) => item.text);
    try {
      const output = await extractor(batch, { pooling: "mean", normalize: true });
      const dimensions = output.dims.at(-1) ?? 384;
      const data =
        output.data instanceof Float32Array ? output.data : Float32Array.from(output.data);
      for (let index = 0; index < batchItems.length; index += 1) {
        const vector = data.slice(index * dimensions, (index + 1) * dimensions);
        for (const originalIndex of batchItems[index].indexes) {
          embeddings[originalIndex] = vector;
        }
      }
      start += batchItems.length;
      processedCandidates += batchItems.reduce((total, item) => total + item.indexes.length, 0);
      progress("embed", "Embedding memory candidates", processedCandidates, texts.length, runtime);
      await new Promise((resolve) => setTimeout(resolve, 0));
    } catch (error) {
      const minimumBatch = runtime.device === "webgpu" ? 16 : 12;
      const canRetrySmaller =
        runtime.batchSize > minimumBatch && (start === 0 || isMemoryPressure(error));
      if (!canRetrySmaller) throw error;
      runtime = {
        ...runtime,
        batchSize: Math.max(minimumBatch, Math.floor(runtime.batchSize / 2)),
      };
      progress(
        "embed",
        `Reducing inference batch to ${runtime.batchSize}`,
        processedCandidates,
        texts.length,
        runtime
      );
    }
  }
  return { vectors: embeddings, runtime };
}

async function embedTexts(
  texts: string[],
  profile: AnalysisResolution["resolvedModelProfile"],
  progress: Progress
): Promise<{ vectors: Float32Array[]; runtime: AnalysisRuntime }> {
  if (texts.length === 0) {
    return { vectors: [], runtime: preferredRuntime(false, profile) };
  }
  const preferred = preferredRuntime(profile === "compact" && (await supportsWebGpu()), profile);
  if (preferred.device === "wasm") {
    return embedWithRuntime(texts, profile, progress, preferred);
  }
  try {
    return await embedWithRuntime(texts, profile, progress, preferred);
  } catch (error) {
    await disposeExtractor();
    const fallbackReason = error instanceof Error ? error.message.slice(0, 180) : String(error);
    const fallback: AnalysisRuntime = {
      ...preferredRuntime(false, profile),
      fallbackReason,
    };
    progress("model", "GPU path unavailable; retrying with compatibility mode", 0, 100, fallback);
    return embedWithRuntime(texts, profile, progress, fallback);
  }
}

export function cosine(left: Float32Array, right: Float32Array): number {
  let value = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) value += left[index] * right[index];
  return value;
}

function average(vectors: Float32Array[]): Float32Array {
  if (vectors.length === 0) return new Float32Array();
  const output = new Float32Array(vectors[0].length);
  for (const vector of vectors) {
    for (let index = 0; index < vector.length; index += 1) output[index] += vector[index];
  }
  let magnitude = 0;
  for (let index = 0; index < output.length; index += 1) {
    output[index] /= vectors.length;
    magnitude += output[index] ** 2;
  }
  magnitude = Math.sqrt(magnitude) || 1;
  for (let index = 0; index < output.length; index += 1) output[index] /= magnitude;
  return output;
}

class UnionFind {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(value: number): number {
    if (this.parent[value] !== value) this.parent[value] = this.find(this.parent[value]);
    return this.parent[value];
  }

  union(left: number, right: number) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent[rightRoot] = leftRoot;
  }

  groups(): number[][] {
    const groups = new Map<number, number[]>();
    for (let index = 0; index < this.parent.length; index += 1) {
      const root = this.find(index);
      const group = groups.get(root) ?? [];
      group.push(index);
      groups.set(root, group);
    }
    return [...groups.values()];
  }
}

function semanticRepeats(prompts: UserPrompt[], vectors: Float32Array[]): SemanticRepeat[] {
  const union = new UnionFind(prompts.length);
  for (let left = 0; left < prompts.length; left += 1) {
    let best = -1;
    let bestScore = 0;
    for (let right = left + 1; right < prompts.length; right += 1) {
      const score = cosine(vectors[left], vectors[right]);
      if (score > bestScore) {
        best = right;
        bestScore = score;
      }
    }
    const lexical = best >= 0 ? lexicalSimilarity(prompts[left].text, prompts[best].text) : 0;
    const confidence = evidenceConfidence(bestScore, lexical);
    if (
      best >= 0 &&
      bestScore >= 0.62 &&
      (lexical >= 0.08 || bestScore >= 0.76) &&
      confidence >= 0.38
    ) {
      union.union(left, best);
    }
  }

  return union
    .groups()
    .filter((group) => group.length > 1)
    .map((group, index) => {
      const ordered = group
        .map((item) => prompts[item])
        .sort((left, right) => right.date - left.date);
      const centroid = average(group.map((item) => vectors[item]));
      const representativeIndex = group
        .map((item) => ({ item, score: cosine(vectors[item], centroid) }))
        .sort((left, right) => right.score - left.score)[0].item;
      const representativeText = prompts[representativeIndex].text;
      const comparisons = group.filter((item) => item !== representativeIndex);
      const similarity =
        comparisons.reduce(
          (sum, item) => sum + cosine(vectors[item], vectors[representativeIndex]),
          0
        ) / Math.max(1, comparisons.length);
      const lexical =
        comparisons.reduce(
          (sum, item) => sum + lexicalSimilarity(prompts[item].text, representativeText),
          0
        ) / Math.max(1, comparisons.length);
      return {
        id: `semantic-repeat-${index}`,
        representative: representativeText,
        count: group.length,
        similarity,
        confidence: evidenceConfidence(similarity, lexical),
        questions: ordered.slice(0, 10).map((prompt) => prompt.text),
        sources: ordered.slice(0, 12).map(sourceOf),
      };
    })
    .sort((left, right) => right.count - left.count || right.similarity - left.similarity)
    .slice(0, 80);
}

export function classifyFactHistory(history: FactCandidate[]): FactGroup["status"] {
  if (history.length < 2) return "current";
  const ordered = [...history].sort((left, right) => left.date - right.date);
  const latest = ordered.at(-1)!;
  const distinct = new Set(ordered.map((fact) => normalizedKey(fact.text))).size;
  if (latest.cue === "refutation" && distinct > 1) return "refuted";
  if (distinct > 1 && ordered.some((fact) => fact.cue === "update")) return "updated";
  return "current";
}

function groupFacts(facts: FactCandidate[], vectors: Float32Array[]): FactGroup[] {
  const union = new UnionFind(facts.length);
  for (let left = 0; left < facts.length; left += 1) {
    let best = -1;
    let bestScore = 0;
    for (let right = left + 1; right < facts.length; right += 1) {
      const score = cosine(vectors[left], vectors[right]);
      if (score > bestScore) {
        best = right;
        bestScore = score;
      }
    }
    const lexical = best >= 0 ? lexicalSimilarity(facts[left].text, facts[best].text) : 0;
    if (
      best >= 0 &&
      (bestScore >= 0.84 || (bestScore >= 0.72 && lexical >= 0.14)) &&
      evidenceConfidence(bestScore, lexical) >= 0.56
    ) {
      union.union(left, best);
    }
  }

  return union
    .groups()
    .map((group, index) => {
      const orderedIndices = group
        .slice()
        .sort((left, right) => facts[left].date - facts[right].date);
      const history = orderedIndices.map((item) => facts[item]);
      const latest = history.at(-1)!;
      const latestIndex = orderedIndices.at(-1)!;
      const previous = orderedIndices
        .slice(0, -1)
        .map((item) => ({
          item,
          semantic: cosine(vectors[latestIndex], vectors[item]),
          lexical: lexicalSimilarity(facts[latestIndex].text, facts[item].text),
        }))
        .sort((left, right) => right.semantic - left.semantic)[0];
      const explicitStatus = classifyFactHistory(history);
      const distinct = new Set(history.map((fact) => normalizedKey(fact.text))).size > 1;
      const spansConversations = new Set(history.map((fact) => fact.conversationId)).size > 1;
      const spansAtLeastAWeek = latest.date - history[0].date >= 7 * 24 * 60 * 60;
      const possibleContradiction =
        explicitStatus === "current" &&
        distinct &&
        spansConversations &&
        spansAtLeastAWeek &&
        Boolean(previous) &&
        previous.semantic >= 0.78 &&
        previous.lexical >= 0.1 &&
        previous.lexical < 0.86;
      const status: FactGroup["status"] = possibleContradiction ? "contradicted" : explicitStatus;
      const semantic = previous?.semantic ?? 1;
      const lexical = previous?.lexical ?? 1;
      const cueBonus =
        status === "refuted"
          ? 0.1
          : status === "updated"
            ? 0.06
            : status === "contradicted"
              ? -0.08
              : 0;
      const confidence =
        status === "current" ? 0.99 : evidenceConfidence(semantic, lexical, cueBonus);
      const reason =
        status === "refuted"
          ? "A later linked statement uses explicit rejection wording."
          : status === "updated"
            ? "A later linked statement uses explicit update wording."
            : status === "contradicted"
              ? "Related statements differ without an explicit correction cue; review which is current."
              : "No qualified later change was detected.";
      return {
        id: `fact-${index}`,
        status,
        statement: latest.text,
        firstSeen: history[0].date,
        lastSeen: latest.date,
        confidence,
        similarity: semantic,
        lexicalSimilarity: lexical,
        reason,
        history,
        sources: history.slice(-10).reverse().map(sourceOf),
      } satisfies FactGroup;
    })
    .sort((left, right) => right.lastSeen - left.lastSeen)
    .slice(0, 180);
}

function kMeans(vectors: Float32Array[], requestedClusters: number) {
  const clusterCount = Math.max(1, Math.min(requestedClusters, vectors.length));
  const centroids: Float32Array[] = [vectors[0].slice()];
  while (centroids.length < clusterCount) {
    let candidate = 0;
    let farthest = -1;
    for (let index = 0; index < vectors.length; index += 1) {
      const nearest = Math.max(...centroids.map((centroid) => cosine(vectors[index], centroid)));
      const distance = 1 - nearest;
      if (distance > farthest) {
        farthest = distance;
        candidate = index;
      }
    }
    centroids.push(vectors[candidate].slice());
  }

  const assignments = new Array(vectors.length).fill(0);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    let changed = false;
    for (let index = 0; index < vectors.length; index += 1) {
      let bestCluster = 0;
      let bestScore = -Infinity;
      for (let cluster = 0; cluster < centroids.length; cluster += 1) {
        const score = cosine(vectors[index], centroids[cluster]);
        if (score > bestScore) {
          bestScore = score;
          bestCluster = cluster;
        }
      }
      if (assignments[index] !== bestCluster) changed = true;
      assignments[index] = bestCluster;
    }
    for (let cluster = 0; cluster < centroids.length; cluster += 1) {
      const members = vectors.filter((_, index) => assignments[index] === cluster);
      if (members.length) centroids[cluster] = average(members);
    }
    if (!changed && iteration > 0) break;
  }
  return { assignments, centroids };
}

function topicGraph(
  conversations: ConversationRecord[],
  vectors: Float32Array[],
  anchorVectors: Float32Array[]
): {
  topics: TopicNode[];
  edges: TopicEdge[];
  centroids: Float32Array[];
  assignments: number[];
} {
  if (conversations.length === 0) {
    return { topics: [], edges: [], centroids: [], assignments: [] };
  }
  const requested = Math.min(12, Math.max(2, Math.round(Math.sqrt(conversations.length / 2))));
  const { assignments, centroids } = kMeans(vectors, requested);
  const groups = centroids.map((_, cluster) =>
    conversations.filter((__, index) => assignments[index] === cluster)
  );
  const allMonths = [...new Set(conversations.map((conversation) => monthKey(conversation.date)))]
    .filter((month) => month !== "1970-01")
    .sort();
  const monthlyTotals = new Map<string, number>();
  for (const conversation of conversations) {
    const month = monthKey(conversation.date);
    monthlyTotals.set(month, (monthlyTotals.get(month) ?? 0) + 1);
  }
  const order = groups
    .map((group, cluster) => ({ cluster, count: group.length }))
    .sort((left, right) => right.count - left.count);

  const anchorAssignments = new Map<number, string>();
  const usedAnchors = new Set<number>();
  for (const { cluster } of order) {
    const candidates = anchorVectors
      .map((vector, anchor) => ({
        anchor,
        similarity: cosine(centroids[cluster], vector),
      }))
      .sort((left, right) => right.similarity - left.similarity);
    const selected =
      candidates.find((candidate) => !usedAnchors.has(candidate.anchor)) ?? candidates[0];
    if (selected) {
      usedAnchors.add(selected.anchor);
      anchorAssignments.set(cluster, TOPIC_ANCHORS[selected.anchor][0]);
    }
  }

  const position = new Map<number, { x: number; y: number }>();
  order.forEach(({ cluster }, orderIndex) => {
    if (orderIndex === 0) {
      position.set(cluster, { x: 0.5, y: 0.48 });
      return;
    }
    const outerCount = Math.max(1, order.length - 1);
    const angle = -Math.PI / 2 + ((orderIndex - 1) * Math.PI * 2) / outerCount;
    position.set(cluster, {
      x: 0.5 + Math.cos(angle) * 0.39,
      y: 0.5 + Math.sin(angle) * 0.39,
    });
  });

  const topics = groups.map((group, cluster) => {
    const titleTerms = distinctiveTitleTerms(group);
    const terms = titleTerms.length >= 2 ? titleTerms : distinctiveTerms(group);
    const fallback = group
      .map((conversation) => conversation.title)
      .find((title) => title && title !== "Untitled conversation");
    const anchor = anchorAssignments.get(cluster);
    const specific = terms.find(
      (term) => !anchor?.toLocaleLowerCase().includes(term.toLocaleLowerCase())
    );
    const label =
      [
        anchor,
        specific ? specific.replace(/\b\w/g, (character) => character.toLocaleUpperCase()) : null,
      ]
        .filter(Boolean)
        .join(" · ") ||
      fallback?.slice(0, 34) ||
      `Topic ${cluster + 1}`;
    const point = position.get(cluster) ?? { x: 0.5, y: 0.5 };
    const monthlyCounts = new Map<string, number>();
    for (const conversation of group) {
      const month = monthKey(conversation.date);
      monthlyCounts.set(month, (monthlyCounts.get(month) ?? 0) + 1);
    }
    const activityByMonth = allMonths.map((label) => ({
      label,
      value: monthlyCounts.get(label) ?? 0,
    }));
    const { trend, momentum } = classifyTrend(activityByMonth, monthlyTotals);
    return {
      id: `topic-${cluster}`,
      label,
      count: group.length,
      x: point.x,
      y: point.y,
      color: COLORS[cluster % COLORS.length],
      terms,
      activityByMonth,
      trend,
      momentum,
      sources: [...group]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, 8)
        .map(sourceOf),
    } satisfies TopicNode;
  });

  const edgeMap = new Map<string, TopicEdge>();
  for (let source = 0; source < centroids.length; source += 1) {
    const neighbors = centroids
      .map((centroid, target) => ({ target, similarity: cosine(centroids[source], centroid) }))
      .filter(({ target }) => target !== source)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 2);
    for (const neighbor of neighbors) {
      const [left, right] = [source, neighbor.target].sort((a, b) => a - b);
      const key = `${left}:${right}`;
      const existing = edgeMap.get(key);
      if (!existing || neighbor.similarity > existing.similarity) {
        edgeMap.set(key, {
          source: `topic-${left}`,
          target: `topic-${right}`,
          similarity: neighbor.similarity,
        });
      }
    }
  }
  return { topics, edges: [...edgeMap.values()], centroids, assignments };
}

function conversationFingerprint(conversation: ConversationRecord): string {
  const prompts = conversation.prompts;
  const selected = [prompts[0], prompts.at(-1)]
    .filter((prompt): prompt is UserPrompt => Boolean(prompt))
    .map((prompt) => prompt.text.slice(0, 700));
  return `${conversation.title}\n${selected.join("\n")}`.slice(0, 1_600);
}

type PreparedThread = {
  conversation: ConversationRecord;
  prompts: UserPrompt[];
};

function sampleOrderedPrompts(prompts: UserPrompt[], limit: number): UserPrompt[] {
  const ordered = prompts.slice().sort((left, right) => left.date - right.date);
  if (ordered.length <= limit) return ordered;
  return ordered.slice(-limit);
}

function prepareThreads(
  conversations: ConversationRecord[],
  candidateIds: string[]
): {
  threads: PreparedThread[];
  totalPrompts: number;
} {
  const candidates = candidateIds
    .map((id) => conversations.find((conversation) => conversation.conversationId === id))
    .filter((conversation): conversation is ConversationRecord => Boolean(conversation))
    .slice(0, THREAD_CONVERSATION_CAP);
  const totalPrompts = candidates.reduce(
    (sum, conversation) => sum + conversation.prompts.length,
    0
  );
  if (candidates.length === 0) return { threads: [], totalPrompts };
  const perConversation = Math.max(
    8,
    Math.floor(THREAD_PROMPT_CAP / Math.max(1, candidates.length))
  );
  let remaining = THREAD_PROMPT_CAP;
  const threads = candidates
    .map((conversation) => {
      const prompts = sampleOrderedPrompts(
        conversation.prompts,
        Math.min(perConversation, remaining)
      );
      remaining -= prompts.length;
      return { conversation, prompts };
    })
    .filter((thread) => thread.prompts.length >= 4);
  return { threads, totalPrompts };
}

function segmentThreads(
  prepared: PreparedThread[],
  vectors: Float32Array[]
): { threads: ThreadSegmentation[]; searchEntries: SearchEntry[] } {
  const threads: ThreadSegmentation[] = [];
  const searchEntries: SearchEntry[] = [];
  let offset = 0;

  for (const { conversation, prompts } of prepared) {
    const promptVectors = vectors.slice(offset, offset + prompts.length);
    offset += prompts.length;
    const threadPrompts: ThreadPrompt[] = prompts.map((prompt) => ({
      id: prompt.id,
      text: prompt.text,
      date: prompt.date,
      source: sourceOf(prompt),
    }));
    const candidates: ThreadBoundary[] = [];
    for (let index = 1; index < prompts.length; index += 1) {
      const leftTerms = normalizedKey(prompts[index - 1].text)
        .split(" ")
        .filter((term) => term.length > 3);
      const rightTerms = normalizedKey(prompts[index].text)
        .split(" ")
        .filter((term) => term.length > 3);
      if (leftTerms.length < 4 || rightTerms.length < 4) continue;
      const lexical = lexicalSimilarity(prompts[index - 1].text, prompts[index].text);
      const semantic = cosine(promptVectors[index - 1], promptVectors[index]);
      const continuity = semantic * 0.76 + Math.min(1, lexical * 3) * 0.24;
      const confidence = Math.max(0, Math.min(0.99, 0.85 - continuity));
      if (confidence >= 0.35) {
        candidates.push({
          at: index,
          confidence,
          continuity,
          lexicalSimilarity: lexical,
          semanticSimilarity: semantic,
        });
      }
    }
    const maximumBoundaries = Math.max(
      2,
      Math.min(12, Math.round(Math.sqrt(prompts.length) * 1.25))
    );
    const selected: ThreadBoundary[] = [];
    for (const candidate of candidates.sort(
      (left, right) => right.confidence - left.confidence || left.at - right.at
    )) {
      if (candidate.at < 2 || candidate.at > prompts.length - 2) continue;
      if (selected.some((boundary) => Math.abs(boundary.at - candidate.at) < 2)) continue;
      selected.push(candidate);
      if (selected.length >= maximumBoundaries) break;
    }
    const boundaries = selected.sort((left, right) => left.at - right.at);
    if (boundaries.length === 0) continue;
    const strands = buildThreadStrands(threadPrompts, boundaries, 0.35);
    const confidence = Math.max(...boundaries.map((boundary) => boundary.confidence));
    const segmentation: ThreadSegmentation = {
      id: conversation.conversationId,
      title: conversation.title,
      date: conversation.date,
      promptCount: conversation.prompts.length,
      analyzedPrompts: prompts.length,
      confidence,
      prompts: threadPrompts,
      boundaries,
      strands,
      sources: [sourceOf(conversation)],
    };
    threads.push(segmentation);

    for (const strand of strands) {
      const strandVectors = promptVectors.slice(strand.firstPrompt, strand.lastPrompt + 1);
      searchEntries.push({
        id: `strand:${conversation.conversationId}:${strand.id}`,
        type: "strand",
        title: `${conversation.title} · ${strand.label}`,
        detail: `${strand.promptCount} prompts in one conversation strand`,
        context: prompts
          .slice(strand.firstPrompt, strand.lastPrompt + 1)
          .map((prompt) => prompt.text)
          .join("\n")
          .slice(0, 1_600),
        source: strand.sources[0] ?? sourceOf(conversation),
        topicId: null,
        embedding: average(strandVectors),
      });
    }
  }

  return {
    threads: threads
      .sort(
        (left, right) =>
          right.confidence - left.confidence ||
          right.boundaries.length - left.boundaries.length ||
          right.promptCount - left.promptCount
      )
      .slice(0, THREAD_CONVERSATION_CAP),
    searchEntries,
  };
}

export async function buildSemanticMemory(
  allConversations: ConversationRecord[],
  allPrompts: UserPrompt[],
  allFacts: FactCandidate[],
  threadCandidateIds: string[],
  analysis: AnalysisResolution,
  progress: Progress
): Promise<{ report: SemanticReport; searchIndex: SearchEntry[] }> {
  const conversations = stableSample(allConversations, CONVERSATION_CAP);
  const prompts = sampleQuestions(allPrompts);
  const facts = stableSample(allFacts, FACT_CAP);
  const preparedThreads = prepareThreads(allConversations, threadCandidateIds);
  const threadPrompts = preparedThreads.threads.flatMap((thread) => thread.prompts);
  const texts = [
    ...conversations.map(conversationFingerprint),
    ...prompts.map((prompt) => prompt.text),
    ...facts.map((fact) => fact.text),
    ...TOPIC_ANCHORS.map(([, description]) => description),
    ...threadPrompts.map((prompt) => prompt.text),
  ];
  const embedded = await embedTexts(texts, analysis.resolvedModelProfile, progress);
  const { vectors, runtime } = embedded;
  const conversationVectors = vectors.slice(0, conversations.length);
  const promptVectors = vectors.slice(conversations.length, conversations.length + prompts.length);
  const factVectors = vectors.slice(conversations.length + prompts.length);
  const anchorVectors = factVectors.slice(facts.length, facts.length + TOPIC_ANCHORS.length);
  const boundedFactVectors = factVectors.slice(0, facts.length);
  const threadVectorStart =
    conversations.length + prompts.length + facts.length + TOPIC_ANCHORS.length;
  const threadVectors = vectors.slice(threadVectorStart);

  progress("cluster", "Grouping repeated questions", 0, 4, runtime);
  const repeats = semanticRepeats(prompts, promptVectors);
  progress("cluster", "Building fact history", 1, 4, runtime);
  const groupedFacts = groupFacts(facts, boundedFactVectors);
  progress("cluster", "Laying out topic graph", 2, 4, runtime);
  const graph = topicGraph(conversations, conversationVectors, anchorVectors);
  progress("cluster", "Segmenting conversation strands", 3, 4, runtime);
  const segmented = segmentThreads(preparedThreads.threads, threadVectors);

  const searchIndex: SearchEntry[] = [
    ...conversations.map((conversation, index) => ({
      id: `conversation:${conversation.conversationId}`,
      type: "conversation" as const,
      title: conversation.title,
      detail: `${conversation.messageCount} messages`,
      context: conversationFingerprint(conversation),
      source: sourceOf(conversation),
      topicId: `topic-${graph.assignments[index]}`,
      embedding: conversationVectors[index],
    })),
    ...prompts.map((prompt, index) => ({
      id: `question:${prompt.id}`,
      type: "question" as const,
      title: prompt.text,
      detail: prompt.title,
      context: prompt.text,
      source: sourceOf(prompt),
      topicId: null,
      embedding: promptVectors[index],
    })),
    ...facts.map((fact, index) => ({
      id: `fact:${fact.id}`,
      type: "fact" as const,
      title: fact.text,
      detail: fact.cue === "statement" ? "Detected statement" : `Detected ${fact.cue}`,
      context: fact.text,
      source: sourceOf(fact),
      topicId: null,
      embedding: factVectors[index],
    })),
    ...graph.topics.map((topic, index) => ({
      id: `topic:${topic.id}`,
      type: "topic" as const,
      title: topic.label,
      detail: `${topic.count} conversations · ${topic.terms.join(", ")}`,
      context: `${topic.label}. ${topic.count} conversations. Distinctive terms: ${topic.terms.join(", ")}.`,
      source: topic.sources[0] ?? null,
      topicId: topic.id,
      embedding: graph.centroids[index],
    })),
    ...segmented.searchEntries,
  ];

  const model = MODEL_PROFILES[analysis.resolvedModelProfile];
  progress("cluster", "Semantic memory ready", 4, 4, runtime);
  return {
    report: {
      model: {
        id: model.id,
        revision: model.revision,
        requestedProfile: analysis.modelProfile,
        resolvedProfile: analysis.resolvedModelProfile,
        approximateDownloadMb:
          runtime.dtype === "fp32" && analysis.resolvedModelProfile === "compact"
            ? 90
            : model.approximateDownloadMb,
        profileReason: analysis.profileReason,
        embeddedConversations: conversations.length,
        totalConversations: allConversations.length,
        embeddedQuestions: prompts.length,
        totalQuestions: allPrompts.length,
        embeddedFacts: facts.length,
        totalFacts: allFacts.length,
        embeddedThreadPrompts: threadPrompts.length,
        totalThreadPrompts: preparedThreads.totalPrompts,
        embeddedTopicAnchors: TOPIC_ANCHORS.length,
        runtime,
      },
      repeats,
      facts: groupedFacts,
      topics: graph.topics,
      edges: graph.edges,
      threads: segmented.threads,
    },
    searchIndex,
  };
}

type RankedEvidence = LexicalSearchEntry & { similarity: number };

type GroupedEvidence = RankedEvidence & {
  repetitionCount: number;
  sources: SourceRef[];
  provenance: RankedEvidence[];
};

function isDateIndependentPrompt(text: string): boolean {
  if (/\b(now|today|yesterday|tomorrow|currently|this|last|next|ago)\b/iu.test(text)) {
    return false;
  }
  // Recognize generic question/directive structure, not a list of state verbs.
  // Statements, mixed utterances and unknown forms retain their observation date.
  const question = /^(how|what|why|which)\b[^.!?]*\?$/iu.test(text);
  const policy = /^(always|never|do not|don['’]t)\s+[^.!?]+[.!]?$/iu.test(text);
  const body = text.replace(/^how\s+(do|can|could|should|would)\s+(i|we|you)\s+/iu, "");
  const personal =
    /\b(i|me|my|mine|we|us|our|ours|you|your|yours|he|his|she|her|hers|they|them|their|theirs)\b/iu;
  const stateClause = /\b(am|is|are|was|were|have|has|had)\b/iu;
  return (question || policy) && !personal.test(body) && !stateClause.test(body);
}

function searchEvidenceKey(entry: RankedEvidence): string {
  // Do not use normalizedKey: removing punctuation can erase negation or code.
  const text = (entry.context ?? entry.title).replace(/\s+/gu, " ").trim();
  if (!text || (entry.type !== "question" && entry.type !== "fact")) return entry.id;
  const dated = entry.type === "fact" || !isDateIndependentPrompt(text);
  // Record role does not establish that wording is independent of observation time.
  // Facts also retain case and detection cues.
  return JSON.stringify([
    entry.type,
    entry.type === "question" ? text.toLowerCase() : text,
    entry.type === "fact" ? entry.detail : null,
    dated ? (entry.source?.date ?? entry.id) : null,
  ]);
}

export function groupSearchEvidence(results: RankedEvidence[], limit = 16): GroupedEvidence[] {
  const groups = new Map<string, GroupedEvidence>();
  const ranked = results.slice().sort((left, right) => {
    const score = right.similarity - left.similarity;
    return score || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  });
  for (const entry of ranked) {
    const key = searchEvidenceKey(entry);
    const existing = groups.get(key);
    if (existing) {
      existing.repetitionCount += 1;
      existing.provenance.push(entry);
      if (entry.source) existing.sources.push(entry.source);
    } else {
      groups.set(key, {
        ...entry,
        repetitionCount: 1,
        sources: entry.source ? [entry.source] : [],
        provenance: [entry],
      });
    }
  }
  return [...groups.values()]
    .filter((entry) => entry.similarity > 0)
    .slice(0, Math.max(0, Math.floor(limit)));
}

export async function searchMemory(
  query: string,
  index: SearchEntry[],
  lexicalIndex: LexicalSearchEntry[],
  profile: AnalysisResolution["resolvedModelProfile"],
  progress: Progress
): Promise<GroupedEvidence[]> {
  const { vectors } = await embedTexts([query], profile, progress);
  const [queryVector] = vectors;
  const semanticResults = index.map(({ embedding, ...entry }) => {
    const score = cosine(queryVector, embedding);
    return { ...entry, semanticScore: score > 0.18 ? score : 0 };
  });
  const queryTerms = new Set(
    normalizedKey(query)
      .split(" ")
      .filter((term) => term.length > 2)
  );
  const lexicalResults = lexicalIndex.map((entry) => {
    const haystack = normalizedKey(`${entry.title} ${entry.detail}`);
    const terms = new Set(haystack.split(" "));
    const overlap = [...queryTerms].filter((term) => terms.has(term)).length;
    const phraseBonus = haystack.includes(normalizedKey(query)) ? 0.3 : 0;
    return {
      ...entry,
      lexicalScore: Math.min(0.99, (overlap / Math.max(1, queryTerms.size)) * 0.68 + phraseBonus),
    };
  });

  const candidates = new Map<
    string,
    Omit<SearchEntry, "embedding"> & {
      semanticScore: number;
      lexicalScore: number;
    }
  >();
  for (const { semanticScore, ...result } of semanticResults) {
    candidates.set(result.id, { ...result, semanticScore, lexicalScore: 0 });
  }
  for (const { lexicalScore, ...result } of lexicalResults) {
    const existing = candidates.get(result.id);
    candidates.set(result.id, {
      ...result,
      semanticScore: existing?.semanticScore ?? 0,
      lexicalScore,
    });
  }

  const topicByConversation = new Map(
    index
      .filter((entry) => entry.source && entry.topicId)
      .map((entry) => [entry.source!.conversationId, entry.topicId!] as const)
  );
  return groupSearchEvidence(
    [...candidates.values()].map(({ semanticScore, lexicalScore, ...entry }) => {
      const combined =
        semanticScore > 0 && lexicalScore > 0
          ? semanticScore * 0.65 + lexicalScore * 0.55
          : semanticScore > 0
            ? semanticScore * 0.82
            : lexicalScore * 0.9;
      return {
        ...entry,
        topicId:
          entry.topicId ??
          (entry.source ? (topicByConversation.get(entry.source.conversationId) ?? null) : null),
        similarity: Math.min(0.99, combined),
      };
    })
  );
}

export function buildLexicalIndex(
  conversations: ConversationRecord[],
  prompts: UserPrompt[],
  facts: FactCandidate[]
): LexicalSearchEntry[] {
  return [
    ...conversations.map((conversation) => ({
      id: `conversation:${conversation.conversationId}`,
      type: "conversation" as const,
      title: conversation.title,
      detail: `${conversation.messageCount} messages`,
      context: conversationFingerprint(conversation),
      source: sourceOf(conversation),
      topicId: null,
    })),
    ...prompts.map((prompt) => ({
      id: `question:${prompt.id}`,
      type: "question" as const,
      title: prompt.text,
      detail: prompt.title,
      context: prompt.text,
      source: sourceOf(prompt),
      topicId: null,
    })),
    ...facts.map((fact) => ({
      id: `fact:${fact.id}`,
      type: "fact" as const,
      title: fact.text,
      detail: fact.cue === "statement" ? "Detected statement" : `Detected ${fact.cue}`,
      context: fact.text,
      source: sourceOf(fact),
      topicId: null,
    })),
  ];
}
