import { Component, useEffect, useRef, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import Tasks from './pages/Tasks'
import Skills from './pages/Skills'
import Settings from './pages/Settings'
import { useWsStatus, useSetWsStatus, useSetServerPort } from './store/uiStore'
import { useTaskStore } from './store/taskStore'
import { useAgentStore } from './store/agentStore'
import { setApiBase } from './api'
import * as wsClient from './wsClient'
import type { Agent } from '../shared/types'

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }
  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full bg-neutral-950">
          <div className="text-center space-y-3 p-8">
            <p className="text-red-400 text-sm font-mono">Unhandled render error</p>
            <p className="text-neutral-500 text-xs max-w-md">{this.state.message}</p>
            <button
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="text-xs text-teal hover:underline"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const NAV = [
  { path: '/',         label: 'Dashboard', end: true  },
  { path: '/agents',   label: 'Agents',    end: false },
  { path: '/tasks',    label: 'Tasks',     end: false },
  { path: '/skills',   label: 'Skills',    end: false },
  { path: '/settings', label: 'Settings',  end: false },
]

export default function App() {
  const wsStatus = useWsStatus()
  const setWsStatus = useSetWsStatus()
  const setServerPort = useSetServerPort()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelay = useRef(500)

  useEffect(() => {
    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = async () => {
      if (cancelled) return
      let port = 4321
      try {
        port = await window.agentmesh.getServerPort()
        setServerPort(port)
        setApiBase(port)
      } catch { /* dev fallback */ }

      setWsStatus('connecting')
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
      wsRef.current = ws
      wsClient.setWs(ws)

      // Handle server-push broadcasts
      wsClient.subscribeGlobal((msg) => {
        if (msg.method === 'task:update') {
          useTaskStore.getState().fetch()
        }
        if (msg.method === 'agent_status') {
          const params = msg.params as { id: string; status: Agent['status'] } | undefined
          if (params) useAgentStore.getState().updateStatus(params.id, params.status)
        }
      })

      ws.onopen = () => {
        if (cancelled) { ws.close(); return }
        setWsStatus('connected')
        reconnectDelay.current = 500
      }

      ws.onclose = () => {
        if (cancelled) return
        wsClient.setWs(null)
        setWsStatus('disconnected')
        const jitter = 0.8 + Math.random() * 0.4
        const delay = Math.min(reconnectDelay.current * jitter, 30_000)
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000)
        reconnectTimer = setTimeout(connect, delay)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, [setWsStatus, setServerPort])

  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen overflow-hidden bg-neutral-950 text-neutral-100">
        <div className="drag-region shrink-0 h-10 flex items-center px-4 bg-neutral-900 border-b border-neutral-800">
          <span className="no-drag font-mono text-xs font-semibold tracking-[0.2em] uppercase text-teal select-none">
            AgentMesh
          </span>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-52 shrink-0 flex flex-col bg-neutral-900 border-r border-neutral-800">
            <nav className="flex-1 py-2 overflow-y-auto">
              {NAV.map(({ path, label, end }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={end}
                  className={({ isActive }) =>
                    [
                      'flex items-center px-4 py-2.5 text-sm transition-colors border-r-2',
                      isActive
                        ? 'text-teal bg-teal/10 border-teal'
                        : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 border-transparent',
                    ].join(' ')
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>

            <div className="px-4 py-3 border-t border-neutral-800 shrink-0">
              <div className="flex items-center gap-2">
                <div
                  className={[
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    wsStatus === 'connected'
                      ? 'bg-teal'
                      : wsStatus === 'connecting'
                        ? 'bg-yellow-400 animate-pulse'
                        : 'bg-neutral-600',
                  ].join(' ')}
                />
                <span className="font-mono text-xs text-neutral-500">{wsStatus}</span>
              </div>
            </div>
          </aside>

          <main className="flex-1 overflow-auto">
            <ErrorBoundary>
              <Routes>
                <Route path="/"         element={<Dashboard />} />
                <Route path="/agents"   element={<Agents />} />
                <Route path="/tasks"    element={<Tasks />} />
                <Route path="/skills"   element={<Skills />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}
