import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { test } from "node:test";
import { chromium, expect } from "@playwright/test";
import { createServer as createViteServer } from "vite";

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
let demo;
try {
  const { createDemoData } = await vite.ssrLoadModule("/src/lib/demo-data.ts");
  const conversations = Array.from({ length: 24 }, (_, index) => {
    const date = Date.UTC(2025, index % 12, 1 + index) / 1000;
    const source = { conversationId: `private-${index}`, title: "PRIVATE_SYNTHETIC_TITLE", date };
    return {
      ...source,
      updatedAt: date,
      model: "synthetic",
      messageCount: 4,
      userMessageCount: 1,
      assistantMessageCount: 3,
      wordCount: 50,
      prompts: [
        {
          ...source,
          id: `prompt-${index}`,
          text:
            index % 2
              ? "How can I learn software programming?"
              : "How should I plan a travel budget?",
        },
      ],
    };
  });
  demo = JSON.stringify(createDemoData(conversations));
} finally {
  await vite.close();
}

async function serveApp() {
  const state = { requests: 0, mode: "success", delay: 500 };
  const server = createServer(async (request, response) => {
    if (request.url === "/demo/report-v1.json") {
      state.requests += 1;
      if (state.mode === "failure") return response.writeHead(503).end("unavailable");
      const body = state.mode === "invalid" ? '{"title":"PRIVATE_SYNTHETIC_TITLE"}' : demo;
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      });
      const split = Math.floor(body.length / 2);
      response.write(body.slice(0, split));
      setTimeout(() => response.end(body.slice(split)), state.delay);
      return;
    }
    try {
      const path = request.url === "/" ? "index.html" : request.url.slice(1).split("?")[0];
      if (path.includes("..")) return response.writeHead(400).end();
      const body = await readFile(new URL(`../dist/${path}`, import.meta.url));
      response.setHeader(
        "Content-Type",
        path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html"
      );
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, state, origin: `http://127.0.0.1:${server.address().port}` };
}

async function withBrowser(width, run, timezoneId = "UTC") {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, timezoneId });
    const errors = [];
    const remote = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      if (route.request().url().startsWith(app.origin)) return route.continue();
      remote.push(route.request().url());
      return route.abort();
    });
    await page.goto(app.origin);
    await expect(page.locator("#load-demo")).toBeVisible();
    if (app.state.requests !== 0) throw new Error("Landing preloaded the demo");
    await run(page, app);
    if (errors.length) throw new Error(`Browser runtime errors: ${errors.join("; ")}`);
    if (remote.some((url) => /huggingface|onnx|transformers/i.test(url))) {
      throw new Error("Demo downloaded an inference model");
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => app.server.close(resolve));
  }
}

for (const width of [390, 768, 1440]) {
  test(`demo loads explicitly with truthful graphs and private controls omitted at ${width}px`, async () => {
    await withBrowser(width, async (page, app) => {
      await page.locator("#load-demo").click();
      await expect(page.locator("#demo-progress")).toBeVisible();
      await expect(page.locator("#demo-progress-bar")).toHaveAttribute("value", /\d/);
      await expect(page.locator("#report-view")).toBeVisible();
      await expect(page.locator("#demo-notice")).toContainText("aggregate");
      const highlightFits = await page.locator(".atlas-highlight").evaluate((element) => {
        const card = element.getBoundingClientRect();
        return [...element.children].every((child) => {
          const bounds = child.getBoundingClientRect();
          return bounds.left >= card.left - 1 && bounds.right <= card.right + 1;
        });
      });
      assert.equal(highlightFits, true, "aggregate highlight content must stay inside its card");
      await expect(page.locator("#overview-stats")).toContainText(/Conversations\s*24/);
      await expect(page.locator("#topic-graph")).toBeVisible();
      assert.ok((await page.locator("#topic-graph circle").count()) > 0);
      const weights = await page.locator("#topic-graph .graph-edge").evaluateAll((edges) =>
        edges.map((edge) => ({
          source: edge.getAttribute("data-source"),
          target: edge.getAttribute("data-target"),
          width: edge.style.strokeWidth,
        }))
      );
      const selectedTopic = await page
        .locator("#topic-graph .graph-node")
        .first()
        .getAttribute("data-id");
      await page.locator("#topic-graph .graph-node").first().click();
      await expect(page.locator("#evidence-panel")).toBeVisible();
      await expect(page.locator("#evidence-content")).toContainText("aggregate counts only");
      const unconnected = weights.filter(
        ({ source, target }) => source !== selectedTopic && target !== selectedTopic
      );
      for (const edge of unconnected) {
        const actual = await page
          .locator(
            `#topic-graph .graph-edge[data-source="${edge.source}"][data-target="${edge.target}"]`
          )
          .evaluate((element) => element.style.strokeWidth);
        assert.equal(
          actual,
          edge.width,
          "selection must retain the route's original strength encoding"
        );
      }
      await page.locator("#close-evidence").click();
      await expect(page.locator("#save-memory")).toBeHidden();
      await expect(page.locator("#memory-search")).toBeHidden();
      await expect(page.locator("#enable-memory-chat")).toBeHidden();
      await expect(page.locator("body")).not.toContainText("PRIVATE_SYNTHETIC_TITLE");
      assert.equal(app.state.requests, 1);
      await page.locator("#atlas-period").selectOption("all");
      await expect(page.locator("#demo-notice")).toBeVisible();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        false,
        "viewport must not overflow"
      );
      const artifactDir = process.env.MEMORY_MAP_DEMO_ARTIFACT_DIR;
      if (artifactDir) {
        await mkdir(artifactDir, { recursive: true });
        await page.screenshot({ path: join(artifactDir, `demo-${width}.png`), fullPage: true });
      }
      await page.locator("#reset-report").click();
      await expect(page.locator("#import-view")).toBeVisible();
      await expect(page.locator("#demo-progress")).toBeHidden();
    });
  });
}

test("demo cancellation ignores a late response and retry recovers from a failed download", async () => {
  await withBrowser(1440, async (page, app) => {
    app.state.delay = 800;
    await page.locator("#load-demo").click();
    await expect(page.locator("#demo-progress")).toBeVisible();
    await page.locator("#cancel-demo").click();
    await expect(page.locator("#import-view")).toBeVisible();
    await page.waitForTimeout(900);
    await expect(page.locator("#report-view")).toBeHidden();
    app.state.mode = "failure";
    await page.locator("#load-demo").click();
    await expect(page.locator("#error-view")).toBeVisible();
    await expect(page.locator("#retry-demo")).toBeVisible();
    app.state.mode = "success";
    app.state.delay = 0;
    await page.locator("#retry-demo").click();
    await expect(page.locator("#report-view")).toBeVisible();
    await expect(page.locator("#demo-notice")).toBeVisible();
  });
});

test("unexpected demo fields fail closed", async () => {
  await withBrowser(390, async (page, app) => {
    app.state.mode = "invalid";
    app.state.delay = 0;
    await page.locator("#load-demo").click();
    await expect(page.locator("#error-view")).toBeVisible();
    await expect(page.locator("#report-view")).toBeHidden();
    await expect(page.locator("body")).not.toContainText("PRIVATE_SYNTHETIC_TITLE");
  });
});

test("aggregate date ranges match UTC calendar days west of UTC", async () => {
  await withBrowser(
    390,
    async (page) => {
      await page.locator("#load-demo").click();
      await expect(page.locator("#report-meta")).toContainText("Jan 1, 2025");
      await expect(page.locator("#report-meta")).toContainText("Dec 24, 2025");
    },
    "America/Los_Angeles"
  );
});
