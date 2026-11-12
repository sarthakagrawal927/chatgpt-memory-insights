import { describe, expect, it } from "vitest";
import { handleMarkdown, markdownPages, markdownRoutes } from "../data/markdown-registry";
import {
  capabilityRoutes,
  releases,
  surfaces,
  chatgptExportSteps,
  aboutFacts,
  privacyContract,
} from "../data/public-content";

describe("public source-only Markdown", () => {
  it("retains complete export instructions, visible counts and private-workflow guidance", async () => {
    expect(markdownPages["/"]).toContain(privacyContract);
    expect(markdownPages["/"]).toContain("receives no archive text or derived content");
    for (const parts of chatgptExportSteps)
      expect(markdownPages["/"]).toContain(parts.map((part) => part.text).join(""));
    for (const fact of aboutFacts)
      expect(markdownPages["/about/"]).toContain(`${fact.value} ${fact.label}`);
    const response = await handleMarkdown(
      new Request("https://chatgpt.significanthobbies.com/llms.txt")
    );
    const body = await response!.text();
    for (const path of [
      "/agents.md",
      "/.well-known/agent-skills/explore-memory-map/SKILL.md",
      "/pricing.md",
    ])
      expect(body).toContain(`https://chatgpt.significanthobbies.com${path}`);
  });

  it("covers the four public pages and preserves complete capability and release data", () => {
    expect(markdownRoutes.map((route) => route.path)).toEqual([
      "/",
      "/about/",
      "/changelog/",
      "/used-by/",
    ]);
    for (const route of capabilityRoutes)
      for (const stop of route.stops) {
        expect(markdownPages["/about/"]).toContain(stop.title);
        expect(markdownPages["/about/"]).toContain(stop.detail);
      }
    for (const release of releases)
      for (const outcome of release.outcomes)
        expect(markdownPages["/changelog/"]).toContain(outcome);
    for (const surface of surfaces) expect(markdownPages["/used-by/"]).toContain(surface.detail);
    expect(markdownPages["/about/"]).toContain("### Does not exist\n\nArchive upload endpoint");
  });
  it("renders identical content through all public entrypoints without user request state", async () => {
    for (const path of ["/about/", "/about.md", "/api/md/about"]) {
      const response = await handleMarkdown(
        new Request(`https://chatgpt.significanthobbies.com${path}?query=PRIVATE_FIXTURE`, {
          headers: {
            Accept: "text/markdown",
            Cookie: "PRIVATE_FIXTURE",
            Authorization: "PRIVATE_FIXTURE",
          },
        })
      );
      expect(response!.status).toBe(200);
      expect(response!.headers.get("Content-Location")).toBe(
        "https://chatgpt.significanthobbies.com/about/"
      );
      const body = await response!.text();
      expect(body).toBe(markdownPages["/about/"]);
      expect(body).not.toContain("PRIVATE_FIXTURE");
    }
  });
  it("excludes private and missing entities and preserves true Markdown documents", async () => {
    for (const path of ["/api/md/dashboard", "/api/md/report", "/missing.md"]) {
      const response = await handleMarkdown(
        new Request(`https://chatgpt.significanthobbies.com${path}`)
      );
      expect(response!.status).toBe(404);
      expect(response!.headers.get("X-Robots-Tag")).toBe("noindex, follow");
    }
    expect(
      await handleMarkdown(new Request("https://chatgpt.significanthobbies.com/pricing.md"))
    ).toBeNull();
    expect(
      await handleMarkdown(new Request("https://chatgpt.significanthobbies.com/agents.md"))
    ).toBeNull();
  });
});
