import { create } from 'zustand'
import type { Agent, AgentType } from '../../shared/types'
import * as api from '../api'

interface AgentStore {
  agents: Agent[]
  loading: boolean
  error: string | null
  fetch: () => Promise<void>
  add: (data: {
    name: string
    type: AgentType
    endpoint?: string
    skills: string[]
    config?: Record<string, unknown>
  }) => Promise<Agent>
  remove: (id: string) => Promise<void>
  updateStatus: (id: string, status: Agent['status']) => void
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const agents = await api.getAgents()
      set({ agents, loading: false })
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
    }
  },

  add: async (data) => {
    const agent = await api.createAgent({ ...data, config: data.config ?? {} })
    set((s) => ({ agents: [agent, ...s.agents] }))
    return agent
  },

  remove: async (id) => {
    await api.deleteAgent(id)
    set((s) => ({ agents: s.agents.filter((a) => a.id !== id) }))
  },

  updateStatus: (id, status) => {
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === id ? { ...a, status, last_seen: Date.now() } : a,
      ),
    }))
  },
}))

export const useAgents = () => useAgentStore((s) => s.agents)
export const useAgentLoading = () => useAgentStore((s) => s.loading)
