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
      const pathname = request.url.split("?")[0];
      const path = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
      if (path.includes("..")) return response.writeHead(400).end();
      const body = await readFile(new URL(`../dist/${path}`, import.meta.url));
      response.setHeader(
        "Content-Type",
        path.endsWith(".woff2")
          ? "font/woff2"
          : path.endsWith(".js")
            ? "text/javascript"
            : path.endsWith(".css")
              ? "text/css"
              : "text/html"
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
    await expect(page.locator("#load-demo")).toHaveAttribute("data-slot", "native-button");
    await expect(page.locator("#load-demo")).toHaveAttribute("data-variant", "brand");
    const fontsLoaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return ["Geist Variable", "Figtree Variable"].every((family) =>
        [...document.fonts].some((face) => face.family.includes(family) && face.status === "loaded")
      );
    });
    if (!fontsLoaded) throw new Error("Shared UI font assets did not load");
    const inputClipped = await page
      .locator("#archive-input")
      .evaluate((element) => getComputedStyle(element).clipPath === "inset(50%)");
    const fileBounds = await page.locator("#archive-input").boundingBox();
    if (!inputClipped || !fileBounds || fileBounds.width > 2 || fileBounds.height > 2) {
      throw new Error("Hidden file input overlaps nearby controls");
    }
    for (const dark of [false, true]) {
      await page.evaluate(
        (enabled) => document.documentElement.classList.toggle("dark", enabled),
        dark
      );
      const selection = await page
        .locator('[data-confidence="65"]')
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element);
          const sibling = getComputedStyle(element.previousElementSibling);
          return {
            background: style.backgroundColor,
            color: style.color,
            other: sibling.backgroundColor,
          };
        });
      if (selection.background === selection.other || selection.color === selection.background) {
        throw new Error("Selected controls must have a distinct background and visible labels");
      }
    }
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
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

async function viewportOverflow(page) {
  return page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll("body *")]
      .flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        if (bounds.right <= window.innerWidth + 1 || bounds.width === 0) return [];
        const style = getComputedStyle(element);
        return [
          {
            tag: element.tagName,
            id: element.id,
            class: element.getAttribute("class"),
            right: bounds.right,
            width: bounds.width,
            transform: style.transform,
          },
        ];
      })
      .slice(0, 20),
  }));
}

