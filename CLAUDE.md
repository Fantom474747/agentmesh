# AgentMesh

AgentMesh is a desktop-first agent management platform built with Electron + React + TypeScript. The Electron main process embeds an Express + WebSocket server, allowing Claude (cloud) to orchestrate a fleet of local and free-tier cloud AI agents through a JSON-RPC 2.0 protocol. The React renderer (Vite) communicates with the main process over IPC and with the embedded server over localhost WebSocket.

---

## Tech Stack

- **Electron** + **electron-builder** — desktop shell, IPC, safeStorage, userData path
- **Vite** + **React 18** + **TypeScript** — renderer UI with HMR in dev
- **Express** + **ws** — embedded HTTP + WebSocket server (main process only)
- **Zustand** — renderer global state
- **Tailwind CSS** — dark industrial theme, accent `#1D9E75` (teal)
- **Zod** — runtime schema validation for all external inputs
- **sql.js** — SQLite compiled to WebAssembly, main process only; persisted to `agentmesh.db`
- **dotenv** — dev-only environment variables
- **Electron safeStorage** — encrypted API key storage in production

---

## Directory Structure

```
agentmesh/
├── electron/                     # Electron main process
│   ├── main.ts                   # Entry: BrowserWindow, IPC setup, starts embedded server
│   ├── server/
│   │   ├── index.ts              # Express bootstrap, listens on port 4321
│   │   ├── routes/               # REST handlers (health, agents, tasks, skills)
│   │   └── ws/                   # WebSocket handler — JSON-RPC 2.0 dispatcher
│   └── agents/
│       ├── registry.ts           # Agent CRUD + health-check loop; ALL agents table DB access
│       ├── queue.ts              # Task dispatch, retry logic; ALL tasks table DB access
│       └── runners/              # One file per agent backend
│           ├── local.ts          # Local script subprocess
│           ├── ollama.ts         # Ollama REST API
│           ├── groq.ts           # Groq cloud (free tier)
│           ├── huggingface.ts    # HuggingFace Inference API
│           ├── together.ts       # Together AI
│           └── openrouter.ts     # OpenRouter free models
├── src/                          # React renderer (Vite)
│   ├── App.tsx                   # Router shell (React Router v6)
│   ├── pages/
│   │   ├── Dashboard.tsx         # Agent health, task throughput chart, recent tasks
│   │   ├── Agents.tsx            # Agent list + add/edit modal
│   │   ├── Tasks.tsx             # Task history + log viewer
│   │   ├── Skills.tsx            # Installed YAML skill manifests
│   │   └── Settings.tsx          # Port, API keys, WebSocket URL, Deploy to Web
│   ├── components/               # Shared UI primitives
│   └── store/                    # Zustand slices (agentStore, taskStore, uiStore)
├── shared/
│   └── types.ts                  # ← CHECK HERE FIRST before creating any new interface
├── skills/                       # YAML skill manifests (auto-loaded at startup)
│   ├── summarize/manifest.yaml
│   ├── code_review/manifest.yaml
│   ├── extract_data/manifest.yaml
│   ├── translate/manifest.yaml
│   ├── classify/manifest.yaml
│   ├── question_answer/manifest.yaml
│   └── agentmesh-manager/SKILL.md
├── tests/
│   └── runners/                  # One test file per runner
├── package.json
├── vite.config.ts                # Renderer build (outDir: dist/renderer)
└── electron-builder.config.js   # Packaging (targets Windows/macOS/Linux)
```

---

## Common Commands

```bash
npm run dev              # Renderer HMR + Electron watch
npm run build            # Full production build + package
npm run build:renderer   # Renderer only
npm run build:main       # Electron main only
npm test                 # All tests
npx tsc --noEmit         # Type-check without emitting
```

---

## Key Conventions

### Shared types
`shared/types.ts` is the single source of truth for ALL interfaces and enums used across main and renderer. Check it before creating any new type.

