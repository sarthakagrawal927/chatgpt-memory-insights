import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoData, parseDemoData } from "./demo-data";
import { loadDemo } from "./load-demo";
import type { ConversationRecord } from "./types";

afterEach(() => vi.unstubAllGlobals());

const date = Date.UTC(2026, 0, 1) / 1000;
const fixture: ConversationRecord = {
  conversationId: "private-id",
  title: "PRIVATE_TITLE",
  date,
  updatedAt: date,
  model: "test",
  messageCount: 2,
  userMessageCount: 1,
  assistantMessageCount: 1,
  wordCount: 10,
  prompts: [
    {
      id: "private-prompt",
      conversationId: "private-id",
      title: "PRIVATE_TITLE",
      date,
      text: "How do I debug software?",
    },
  ],
};

describe("on-demand demo download", () => {
  it("ships only the validated aggregate artifact", () => {
    const bytes = readFileSync(new URL("../../public/demo/report-v1.json", import.meta.url));
    const data = parseDemoData(JSON.parse(bytes.toString()));
    expect(data.totals.conversations).toBe(1061);
    expect(data.totals.userPrompts).toBe(6146);
    expect(bytes.byteLength).toBeLessThan(20000);
  });

  it("reports streamed bytes and preparation, then returns aggregate data", async () => {
    const encoded = new TextEncoder().encode(JSON.stringify(createDemoData([fixture])));
    const split = Math.floor(encoded.length / 2);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoded.slice(0, split));
              controller.enqueue(encoded.slice(split));
              controller.close();
            },
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Content-Length": String(encoded.length),
            },
          }
        )
      )
    );
    const onProgress = vi.fn();
    const report = await loadDemo({ signal: new AbortController().signal, onProgress });
    expect(report.deterministic.totals.conversations).toBe(1);
    expect(JSON.stringify(report)).not.toContain("PRIVATE_TITLE");
    expect(report.semantic).toBeNull();
    expect(onProgress.mock.calls.map(([value]) => value.phase)).toEqual([
      "download",
      "download",
      "download",
      "prepare",
    ]);
    expect(onProgress.mock.calls.at(-1)?.[0]).toEqual({
      phase: "prepare",
      loaded: encoded.length,
      total: encoded.length,
    });
  });

  it("stops when the visitor cancels before report assembly", async () => {
    const abort = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("{}", { headers: { "Content-Type": "application/json" } }))
    );
    await expect(
      loadDemo({
        signal: abort.signal,
        onProgress: ({ loaded }) => {
          if (loaded) abort.abort();
        },
      })
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("keeps compressed downloads indeterminate because fetch exposes decoded bytes", async () => {
    const body = JSON.stringify(createDemoData([fixture]));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": "100",
            "Content-Encoding": "gzip",
          },
        })
      )
    );
    const onProgress = vi.fn();
    await loadDemo({ signal: new AbortController().signal, onProgress });
    const updates = onProgress.mock.calls.map(([value]) => value);
    expect(
      updates.filter(({ phase }) => phase === "download").every(({ total }) => total === null)
    ).toBe(true);
    expect(updates.at(-1)).toEqual({
      phase: "prepare",
      loaded: new TextEncoder().encode(body).length,
      total: new TextEncoder().encode(body).length,
    });
  });

  it("rejects missing, oversized and invalid demo responses", async () => {
    for (const response of [
      new Response("unavailable", { status: 503 }),
      new Response("<html>fallback</html>", { headers: { "Content-Type": "text/html" } }),
      new Response("{}", {
        headers: { "Content-Type": "application/json", "Content-Length": String(3 * 1024 * 1024) },
      }),
      new Response('{"title":"PRIVATE_TITLE"}', {
        headers: { "Content-Type": "application/json" },
      }),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(
        loadDemo({ signal: new AbortController().signal, onProgress: vi.fn() })
      ).rejects.toThrow();
    }
  });

  it("bounds a streaming response even without Content-Length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    await expect(
      loadDemo({ signal: new AbortController().signal, onProgress: vi.fn() })
    ).rejects.toThrow("download limit");
  });
});
