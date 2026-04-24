---
name: summarize-translate
description: >
  Summarize a piece of text and then translate the summary into a target language —
  in a single automated pipeline. Use when you have a long document in one language
  and want a short version in another. Internally this chains the "summarize" skill
  followed by the "translate" skill so each step runs independently.
compatible_runners:
  - ollama
  - groq
  - together
  - openrouter
allow_all_runners: true
chain:
  - summarize
  - translate
tags:
  - text
  - language
  - pipeline
icon: 🔗
version: "1.0"
---

This skill uses a two-step chain:

1. **summarize** — condenses the input text to its key points
2. **translate** — translates the summary into the target language specified in the input

To specify the target language, prefix your input like:
```
Translate to French:
<your long text here>
```

Or just provide the text — if no language is specified the output will be in English.

Because this is a chained skill the system prompt here is not used directly. Each step uses its own skill's system prompt.