### IDs
All entity IDs use `crypto.randomUUID()`. Never use sequential integers.

### Database access
- Agents table: only through `electron/agents/registry.ts`
- Tasks table: only through `electron/agents/queue.ts`
- Never write raw SQL in routes or runners
- SQLite path: `app.getPath('userData') + '/agentmesh.db'` in prod; `./dev.db` in dev
- Use `CREATE TABLE IF NOT EXISTS` migrations at startup in `registry.ts`
- Index `agent_id` on the tasks table at creation time

### Error handling
Always return structured errors — never let exceptions propagate unhandled:
```typescript
// Correct
return { error: { code: 'RUNNER_TIMEOUT', message: 'Agent did not respond in 30s' } }
// Wrong — never do this in routes or runners
throw new Error('Agent timed out')
```

### WebSocket protocol (JSON-RPC 2.0)
```jsonc
// Request
{ "id": "<uuid>", "method": "run_task", "params": { "skill": "summarize", "input": "..." } }
// Streaming chunk
{ "id": "<uuid>", "result": { "chunk": "partial..." } }
// Final result
{ "id": "<uuid>", "result": { "done": true, "output": "...", "durationMs": 1234 } }
// Error
{ "id": "<uuid>", "error": { "code": -32000, "message": "Runner failed: ..." } }
// Heartbeat
{ "method": "ping" }  →  { "result": "pong" }
```

### Streaming pattern
All runners use `AsyncGenerator` — never buffer full output:
```typescript
async *run(task: Task): AsyncGenerator<string, TaskResult> {
  for await (const chunk of streamFromBackend(task)) {
    yield chunk
  }
  return { success: true, output: accumulated }
}
```

### API key storage
- Production: `safeStorage.encryptString(key)` → store encrypted bytes in DB
- Development: `.env` via dotenv is acceptable
- Never commit `.env`. Never store plaintext keys in SQLite in production.

### Server port
Default `4321`, user-configurable in Settings. Passed to renderer via `contextBridge` IPC.

### WebSocket reconnection
Renderer client reconnects with exponential backoff (start 500 ms, max 30 s, ±20% jitter).

---

## AgentRunner Interface

Defined in `shared/types.ts`. Every runner must implement both methods:

```typescript
interface AgentRunner {
  run(task: Task): AsyncGenerator<string, TaskResult>   // streams then resolves
  healthCheck(): Promise<boolean>                        // called on registration + every 30s
}
```

---

## Adding a New Agent Runner

1. Create `electron/agents/runners/<type>.ts` implementing `AgentRunner`
2. Add the type string to the agent type enum in `electron/agents/registry.ts`
3. Add the type's config fields to the Add/Edit Agent modal in `src/pages/Agents.tsx`
4. Write tests in `tests/runners/<type>.test.ts` (normal stream, healthCheck pass/fail, error)
5. Add new config shape to `shared/types.ts` if needed

---

## Adding a New Skill

1. Create `skills/<id>/manifest.yaml` with `id`, `name`, `description`, `input_schema`, `output_schema`, `compatible_runners`, `system_prompt`
2. Skills are auto-loaded at startup by scanning `skills/*/manifest.yaml` — no code registration needed
3. Manifests are Zod-validated on load; malformed ones are logged and skipped

---

## Electron IPC Notes

- Main → renderer: `webContents.send(channel, payload)` for push events (task updates)
- Renderer → main: `ipcRenderer.invoke(channel, payload)` returns a Promise
- Always expose via `contextBridge` in a preload script — never expose raw `ipcRenderer`
- IPC channel names are string constants in `shared/types.ts` under `IpcChannel` enum

---

## Build Notes

| Output | Path |
|--------|------|
| Renderer | `dist/renderer/` |
| Electron main | `dist/main/` |
| Packaged app | `release/` |

In dev, Electron loads `http://localhost:5173` (Vite). In prod, it loads `dist/renderer/index.html` via `file://`.
