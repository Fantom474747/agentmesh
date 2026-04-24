import express from 'express'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { app as electronApp } from 'electron'
import agentRoutes from './routes/agents.js'
import taskRoutes from './routes/tasks.js'
import skillRoutes from './routes/skills.js'
import { attachWs, broadcast, type WsEventEmitter } from './ws/handler.js'
import { attachMcp } from './mcp.js'
import { loadSkills } from './skills.js'
import * as registry from '../agents/registry.js'
import { startQueueRunner } from '../agents/queue.js'
import { executeTask, executeChain } from '../agents/executor.js'
import type { WebSocketServer } from 'ws'
import type { SkillManifest } from '../../shared/types.js'

const DEFAULT_PORT = 4321

let _skills: SkillManifest[] = []
let _wss: WebSocketServer | null = null

export function getSkillsDir(): string {
  return join(electronApp.getAppPath(), 'skills')
}

export function reloadSkills(): void {
  _skills = loadSkills(getSkillsDir())
  console.log(`[skills] Reloaded ${_skills.length} skill(s)`)
}

export function getSkills(): SkillManifest[] {
  return _skills
}

export const emit: WsEventEmitter = (event, payload) => {
  if (_wss) broadcast(_wss, { method: event, params: payload })
}

export async function startServer(port = DEFAULT_PORT): Promise<number> {
  reloadSkills()

  const expressApp = express()
  expressApp.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (_req.method === 'OPTIONS') { res.status(204).end(); return }
    next()
  })
  expressApp.use(express.json())

  expressApp.get('/health', (_req: import('express').Request, res: import('express').Response) => {
    res.json({
      status: 'ok',
      version: '0.1.0',
      agentCount: registry.listAgents().length,
      skillCount: _skills.length,
    })
  })

  expressApp.use('/agents', agentRoutes)
  expressApp.use('/tasks', taskRoutes)
  expressApp.use('/skills', skillRoutes)

  attachMcp(expressApp, getSkills, getSkillsDir, reloadSkills)

  const server = createServer(expressApp)
  _wss = attachWs(server, getSkills)

  startQueueRunner(
    getSkills,
    (taskId, status, result, error) => {
      if (_wss) broadcast(_wss, { method: 'task:update', params: { taskId, status, result, error } })
    },
    (task, systemPrompt, agent, tools, exec, timeoutMs, onChunk) =>
      executeTask(task, systemPrompt, agent, tools, exec, timeoutMs, onChunk),
    (chainSkillIds, input, gs, findAgent, parentTaskId, onChunk) =>
      executeChain(chainSkillIds, input, gs, findAgent, parentTaskId, onChunk),
  )

  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => {
      console.log(`[server] Listening on http://127.0.0.1:${port}`)
      resolve(port)
    })
  })
}
