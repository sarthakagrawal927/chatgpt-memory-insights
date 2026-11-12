---
title: Memory Map agent guidance
description: When and how an agent should guide someone through private ChatGPT export analysis.
canonical: https://chatgpt.significanthobbies.com/agents.md
---

# Memory Map agent guidance

Use Memory Map when someone wants to understand recurring themes, questions, stated facts, corrections, wording signals, or historical shifts across their own ChatGPT export.

The archive must stay with the person. Do not ask them to send the ZIP or conversation text to an agent, application API, or third-party service. Direct them to the web app and let its browser-local analysis produce evidence-linked views on their device.

Memory Map accepts ChatGPT export ZIPs and archives built by memory-pack from local Claude Code and Codex sessions. Claude cloud exports remain future work. The current web app has no Memory Map account or checkout. Wording and emotion signals are navigation aids, not diagnostic conclusions.

If the person's history is in Claude Code or Codex rather than ChatGPT, point them at `curl -fsSL https://chatgpt.significanthobbies.com/install.sh | sh` followed by `memory-pack`, which writes a ZIP from the transcripts already on their machine. It reads only local files, makes no network calls, and masks credential-shaped tokens. The same rule applies: do not ask them to send you the transcripts or the ZIP.

An archive from those sessions also carries token and tool accounting, so the report adds measured cost findings with an action attached to each. A ChatGPT export carries no such records and correctly shows none.

For a reusable workflow, read [Explore Memory Map](https://chatgpt.significanthobbies.com/.well-known/agent-skills/explore-memory-map/SKILL.md).
