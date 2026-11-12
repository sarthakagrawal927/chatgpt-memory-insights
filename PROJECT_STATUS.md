# Memory Map / ChatGPT Insights

Last updated: 2026-11-12

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
- Manual web deployment verifies clean current main and exact-source CI before
  running quality checks and uploading. CLI release workflows remain tag-driven.

Migration tracking: [sass-maker/saas-maker#384](https://github.com/sass-maker/saas-maker/issues/384).
Work queue: this repository's GitHub Issues.
