# Memory Map / ChatGPT Insights

This repository owns the browser-local ChatGPT-export analysis application and
the `memory-pack` Rust CLI in `packer/`. They were restored from SaaS Maker on
2026-11-12 at the owner's request. Historical commits, design receipts,
qualification evidence and releases are preserved. DaddyRad MCP now belongs to
SaaS Maker MCP Connections at `apps/mcp/local/daddyrad`; do not add it here.

## Runtime and privacy

- Archive contents and derived memory stay in the visitor's browser. Do not add
  a hosted archive-analysis API or send conversation content to an AI gateway.
- Preserve origin `https://chatgpt.significanthobbies.com` and Pages project
  `chatgpt-memory-insights`. The origin owns visitors' saved IndexedDB indexes.
- `vendor/agent-surfaces` is a minimal pinned snapshot of SaaS Maker's shared
  public-document helpers. Provenance is recorded there; builds require no
  sibling checkout. Footer assets are already vendored in `public/`.
- Follow the exact pnpm pin and frozen lockfile.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm run test:import
cd packer && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

`pnpm check` includes the established quality gates, production build and
deployment-guard tests. CI additionally qualifies a synthetic browser import.
`memory-pack-ci.yml` and `memory-pack-release.yml` own the CLI checks and
tag-triggered binaries. Do not publish a tag merely to test a migration.

## Deployment and work tracking

Before the first standalone deployment, the GitHub repository must be renamed
from `sarthakagrawal927/daddyrad-mcp` to
`sarthakagrawal927/chatgpt-memory-insights`. Update this checkout with
`git remote set-url origin https://github.com/sarthakagrawal927/chatgpt-memory-insights.git`.
The origin allowlist intentionally rejects the former repository name.

Deploy manually with `pnpm run deploy` from clean current `main` after exact-source
push CI succeeds. `node scripts/deploy.mjs --dry-run` checks readiness without
uploading. Existing production configuration and rollback remain unchanged.
Track work in this repository's GitHub Issues. Use `PROJECT_STATUS.md` only for
durable current truth. Preserve unrelated local work and retained evidence.