for (const width of [360, 390, 768, 1440]) {
  test(`demo loads explicitly with truthful graphs and private controls omitted at ${width}px`, async () => {
    await withBrowser(width, async (page, app) => {
      await page.locator("#load-demo").click();
      await expect(page.locator("#demo-progress")).toBeVisible();
      await expect(page.locator("#demo-progress-bar")).toHaveAttribute("value", /\d/);
      await expect(page.locator("#report-view")).toBeVisible();
      await expect(page.locator("#demo-notice")).toContainText("aggregate");
      const designSystem = await page.locator("#reset-report").evaluate((button) => ({
        radius: parseFloat(getComputedStyle(button).borderRadius),
        font: getComputedStyle(document.body).fontFamily,
        charts: document.querySelectorAll('[data-slot="chart-panel"]').length,
        rows: document.querySelectorAll('#topic-list [data-slot="native-button"]').length,
      }));
      assert.ok(designSystem.radius > 0, "actions must use the shared rounded control geometry");
      assert.match(designSystem.font, /Geist/);
      assert.equal(designSystem.charts, 7);
      const labelsFit = await page
        .locator(".matrix-row-label")
        .evaluateAll((rows) => rows.every((row) => row.scrollWidth <= row.clientWidth + 1));
      assert.equal(labelsFit, true, "language-chart labels must fit their controls");
      assert.ok(designSystem.rows > 0, "dynamic topic controls must use the shared DOM adapter");
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
      const overflow = await viewportOverflow(page);
      assert.equal(
        overflow.scrollWidth > overflow.width,
        false,
        `viewport must not overflow: ${JSON.stringify(overflow)}`
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

test("report tabs support keyboard navigation and evidence restores focus", async () => {
  await withBrowser(390, async (page) => {
    await page.locator("#load-demo").click();
    await expect(page.locator("#report-view")).toBeVisible();
    const tabs = page.locator("[data-evolution]");
    await tabs.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(tabs.nth(2)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(0)).toBeFocused();
    await page.keyboard.press("Home");
    assert.equal(
      await tabs.evaluateAll((nodes) => nodes.filter((node) => node.tabIndex === 0).length),
      1
    );
    const topic = page.locator("#topic-graph .graph-node").first();
    await topic.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#close-evidence")).toBeFocused();
    await expect(page.locator(".app-shell")).toHaveAttribute("inert", "");
    await page.keyboard.press("Escape");
    await expect(topic).toBeFocused();
    await expect(page.locator("#evidence-panel")).toBeHidden();
    await expect(page.locator(".app-shell")).not.toHaveAttribute("inert", "");
    assert.equal(
      await page.evaluate(() => {
        const event = new KeyboardEvent("keydown", {
          key: "k",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      false,
      "a hidden search must not swallow the browser shortcut"
    );
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }))
    );
    await tabs.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toBeFocused();
  });
});

for (const reducedMotion of ["reduce", "no-preference"]) {
  test(`report motion remains interruptible with ${reducedMotion}`, async () => {
    await withBrowser(360, async (page) => {
      await page.emulateMedia({ reducedMotion });
      await page.locator("#load-demo").click();
      await expect(page.locator("#report-view")).toBeVisible();
      const topic = page.locator("#topic-graph .graph-node").first();
      await topic.click();
      await expect(page.locator("#evidence-panel")).toHaveAttribute("aria-hidden", "false");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.getAnimations().filter((animation) => animation.playState === "running")
                .length
          )
        )
        .toBe(0);
      await page.locator("#close-evidence").click();
      await topic.click();
      await page.keyboard.press("Escape");
      await expect(topic).toBeFocused();
      await expect(page.locator("#evidence-panel")).toHaveAttribute("inert", "");
      const overflow = await viewportOverflow(page);
      assert.ok(overflow.scrollWidth <= overflow.width, JSON.stringify(overflow));
      await page.locator("#reset-report").click();
      await expect(page.locator("#import-view")).toBeVisible();
      assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    });
  });
}

test("public-page analytics initializes before its delayed provider script", async () => {
  await withBrowser(768, async (page) => {
    let release;
    const ready = new Promise((resolve) => {
      release = resolve;
    });
    await page.route("https://www.clarity.ms/tag/*", async (route) => {
      await ready;
      await route.fulfill({
        contentType: "text/javascript",
        body: `
        if (!window.clarity.v) window.clarity('event', 'sdk_ready');
        window.providerQueue = window.clarity.q.map((entry) => Array.from(entry));
      `,
      });
    });
    try {
      await page.goto(new URL("/about/", page.url()).href, { waitUntil: "domcontentloaded" });
      assert.deepEqual(
        await page.evaluate(() => window.clarity.q.map((entry) => Array.from(entry))),
        [["set", "project_id", "chatgpt-memory-insights"]]
      );
      release();
      await expect
        .poll(() => page.evaluate(() => window.providerQueue))
        .toEqual([
          ["set", "project_id", "chatgpt-memory-insights"],
          ["event", "sdk_ready"],
        ]);
      await expect(page.locator("h1")).toBeVisible();
      for (const path of ["/about/", "/changelog/", "/used-by/"]) {
        await page.route("https://www.clarity.ms/tag/*", (route) => route.abort());
        const response = await page.goto(new URL(path, page.url()).href);
        assert.equal(response.status(), 200);
        await expect(page.locator("h1")).toBeVisible();
        const brokenAnchors = await page
          .locator('a[href^="#"]')
          .evaluateAll((links) =>
            links
              .map((link) => link.getAttribute("href").slice(1))
              .filter((id) => id && !document.getElementById(decodeURIComponent(id)))
          );
        assert.deepEqual(brokenAnchors, [], `${path} has broken section links`);
        for (const width of [360, 768, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          const overflow = await viewportOverflow(page);
          assert.ok(overflow.scrollWidth <= overflow.width, `${path}: ${JSON.stringify(overflow)}`);
        }
      }
    } finally {
      release();
    }
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
