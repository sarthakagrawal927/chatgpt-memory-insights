# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People with a ChatGPT data-export ZIP who want to understand what they ask,
which themes recur, and what their conversation history reveals over time.

## Product Purpose

Turn a ChatGPT export into an explorable insight report and a better personal
memory index. Success means a visitor can recognize recurring questions,
projects, stated facts, corrections, and interests, navigate their semantic
relationships, and search the derived memory without sending archive contents
to a server.

## Positioning

The product combines transparent activity statistics with a browser-computed
semantic graph: the archive stays on the visitor's device while embeddings turn
scattered conversations into reusable memory.

## Operating Context

The visitor downloads a ChatGPT export, opens the deployed static site, selects
the ZIP, waits through parsing and model progress, then explores the report.
They may optionally keep the derived memory index in browser storage and can
delete it from the product.

## Capabilities and Constraints

- Accept current ChatGPT ZIP exports containing one or more
  `conversations*.json` files.
- Process conversation data in the browser and ignore binary attachments for
  the first release.
- Use an embedding model, not a generative language model, for semantic
  similarity and clustering.
- Offer a compact English-focused profile, a multilingual profile, and an
  automatic script-aware choice. Pin both model revisions and disclose the
  approximate browser download before import.
- Detect first-person fact candidates, later updates, and explicit refutations
  through transparent language rules plus semantic grouping. Keep possible
  contradictions separate from explicit updates and refutations.
- Preserve a dated evidence trail for memory changes, including similarity,
  lexical overlap, detection reason, and confidence.
- Segment substantial multi-prompt conversations into named semantic strands
  while preserving prompt order and a visible boundary timeline.
- Show longitudinal topic, question-domain, and language-signal activity with
  emerging, fading, resurfacing, steady, or insufficient-evidence labels.
- Let visitors tune inferred evidence with exploratory, balanced, conservative,
  or custom confidence thresholds without changing deterministic totals.
- Estimate broad query tone and dominant language signals—curiosity,
  frustration, urgency, uncertainty, excitement, appreciation, or
  neutral/direct—with small, documented lexical methods; never infer
  personality, mental health, or a durable emotional state.
- Turn high-confidence repeats, changed or old memories, wording spikes,
  dormant themes, recurring terms, and activity peaks into evidence-linked
  questions for the visitor, never conclusions about them.
- Show overlapping question-domain lenses—including math, health, software,
  money, career, learning, writing, relationships, travel, and planning—with
  query counts, conversation counts, and evidence.
- Detect a deliberately small set of likely typo signals and low-overlap
  adjacent prompt changes that may indicate multiple threads. Present both as
  conservative candidates, never a writing score or a judgment that a
  conversation was derailed.
- Provide deterministic statistics even if the embedding model cannot load.
- Bound embedding work so large exports remain usable on ordinary laptops.
- Do not upload archive contents or derived text to an application server.
- Persist nothing by default; saved browser memory is an explicit visitor
  action.
- Ship as a static Astro website.

## Evidence on Hand

- A real ChatGPT export ZIP supplied by the owner contains eleven chunked
  conversation JSON files, a `chat.html` file, metadata JSON, and many binary
  attachment files.
- The sample establishes that conversation parsing must be incremental and
  attachments must not be read into memory by default.
- No testimonials, public benchmarks, or production usage evidence exist yet.

## Product Principles

- Private computation must be visible and understandable.
- Useful insight should arrive before semantic processing finishes.
- Repeated questions and relationships matter more than vanity totals.
- Memory changes must preserve their history instead of silently replacing it.
- The visitor stays in control of model downloads and browser persistence.
- Confidence is a filter over candidates, not a claim of objective truth.
- Derived claims must link back to the conversations that support them.
- Reflection should invite the visitor to decide what is true now.

## Accessibility & Inclusion

Core insights must remain navigable without the graph, keyboard interactions
must have visible focus, and visual encodings must not rely on color alone.
