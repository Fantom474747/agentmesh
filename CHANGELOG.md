# Changelog

All notable changes to AgentMesh are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Known gaps

- **Automated tests** — test infrastructure is configured (vitest, `tests/runners/`), runner tests pending
- **SKILL.md round-trip edit** — editing an existing SKILL.md via the UI reconstructs frontmatter from the parsed manifest; manual edits to frontmatter fields (beyond `system_prompt`) are not preserved on save
- **Per-agent task locking** — two concurrent tasks for the same agent run in parallel with no coordination; may cause context issues on small context-window local models
- **Rate-limit handling** — 429 responses from Groq/Together/OpenRouter are surfaced as errors with no automatic retry delay

---

## [0.1.0] — 2026-04-23

Initial release.

### Added

#### Core platform
- Electron + Vite + React 18 + TypeScript desktop application
- Embedded Express + WebSocket server on configurable port (default 4321)
- sql.js SQLite database; agents and tasks persisted to `agentmesh.db` (production) / `dev.db` (development)
- Electron `safeStorage` encrypted API key storage in production; `.env` fallback in development
- JSON-RPC 2.0 WebSocket protocol with streaming chunks and ping/pong heartbeat
- React renderer with Zustand state management; WebSocket client with exponential-backoff reconnection (500 ms start, 30 s max, ±20% jitter)
- Five UI pages: Dashboard, Agents, Tasks, Skills, Settings
- Dark industrial theme (Tailwind CSS, accent `#1D9E75` teal)
- Custom title bar with draggable region; window min/max/close via IPC

#### Agent backends
- **Ollama** — local model execution via `/api/chat` NDJSON streaming
- **Groq** — OpenAI-compatible cloud inference (free tier)
- **Together AI** — OpenAI-compatible cloud inference
- **OpenRouter** — OpenAI-compatible routing layer with `HTTP-Referer` / `X-Title` headers
- **HuggingFace** — Inference API; model name is part of the endpoint URL
- **Local script** and **local Docker** runners — subprocess stdin/stdout
- 30-second health-check loop with 5-second timeout per agent; live status broadcast to renderer
- Agent CRUD via REST (`/agents`) and Electron IPC

#### Skill system
- Auto-loading from `skills/*/manifest.yaml` or `skills/*/SKILL.md` at startup
- Zod validation on load; malformed skills logged and skipped, no crash
- `manifest.yaml` preferred when both formats exist in the same directory
- Skill hot-reload via `reloadSkills()` called after IPC save/delete

#### SKILL.md format
- Markdown file with YAML frontmatter (between `---` delimiters) + free-form system prompt as body
- `parseSkillMd`, `buildSkillMd`, `buildSkillYaml` serialisers
- Source badge in Skills UI: violet = SKILL.md, amber = YAML
- YAML/SKILL.md format toggle in skill create modal
- Raw content loaded via `skillReadRaw` IPC when editing existing SKILL.md
- MCP tools: `agentmesh_skill_read`, `agentmesh_skill_create`, `agentmesh_skill_edit`

#### Skill manifest — full field set
- **Identity:** `id`, `name`, `description`, `icon`, `version`, `author`, `tags`, `hidden`
- **Runner selection:** `compatible_runners`, `allow_all_runners`, `preferred_agent`, `require_online`
- **Model override:** `model` — overrides the agent's configured model per skill
- **Execution control:** `temperature` (0–2), `max_tokens`, `timeout_ms`, `retry` (0–10)
- **Filesystem tools:** `tools` list, `tool_sandbox` (path restriction), `tool_timeout_ms`
- **Context injection:** `inject_date`, `inject_cwd`, `context_template` (with `{{system_prompt}}` placeholder)
- **Skill composition:** `chain` (sequential pipeline), `fallback_skill` (on failure after retries)

#### Execution engine
- `AsyncGenerator` streaming — no buffered output at any layer
- `buildSystemPrompt()` — applies `context_template`, `inject_date`, `inject_cwd` before each run
- `executeTask()` — runs a single skill with timeout deadline via `Promise.race`
- `executeChain()` — runs a sequence of skills, passing each step's output as the next step's input; streams chunks with `[chain N/total: id]` prefix
- `selectAgent()` — respects `preferred_agent` (online check + fallback), `require_online` (fail-fast), `allow_all_runners`, and `compatible_runners`
- Retry loop in queue runner; fallback skill execution after all retries exhausted

#### Filesystem tools for agents
- Four tools: `list_dir`, `read_file` (500 KB limit, line range support), `search_files` (regex, glob filter, 100-result cap), `get_file_info`
- Two-phase execution for OpenAI-compatible APIs: non-streaming tool-call rounds → streaming final answer
- Ollama-specific tool loop (NDJSON format, no `tool_call_id`)
- `ToolContext` enforcement: `allowedTools` list rejection, `sandbox` path check (blocks `..` traversal), `timeoutMs` per-call deadline

#### MCP integration
- stdio proxy (`scripts/agentmesh-mcp.mjs`) — Claude Code spawns as subprocess; lazy WebSocket connection
- Seven MCP tools: `agentmesh_list_skills`, `agentmesh_list_agents`, `agentmesh_run_task`, `agentmesh_run_prompt`, `agentmesh_skill_read`, `agentmesh_skill_create`, `agentmesh_skill_edit`
- SSE MCP server at `/mcp/sse` for browser-based MCP clients
- `ProjectMCP/.mcp.json` template for connecting Claude Code projects to AgentMesh

#### Bundled skills
- `summarize` 📝 — text condensation; all runner types
- `code_review` 🔍 — autonomous codebase exploration + structured review; filesystem tools, `retry:1`, `fallback_skill:summarize`
- `translate` 🌐 — language translation; `allow_all_runners`
- `classify` 🏷️ — text classification returning JSON; `temperature:0`, `max_tokens:256`
- `context-aware` 📅 — general assistant with `inject_date` + `inject_cwd`
- `summarize-translate` 🔗 — `chain: [summarize, translate]` pipeline
- `resilient-qa` 🛡️ — question answering with `require_online`, `retry:2`, `fallback_skill:summarize`
- `agentmesh-manager` — SKILL.md with full API reference for Claude Code (auto-triggered when working on the codebase)
- `skill-creator` — skill authoring guide and iterative improvement workflow
