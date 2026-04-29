// Single source of truth for all interfaces and enums used across main and renderer.
// CHECK THIS FILE FIRST before creating any new interface.

export type AgentType =
  | 'local_script'
  | 'local_docker'
  | 'ollama'
  | 'groq'
  | 'huggingface'
  | 'together'
  | 'openrouter'

export type AgentStatus = 'online' | 'offline' | 'unknown'

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed'

export interface Agent {
  id: string
  name: string
  type: AgentType
  endpoint?: string
  skills: string[]
  status: AgentStatus
  last_seen?: number
  config: Record<string, unknown>
  created_at: number
}

export interface Task {
  id: string
  skill: string
  input: string
  agent_id?: string
  status: TaskStatus
  result?: string
  error?: string
  created_at: number
  completed_at?: number
}

export interface TaskResult {
  success: boolean
  output: string
  durationMs?: number
  error?: string
}

// A tool the agent can call autonomously during task execution
export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description: string; enum?: string[] }>
    required?: string[]
  }
}

export interface AgentRunner {
  run(task: Task, systemPrompt: string, tools?: ToolDefinition[]): AsyncGenerator<string, TaskResult>
  healthCheck(): Promise<boolean>
}

export interface SkillManifest {
  id: string
  name: string
  description: string
  input_schema: Record<string, unknown>
  output_schema: Record<string, unknown>
  compatible_runners: AgentType[]
  system_prompt: string
  source?: 'yaml' | 'markdown'
  // Model / runner selection
  tools?: string[]
  model?: string
  allow_all_runners?: boolean
  preferred_agent?: string   // try this agent ID first; fall back to auto if offline
  require_online?: boolean   // fail immediately if no compatible online agent
  // Execution control
  temperature?: number
  max_tokens?: number
  timeout_ms?: number
  retry?: number
  // Tool access control
  tool_sandbox?: string      // restrict filesystem tools to this directory
  tool_timeout_ms?: number   // per-tool-call timeout in ms
  // Context injection
  inject_date?: boolean      // prepend today's date to the system prompt
  inject_cwd?: boolean       // prepend process.cwd() to the system prompt
  context_template?: string  // template wrapping system_prompt; use {{system_prompt}} as placeholder
  // Skill composition
  chain?: string[]           // run these skill IDs in sequence; output of each feeds the next
  fallback_skill?: string    // if this skill fails (after retries), re-run with this skill ID
  // UI / discovery
  tags?: string[]
  icon?: string
  hidden?: boolean           // hide from Skills UI (MCP-only skills)
  version?: string
  author?: string
}

export interface JsonRpcRequest {
  id: string
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcChunk {
  id: string
  result: { chunk: string }
}

export interface JsonRpcFinalResult {
  id: string
  result: { done: true; output: string; durationMs: number }
}

export interface JsonRpcError {
  id: string
  error: { code: number; message: string }
}

// IPC channel names — always use these constants, never raw strings
export enum IpcChannel {
  GET_SERVER_PORT = 'get-server-port',
  GET_USERDATA_PATH = 'get-userdata-path',
  TASK_UPDATE = 'task-update',
  AGENT_UPDATE = 'agent-update',
  SKILL_SAVE = 'skill:save',
  SKILL_DELETE = 'skill:delete',
  SKILL_READ_RAW = 'skill:read-raw',
}

// Exposed to renderer via contextBridge — see electron/preload.ts
export interface AgentMeshBridge {
  getServerPort(): Promise<number>
  getUserDataPath(): Promise<string>
  winMinimize(): void
  winMaximize(): void
  winClose(): void
  skillSave(manifest: SkillManifest): Promise<void>
  skillDelete(id: string): Promise<void>
  skillReadRaw(id: string): Promise<{ content: string; format: 'yaml' | 'markdown' }>
}

// Augment the renderer's Window type
declare global {
  interface Window {
    agentmesh: AgentMeshBridge
  }
}
