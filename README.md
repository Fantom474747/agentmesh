# AgentMesh

A desktop-first AI agent management platform. AgentMesh runs as a native Electron app and embeds an Express + WebSocket server so that Claude Code (or any MCP/WebSocket client) can delegate token-heavy work — summarisation, code review, translation, classification — to cheaper local or free-tier cloud models.

> **v0.1.0 early release** — core systems are complete and type-clean. Manual QA of individual features is ongoing; see [DEVELOPMENT_NOTES.md](./DEVELOPMENT_NOTES.md) for current test status.

---

## What it does

Claude Code stays in charge of reasoning and multi-file decisions. When it hits something repetitive or cheap (summarise this log, review this directory, classify these rows), it calls `agentmesh_run_task` through the MCP proxy. AgentMesh picks the best available agent, streams the result back, and the desktop UI shows live task status and agent health — all without interrupting Claude's main context window.

---

## Features

### Agent backends

| Type | Description |
|---|---|
| `ollama` | Local models via [Ollama](https://ollama.com) (`llama3`, `qwen2.5`, `mistral`, any pulled model) |
| `groq` | Free-tier cloud inference (llama-3.1-8b-instant and others) |
| `together` | Together AI free-tier models |
| `openrouter` | OpenRouter free and paid routing |
| `huggingface` | HuggingFace Inference API (TGI-hosted models) |
| `local_script` | Any executable that reads a prompt from stdin and writes to stdout |
| `local_docker` | Same as local_script, run inside Docker |

### Skill system

Skills are YAML manifests (`manifest.yaml`) or Markdown files (`SKILL.md`) stored in `skills/<id>/`. They are auto-loaded at startup with no code registration required. Every field is Zod-validated; malformed skills are logged and skipped.

| Category | Fields |
|---|---|
| Identity | `id`, `name`, `description`, `icon`, `version`, `author`, `tags`, `hidden` |
| Runner selection | `compatible_runners`, `allow_all_runners`, `preferred_agent`, `require_online` |
| Model override | `model` — overrides the agent's configured model |
| Execution | `temperature`, `max_tokens`, `timeout_ms`, `retry` |
| Filesystem tools | `tools`, `tool_sandbox`, `tool_timeout_ms` |
| Context injection | `inject_date`, `inject_cwd`, `context_template` |
| Composition | `chain`, `fallback_skill` |

### Autonomous filesystem tools

When a skill declares `tools`, agents can call `list_dir`, `read_file`, `search_files`, and `get_file_info` during execution — exploring a codebase before answering, for example. `tool_sandbox` restricts access to a specific directory; `tool_timeout_ms` adds a per-call deadline; tools not in the `tools` list are rejected even if the model tries to call them.

### Skill composition

`chain: [summarize, translate]` pipes the output of each skill as input to the next in a single automated pipeline. `fallback_skill` re-runs the task with a simpler skill when the primary fails after all retries.

### Claude Code integration via MCP

A stdio proxy (`scripts/agentmesh-mcp.mjs`) exposes seven MCP tools to Claude Code. The proxy connects lazily at call time — if AgentMesh is not running the tools return a descriptive error instead of silently disappearing.

| Tool | What it does |
|---|---|
| `agentmesh_list_skills` | List all loaded skills |
| `agentmesh_list_agents` | List all registered agents and their online/offline status |
| `agentmesh_run_task` | Delegate a task by skill ID |
| `agentmesh_run_prompt` | Free-form prompt to any agent without a skill |
| `agentmesh_skill_read` | Read the raw source of a skill file |
| `agentmesh_skill_create` | Create a new skill from Claude Code |
| `agentmesh_skill_edit` | Edit an existing skill from Claude Code |

### Desktop UI

Five pages built with React 18 + Tailwind CSS (dark industrial theme):

- **Dashboard** — agent health status, task throughput chart, recent tasks
- **Agents** — register, remove, and prompt agents directly; live online/offline badges
- **Tasks** — full task history with streamed log viewer
- **Skills** — skill cards with format badge (YAML/SKILL.md), model badge, tool count, tag filter
- **Settings** — server port, API keys, WebSocket URL, Claude Code config snippet

---

## Quick start

### Prerequisites

- Node.js 20+
- npm 10+
- At least one agent backend (see below)

### Install and run

```bash
git clone https://github.com/Fantom474747/agentmesh.git
cd agentmesh
npm install
npm run dev
```

The Electron window opens. The embedded server starts on port 4321.

### Add your first agent

1. Open the **Agents** page
2. Click **+ Add Agent**
3. Choose a type:
   - **Ollama** — set endpoint (`http://localhost:11434`) and model name. Requires [Ollama](https://ollama.com) running locally with at least one model pulled (`ollama pull llama3`).
   - **Groq** — paste your [Groq API key](https://console.groq.com). Free tier available, no card required.
   - **Together / OpenRouter / HuggingFace** — paste your API key and pick a model.
   - **Local script** — path to any executable that reads from stdin and writes to stdout.

AgentMesh runs a health check immediately on registration and every 30 seconds thereafter. A green dot means online.

### Run your first task

Open the **Skills** page and click **Run** on any skill, or send directly over WebSocket:

```jsonc
// Connect to ws://127.0.0.1:4321/ws
{ "id": "1", "method": "run_task", "params": { "skill": "summarize", "input": "Paste a long article here." } }
```

Streamed response:

```jsonc
{ "id": "1", "result": { "chunk": "The article discusses..." } }
{ "id": "1", "result": { "done": true, "output": "...", "durationMs": 1840 } }
```

---

## Bundled skills

| ID | Description | Notable config |
|---|---|---|
| `summarize` 📝 | Condense text to key points | — |
| `code_review` 🔍 | Autonomous codebase exploration + structured review | `tools`, `retry:1`, `fallback_skill` |
| `translate` 🌐 | Translate text to a target language | `allow_all_runners` |
| `classify` 🏷️ | Classify text; returns JSON | `temperature:0`, `max_tokens:256` |
| `context-aware` 📅 | General assistant with auto-injected date + cwd | `inject_date`, `inject_cwd` |
| `summarize-translate` 🔗 | Summarise then translate in one pipeline | `chain: [summarize, translate]` |
| `resilient-qa` 🛡️ | Q&A with automatic retry and fallback | `require_online`, `retry:2`, `fallback_skill` |

---

## Writing skills

### SKILL.md (recommended)

Create `skills/<id>/SKILL.md`:

```markdown
---
name: my-skill
description: What this skill does and when to use it.
compatible_runners:
  - ollama
  - groq
tags: [coding]
icon: 🔧
temperature: 0.3
timeout_ms: 60000
retry: 1
---

You are an expert assistant. When given a task:
1. Do this first
2. Then do this
```

The file is picked up automatically on next startup. You can also create and edit skills live from Claude Code using `agentmesh_skill_create` / `agentmesh_skill_edit`.

### manifest.yaml

```yaml
id: my_skill
name: my-skill
description: What this skill does.
compatible_runners: [ollama, groq]
temperature: 0.3
timeout_ms: 60000
system_prompt: |
  You are an expert assistant...
```

If both `manifest.yaml` and `SKILL.md` exist in the same directory, `manifest.yaml` takes precedence.

### Skill with filesystem tools

```yaml
id: project_reviewer
name: project-reviewer
description: Review source files in a directory.
compatible_runners: [ollama, groq]
tools:
  - list_dir
  - read_file
  - search_files
tool_sandbox: /home/user/projects   # restrict to this path only
tool_timeout_ms: 10000
system_prompt: |
  You have filesystem tools. Explore the given path before answering.
```

### Chained skill

```yaml
id: summarize_translate
name: summarize-translate
compatible_runners: [ollama, groq]
allow_all_runners: true
chain:
  - summarize
  - translate
```

The `system_prompt` is not used when `chain` is set — each step uses its own skill's prompt.

### Full field reference

```yaml
# Identity
id: my_skill          # snake_case directory name (YAML only; inferred from dir in SKILL.md)
name: my-skill        # lowercase + hyphens; shown in UI
description: ...      # shown on skill card and passed to Claude Code
icon: 🔧              # emoji shown on the card title
version: "1.0"
author: your-name
tags: [coding, review]
hidden: true          # hide from Skills UI (MCP-callable only)

# Runner selection
compatible_runners: [ollama, groq, together, openrouter, huggingface, local_script]
allow_all_runners: true       # bypass compatible_runners filter
preferred_agent: <uuid>       # try this agent first; fall back to auto if offline
require_online: true          # fail immediately if no online agent (no queuing)

# Model override
model: qwen2.5-coder          # overrides the agent's configured model

# Execution control
temperature: 0.2              # 0–2; leave blank to use model default
max_tokens: 2048              # cap output length
timeout_ms: 60000             # abort task after N ms
retry: 2                      # auto-retry on failure (0–10)

# Filesystem tools
tools: [list_dir, read_file, search_files, get_file_info]
tool_sandbox: /path/to/dir    # restrict all tool paths to this directory
tool_timeout_ms: 5000         # per-tool-call timeout in ms

# Context injection (prepended to system prompt before each run)
inject_date: true             # "Today's date: YYYY-MM-DD"
inject_cwd: true              # "Working directory: /path"
context_template: |           # wraps system prompt; {{system_prompt}} = insertion point
  Project context: MyApp
  {{system_prompt}}

# Skill composition
chain: [skill_a, skill_b]     # sequential pipeline; output of each feeds the next
fallback_skill: summarize     # re-run with this skill if primary fails after all retries
```

---

## Claude Code integration (MCP)

AgentMesh ships a stdio MCP proxy (`scripts/agentmesh-mcp.mjs`). Claude Code spawns it as a subprocess — no separate server needed.

### Setup

**Option 1 — Project-local (recommended)**

Copy `ProjectMCP/.mcp.json` to your project root as `.mcp.json` and update the path:

```json
{
  "mcpServers": {
    "agentmesh": {
      "command": "node",
      "args": ["/absolute/path/to/agentmesh/scripts/agentmesh-mcp.mjs"]
    }
  }
}
```

Restart Claude Code. The `agentmesh_*` tools appear automatically.

**Option 2 — User-global**

Add the same entry to `~/.claude/mcp.json` (see your MCP client docs) so AgentMesh is available in every project.

**Option 3 — Environment variable**

```bash
AGENTMESH_URL=http://127.0.0.1:4321 node scripts/agentmesh-mcp.mjs
```

Use `AGENTMESH_URL` if you changed the default port in Settings.

### Example usage from Claude Code

```
Use agentmesh_list_skills to see what's available, then run agentmesh_run_task
with skill="code_review" and input="Review the code at /path/to/project".
```

The output streams chunk by chunk as the agent explores the codebase.

### Creating skills from Claude Code

```
Call agentmesh_skill_create with:
  id="pr_summary"
  name="pr-summary"
  description="Summarize a pull request diff"
  compatible_runners=["groq","ollama"]
  system_prompt="You are a senior engineer. Summarize this PR diff..."
  format="markdown"
```

The skill is immediately available in `agentmesh_list_skills`.

---

## REST API

Base URL: `http://127.0.0.1:4321`

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Server status, agent count, skill count |
| `GET` | `/agents` | List all agents |
| `POST` | `/agents` | Register an agent |
| `DELETE` | `/agents/:id` | Remove an agent |
| `GET` | `/tasks` | Task history (last 100; add `?limit=N`) |
| `GET` | `/tasks/:id` | Single task with result |
| `GET` | `/skills` | List all loaded skill manifests |
| `GET` | `/mcp/sse` | MCP SSE transport (alternative to stdio proxy) |

---

## Development

### Scripts

```bash
npm run dev            # Vite HMR + Electron watch
npm run build          # Full production build
npm run build:renderer # Renderer only
npm run build:main     # Electron main only
npm test               # Vitest test suite
npx tsc --noEmit       # Type-check without emitting
```

### Architecture

```
agentmesh/
├── electron/                     # Electron main process
│   ├── main.ts                   # BrowserWindow, IPC, starts embedded server
│   ├── db.ts                     # sql.js SQLite wrapper (dev.db / agentmesh.db)
│   ├── preload.ts                # contextBridge API surface
│   ├── server/
│   │   ├── index.ts              # Express bootstrap; reloadSkills(); startQueueRunner()
│   │   ├── mcp.ts                # MCP SSE server (7 tools)
│   │   ├── skills.ts             # Skill loader, SKILL.md parser, serialisers
│   │   ├── routes/               # REST handlers (agents, tasks, skills)
│   │   └── ws/handler.ts         # JSON-RPC 2.0 WebSocket dispatcher
│   └── agents/
│       ├── registry.ts           # Agent CRUD + 30s health-check loop
│       ├── queue.ts              # Task dispatch, agent selection, retry, fallback
│       ├── executor.ts           # Context injection, streaming execution, chain runner
│       ├── runners/              # One file per backend (ollama, groq, huggingface, …)
│       └── tools/                # Filesystem tool implementations + ToolContext enforcement
├── src/                          # React 18 renderer (Vite)
│   ├── App.tsx                   # Router shell + WebSocket reconnect loop
│   ├── pages/                    # Dashboard, Agents, Tasks, Skills, Settings
│   ├── store/                    # Zustand slices (agentStore, taskStore, uiStore)
│   ├── api.ts                    # REST client
│   └── wsClient.ts               # WebSocket abstraction (send, subscribe by id)
├── shared/
│   └── types.ts                  # Single source of truth for ALL interfaces and enums
├── skills/                       # Bundled skill manifests (auto-loaded at startup)
├── scripts/
│   ├── agentmesh-mcp.mjs         # stdio MCP proxy for Claude Code
│   └── dev.mjs                   # Dev launcher (Windows-safe electron-vite spawn)
└── ProjectMCP/
    ├── .mcp.json                 # Template MCP config — copy to your project root
    └── README.md                 # Setup instructions
```

### Key conventions

**Types** — `shared/types.ts` is the single source of truth for all interfaces. Check it before creating a new type.

**IDs** — `crypto.randomUUID()` everywhere. Never sequential integers.

**Database** — Agents via `electron/agents/registry.ts` only. Tasks via `electron/agents/queue.ts` only. Never raw SQL in routes or runners.

**Error handling** — Always return structured errors; never let exceptions propagate unhandled from routes or runners.

```typescript
// Correct
return { error: { code: 'RUNNER_TIMEOUT', message: 'Agent did not respond in 30s' } }
```

**Streaming** — All runners use `AsyncGenerator<string, TaskResult>`. Never buffer full output.

**API keys** — Production: `safeStorage.encryptString(key)`. Development: `.env` via dotenv. Never commit `.env`.

### Adding a runner

1. Create `electron/agents/runners/<type>.ts` implementing `AgentRunner` from `shared/types.ts`
2. Add the type to the `AgentType` union in `shared/types.ts`
3. Add it to the `switch` in `electron/agents/runners/index.ts`
4. Add config fields to the Add Agent modal in `src/pages/Agents.tsx`
5. Write tests in `tests/runners/<type>.test.ts`

For OpenAI-compatible APIs, use the shared factory — it handles streaming, tool-calling loops, temperature, max_tokens, and model override automatically:

```typescript
import { makeOpenAICompatRunner, type RunnerExecParams } from './utils.js'

export function createMyRunner(agent: Agent, exec?: RunnerExecParams): AgentRunner {
  return makeOpenAICompatRunner(
    'https://api.example.com/v1',
    () => (agent.config.api_key as string) ?? '',
    () => (agent.config.model as string) ?? 'default-model',
    {},    // extra headers
    exec,  // carries modelOverride, temperature, max_tokens, toolCtx
  )
}
```

### WebSocket protocol reference

```jsonc
// Run a task with a skill
{ "id": "<uuid>", "method": "run_task", "params": { "skill": "summarize", "input": "..." } }

// Run without a skill (free prompt)
{ "id": "<uuid>", "method": "run_task", "params": { "input": "...", "system_prompt": "..." } }

// Streaming chunk
{ "id": "<uuid>", "result": { "chunk": "partial output..." } }

// Final result
{ "id": "<uuid>", "result": { "done": true, "output": "...", "durationMs": 1234 } }

// Error
{ "id": "<uuid>", "error": { "code": -32000, "message": "No online agent available" } }

// Heartbeat
{ "method": "ping" }  →  { "result": "pong" }
```

---

## Building for distribution

```bash
npm run build
```

Output in `release/`:

| Platform | Format |
|---|---|
| Windows | NSIS installer (x64) |
| macOS | DMG (x64, arm64) |
| Linux | AppImage (x64) |

> **Note:** Unsigned Electron apps trigger security warnings on macOS (Gatekeeper) and Windows (SmartScreen). For local and development use this is fine — right-click → Open to bypass the warning. Code signing requires an Apple Developer account and/or a Windows EV certificate.

---

## Contributing

1. Fork and clone the repository
2. `npm install`
3. `npm run dev` — verify the app starts and the server is reachable at `http://127.0.0.1:4321/health`
4. Create a branch: `git checkout -b feat/my-change`
5. `npx tsc --noEmit` before committing — zero TypeScript errors required
6. Open a pull request with a description of what changed and why

Bug reports, new skill manifests (`skills/<id>/`), and new runner implementations are all welcome. See [CLAUDE.md](./CLAUDE.md) for the full development conventions.

---

## License

MIT — see [LICENSE](./LICENSE).
