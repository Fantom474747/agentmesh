import type { Agent, Task, SkillManifest } from '../shared/types'

let base = 'http://127.0.0.1:4321'

export function setApiBase(port: number): void {
  base = `http://127.0.0.1:${port}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message: string } }
    throw new Error(body.error?.message ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

// Agents
export const getAgents = () => request<Agent[]>('/agents')
export const getAgent = (id: string) => request<Agent>(`/agents/${id}`)
export const createAgent = (data: Omit<Agent, 'id' | 'status' | 'created_at'>) =>
  request<Agent>('/agents', { method: 'POST', body: JSON.stringify(data) })
export const deleteAgent = (id: string) =>
  request<void>(`/agents/${id}`, { method: 'DELETE' })

// Tasks
export const getTasks = (limit?: number) =>
  request<Task[]>(`/tasks${limit ? `?limit=${limit}` : ''}`)
export const getTask = (id: string) => request<Task>(`/tasks/${id}`)
export const createTask = (data: Pick<Task, 'skill' | 'input' | 'agent_id'>) =>
  request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) })

// Skills
export const getSkills = () => request<SkillManifest[]>('/skills')

// Health
export const getHealth = () =>
  request<{ status: string; agentCount: number; skillCount: number }>('/health')
