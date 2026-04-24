import { create } from 'zustand'
import type { Task } from '../../shared/types'
import * as api from '../api'

interface TaskStore {
  tasks: Task[]
  loading: boolean
  fetch: () => Promise<void>
  startPolling: () => () => void
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  loading: false,

  fetch: async () => {
    set({ loading: true })
    try {
      const tasks = await api.getTasks(100)
      set({ tasks, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  startPolling: () => {
    const id = setInterval(() => {
      useTaskStore.getState().fetch()
    }, 5_000)
    return () => clearInterval(id)
  },
}))

export const useTasks = () => useTaskStore((s) => s.tasks)
