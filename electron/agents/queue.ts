import { randomUUID } from 'node:crypto'
import { dbRun, dbGet, dbAll } from '../db.js'
import type { Task, TaskStatus, SkillManifest, Agent, ToolDefinition } from '../../shared/types.js'
import * as registry from './registry.js'
import { resolveTools } from './tools/index.js'
import type { ToolContext } from './tools/index.js'
import type { RunnerExecParams } from './runners/index.js'

interface TaskRow {
  id: string
  skill: string
  input: string
  agent_id: string | null
  status: string
  result: string | null
  error: string | null
  created_at: number
  completed_at: number | null
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    skill: row.skill,
    input: row.input,
    agent_id: row.agent_id ?? undefined,
    status: row.status as TaskStatus,
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    created_at: row.created_at,
    completed_at: row.completed_at ?? undefined,
  }
}

export function listTasks(limit = 100): Task[] {
  return dbAll<TaskRow>(
    'SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?',
    [limit],
  ).map(rowToTask)
}

export function getTask(id: string): Task | undefined {
  const row = dbGet<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id])
  return row ? rowToTask(row) : undefined
}

export function createTask(data: Pick<Task, 'skill' | 'input' | 'agent_id'>): Task {
  const task: Task = {
    id: randomUUID(),
    skill: data.skill,
    input: data.input,
    agent_id: data.agent_id,
    status: 'pending',
    created_at: Date.now(),
  }
  dbRun(
    `INSERT INTO tasks (id, skill, input, agent_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [task.id, task.skill, task.input, task.agent_id ?? null, task.status, task.created_at],
  )
  return task
}

export function updateTaskStatus(
  id: string,
  status: TaskStatus,
  result?: string,
  error?: string,
): void {
  const completedAt = status === 'done' || status === 'failed' ? Date.now() : null
  dbRun(
    'UPDATE tasks SET status = ?, result = ?, error = ?, completed_at = ? WHERE id = ?',
    [status, result ?? null, error ?? null, completedAt, id],
  )
}

// Select an agent for a skill.
// By default any agent is eligible. When a skill specifies a model, only agents
// with config.model matching that value are considered.
export function selectAgent(skill: SkillManifest | undefined, forcedAgentId?: string): Agent | undefined {
  const agents = registry.listAgents()

  if (forcedAgentId) return registry.getAgent(forcedAgentId)

  // preferred_agent: try it first if online, then fall back
  if (skill?.preferred_agent) {
    const preferred = registry.getAgent(skill.preferred_agent)
    if (preferred?.status === 'online') return preferred
  }

  const requireOnline = !!skill?.require_online

  // When skill has a model set, restrict to agents configured with that model
  const modelFilter = skill?.model
  const pool = modelFilter
    ? agents.filter((a) => (a.config.model as string | undefined) === modelFilter)
    : agents

  const online = pool.find((a) => a.status === 'online')
  if (online) return online
  if (requireOnline) return undefined
  return pool[0]
}

type RunTaskFn = (
  task: Task,
  systemPrompt: string,
  agent: Agent,
  tools: ToolDefinition[],
  exec: RunnerExecParams | undefined,
  timeoutMs: number | undefined,
  onChunk?: (taskId: string, chunk: string) => void,
) => Promise<void>

type RunChainFn = (
  chainSkillIds: string[],
  input: string,
  getSkills: () => SkillManifest[],
  findAgent: (skill: SkillManifest) => Agent | undefined,
  parentTaskId: string,
  onChunk?: (taskId: string, chunk: string) => void,
) => Promise<{ success: boolean; output: string; error?: string }>

type UpdateFn = (taskId: string, status: TaskStatus, result?: string, error?: string) => void

let _queueTimer: ReturnType<typeof setInterval> | null = null

export function startQueueRunner(
  getSkills: () => SkillManifest[],
  onUpdate: UpdateFn,
  runTask: RunTaskFn,
  runChain: RunChainFn,
): void {
  if (_queueTimer) return
  _queueTimer = setInterval(() => {
    runPending(getSkills, onUpdate, runTask, runChain).catch((err) => {
      console.error('[queue] runPending error:', (err as Error).message)
    })
  }, 3_000)
}

async function runPending(
  getSkills: () => SkillManifest[],
  onUpdate: UpdateFn,
  runTask: RunTaskFn,
  runChain: RunChainFn,
): Promise<void> {
  const pending = dbAll<TaskRow>(
    "SELECT * FROM tasks WHERE status = 'pending' LIMIT 5",
    [],
  ).map(rowToTask)

  for (const task of pending) {
    const skills = getSkills()
    const skill = task.skill !== '_raw' ? skills.find((s) => s.id === task.skill) : undefined
    const systemPrompt = skill?.system_prompt ?? 'You are a helpful assistant.'

    // ── Chain execution ────────────────────────────────────────────────────
    if (skill?.chain?.length) {
      updateTaskStatus(task.id, 'running')
      try {
        const result = await runChain(
          skill.chain,
          task.input,
          getSkills,
          (s) => selectAgent(s),
          task.id,
        )
        updateTaskStatus(task.id, result.success ? 'done' : 'failed', result.output, result.error)
        onUpdate(task.id, result.success ? 'done' : 'failed', result.output, result.error)
      } catch (err) {
        const message = (err as Error).message
        updateTaskStatus(task.id, 'failed', undefined, message)
        onUpdate(task.id, 'failed', undefined, message)
      }
      continue
    }

    // ── Normal execution ───────────────────────────────────────────────────
    const agent = selectAgent(skill, task.agent_id)

    if (!agent) {
      if (skill?.require_online) {
        updateTaskStatus(task.id, 'failed', undefined, 'No online agent available (require_online is set)')
        onUpdate(task.id, 'failed', undefined, 'No online agent available (require_online is set)')
      }
      // no agent yet but not require_online → leave as pending
      continue
    }

    const toolCtx: ToolContext | undefined =
      skill?.tool_sandbox || skill?.tool_timeout_ms || skill?.tools
        ? { sandbox: skill.tool_sandbox, timeoutMs: skill.tool_timeout_ms, allowedTools: skill.tools }
        : undefined

    const exec: RunnerExecParams = {
      modelOverride: skill?.model,
      temperature: skill?.temperature,
      max_tokens: skill?.max_tokens,
      toolCtx,
    }
    const tools = resolveTools(skill?.tools ?? [])
    const timeoutMs = skill?.timeout_ms
    const maxAttempts = 1 + (skill?.retry ?? 0)

    let lastError = ''
    let succeeded = false

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await runTask(task, systemPrompt, agent, tools, exec, timeoutMs)
        const updated = getTask(task.id)
        if (updated?.status === 'done') {
          onUpdate(task.id, 'done', updated.result, undefined)
          succeeded = true
          break
        }
        lastError = updated?.error ?? 'unknown error'
      } catch (err) {
        lastError = (err as Error).message
      }
      if (attempt < maxAttempts - 1) {
        updateTaskStatus(task.id, 'pending')
      }
    }

    if (!succeeded) {
      // ── Fallback skill ─────────────────────────────────────────────────
      if (skill?.fallback_skill) {
        const fallback = skills.find((s) => s.id === skill.fallback_skill)
        if (fallback) {
          const fbAgent = selectAgent(fallback)
          if (fbAgent) {
            const fbExec: RunnerExecParams = {
              modelOverride: fallback.model,
              temperature: fallback.temperature,
              max_tokens: fallback.max_tokens,
            }
            try {
              await runTask(task, fallback.system_prompt, fbAgent, resolveTools(fallback.tools ?? []), fbExec, fallback.timeout_ms)
              const updated = getTask(task.id)
              if (updated?.status === 'done') {
                onUpdate(task.id, 'done', updated.result, undefined)
                succeeded = true
              }
            } catch { /* fallback also failed — fall through */ }
          }
        }
      }

      if (!succeeded) {
        onUpdate(task.id, 'failed', undefined, lastError)
      }
    }
  }
}
