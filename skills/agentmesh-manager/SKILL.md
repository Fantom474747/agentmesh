---
name: agentmesh-manager
description: >
  AgentMesh is a local agent delegation platform. Use this skill when working on the
  AgentMesh codebase (adding runners, editing skills, debugging the server, modifying
  the task queue or Electron main process). Also use it to understand the MCP tools
  exposed to Claude Code so you can delegate token-heavy work to cheaper local or
  free-tier models instead of doing it yourself. Use when the user mentions agents,
  skills, runners, delegation, or the AgentMesh app.
---

## What AgentMesh Is

AgentMesh is a desktop Electron app that embeds an Express + WebSocket server. It lets
you register AI agents (Ollama, Groq, HuggingFace, Together, OpenRouter, local scripts)
and define reusable *skills* (YAML manifests or SKILL.md files with a system prompt and
optional execution controls).

Claude Code connects via a **stdio MCP proxy** (`scripts/agentmesh-mcp.mjs`), configured
in `.mcp.json` at the project root:
```json
{
  "mcpServers": {
    "agentmesh": { "command": "node", "args": ["scripts/agentmesh-mcp.mjs"] }
  }
}
```

---

## MCP Tools Available to Claude Code

### `agentmesh_list_skills` / `agentmesh_list_agents`
Inspect what skills and agents are loaded. Call these before `agentmesh_run_task`.

### `agentmesh_run_task`
| Param | Type | Notes |
|-------|------|-------|
| `skill` | string | Skill ID from `agentmesh_list_skills` |
| `input` | string | Text to process |
| `agent_id` | string? | Pin to a specific agent (optional) |

### `agentmesh_run_prompt`
Free-form prompt to any agent without a skill manifest.

### `agentmesh_skill_read` / `agentmesh_skill_create` / `agentmesh_skill_edit`
Read, create, and edit skill files directly from Claude Code. Use `format="markdown"` for SKILL.md or `format="yaml"` for manifest.yaml.

---

## When to Delegate vs. Do It Yourself

**Delegate when:** summarizing long docs, first-pass code review, translation, classification, data extraction, any 7B–70B-capable task.

**Do it yourself when:** multi-file reasoning, cross-references, architectural decisions, or all agents are offline.

---

## Skill Manifest — Full Field Reference

Every skill lives in `skills/<id>/manifest.yaml` or `skills/<id>/SKILL.md`.
SKILL.md has YAML frontmatter between `---` delimiters; the body is the `system_prompt`.

### Core (required)
```yaml
id: my_skill           # snake_case directory name (YAML only; inferred from dir in SKILL.md)
name: My Skill
description: What this skill does and when to use it
system_prompt: |
  You are a helpful assistant that...
compatible_runners:
  - ollama
  - groq
```

### Model / Runner selection
```yaml
model: qwen2.5-coder        # override the agent's configured model
allow_all_runners: true     # ignore compatible_runners, route to any online agent
preferred_agent: <uuid>     # try this agent ID first; fall back to auto if offline
require_online: true        # fail immediately if no compatible online agent (don't queue)
```

### Execution control
```yaml
temperature: 0.2            # sampling temperature 0–2 (default: model's own default)
max_tokens: 2048            # cap output length (default: model's own default)
timeout_ms: 60000           # abort task after N ms (default: no limit)
retry: 2                    # auto-retry on failure, up to N times (default: 0)
```

### Autonomous tools
```yaml
tools:
  - list_dir
  - read_file
  - search_files
  - get_file_info
tool_sandbox: C:/projects/myapp   # restrict filesystem tools to this directory
tool_timeout_ms: 10000            # per-tool-call timeout in ms
```
Tools not in the `tools` list are rejected even if the model tries to call them.

### Context injection
```yaml
inject_date: true           # prepends "Today's date: YYYY-MM-DD" to the system prompt
inject_cwd: true            # prepends "Working directory: <cwd>" to the system prompt
context_template: |         # wraps the system prompt; {{system_prompt}} is the insertion point
  Project context: MyApp
  {{system_prompt}}
```
Injection order: `context_template` wraps first, then `inject_date` / `inject_cwd` prepend.

### Skill composition
```yaml
chain:
  - summarize
  - translate
# Runs skill IDs in sequence; output of each step feeds the next as input.
# The chaining skill's own system_prompt is not used.

fallback_skill: summarize
# If this skill fails after all retries, re-run the task with this skill instead.
```

### UI / discovery
```yaml
tags:
  - coding
  - review
icon: "🔍"           # emoji shown on the skill card
hidden: true         # hide from the Skills UI (MCP-callable only)
version: "1.1"
author: nikita
```

---

## Built-in Skills

