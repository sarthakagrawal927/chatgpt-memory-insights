# DaddyRad MCP source container

This repository now hosts the **DaddyRad MCP server** ([`mcp/`](mcp/README.md)).
Memory Map and its `memory-pack` CLI have moved to SaaS Maker.

The repository still has its historical `chatgpt-memory-insights` name. That is
a source-container name, not the server's product identity. The local, read-only
MCP server serves the four DaddyRad native cores; it is not a ChatGPT-memory
feature. The 2026-10-09 consolidation placed it here while preserving Memory
Map's history. Do not count this checkout as another active Memory Map product
or infer a new migration from the naming mismatch.

## Memory Map moved

Memory Map, the browser-local ChatGPT-export analysis app at
<https://chatgpt.significanthobbies.com>, now lives in
[`sass-maker/saas-maker` → `apps/memory-map`](https://github.com/sass-maker/saas-maker/tree/main/apps/memory-map)
and deploys from there to the same Cloudflare Pages project and hostname, so
saved browser-local indexes are unaffected.

- Source absorbed from this repository at
  [`950a85ce`](https://github.com/Significant-Hobbies/chatgpt-memory-insights/commit/950a85ce1fd4fb255d145e1c514e776426a9b4e8)
  in [saas-maker@6ef53142](https://github.com/sass-maker/saas-maker/commit/6ef53142) (#211).
- Deploy path and `memory-pack` move: [saas-maker@576a623e](https://github.com/sass-maker/saas-maker/commit/576a623ed0ca4e8ea883cbe6ce29d118cc480e47) (#215).
- Cutover tracking: [sass-maker/saas-maker#210](https://github.com/sass-maker/saas-maker/issues/210).

## memory-pack moved

The `memory-pack` CLI (formerly `packer/`), its release workflow, and the
installer now live at
[`apps/memory-map/packer`](https://github.com/sass-maker/saas-maker/tree/main/apps/memory-map/packer)
with `.github/workflows/memory-pack-release.yml` and `memory-pack-ci.yml` in
SaaS Maker. The installer is unchanged for users:

```sh
curl -fsSL https://chatgpt.significanthobbies.com/install.sh | sh
```

Releases `memory-pack-v0.1.0` to `memory-pack-v0.1.2` stay published on this
repository's [Releases](https://github.com/Significant-Hobbies/chatgpt-memory-insights/releases);
the installer falls back to them until SaaS Maker publishes its first
`memory-pack-v*` release.

Open questions moved too: #12 → [saas-maker#213](https://github.com/sass-maker/saas-maker/issues/213),
#37 → [saas-maker#214](https://github.com/sass-maker/saas-maker/issues/214).
Memory Map's history, design receipts (`artifacts/design`, still referenced by
the live site's social images) and qualification evidence (`docs/qualification`)
remain here.

## DaddyRad MCP server

[`mcp/`](mcp/) is the single local, read-only stdio MCP server across the four
DaddyRad native cores (PerformanceDaddy, ContextDaddy, StorageDaddy,
BrowserDaddy). It moved here verbatim from
[`Significant-Hobbies/daddyrad@bfdd8a81`](https://github.com/Significant-Hobbies/daddyrad/tree/bfdd8a813deff13fbc9a342ff865a28a50b724e3/mcp)
with its macOS CI job. Build and configuration instructions are in
[`mcp/README.md`](mcp/README.md). It builds with SwiftPM against sibling
checkouts of the four engine repositories (`../../performancedaddy` etc.), at
the revisions pinned in `mcp/engine-revisions.json`.

## License

MIT, see [LICENSE](LICENSE).
