/// <reference lib="webworker" />

import {
  buildMemoryChatPrompt,
  extractGeneratedAnswer,
  MEMORY_CHAT_MODEL,
  type MemoryChatRuntime,
  type MemoryChatWorkerRequest,
  type MemoryChatWorkerResponse,
} from "../lib/memory-chat";

const worker = self as DedicatedWorkerGlobalScope;

type Generator = {
  (
    prompt: string,
    options: {
      max_new_tokens: number;
      do_sample: false;
      repetition_penalty: number;
      no_repeat_ngram_size: number;
    }
  ): Promise<unknown>;
  dispose(): Promise<void>;
};

let generatorPromise: Promise<Generator> | null = null;
const runtime: MemoryChatRuntime = { device: "wasm", dtype: "q8" };

function post(message: MemoryChatWorkerResponse) {
  worker.postMessage(message);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "number") return `browser inference code ${error}`;
  return String(error);
}

async function getGenerator(): Promise<Generator> {
  if (!generatorPromise) {
    generatorPromise = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      env.useBrowserCache = true;
      return (await pipeline("text2text-generation", MEMORY_CHAT_MODEL.id, {
        revision: MEMORY_CHAT_MODEL.revision,
        dtype: runtime.dtype,
        progress_callback: (event: {
          status: string;
          file?: string;
          progress?: number;
          loaded?: number;
          total?: number;
        }) => {
          if (event.status !== "progress") return;
          post({
            type: "progress",
            phase: "model",
            label: event.file ? `Downloading ${event.file}` : "Loading the local chat model",
            current: event.loaded ?? event.progress ?? 0,
            total: event.total ?? 100,
            runtime,
          });
        },
      })) as unknown as Generator;
    })().catch((error) => {
      generatorPromise = null;
      throw error;
    });
  }
  return generatorPromise;
}

async function disposeGenerator() {
  if (!generatorPromise) return;
  const generator = await generatorPromise;
  await generator.dispose();
  generatorPromise = null;
}

worker.addEventListener("message", async (event: MessageEvent<MemoryChatWorkerRequest>) => {
  try {
    if (event.data.type === "dispose") {
      await disposeGenerator();
      post({ type: "disposed" });
      return;
    }
    const generator = await getGenerator();
    if (event.data.type === "load") {
      post({ type: "ready", runtime });
      return;
    }

    post({
      type: "progress",
      phase: "generate",
      label: "Synthesizing from the retrieved evidence",
      current: 0,
      total: 1,
      runtime,
    });
    const startedAt = performance.now();
    const output = await generator(buildMemoryChatPrompt(event.data.messages), {
      max_new_tokens: MEMORY_CHAT_MODEL.maxNewTokens,
      do_sample: false,
      repetition_penalty: 1.12,
      no_repeat_ngram_size: 3,
    });
    post({
      type: "answer",
      answer: extractGeneratedAnswer(output),
      elapsedMs: performance.now() - startedAt,
      runtime,
    });
  } catch (error) {
    post({ type: "error", message: errorMessage(error), runtime });
  }
});
