import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import { z } from 'zod'
import type { JsonRpcRequest, SkillManifest, Agent } from '../../../shared/types.js'
import * as registry from '../../agents/registry.js'
import * as queue from '../../agents/queue.js'
import { executeTask, executeChain, buildSystemPrompt } from '../../agents/executor.js'
import { resolveTools } from '../../agents/tools/index.js'
import type { RunnerExecParams } from '../../agents/runners/index.js'

export type WsEventEmitter = (event: string, payload: unknown) => void

const RunTaskParams = z.object({
  skill: z.string().optional(),
  input: z.string(),
  agent_id: z.string().optional(),
  system_prompt: z.string().optional(),
})

export function attachWs(server: Server, getSkills: () => SkillManifest[]): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', (raw) => {
      let msg: Partial<JsonRpcRequest>
      try {
        msg = JSON.parse(raw.toString()) as Partial<JsonRpcRequest>
      } catch {
        return
      }

      if (msg.method === 'ping') {
        send(ws, { result: 'pong' })
        return
      }

      if (msg.method === 'run_task') {
        handleRunTask(ws, msg.id ?? '', msg.params ?? {}, getSkills).catch((err) => {
          console.error('[ws] run_task unhandled error:', err)
        })
        return
      }

      send(ws, {
        id: msg.id,
        error: { code: -32601, message: `Method '${msg.method}' not yet implemented` },
      })
    })

    ws.on('error', (err) => console.error('[ws]', err.message))
  })

  return wss
}

async function handleRunTask(
  ws: WebSocket,
  id: string,
  rawParams: Record<string, unknown>,
  getSkills: () => SkillManifest[],
): Promise<void> {
  const parsed = RunTaskParams.safeParse(rawParams)
  if (!parsed.success) {
    send(ws, { id, error: { code: -32602, message: `Invalid params: ${parsed.error.message}` } })
    return
  }

  const { skill: skillId, input, agent_id, system_prompt } = parsed.data

  let skill: SkillManifest | undefined
  if (skillId && skillId !== '_raw') {
    skill = getSkills().find((s) => s.id === skillId)
    if (!skill) {
      send(ws, { id, error: { code: -32000, message: `Unknown skill: ${skillId}` } })
      return
    }
  }

  const task = queue.createTask({ skill: skillId ?? '_raw', input, agent_id })
  const start = Date.now()

  // ── Chain execution ──────────────────────────────────────────────────────
  if (skill?.chain?.length) {
    try {
      const result = await executeChain(
        skill.chain,
        input,
        getSkills,
        (s) => queue.selectAgent(s),
        task.id,
        (_taskId, chunk) => {
          if (ws.readyState === WebSocket.OPEN) send(ws, { id, result: { chunk } })
        },
      )
      queue.updateTaskStatus(task.id, result.success ? 'done' : 'failed', result.output, result.error)
      if (result.success) {
        send(ws, { id, result: { done: true, output: result.output, durationMs: Date.now() - start } })
      } else {
        send(ws, { id, error: { code: -32000, message: result.error ?? 'Chain failed' } })
      }
    } catch (err) {
      send(ws, { id, error: { code: -32000, message: `Chain failed: ${(err as Error).message}` } })
    }
    return
  }

  // ── Normal execution ─────────────────────────────────────────────────────
  const agent = queue.selectAgent(skill, agent_id)

  if (!agent) {
    const reason = skill?.require_online
      ? 'No online agent available (require_online is set)'
      : 'No agent available'
    send(ws, { id, error: { code: -32000, message: reason } })
    queue.updateTaskStatus(task.id, 'failed', undefined, reason)
    return
  }

  queue.updateTaskStatus(task.id, 'pending', undefined, undefined)

  const resolvedSystemPrompt = buildSystemPrompt(skill, system_prompt ?? skill?.system_prompt ?? 'You are a helpful assistant.')

  const exec: RunnerExecParams = {
    modelOverride: skill?.model,
    temperature: skill?.temperature,
    max_tokens: skill?.max_tokens,
    toolCtx: skill?.tool_sandbox || skill?.tool_timeout_ms || skill?.tools
      ? { sandbox: skill.tool_sandbox, timeoutMs: skill.tool_timeout_ms, allowedTools: skill.tools }
      : undefined,
  }

  const tools = resolveTools(skill?.tools ?? [])

  try {
    await executeTask(task, resolvedSystemPrompt, agent, tools, exec, skill?.timeout_ms, (_taskId, chunk) => {
      if (ws.readyState === WebSocket.OPEN) send(ws, { id, result: { chunk } })
    })

    // Fallback skill if the task failed
    let completed = queue.getTask(task.id)
    if (completed?.status === 'failed' && skill?.fallback_skill) {
      const fallback = getSkills().find((s) => s.id === skill!.fallback_skill)
      const fbAgent = fallback ? queue.selectAgent(fallback) : undefined
      if (fallback && fbAgent) {
        send(ws, { id, result: { chunk: `\n[fallback: ${fallback.id}]\n` } })
        const fbExec: RunnerExecParams = { modelOverride: fallback.model, temperature: fallback.temperature, max_tokens: fallback.max_tokens }
        await executeTask(task, buildSystemPrompt(fallback, fallback.system_prompt), fbAgent, resolveTools(fallback.tools ?? []), fbExec, fallback.timeout_ms, (_taskId, chunk) => {
          if (ws.readyState === WebSocket.OPEN) send(ws, { id, result: { chunk } })
        })
        completed = queue.getTask(task.id)
      }
    }

    send(ws, {
      id,
      result: {
        done: true,
        output: completed?.result ?? '',
        durationMs: (completed?.completed_at ?? Date.now()) - start,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    send(ws, { id, error: { code: -32000, message: `Runner failed: ${message}` } })
  }
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

export function broadcast(wss: WebSocketServer, payload: unknown): void {
  const data = JSON.stringify(payload)
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data)
  }
}
