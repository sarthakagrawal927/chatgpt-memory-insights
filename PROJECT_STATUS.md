# Memory Map / ChatGPT Insights

Last updated: 2026-11-13

- Report presentation, graphs, loading states and styles are owned by UI
  Library's `@saas-maker/insight-atlas` package, composed from `@saas-maker/ui`
  native controls, Cards, chart frames and the shared theme and fonts. This app
  supplies local analysis,
  model workers, storage and product copy through its typed services.
- The opt-in demo uses an owner-approved aggregate projection of a real export.
  Its bundled JSON contains numeric activity and fixed question-category IDs;
  conversation text, titles, IDs, source links and extracted facts are omitted.
  The graph represents category co-occurrence, not semantic embeddings. The
  same artifact is retained in R2 under the product's demo asset prefix.
- Rebuild an aggregate fixture with `pnpm demo:build <archive.zip> <output.json>`;
  `pnpm test:demo` qualifies on-demand loading, cancellation, retry and responsive
  rendering. Source changes do not themselves claim a production deployment.

- Application and `memory-pack` source restored as an independent product from
  `sass-maker/saas-maker` at `b54780b8496fb081cec29ec352fea92e0ff7c74f`.
  This uses current source, not the pre-consolidation application revision.
- Original repository history, design receipts, qualification evidence and
  `memory-pack-v0.1.0` through `memory-pack-v0.1.2` releases are retained.
- Production address remains `https://chatgpt.significanthobbies.com`, on the
  existing `chatgpt-memory-insights` Pages project. Visitors' saved indexes
  remain bound to that same origin. The source restoration does not itself
  claim a new production deployment.
- DaddyRad MCP source and its native-engine CI move to SaaS Maker MCP
  Connections at `apps/mcp/local/daddyrad`. The server stays local and read-only.
- Standalone builds carry the exact dependency pins and a minimal, attributed
  snapshot of the shared agent-surface helpers. No sibling checkout is required.
- The standalone dependency audit has no advisory exceptions. Targeted
  transitive security pins repair the inherited build-tool graph. The unused
  DOM peer and Ultracite CLI are removed; byte-identical Ultracite 7.12.4 Biome
  presets are retained with their MIT license in `vendor/ultracite`.
- Manual web deployment verifies clean current main and exact-source CI before
  running quality checks and uploading. CLI release workflows remain tag-driven.

Migration tracking: [sass-maker/saas-maker#384](https://github.com/sass-maker/saas-maker/issues/384).
Work queue: this repository's GitHub Issues.