| ID | Name | Key features |
|----|------|--------------|
| `summarize` | Summarize | General text summarization |
| `code_review` | Code Review 🔍 | Autonomous file exploration; `tool_timeout_ms`, `retry`, `fallback_skill` |
| `translate` | Translate 🌐 | Language translation; works standalone or as chain step |
| `classify` | Classify 🏷️ | `temperature:0`, JSON output, deterministic |
| `context-aware` | context-aware 📅 | `inject_date`, `inject_cwd`, `context_template` |
| `summarize-translate` | summarize-translate 🔗 | `chain: [summarize, translate]` |
| `resilient-qa` | resilient-qa 🛡️ | `require_online`, `retry:2`, `fallback_skill:summarize` |

---

## Adding a New Agent Runner

1. Create `electron/agents/runners/<type>.ts` implementing `AgentRunner` from `shared/types.ts`
2. Add type to the union in `shared/types.ts` and to the switch in `runners/index.ts`
3. Add config fields to the Add Agent modal in `src/pages/Agents.tsx`
4. Write tests in `tests/runners/<type>.test.ts`

```typescript
// Minimum runner — use makeOpenAICompatRunner for OpenAI-compatible APIs
import { makeOpenAICompatRunner, type RunnerExecParams } from './utils.js'
export function createMyRunner(agent: Agent, exec?: RunnerExecParams): AgentRunner {
  return makeOpenAICompatRunner(baseUrl, getKey, getModel, {}, exec)
}
```

`RunnerExecParams` carries `modelOverride`, `temperature`, `max_tokens`, and `toolCtx`
(sandbox path, per-tool timeout, allowed tools list) — all set from the skill manifest
automatically; runners don't need to handle them beyond passing them to `makeOpenAICompatRunner`.

---

## Key Execution Flow

```
skill manifest
  │
  ├─ chain? → executeChain() in executor.ts
  │              └─ sequential executeTask() per step
  │
  └─ normal → selectAgent() (preferred_agent → online compatible → offline fallback)
                │  require_online + no online agent → fail immediately
                │
                └─ executeTask()
                     ├─ buildSystemPrompt() — applies inject_date/cwd + context_template
                     ├─ createRunner(agent, exec)  ← exec has model/temp/max_tokens/toolCtx
                     ├─ runner.run(task, prompt, tools)
                     │     └─ executeTool(name, args, toolCtx)
                     │           ├─ allowedTools enforcement
                     │           ├─ sandbox path check
                     │           └─ per-tool timeout
                     └─ timeout_ms deadline (Promise.race)

  On failure → retry up to skill.retry times → fallback_skill (if set)
```

---

## WebSocket Protocol (JSON-RPC 2.0)

```jsonc
{ "id": "<uuid>", "method": "run_task", "params": { "skill": "summarize", "input": "..." } }
{ "id": "<uuid>", "result": { "chunk": "partial..." } }
{ "id": "<uuid>", "result": { "done": true, "output": "...", "durationMs": 1234 } }
{ "id": "<uuid>", "error": { "code": -32000, "message": "No online agent available" } }
{ "method": "ping" }  →  { "result": "pong" }
```

---

## REST API

Base: `http://127.0.0.1:4321`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Status, agent count, skill count |
| GET/POST | `/agents` | List / register agents |
| DELETE | `/agents/:id` | Remove agent |
| GET | `/tasks` | Task history (`?limit=N`) |
| POST | `/tasks` | Queue a task |
| GET | `/skills` | List loaded skills |

---

## Key Conventions

- **IDs:** `crypto.randomUUID()` — never sequential integers
- **DB access:** Only via `registry.ts` (agents) and `queue.ts` (tasks)
- **Errors:** Always `{ error: { code, message } }` — never unhandled throws from routes/runners
- **Streaming:** All runners use `AsyncGenerator<string, TaskResult>` — never buffer
- **Skill-less tasks:** `skill: '_raw'` sentinel in DB
- **Shared types:** Check `shared/types.ts` before creating any new interface
- **IPC channels:** Use `IpcChannel` enum — never raw strings
- **API keys:** `safeStorage.encryptString` in production; `.env` in dev only

---

## Project Structure

```
electron/main.ts              # App entry — BrowserWindow, IPC, starts server
electron/server/index.ts      # Express bootstrap; reloadSkills(); startQueueRunner()
electron/server/mcp.ts        # MCP tools (list_skills, list_agents, run_task, run_prompt, skill CRUD)
electron/server/ws/           # WebSocket JSON-RPC 2.0 dispatcher (chain + fallback aware)
electron/agents/executor.ts   # executeTask(), executeChain(), buildSystemPrompt()
electron/agents/registry.ts   # Agent CRUD + health-check polling (every 30s)
electron/agents/queue.ts      # Task CRUD + selectAgent() + startQueueRunner()
electron/agents/runners/      # One file per backend; all accept RunnerExecParams
electron/agents/tools/        # filesystem.ts (sandbox-aware), index.ts (ToolContext enforcement)
src/pages/Skills.tsx          # Skills UI: list, tag filter, create/edit modal, run modal
src/pages/Agents.tsx          # Agent UI: list, add, direct prompt
src/pages/Tasks.tsx           # Task history + output viewer
shared/types.ts               # Single source of truth for ALL interfaces and enums
skills/*/                     # Skill manifests (auto-loaded at startup)
```
