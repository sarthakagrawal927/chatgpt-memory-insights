# Design

## Direction

**Memory Transit Atlas** treats a conversation history as a legible network:
recurring questions become stops, themes become routes, and time becomes the
journey through them. It refuses the generic analytics dashboard and the
glowing “AI brain” graph. The product should feel like a public information
system made personal—precise enough to trust, annotated enough to understand.

The first surface is an operational map room. Before import, one dominant drop
zone explains the route from ZIP to insight. After import, a powerful search
field and semantic map occupy the primary field while a fixed index moves
through Topic map, Memory ledger, Repeated questions, Query tone, Rhythms, and
Memory search. The graph-first workbench probe is the selected composition.

## References

- **Harry Beck’s London Underground diagram** — topology over geographic
  literalism, disciplined line color, clear interchanges, and labels that stay
  readable inside complexity.
- **Giorgia Lupi’s data-humanism work** — personal data explained through
  annotations and visible evidence rather than reduced to anonymous totals.
- **Observable notebooks** — computation is progressive, transparent, and
  inspectable; loading and methodology are part of the interface.

These are structural and craft references, not brand styles to copy.

## Anti-references

- Generic SaaS dashboards made from interchangeable rounded statistic cards.
- Neon galaxy, neural-brain, glassmorphism, or particle-field AI imagery.
- “Wrapped” gamification that turns private behavior into unsupported
  personality claims.

## Palette and Material

The surface is a cool transit map, not warm stationery:

- `--paper: #f3f5f2` — primary field
- `--paper-raised: #ffffff` — focused panels and controls
- `--ink: #101b24` — primary text and structural rules
- `--ink-muted: #5d6970` — annotation and secondary labels
- `--rule: #cbd2d0` — map grid and separators
- `--cobalt: #2157d5` — primary action and one route family
- `--signal: #e44b33` — current position, errors, and one route family
- `--teal: #168579` — completed states and one route family
- `--amber: #d69a17` — warnings and one route family
- `--violet: #7554c8` — one route family

Route colors always pair with shape, label, or line pattern. Solid fields are
flat; shadows are reserved for floating evidence drawers. Gradients are not
part of the system.

The Visual atlas and Story mode are bounded presentation layers within this
system. They may use a sparse dither texture to distinguish data families and
an oversized interchange ring as a route motif. The texture must remain
diagrammatic rather than decorative; generic gradient surfaces remain out of
scope.

## Typography

- UI and narrative: `Arial`, `Helvetica Neue`, system sans-serif.
- Data, dates, counts, and file progress: `ui-monospace`, `SFMono-Regular`,
  `Consolas`, monospace.
- Headings use condensed proportions through weight, tracking, and max width,
  not a decorative display font.
- Story-mode display numerals and headlines may use `Georgia` as a bounded
  editorial voice; the report, controls, labels, and evidence stay in the core
  UI typography.
- Labels use sentence case. All-caps is limited to tiny map keys and status
  codes.

## Composition

- A narrow route index and a dominant evidence field replace a card grid.
- Major sections meet edge to edge and are divided by structural rules.
- The topic map gets the largest single region on desktop.
- Statistics live as platform boards: one baseline, large numerals, compact
  annotations, no floating tiles.
- Repeated questions read as interchange rows: representative wording first,
  count and date span second, source stops underneath.
- Empty space is functional map margin, never ornamental padding.

## Components

### Import gate

A bordered map field accepts click, drag, and keyboard activation. It names the
expected archive, explains that nothing uploads, and shows the three-stage
route: parse, map, explore.

### Progress route

One continuous route line carries the current stage. Completed stops are filled,
the active stop pulses once, and future stops remain outlined. Byte and item
counts use monospaced numerals. A three-part timing board keeps total elapsed
time, the current estimated wait, and the resolved compute route visible while
the deterministic report appears behind it.

After completion, the same route becomes an execution receipt. It separates the
time to initial insight from the full end-to-end total and explicitly includes
archive opening, parsing, model download and preparation, semantic mapping, and
report assembly. Runtime, batch size, and preserved semantic-candidate coverage
remain visible so a fast result does not hide reduced analysis.

The timing route shares the wait with a progressive ingestion sketch. Every
normalized conversation becomes a small station connected to one or more
disclosed question-domain interchanges. The sketch begins during parsing, moves
intact into the topic-map loading region when initial insights arrive, and
yields to the final embedding-backed SVG without delaying completion. Copy
must keep the deterministic preview distinct from semantic topology.

### Topic map

An SVG map uses labelled circular nodes, straight or gently bent edges, and a
small legend. Selection thickens the route and opens an evidence drawer. It
does not imitate a geographic subway map literally.

### Evidence drawer

The drawer lists representative conversation titles, dates, and similarity
evidence. It is the product’s trust mechanism and remains available from graph,
repeat, and search results.

### Analysis lens

A compact control board discloses the selected model profile, why automatic
mode chose it, and the active evidence threshold. Three named presets and one
native range control update inferred rows immediately; deterministic totals do
not move. This control is repeated before import and at the top of the report
so the trade-off is visible at both decision points.

### Memory ledger

The ledger keeps four explicit states: current, updated, refuted, and possible
contradiction. Each row shows the detected first-person statement, date, state
evidence, source conversations, confidence, and matching method. Updated items
retain the superseded wording; refuted items retain the statement and later
refutation. Possible contradictions remain visually and verbally less certain
than explicit changes. Color is reinforced by labels and a continuous left
rule.

### How your map changed

