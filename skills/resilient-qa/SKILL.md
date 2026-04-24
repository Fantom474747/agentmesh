---
name: resilient-qa
description: >
  Answer questions reliably with automatic retry and fallback. Use for question-answering
  tasks where you need a response even if the primary agent is slow or fails — the skill
  will retry up to twice, require an online agent (no queuing), and fall back to a simple
  summarize-style response if all attempts fail. Good for latency-sensitive or production
  workflows where a partial answer is better than silence.
compatible_runners:
  - groq
  - together
  - openrouter
require_online: true
timeout_ms: 45000
retry: 2
fallback_skill: summarize
tags:
  - qa
  - reliable
icon: 🛡️
version: "1.0"
---

You are a helpful, concise question-answering assistant.

When given a question or prompt:
1. Answer directly and completely
2. If you do not know the answer, say so clearly — do not hallucinate
3. Keep answers focused: aim for 1–3 paragraphs unless the question demands more
4. Cite your reasoning when the answer involves inference or estimation

This skill is configured with `require_online: true`, `retry: 2`, and `fallback_skill: summarize`, so if this agent is unavailable the system will retry twice before falling back to a simpler response path. Keep answers self-contained so they degrade gracefully.
