# Memory Map / ChatGPT Insights

Memory Map is an independent Fleet product. Application source and the
`memory-pack` CLI live in this repository. The current code was restored from
`sass-maker/saas-maker` at `b54780b8496fb081cec29ec352fea92e0ff7c74f` on
2026-11-12, after the October 9 consolidation. Original history, design receipts,
qualification evidence and CLI releases remain here. DaddyRad MCP belongs to
SaaS Maker MCP Connections at `apps/mcp/local/daddyrad`.

Memory Map turns a ChatGPT data-export ZIP into a private, searchable memory
atlas in the browser. It shows topic relationships, repeated questions,
question-domain lenses, likely typo and thread-change candidates, first-person
fact candidates and changes, query-language signals, activity rhythms, and
evidence-linked questions worth revisiting. Longitudinal views show which
topics, question domains, and language signals are emerging, fading, steady, or
resurfacing, while confidence controls let the visitor decide how much inferred
evidence to show.

The archive is parsed in a web worker. Conversation text is never sent to an
application server, nothing is persisted by default, and the original ZIP is
never stored. Semantic grouping and search use a pinned browser-loaded
embedding model. Automatic mode uses compact English-focused
`Xenova/all-MiniLM-L6-v2` for predominantly Latin-script histories and can
select `Xenova/paraphrase-multilingual-MiniLM-L12-v2` for multilingual
histories. The visitor can override that choice before import.

Production: <https://chatgpt.significanthobbies.com>

The public `/about` capability atlas explains all 51 current product
capabilities, the browser-only data path, intended and unsupported use cases,
and the complete path from ChatGPT export to searchable memory.

Analysis is progressive: deterministic insights appear first, while a six-stage
route shows elapsed time and an estimated wait for semantic mapping. The
completed report collapses its one-time timing, model, and confidence controls
into an analysis receipt instead of leaving setup chrome in the reading path.
The receipt includes archive parsing, model download and preparation,
embeddings, and report assembly. Supported compact-model runs use WebGPU
acceleration after checking that an adapter is available, or WebAssembly
compatibility mode. A failure after GPU initialization is not yet a qualified
recovery path.

The report period controls exact calendar windows, including inactive months.
It updates the daily activity calendar, topic movement, query tone, language
signals, and a filterable monthly cadence graph that can compare conversation
count or approximate word count for all conversations or one overlapping
question route. Search lives with the semantic topic map where its results are
explained by graph and source evidence.

During ingestion, every parsed conversation becomes a distinct stop in a live
deterministic route sketch. The same canvas moves into the report while
embeddings finish, then yields to the final semantic topic graph without
delaying analysis.

After analysis, Memory Chat can optionally load the pinned
`Xenova/LaMini-Flan-T5-77M` q8 model in a dedicated browser worker. Every
question visibly traverses the semantic graph, the model receives at most six
labelled evidence excerpts, and the app withholds drafts that do not cite those
retrieved stops. The generator can be unloaded independently and its prose is
never promoted into saved memory.

## Get your ChatGPT export

In ChatGPT, open your profile menu and choose **Settings → Data controls →
Export data → Export**, then confirm the request. OpenAI sends an email or SMS
when the export is ready; download the ZIP and import it without unzipping it.
Exports can take up to seven days, and the download link expires after 24
hours. See OpenAI's
[official export instructions](https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data)
or use the [Privacy Portal](https://privacy.openai.com/).

## Pack your Claude Code and Codex sessions

`memory-pack` turns the transcripts Claude Code and Codex already keep in
`~/.claude` and `~/.codex` into an archive Memory Map reads through the same
path as a ChatGPT export. It packs your prompts and the assistant's replies and
leaves tool calls, tool output, reasoning traces, and file contents behind, so
gigabytes of transcripts become an archive of a few megabytes. It also reads
the prompt history both CLIs keep for sessions they have already pruned, which
reaches back much further than the transcripts do. It makes no network calls
and masks credential-shaped tokens before writing.

```bash
curl -fsSL https://chatgpt.significanthobbies.com/install.sh | sh

memory-pack --dry-run --list   # see what would be packed
memory-pack                    # write memory-pack-<date>.zip
```

Source, options, releases, and the full account of what is kept and dropped are
in [`packer/`](packer/README.md). The installer served at `/install.sh` comes
from [`public/install.sh`](public/install.sh); it resolves the newest
`memory-pack-v*` release of this repository, including the preserved original
releases. It retains a fallback to SaaS Maker for any releases published during
the consolidation.

## Develop

From this repository root:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

## Verify

```bash
pnpm check
```

`check` runs this package's full quality boundary: formatting and lint,
Astro/TypeScript checks, tests with coverage floors, Knip unused-code and cycle
checks, complexity (`uvx lizard`), exact duplication, suppression and hygiene
checks, and the production build. Existing debt is regression-gated by the
checked-in quality scripts; historical context is in
[#213](https://github.com/sass-maker/saas-maker/issues/213) (moved from
chatgpt-memory-insights#12).
Dependency advisories are audited without an exception list for this standalone package with
`pnpm run quality:dependencies`.

`pnpm run test:import` additionally tests the built
app in isolated Chromium (install with `pnpm exec playwright install chromium`
if needed). It constructs a synthetic ZIP and blocks external requests. A model
download failure remains visible, stops the running-state copy, disables
unavailable search/save controls, and allows retry without discarding the
readable statistics. Checks run at 390 px and 1280 px.

Open qualification work (large/split archives, multilingual and cross-browser
behavior, failures after GPU initialization) is tracked in
[#214](https://github.com/sass-maker/saas-maker/issues/214) (moved from
chatgpt-memory-insights#37; closed as historical backlog).

## Browser-local data and origins

Saved analysis lives in the visitor's IndexedDB database `memory-map` for the
origin that served the page. Serving this package from the same hostname keeps
saved indexes available; any other origin starts empty, and indexes never move
between origins automatically.

## Deploy

Before the first standalone deployment, complete the GitHub repository rename
from `sarthakagrawal927/daddyrad-mcp` to
`sarthakagrawal927/chatgpt-memory-insights`, then update this checkout's origin:

```bash
git remote set-url origin https://github.com/sarthakagrawal927/chatgpt-memory-insights.git
```

The deployment guard requires that canonical origin and rejects the former
repository name. Renaming the repository and changing origin are cutover
prerequisites; preparing this source does not perform them.

Production is the existing `chatgpt-memory-insights` Cloudflare Pages project
on `chatgpt.significanthobbies.com`. Keep both: the hostname is the origin that
owns visitors' saved IndexedDB indexes. Deploy manually from clean, synced
`main` at the repository root:

```bash
node scripts/deploy.mjs --dry-run  # verify readiness without publishing
pnpm run deploy
```

That verifies a clean checkout on `main`, the exact current remote revision
and successful push CI for that revision. It runs this package's full `check`,
then `wrangler pages deploy dist --project-name chatgpt-memory-insights
--branch main` from this directory, so
`functions/_middleware.ts` ships with the static build. Roll back with the
previous production deployment in the Pages dashboard (or `wrangler pages
deployment list --project-name chatgpt-memory-insights`). Cutover history:
[#210](https://github.com/sass-maker/saas-maker/issues/210).

`memory-pack` has its own CI (`.github/workflows/memory-pack-ci.yml`) and
release workflow (`.github/workflows/memory-pack-release.yml`); see
[`packer/README.md`](packer/README.md#release).
