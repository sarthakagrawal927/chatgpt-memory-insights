import { handleMarkdown } from "../src/data/markdown-registry";
import { wantsMarkdown } from "../vendor/agent-surfaces/http.mjs";
import { advertiseMarkdown } from "../vendor/agent-surfaces/adapters/static-assets.mjs";
/**
 * Cloudflare Pages middleware — agent-friendly surfaces for Memory Map.
 * Handles /openapi.json, JSON error responses for unknown /api/* paths,
 * Vary: Accept on HTML with markdown alternates, and agent-friendly 404s.
 */

const ORIGIN = "https://chatgpt.significanthobbies.com";

function discoveryLinks(markdownPath: string): string {
  return [
    `</sitemap.xml>; rel="sitemap"; type="application/xml"`,
    `<${markdownPath}>; rel="alternate"; type="text/markdown"`,
    `</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"`,
    `</.well-known/ai-catalog.json>; rel="service-desc"; type="application/ai-catalog+json"`,
    `</.well-known/agent-skills/index.json>; rel="agent-skills"; type="application/json"`,
  ].join(", ");
}

const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Memory Map discovery surfaces",
    version: "1.0.0",
    description:
      "Private, browser-local analysis of a ChatGPT export into evidence-linked memory and longitudinal insights. These read-only discovery documents do not accept archives, run analysis, or expose derived memory.",
    contact: { name: "Memory Map", url: ORIGIN },
  },
  servers: [{ url: ORIGIN }],
  tags: [{ name: "agent-surfaces", description: "Machine-readable public surfaces" }],
  paths: {
    "/api/ai": {
      get: {
        operationId: "getAgentCatalog",
        tags: ["agent-surfaces"],
        summary: "Agent catalog",
        description: "JSON inventory of public agent surfaces.",
        responses: { "200": { description: "Agent catalog", content: { "application/json": {} } } },
      },
    },
    "/llms.txt": {
      get: {
        operationId: "getLlmsTxt",
        tags: ["agent-surfaces"],
        summary: "llms.txt index",
        responses: { "200": { description: "Markdown index", content: { "text/plain": {} } } },
      },
    },
    "/llms-full.txt": {
      get: {
        operationId: "getLlmsFullTxt",
        tags: ["agent-surfaces"],
        summary: "Full agent brief",
        responses: { "200": { description: "Markdown brief", content: { "text/plain": {} } } },
      },
    },
    "/sitemap.xml": {
      get: {
        operationId: "getSitemap",
        tags: ["agent-surfaces"],
        summary: "Sitemap",
        responses: { "200": { description: "XML sitemap", content: { "application/xml": {} } } },
      },
    },
    "/openapi.json": {
      get: {
        operationId: "getOpenApiSpec",
        tags: ["agent-surfaces"],
        summary: "OpenAPI specification",
        description: "This document.",
        responses: {
          "200": { description: "OpenAPI 3.1 spec", content: { "application/json": {} } },
        },
      },
    },
  },
};

function jsonError(status: number, code: string, message: string, path: string): Response {
  return new Response(JSON.stringify({ error: { code, message, path } }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

function markdown404(pathname: string): Response {
  const body = `# 404 — Not Found

\`${pathname}\` does not exist on ${ORIGIN}.

## Where to look next

- [Home](${ORIGIN}/)
- [Sitemap](${ORIGIN}/sitemap.xml)
- [Agent index](${ORIGIN}/llms.txt)
- [Full agent brief](${ORIGIN}/llms-full.txt)
- [Agent catalog (JSON)](${ORIGIN}/api/ai)
`;
  return new Response(body, {
    status: 404,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function onRequest(context: {
  request: Request;
  next: () => Promise<Response>;
}): Promise<Response> {
  const { request, next } = context;
  if (new URL(request.url).pathname !== "/api/ai") {
    const markdown = await handleMarkdown(request);
    if (markdown) return markdown;
  }
  if (request.method !== "GET" && request.method !== "HEAD") return next();

  const url = new URL(request.url);
  const path = url.pathname;

  // /openapi.json — serve the spec directly.
  if (path === "/openapi.json" || path === "/openapi.yaml") {
    return new Response(JSON.stringify(OPENAPI_SPEC, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=3600",
      },
    });
  }

  // JSON errors for unknown /api/* paths (except /api/ai which is handled by _redirects).
  if (path.startsWith("/api/") && path !== "/api/ai") {
    return jsonError(404, "not_found", `Unknown API path: ${path}`, path);
  }

  const response = await next();

  // Add Vary: Accept to HTML responses that have markdown alternates.
  if (
    response.status === 200 &&
    (response.headers.get("content-type") || "").includes("text/html") &&
    !path.includes(".") &&
    !path.startsWith("/api/")
  ) {
    const headers = new Headers(response.headers);
    const markdownPath =
      path === "/"
        ? "/index.md"
        : path === "/about/"
          ? "/about.md"
          : path === "/used-by/"
            ? "/used-by.md"
            : "/changelog.md";
    const existingVary = headers.get("vary");
    headers.set(
      "vary",
      existingVary ? `${existingVary}, Accept, Accept-Encoding` : "Accept, Accept-Encoding"
    );
    headers.set("link", discoveryLinks(markdownPath));
    return advertiseMarkdown(
      new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }),
      ORIGIN
    );
  }

  // Agent-friendly 404 for markdown-accepting clients.
  if (response.status === 404 && wantsMarkdown(request) && !path.startsWith("/api/")) {
    return markdown404(path);
  }

  // Ensure 404 status is preserved for HTML clients too.
  if (response.status === 404 && !path.startsWith("/api/")) {
    const headers = new Headers(response.headers);
    headers.set("vary", "Accept, Accept-Encoding");
    return new Response(response.body, { status: 404, headers });
  }

  return response;
}
