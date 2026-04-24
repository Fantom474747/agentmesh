import { randomUUID } from 'node:crypto'
import { dbRun, dbGet, dbAll } from '../db.js'
import type { Agent, AgentType, AgentStatus } from '../../shared/types.js'
import { createRunner } from './runners/index.js'

interface AgentRow {
  id: string
  name: string
  type: string
  endpoint: string | null
  skills: string
  status: string
  last_seen: number | null
  config: string
  created_at: number
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AgentType,
    endpoint: row.endpoint ?? undefined,
    skills: JSON.parse(row.skills) as string[],
    status: row.status as AgentStatus,
    last_seen: row.last_seen ?? undefined,
    config: JSON.parse(row.config) as Record<string, unknown>,
    created_at: row.created_at,
  }
}

export function listAgents(): Agent[] {
  return dbAll<AgentRow>('SELECT * FROM agents ORDER BY created_at DESC').map(rowToAgent)
}

export function getAgent(id: string): Agent | undefined {
  const row = dbGet<AgentRow>('SELECT * FROM agents WHERE id = ?', [id])
  return row ? rowToAgent(row) : undefined
}

export function createAgent(
  data: Omit<Agent, 'id' | 'status' | 'created_at'>,
): Agent {
  const agent: Agent = {
    id: randomUUID(),
    status: 'unknown',
    created_at: Date.now(),
    ...data,
  }
  dbRun(
    `INSERT INTO agents (id, name, type, endpoint, skills, status, last_seen, config, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agent.id,
      agent.name,
      agent.type,
      agent.endpoint ?? null,
      JSON.stringify(agent.skills),
      agent.status,
      agent.last_seen ?? null,
      JSON.stringify(agent.config),
      agent.created_at,
    ],
  )
  return agent
}

export function updateAgentStatus(id: string, status: AgentStatus, last_seen?: number): void {
  dbRun('UPDATE agents SET status = ?, last_seen = ? WHERE id = ?', [
    status,
    last_seen ?? null,
    id,
  ])
}

export function deleteAgent(id: string): void {
  dbRun('DELETE FROM agents WHERE id = ?', [id])
}

let _healthInterval: ReturnType<typeof setInterval> | null = null

export function startHealthChecks(onUpdate?: (id: string, status: AgentStatus) => void): void {
  if (_healthInterval) return
  _healthInterval = setInterval(() => runChecks(onUpdate), 30_000)
}

async function runChecks(onUpdate?: (id: string, status: AgentStatus) => void): Promise<void> {
  for (const agent of listAgents()) {
    let status: AgentStatus = 'offline'
    try {
      const runner = createRunner(agent)
      const healthy = await Promise.race([
        runner.healthCheck(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000)),
      ])
      status = healthy ? 'online' : 'offline'
    } catch {
      status = 'offline'
    }
    updateAgentStatus(agent.id, status, Date.now())
    onUpdate?.(agent.id, status)
  }
}
