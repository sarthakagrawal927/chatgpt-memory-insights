import type { FullReport, SearchEntry, SearchResult, SourceRef } from "./types";

export const MEMORY_CHAT_MODEL = {
  id: "Xenova/LaMini-Flan-T5-77M",
  revision: "ac7ed8dcdab558daa9d648678e8545a919a81f85",
  approximateDownloadMb: 105,
  maxEvidence: 6,
  maxHistoryTurns: 4,
  maxNewTokens: 96,
} as const;

export type MemoryChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type MemoryChatEvidence = {
  id: string;
  reference: string;
  type: SearchResult["type"];
  title: string;
  excerpt: string;
  detail: string;
  similarity: number;
  source: SourceRef | null;
  topicId: string | null;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type MemoryChatRuntime = {
  device: "wasm";
  dtype: "q8";
};

export type MemoryChatWorkerRequest =
  | { type: "load" }
  | { type: "generate"; messages: ChatMessage[] }
  | { type: "dispose" };

export type MemoryChatWorkerResponse =
  | {
      type: "progress";
      phase: "model" | "generate";
      label: string;
      current: number;
      total: number;
      runtime: MemoryChatRuntime;
    }
  | { type: "ready"; runtime: MemoryChatRuntime }
  | { type: "answer"; answer: string; elapsedMs: number; runtime: MemoryChatRuntime }
  | { type: "disposed" }
  | { type: "error"; message: string; runtime: MemoryChatRuntime };

function compactText(value: string, limit: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

export function buildMemoryChatEvidence(
  results: SearchResult[],
  limit = MEMORY_CHAT_MODEL.maxEvidence
): MemoryChatEvidence[] {
  return results.slice(0, limit).map((result, index) => ({
    id: result.id,
    reference: `S${index + 1}`,
    type: result.type,
    title: compactText(result.title, 180),
    excerpt: compactText(result.context ?? result.title, 900),
    detail: compactText(result.detail, 180),
    similarity: result.similarity,
    source: result.source,
    topicId: result.topicId,
  }));
}

function topicByConversation(index: SearchEntry[]): Map<string, string> {
  return new Map(
    index
      .filter((entry) => entry.source && entry.topicId)
      .map((entry) => [entry.source!.conversationId, entry.topicId!] as const)
  );
}

export function planMemoryChatResults(
  question: string,
  rankedResults: SearchResult[],
  report: FullReport,
  index: SearchEntry[] = []
): SearchResult[] {
  const normalized = question.toLocaleLowerCase();
  const sourceTopics = topicByConversation(index);
  const structured: SearchResult[] = [];
  const changeIntent =
    /\b(chang(?:e|ed|ing)|changed my mind|update(?:d)?|no longer|refut|contradic)\b/.test(
      normalized
    );
  const contradictionIntent = /\bcontradic/.test(normalized);
  const repeatIntent = /\b(repeat|repeated|keep asking|return to|same question)\b/.test(normalized);

  if (changeIntent) {
    for (const fact of (report.semantic?.facts ?? [])
      .filter(
        (item) =>
          item.status === "updated" ||
          item.status === "refuted" ||
          (contradictionIntent && item.status === "contradicted")
      )
      .sort((left, right) => right.confidence - left.confidence || right.lastSeen - left.lastSeen)
      .slice(0, 4)) {
      const source = fact.sources[0] ?? null;
      structured.push({
        id: `memory-change:${fact.id}`,
        type: "fact",
        title: fact.statement,
        detail: `${fact.status} memory · ${fact.history.length} linked statements`,
        context: `Memory state: ${fact.status}. ${fact.reason} Timeline: ${fact.history
          .map((item) => item.text)
          .join(" → ")}`,
        source,
        topicId: source ? (sourceTopics.get(source.conversationId) ?? null) : null,
        similarity: Math.max(0.84, fact.confidence),
      });
    }
  }

  if (repeatIntent) {
    for (const repeat of (report.semantic?.repeats ?? []).slice(0, 4)) {
      const source = repeat.sources[0] ?? null;
      structured.push({
        id: `memory-repeat:${repeat.id}`,
        type: "question",
        title: repeat.representative,
        detail: `${repeat.count} asks · semantic repeat`,
        context: `Repeated question group: ${repeat.questions.join(" | ")}`,
        source,
        topicId: source ? (sourceTopics.get(source.conversationId) ?? null) : null,
        similarity: Math.max(0.82, repeat.confidence),
      });
    }
  }

  if (structured.length > 0 && (changeIntent || repeatIntent)) return structured;
  const seen = new Set(structured.map((item) => item.id));
  return [...structured, ...rankedResults.filter((item) => !seen.has(item.id))];
}

export function buildMemoryChatMessages(
  question: string,
  evidence: MemoryChatEvidence[],
  history: MemoryChatTurn[]
): ChatMessage[] {
  const boundedHistory = history
    .slice(-MEMORY_CHAT_MODEL.maxHistoryTurns)
    .map((turn) => ({ ...turn, content: compactText(turn.content, 800) }));
  const evidencePack =
    evidence.length > 0
      ? evidence
          .map(
            (item) =>
              `[${item.reference}] ${item.type}: ${item.excerpt} (${item.detail}${
                item.source ? `; source: ${item.source.title}` : ""
              })`
          )
          .join("\n")
      : "[No matching memory evidence was retrieved.]";

  return [
    {
      role: "system",
      content:
        "You are a small local synthesis model inside Memory Map. Answer only from the labelled memory evidence in the latest user message. Cite supporting labels like [S1] after each factual claim. If the evidence is weak or missing, say that the mapped history does not contain enough evidence. Never invent preferences, diagnoses, dates, or source content. Keep the answer under 140 words.",
    },
    ...boundedHistory,
    {
      role: "user",
      content: `Memory question: ${compactText(question, 600)}\n\nRetrieved evidence:\n${evidencePack}`,
    },
  ];
}

export function buildMemoryChatPrompt(messages: ChatMessage[]): string {
  return messages
    .map((message) => {
      const label =
        message.role === "system"
          ? "Instructions"
          : message.role === "assistant"
            ? "Previous answer"
            : "User";
      return `${label}: ${message.content}`;
    })
    .join("\n\n")
    .concat("\n\nAnswer with evidence citations:");
}

export function extractGeneratedAnswer(output: unknown): string {
  const first = Array.isArray(output) ? output[0] : output;
  if (!first || typeof first !== "object" || !("generated_text" in first)) {
    throw new Error("The local model returned an unsupported answer format.");
  }
  const generated = (first as { generated_text: unknown }).generated_text;
  if (typeof generated === "string") {
    const answer = generated.trim();
    if (answer) return answer;
  }
  if (Array.isArray(generated)) {
    const lastAssistant = [...generated]
      .reverse()
      .find((message): message is { role: string; content: string } =>
        Boolean(
          message &&
            typeof message === "object" &&
            "role" in message &&
            message.role === "assistant" &&
            "content" in message &&
            typeof message.content === "string"
        )
      );
    if (lastAssistant?.content.trim()) return lastAssistant.content.trim();
  }
  throw new Error("The local model did not produce an answer.");
}

/** Citation syntax is checkable locally; semantic support is not established by it. */
export function validateMemoryChatCitations(
  answer: string,
  evidence: MemoryChatEvidence[]
): { valid: boolean; citations: string[]; reason: string | null } {
  const allowed = new Set(evidence.map((item) => item.reference));
  const citations = [...new Set([...answer.matchAll(/\[(S[\w-]*)\]/gi)].map((match) => match[1]))];
  if (citations.length === 0) {
    return {
      valid: false,
      citations,
      reason: "The local draft did not cite any retrieved evidence.",
    };
  }
  if (citations.some((reference) => !allowed.has(reference))) {
    return { valid: false, citations, reason: "The local draft cited an unknown evidence stop." };
  }
  if (
    /you are a small local synthesis model|answer only from the labelled memory evidence|cite supporting labels|if the evidence is weak or missing|never invent preferences, diagnoses, dates, or source content|keep the answer under 140 words|memory question:|retrieved evidence:|answer with evidence citations:/i.test(
      compactText(answer, answer.length)
    )
  ) {
    return { valid: false, citations, reason: "The local draft repeated its instructions." };
  }
  return { valid: true, citations, reason: null };
}

export function buildMemoryChatFallback(evidence: MemoryChatEvidence[]): string {
  if (evidence.length === 0) {
    return "The mapped history does not contain enough evidence to answer that question.";
  }
  return `The local model’s draft could not be used. Review these retrieved excerpts instead: [${evidence[0].reference}] ${compactText(
    evidence[0].excerpt,
    260
  )}${evidence[1] ? ` A second relevant stop is [${evidence[1].reference}] ${compactText(evidence[1].excerpt, 180)}` : ""}`;
}