Three route tabs—topics, question domains, and language signals—show compact
monthly activity histories. Each route gets an explicit emerging, fading,
resurfacing, steady, or insufficient-evidence label, a short explanation, and
source evidence. A neighboring memory-change board places dated statement
versions on a continuous rule.

### Conversation strands

Substantial conversations are divided into a small number of named semantic
strands. The evidence drawer presents prompts in original order, makes every
suggested boundary visible, and distinguishes semantic segmentation from the
faster deterministic candidate count.

### Repeated-question rows

Rows use an interchange mark, representative question, recurrence count, date
span, and a disclosure control. Exact and semantic repeats have distinct
badges.

### Memory search

A full-width destination field accepts a natural-language query. Results show
topic route, similarity, representative sources, and why the match appeared.

### Graph memory chat

The topic map and chat panel form one workbench on desktop: graph at left,
conversation at right. A question adds a temporary query interchange, then
draws the traversed routes to at most four topic nodes. A parallel five-stop
ledger names question receipt, search, topic traversal, evidence packing, and
local synthesis so the answer is never visually detached from retrieval.

Memory Chat is an opt-in presentation layer over the existing hybrid index.
The pinned 77M q8 model sees no more than six labelled excerpts and four recent
turns. Its answer remains visibly distinct from memory state, must cite an
S1–S6 evidence stop. Unknown citations and instruction echoes are withheld;
recognized citations are syntax checks, not semantic verification. Generated
answers are labelled unverified local drafts. Evidence
buttons remain usable even when generation fails.

### Browser resource safety

Only one tab may own heavyweight archive analysis at a time. The generation
worker loads only after semantic analysis and explicit consent; its model,
approximate cached download, English focus, and local WASM route stay visible.
Unload, reset, errors, and page exit terminate workers and release ownership.

### Query tone

Tone is a compact distribution and trend table, not an emotional score. It
uses labels such as positive wording, neutral/direct, and negative wording,
states the method, and explicitly avoids personality or mental-health claims.
A second vocabulary view distinguishes curiosity, frustration, urgency,
uncertainty, excitement, appreciation, and neutral/direct wording. Each label
defines the words it matched and remains visually secondary to source-backed
memory insights.

### Visual atlas and Story mode

The atlas presents seven coordinated views: daily activity, question mix,
language signals, repeat landscape, topic movement, conversation shape, and an
all-history comparison of the earliest and most recent thirds of the archive.
A single evidence-linked “Start here” row identifies the strongest overlapping
question route in the selected period. Calendar cells are visual marks, not
hundreds of tiny controls; the adjacent readable-data disclosure owns the
source actions. Recent periods are literal calendar windows ending at the
archive's latest month, so inactive months remain visible and the calendar may
scroll horizontally without widening the page.

Rhythms is the report's eighth longitudinal view: an Observable Plot cadence
line that switches between conversation starts and approximate words, filters
to any overlapping question route, and keeps the selected total, peak month,
method, and readable data together. The report's semantic search belongs in the
Topic map workbench rather than in the permanent report header.

Timing, model selection, and evidence-threshold controls are useful during
analysis but secondary after completion. They collapse into a native Analysis
details disclosure once the map is ready. The route rail stays available for
orientation, indicates the section nearest the reading position, and the
evidence drawer groups inference notes separately from numbered sources.

Story mode is a seven-slide, full-screen presentation of the same evidence.
It preserves the active period and confidence threshold, keeps every claim
qualified, and resumes the same slide after an evidence detour. Direct slide
controls use full-size touch targets even when their visible route marks are
thin.

### Questions your history asks you

Evidence-backed reflection cards turn strong patterns into open questions:
repeated decisions, updated or refuted memories, old facts worth rechecking,
months with more friction-shaped wording, substantial themes that went quiet,
widespread terms, and peak-activity months. Every card explains its trigger and
opens the source conversations. The copy asks rather than diagnoses.

### Question lenses

A ten-cell lens matrix makes the breadth of a history immediately scannable:
math, health, software, money, career, learning, creative work, relationships,
travel, and planning. Counts are prominent, descriptions keep category
boundaries understandable, and each cell opens representative evidence.

Below it, two dense ledgers show likely typo signals and conversations with
likely thread changes. Both lead with their conservative method and pair every
count with inspectable sources. “Likely” is never shortened away: these are
navigation aids, not quality scores.

## Interaction and Motion

- Motion communicates route progress, graph selection, or drawer movement.
- The ingestion sketch is the one authored accumulation sequence: conversation
  stations appear in processed order while hub counts grow.
- New graph edges draw once after analysis; they do not continuously animate.
- Hover alone never reveals required information.
- Reduced-motion users receive all final states immediately.
- Model choice, download, sampling, and confidence disclosures remain visible
  after completion.

## Responsive Rules

- At 1440 px, the route index is fixed at left and the topic map shares the
  canvas with an evidence rail.
- At 768 px, the index becomes a horizontal stop bar and evidence opens below
  the selected insight.
- At 390 px, each report section is a single stop in a vertical journey; the
  graph shows a focused neighborhood and the complete accessible topic list
  follows it.
- Tables become labelled rows rather than horizontal scroll traps.

## Accessibility

- Meet WCAG AA contrast for text and functional graph marks.
- Every SVG node is keyboard focusable and mirrors a real button in the
  accessible topic list.
- Announce parsing and model progress through a polite live region.
- Maintain visible focus with a double-ring treatment that survives route
  colors.
- File input, save, forget, and reset remain native controls or native-button
  semantics.
