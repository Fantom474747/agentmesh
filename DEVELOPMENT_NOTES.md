# Development Notes

> These features are implemented and type-checked but not yet covered by automated tests.

Changes that have been implemented and type-checked but not yet manually tested against a running agent.

---

## [2026-04-23] SKILL.md support + skill management MCP tools

### What it does
Skills can now be defined as `SKILL.md` (markdown with YAML frontmatter) in addition to `manifest.yaml`. The two formats are interchangeable — the loader prefers `manifest.yaml` if both exist. The skill creator has a YAML/SKILL.md toggle. Skill cards show a coloured badge indicating their format. Three new MCP tools let Claude Code create, read, and edit skills directly.

### New / modified files
- `shared/types.ts` — `SkillManifest.source?: 'yaml' | 'markdown'`; `IpcChannel.SKILL_READ_RAW`; `skillReadRaw()` on bridge
- `electron/server/skills.ts` — `loadSkills()` now scans for `SKILL.md` as fallback; `buildSkillMd()`, `buildSkillYaml()`, `readSkillRaw()` helpers
- `electron/preload.ts` — exposes `skillReadRaw` via contextBridge
- `electron/main.ts` — `skillSave` IPC writes `SKILL.md` or `manifest.yaml` depending on `manifest.source`; new `SKILL_READ_RAW` handler; removed unused `js-yaml` import
- `electron/server/mcp.ts` — `attachMcp` now takes `getSkillsDir` + `reloadSkills`; added `agentmesh_skill_read`, `agentmesh_skill_create`, `agentmesh_skill_edit` tools
- `electron/server/index.ts` — passes `getSkillsDir`, `reloadSkills` to `attachMcp`
- `src/pages/Skills.tsx` — `SourceBadge` component (violet = SKILL.md, amber = YAML); tool count badge; YAML/SKILL.md toggle in create modal; markdown editor mode (single textarea); raw content loaded via `skillReadRaw` IPC when editing existing SKILL.md

### How to test
1. Open Skills page — existing skills should show amber **YAML** badge
2. Click **+ New Skill**, toggle to **SKILL.md** — editor should appear with template pre-filled
3. Fill in an id, edit the template, save — verify `skills/<id>/SKILL.md` is created on disk and the card shows violet **SKILL.md** badge
4. Click Edit on a SKILL.md skill — editor should load the raw file content
5. Edit and save — verify file is updated and skill reloads
6. From Claude Code, call `agentmesh_skill_create` with `format="markdown"` — verify skill appears in UI
7. Call `agentmesh_skill_read` on an existing skill — verify raw content is returned
8. Call `agentmesh_skill_edit` with modified content — verify skill reloads

### Known risks / things to verify
- `submitMarkdown` for existing skills: uses `buildSkillMd(manifest)` which reconstructs YAML frontmatter from the loaded manifest fields — if the user edits the frontmatter in the textarea, those changes are currently lost on save (only the body/system_prompt is preserved). Full round-trip editing requires parsing the edited markdown client-side, which is not yet implemented.
- `agentmesh_skill_create` with `format="markdown"` writes the file correctly but `reloadSkills()` is called synchronously — verify the new skill appears immediately in `agentmesh_list_skills`
- The pre-existing `mcp.ts` type errors (MCP SDK / Zod version mismatch) are unrelated to these changes

---

## [2026-04-23] Model override + allow_all_runners per skill

### What it does
Skills can now pin a specific model name (`model: qwen2.5-coder`) that overrides whatever model is configured on the matched agent. The `allow_all_runners` flag bypasses the `compatible_runners` filter so any online agent can pick up the task.

### Modified files
- `shared/types.ts` — `SkillManifest.model?`, `SkillManifest.allow_all_runners?`
- `electron/server/skills.ts` — Zod schema parses both fields; `buildSkillMd` serialises them
- `electron/agents/runners/index.ts` — `createRunner(agent, modelOverride?)`
- `electron/agents/runners/utils.ts` — `makeOpenAICompatRunner` accepts `modelOverride`; `resolveModel()` = override ?? configured
- `electron/agents/runners/ollama.ts`, `groq.ts`, `together.ts`, `openrouter.ts`, `huggingface.ts` — all accept and pass `modelOverride`
- `electron/agents/executor.ts` — `executeTask(…, modelOverride?)`
- `electron/agents/queue.ts` — passes `skill.model` as override; respects `allow_all_runners` in agent selection
- `electron/server/index.ts`, `mcp.ts`, `ws/handler.ts` — updated call sites
- `src/pages/Skills.tsx` — model input field + allow-all toggle in YAML form; model badge (blue) and "any runner" badge on cards; SKILL.md template updated with commented hints

### How to test
1. Create a YAML skill, set model to `qwen2.5-coder`, target an Ollama agent configured for `llama3` — verify Ollama uses `qwen2.5-coder`
2. Enable "Allow any runner type" — verify a Groq agent picks up a task even though `compatible_runners` lists only `ollama`
3. In a SKILL.md, add `allow_all_runners: true` and `model: llama3.1` — verify both are parsed and applied
4. Leave model blank — verify agent uses its own configured default

### Known risks
- HuggingFace: `modelOverride` changes the endpoint URL (model is part of the URL path) — verify the new URL is valid for the override model
- `allow_all_runners` + no online agents: falls through to `agents[0]` even if offline, same as before

