import { describe, expect, it, vi } from "vitest";
import {
  classifyFactHistory,
  cosine,
  groupSearchEvidence,
  INFERENCE_BATCH_SIZE,
  isMemoryPressure,
  MODEL_PROFILES,
  preferredRuntime,
  prepareEmbeddingWork,
  searchMemory,
  supportsWebGpu,
} from "./semantic";
import type { FactCandidate, SearchResult } from "./types";

vi.mock("@huggingface/transformers", () => ({
  env: {},
  pipeline: async () => async (texts: string[]) => ({
    dims: [texts.length, 2],
    data: new Float32Array(texts.flatMap(() => [1, 0])),
  }),
}));

describe("search evidence grouping", () => {
  const evidence = (
    id: string,
    title = "How do I grow tomatoes?",
    overrides: Partial<SearchResult> = {}
  ): SearchResult => ({
    id,
    type: "question",
    title,
    context: title,
    detail: `Conversation ${id}`,
    source: { conversationId: id, title: `Conversation ${id}`, date: 1 },
    topicId: `topic-${id}`,
    similarity: 0.8,
    ...overrides,
  });

  it("packs four repeated conversations without losing any evidence or boosting rank", () => {
    const repeats = ["d", "b", "a", "c"].map((id) => evidence(id));
    const distinct = evidence("other", "How do I grow potatoes?", { similarity: 0.7 });
    const results = groupSearchEvidence([...repeats, distinct], 2);
    expect(results.map((entry) => entry.id)).toEqual(["a", "other"]);
    expect(results[0].repetitionCount).toBe(4);
    expect(results[0].similarity).toBe(0.8);
    expect(results[0].provenance).toEqual([repeats[2], repeats[1], repeats[3], repeats[0]]);
    expect(results[0].sources).toEqual(results[0].provenance.map((entry) => entry.source));
    expect(results[1].repetitionCount).toBe(1);
    expect(repeats.map((entry) => entry.id)).toEqual(["d", "b", "a", "c"]);
  });

  it("normalizes only prompt case and whitespace, preserving punctuation and numbers", () => {
    const results = groupSearchEvidence([
      evidence("a"),
      evidence("b", "  HOW do I\n grow\t tomatoes?  "),
      evidence("c", "How do I grow tomatoes!"),
      evidence("d", "How do I grow 2 tomatoes?"),
      evidence("e", "How can I grow tomatoes?"),
      evidence("f", "How do I not grow tomatoes?"),
    ]);
    expect(results.map((entry) => entry.repetitionCount)).toEqual([2, 1, 1, 1, 1]);
  });

  it("keeps contradictory facts, changed dates, case-sensitive facts and relative time separate", () => {
    const fact = { type: "fact" as const, detail: "Detected statement" };
    const results = groupSearchEvidence([
      evidence("a", "I live in Paris.", fact),
      evidence("b", " I live\n in Paris. ", fact),
      evidence("c", "I do not live in Paris.", fact),
      evidence("d", "I live in Paris.", {
        ...fact,
        source: { conversationId: "d", title: "Later observation", date: 2 },
      }),
      evidence("e", "I live in Paris.", { ...fact, detail: "Detected update" }),
      evidence("f", "I live in PARIS.", fact),
      evidence("g", "Where should I live in 2024?"),
      evidence("h", "Where should I live in 2025?"),
      evidence("i", "Where should I live now?"),
      evidence("j", "Where should I live now?", {
        source: { conversationId: "j", title: "Later question", date: 2 },
      }),
      evidence("k", "I live in Paris."),
      evidence("l", "I live in Paris.", {
        source: { conversationId: "l", title: "Later prompt claim", date: 2 },
      }),
    ]);
    expect(results).toHaveLength(11);
    expect(results[0].repetitionCount).toBe(2);
    expect(results.slice(1).every((entry) => entry.repetitionCount === 1)).toBe(true);
  });

  it("limits distinct groups deterministically after collecting full provenance", () => {
    const entries = [
      ...Array.from({ length: 80 }, (_, index) => evidence(`repeat-${index}`)),
      ...Array.from({ length: 20 }, (_, index) =>
        evidence(`distinct-${index}`, `How do I grow crop ${index}?`, { similarity: 0.7 })
      ),
    ];
    const results = groupSearchEvidence(entries);
    expect(results).toHaveLength(16);
    expect(results[0].provenance).toHaveLength(80);
    expect(groupSearchEvidence(entries.toReversed())).toEqual(results);
    expect(groupSearchEvidence(entries, 0)).toEqual([]);
    expect(groupSearchEvidence(entries, -1)).toEqual([]);
    expect(groupSearchEvidence(entries, 1.9)).toHaveLength(1);
  });

  it.each([
    "I no longer live in Paris.",
    "I don't live in Paris.",
    "My home is in Paris.",
    "We moved to Paris.",
    "The Paris office is closed.",
    "I stopped working there. How do I update my profile?",
    "Where do I live?",
    "What is my address?",
    "Why is the Paris office closed?",
    "How do I explain that the Paris office is closed?",
  ])("retains cross-date observations for either record role: %s", (text) => {
    for (const type of ["question", "fact"] as const) {
      const entries = [1, 2].map((date) =>
        evidence(`${type}-${date}`, text, {
          type,
          detail: "Detected statement",
          source: { conversationId: `${type}-${date}`, title: "Observation", date },
        })
      );
      const results = groupSearchEvidence(entries);
      expect(results).toHaveLength(2);
      expect(results.map((entry) => entry.repetitionCount)).toEqual([1, 1]);
      expect(results.flatMap((entry) => entry.provenance)).toEqual(entries);
    }
  });

  it("groups normalized claims only within a known observation date", () => {
    const entries = [
      evidence("a", "I no longer live in Paris."),
      evidence("b", "  I NO LONGER\n live in Paris. "),
      evidence("c", "I no longer live in Paris.", { source: null }),
      evidence("d", "I no longer live in Paris.", { source: null }),
    ];
    const results = groupSearchEvidence(entries);
    expect(results.map((entry) => entry.repetitionCount)).toEqual([2, 1, 1]);
    expect(results[0].provenance).toEqual(entries.slice(0, 2));
    expect(results[0].sources).toEqual(entries.slice(0, 2).map((entry) => entry.source));
  });

  it.each([
    "How do I grow tomatoes?",
    "What causes rain?",
    "Never share credentials.",
    "Do not share credentials.",
  ])("groups generic questions and policies across dates with full provenance: %s", (text) => {
    const entries = [1, 2, 3].map((date) =>
      evidence(`repeat-${date}`, date === 2 ? `  ${text.toUpperCase()}\n ` : text, {
        similarity: date === 2 ? 0.9 : 0.8,
        source: { conversationId: `repeat-${date}`, title: "Repeated request", date },
      })
    );
    const results = groupSearchEvidence(entries, 1);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("repeat-2");
    expect(results[0].similarity).toBe(0.9);
    expect(results[0].repetitionCount).toBe(3);
    expect(results[0].provenance).toEqual([entries[1], entries[0], entries[2]]);
    expect(results[0].sources).toEqual(results[0].provenance.map((entry) => entry.source));
  });

  it("does not merge other entry types by a partial or generated summary", () => {
    const entries = ["conversation", "strand", "topic"].flatMap((type) => [
      evidence(`${type}-a`, "Same summary", { type: type as SearchResult["type"] }),
      evidence(`${type}-b`, "Same summary", { type: type as SearchResult["type"] }),
    ]);
    expect(groupSearchEvidence(entries)).toHaveLength(6);
  });

  it("groups hybrid retrieval before candidate caps and counts each indexed ID once", async () => {
    const lexical = [
      ...Array.from({ length: 80 }, (_, index) => evidence(`repeat-${index}`)),
      evidence("distinct", "How do I grow potatoes?"),
    ].map(({ similarity: _similarity, ...entry }) => entry);
    const semantic = lexical.map((entry) => ({ ...entry, embedding: new Float32Array([1, 0]) }));
    const progress = vi.fn();
    const results = await searchMemory("grow", semantic, lexical, "compact", progress);
    expect(results).toHaveLength(2);
    const repeated = results.find((entry) => entry.repetitionCount === 80);
    expect(repeated?.provenance).toHaveLength(80);
    expect(repeated?.sources).toHaveLength(80);
    expect(results.some((entry) => entry.id === "distinct")).toBe(true);
    expect(await searchMemory("grow", [], lexical, "compact", progress)).toHaveLength(2);
    expect(await searchMemory("grow", semantic, [], "compact", progress)).toHaveLength(2);
    const partlyMatched = semantic.map((entry, index) => ({
      ...entry,
      embedding: new Float32Array(index === 0 ? [0, 1] : [1, 0]),
    }));
    const semanticOnly = await searchMemory("grow", partlyMatched, [], "compact", progress);
    expect(semanticOnly.find((entry) => entry.repetitionCount === 80)?.sources).toHaveLength(80);
    expect(await searchMemory("unmatched", [partlyMatched[0]], [], "compact", progress)).toEqual(
      []
    );
  });
});

describe("cosine", () => {
  it("compares normalized embedding vectors", () => {
    expect(cosine(new Float32Array([1, 0]), new Float32Array([1, 0]))).toBe(1);
    expect(cosine(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBe(0);
  });
});

describe("browser model profiles", () => {
  it("pins both compact and multilingual model revisions", () => {
    expect(MODEL_PROFILES.compact).toEqual({
      id: "Xenova/all-MiniLM-L6-v2",
      revision: "751bff37182d3f1213fa05d7196b954e230abad9",
      approximateDownloadMb: 24,
    });
    expect(MODEL_PROFILES.multilingual).toEqual({
      id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
      revision: "2c4055b12046f11709e9df2c122e59ffbdc2f900",
      approximateDownloadMb: 135,
    });
  });

  it("prefers bounded GPU batches and keeps a portable fallback", () => {
    expect(preferredRuntime(true)).toEqual({
      device: "webgpu",
      dtype: "fp32",
      batchSize: INFERENCE_BATCH_SIZE.webgpu,
    });
    expect(preferredRuntime(false)).toEqual({
      device: "wasm",
      dtype: "q8",
      batchSize: INFERENCE_BATCH_SIZE.wasm,
    });
    expect(preferredRuntime(true, "multilingual")).toEqual({
      device: "wasm",
      dtype: "q8",
      batchSize: INFERENCE_BATCH_SIZE.wasm,
    });
  });

  it("requires an actual GPU adapter before initializing the model", async () => {
    await expect(supportsWebGpu({ navigator: {} })).resolves.toBe(false);
    await expect(
      supportsWebGpu({ navigator: { gpu: { requestAdapter: async () => null } } })
    ).resolves.toBe(false);
    await expect(
      supportsWebGpu({
        navigator: {
          gpu: {
            requestAdapter: async () => {
              throw new Error("GPU denied");
            },
          },
        },
      })
    ).resolves.toBe(false);
    await expect(
      supportsWebGpu({
        navigator: {
          gpu: {
            requestAdapter: async (options) => {
              expect(options.powerPreference).toBe("high-performance");
              return {};
            },
          },
        },
      })
    ).resolves.toBe(true);
  });

  it("recognizes allocation failures without masking unrelated errors", () => {
    expect(isMemoryPressure(new Error("out of memory allocating tensor"))).toBe(true);
    expect(isMemoryPressure(new Error("network request failed"))).toBe(false);
  });

  it("deduplicates exact texts, sorts work by length, and retains original indexes", () => {
    expect(prepareEmbeddingWork(["longer text", "a", "longer text", "mid"])).toEqual([
      { text: "a", indexes: [1] },
      { text: "mid", indexes: [3] },
      { text: "longer text", indexes: [0, 2] },
    ]);
  });
});

describe("fact history classification", () => {
  const fact = (
    id: string,
    text: string,
    cue: FactCandidate["cue"],
    date: number
  ): FactCandidate => ({
    id,
    text,
    cue,
    date,
    conversationId: id,
    title: id,
  });

  it("requires linked history before calling a statement updated or refuted", () => {
    expect(classifyFactHistory([fact("one", "I don't have an answer.", "refutation", 1)])).toBe(
      "current"
    );
    expect(
      classifyFactHistory([
        fact("one", "I use paper notes.", "statement", 1),
        fact("two", "I no longer use paper notes.", "refutation", 2),
      ])
    ).toBe("refuted");
    expect(
      classifyFactHistory([
        fact("one", "I work remotely.", "statement", 1),
        fact("two", "Actually, I work from an office now.", "update", 2),
      ])
    ).toBe("updated");
  });
});