---

## Edge case test plan — tool-calling + agent execution

### Tool calling

| Scenario | Expected behaviour |
|----------|--------------------|
| Model doesn't support function calling (e.g. old `llama2`) | Tool loop is skipped; agent answers from prompt only — no crash |
| `list_dir` on a non-existent path | Returns `Error: path does not exist: …` — model sees the error and can try a different path |
| `list_dir` with `recursive=true` on a huge tree (e.g. C:\Windows) | Returns up to MAX_DEPTH=10, skips `node_modules`/`.git` — response may be long but won't hang |
| `read_file` on a file > 500 KB | Returns size error with hint to use `start_line`/`end_line` |
| `read_file` with `start_line=50, end_line=100` on a 40-line file | Returns lines 50–40 (empty slice) gracefully — no crash |
| `search_files` with an invalid regex (e.g. `[unclosed`) | Returns `Error: invalid regex pattern` |
| `search_files` returning > 100 results | Truncates at 100 with `... (truncated)` note |
| `executeTool` called with unknown tool name | Returns `Error: unknown tool "foo". Available: …` |
| Model calls a tool not in the skill's `tools` list | Tool is still executed (the list is advisory, not enforced server-side) — consider adding enforcement |
| 10 tool-call rounds exhausted | Loop exits after round 10; proceeds to streaming final answer |
| Tool result is very long (> 10 KB) | Full result is injected into message history — monitor context overflow on small models |

### Agent + runner

| Scenario | Expected behaviour |
|----------|--------------------|
| No agents online when task arrives | Task stays `pending` indefinitely — queue poll finds no agent, skips |
| Agent goes offline mid-task | Runner fetch throws; task marked `failed` with error message |
| Ollama model not pulled (404 from `/api/chat`) | Returns `HTTP 404: …` error in task result |
| Groq rate limit (429) | Returns `HTTP 429: …` — no retry logic yet |
| WebSocket client disconnects mid-stream | `ws.readyState !== OPEN` check suppresses further chunk sends; task still completes in DB |
| Two tasks dispatched simultaneously for same agent | Both run concurrently (no per-agent locking) — may cause context issues on small local models |
| SKILL.md with missing `name` in frontmatter | Zod validation fails; skill skipped with warning in console |
| SKILL.md with no `---` frontmatter delimiters | `parseSkillMd` returns null; skill skipped |
| `agentmesh_skill_edit` called with broken YAML | Written to disk; `loadSkills` logs a warning and skips — skill disappears from list until fixed |

---

## [2026-04-23] Autonomous tool access for agents

### What it does
Agents can now browse the filesystem autonomously during task execution. Instead of the master agent pre-fetching everything, you pass a directory path in the task input and the agent calls tools itself (list files, read files, search, get metadata) before producing its answer.

### New files
- `electron/agents/tools/filesystem.ts` — tool implementations (list_dir, read_file, search_files, get_file_info)
- `electron/agents/tools/index.ts` — tool registry, `resolveTools()`, `executeTool()`

### Modified files
- `shared/types.ts` — added `ToolDefinition` interface; `SkillManifest.tools?: string[]`; `AgentRunner.run` accepts `tools?`
- `electron/agents/runners/utils.ts` — added `openAIToolCallingLoop()` two-phase helper; `makeOpenAICompatRunner` uses it when tools are present
- `electron/agents/runners/ollama.ts` — Ollama-specific tool-calling loop (NDJSON format, no tool_call_id)
- `electron/agents/executor.ts` — passes `tools: ToolDefinition[]` to runners
- `electron/agents/queue.ts` — resolves tool names from skill manifest via `resolveTools()`
- `electron/server/index.ts` — updated `executeTask` call signature
- `electron/server/ws/handler.ts` — resolves and passes skill tools on WebSocket path
- `electron/server/mcp.ts` — passes skill tools on MCP path; `agentmesh_run_prompt` passes `[]`
- `electron/server/skills.ts` — Zod schema now accepts optional `tools` array
- `skills/code_review/manifest.yaml` — declares all 4 tools; system prompt instructs agent to explore first

### How to test
1. Start the app (`npm run dev`)
2. Register an Ollama agent with a tool-capable model (`llama3.1`, `llama3.2`, or `qwen2.5`)
3. From Claude Code or the WebSocket, run:
   ```json
   { "method": "run_task", "params": { "skill": "code_review", "input": "Review the code at C:/some/project" } }
   ```
4. Watch the streamed output — you should see `[tool: list_dir]` lines followed by `> ...` previews before the final review
5. Test the no-tools path still works: run any other skill (summarize, translate, etc.) and verify normal streaming behaviour is unchanged

### Known risks / things to verify
- Ollama tool calls: `arguments` field comes back as a parsed object, not a JSON string — verify the Ollama runner doesn't double-parse it
- OpenAI-compatible APIs (Groq, Together, OpenRouter): verify `tool_choice: 'auto'` is accepted and tool call round-trips work
- Large directories: `list_dir` with `recursive=true` on a huge tree might produce very long context — monitor token usage
- Models without function calling (older Ollama models): they will silently skip the tool loop and answer with only the prompt — verify no crash
- The two-phase approach (non-streaming tool calls → streaming final answer) adds latency proportional to the number of tool call rounds — test with a deep codebase
