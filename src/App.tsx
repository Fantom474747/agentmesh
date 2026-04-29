import { Component, memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import Tasks from './pages/Tasks'
import Skills from './pages/Skills'
import Settings from './pages/Settings'
import { useWsStatus, useSetWsStatus, useSetServerPort, useServerPort } from './store/uiStore'
import { useTaskStore, useTasks } from './store/taskStore'
import { useAgents, useAgentStore } from './store/agentStore'
import { setApiBase, getSkills } from './api'
import { useFontSize, useUiScale } from './store/settingsStore'
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
        <div className="flex items-center justify-center h-full bg-mesh-bg">
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

function IconGrid() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function IconPerson() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 12c0-2.2 2.2-4 5-4s5 1.8 5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IconList() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 14 14" fill="none">
      <path d="M1 3h12M1 7h8M1 11h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IconStar() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 14 14" fill="none">
      <polygon
        points="7,1 9,5 13,5.5 10,8.5 10.5,13 7,11 3.5,13 4,8.5 1,5.5 5,5"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
      />
    </svg>
  )
}

function IconGear() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.6 2.6l1.1 1.1M10.3 10.3l1.1 1.1M2.6 11.4l1.1-1.1M10.3 3.7l1.1-1.1"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  )
}

type NavIcon = () => React.JSX.Element

const NAV_STRUCTURE: {
  label: string
  items: { path: string; label: string; end: boolean; Icon: NavIcon; badgeKey: string | null }[]
}[] = [
  {
    label: 'Core',
    items: [
      { path: '/',        label: 'Dashboard', end: true,  Icon: IconGrid,   badgeKey: null },
      { path: '/agents',  label: 'Agents',    end: false, Icon: IconPerson, badgeKey: 'agents' },
      { path: '/tasks',   label: 'Tasks',     end: false, Icon: IconList,   badgeKey: 'tasks' },
    ],
  },
  {
    label: 'Config',
    items: [
      { path: '/skills',   label: 'Skills',   end: false, Icon: IconStar, badgeKey: 'skills' },
      { path: '/settings', label: 'Settings', end: false, Icon: IconGear, badgeKey: null },
    ],
  },
]

const MeshBackground = memo(function MeshBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <svg
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="accentGlow" cx="70%" cy="25%">
            <stop offset="0%" stopColor="#12a3e3" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#12a3e3" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1200" height="800" fill="url(#accentGlow)" />
        <g stroke="#12a3e3" strokeOpacity="0.04" strokeWidth="0.5">
          {[60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720, 780].map((y) => (
            <line key={`h${y}`} x1="0" y1={y} x2="1200" y2={y} />
          ))}
          {[60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080, 1140].map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="800" />
          ))}
        </g>
        <g fill="#12a3e3" opacity="0.10">
          <circle cx="300" cy="120" r="2" />
          <circle cx="600" cy="60" r="1.5" />
          <circle cx="840" cy="180" r="2" />
          <circle cx="480" cy="300" r="1.5" />
          <circle cx="960" cy="120" r="2" />
          <circle cx="720" cy="360" r="1.5" />
          <circle cx="180" cy="240" r="2" />
          <circle cx="1080" cy="300" r="1.5" />
        </g>
        <g stroke="#12a3e3" strokeOpacity="0.06" strokeWidth="0.5">
          <line x1="300" y1="120" x2="480" y2="300" />
          <line x1="600" y1="60" x2="840" y2="180" />
          <line x1="840" y1="180" x2="960" y2="120" />
          <line x1="480" y1="300" x2="720" y2="360" />
          <line x1="180" y1="240" x2="300" y2="120" />
        </g>
      </svg>
    </div>
  )
})

export default function App() {
  const wsStatus = useWsStatus()
  const setWsStatus = useSetWsStatus()
  const setServerPort = useSetServerPort()
  const serverPort = useServerPort()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelay = useRef(500)

  const agents = useAgents()
  const tasks = useTasks()
  const fetchAgents = useAgentStore((s) => s.fetch)
  const fetchTasks = useTaskStore((s) => s.fetch)
  const [skillCount, setSkillCount] = useState(0)

  const fontSize = useFontSize()
  const uiScale = useUiScale()

  useEffect(() => {
    const map: Record<string, string> = { sm: '12px', md: '13px', lg: '14px' }
    document.documentElement.style.fontSize = map[fontSize]
  }, [fontSize])

  useEffect(() => {
    document.documentElement.style.zoom = `${uiScale}%`
  }, [uiScale])

  useEffect(() => {
    fetchAgents()
    fetchTasks()
    getSkills().then((s) => setSkillCount(s.length)).catch(() => {})
  }, [fetchAgents, fetchTasks])

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

  const badges: Record<string, number> = {
    agents: agents.length,
    tasks: tasks.length,
    skills: skillCount,
  }

  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <MeshBackground />
      <div className="flex flex-col h-screen overflow-hidden text-neutral-100" style={{ position: 'relative', zIndex: 1 }}>
        {/* Title bar */}
        <div className="drag-region shrink-0 h-10 flex items-center px-4 bg-mesh-bg2 border-b border-teal/[0.12]">
          <div className="no-drag flex items-center gap-2 select-none">
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 512 512" fill="none">
              <ellipse cx="256" cy="256" rx="188" ry="68" stroke="#00aaff" strokeWidth="4" strokeOpacity="0.4"/>
              <ellipse cx="256" cy="256" rx="68" ry="188" stroke="#00aaff" strokeWidth="4" strokeOpacity="0.3"/>
              <ellipse cx="256" cy="256" rx="138" ry="138" stroke="#00aaff" strokeWidth="2.5" strokeOpacity="0.2" strokeDasharray="10 12"/>
              <circle cx="256" cy="256" r="52" stroke="#00aaff" strokeWidth="3" strokeOpacity="0.3"/>
              <circle cx="256" cy="256" r="36" fill="#0d1b3e"/>
              <circle cx="256" cy="256" r="36" fill="#00aaff" fillOpacity="0.12"/>
              <circle cx="256" cy="256" r="36" stroke="#00aaff" strokeWidth="4" strokeOpacity="0.7"/>
              <circle cx="256" cy="256" r="16" fill="#00aaff" fillOpacity="0.85"/>
              <circle cx="256" cy="256" r="7" fill="#e0f4ff" fillOpacity="0.9"/>
              <circle cx="444" cy="256" r="24" fill="#0d1b3e"/>
              <circle cx="444" cy="256" r="24" fill="#00aaff" fillOpacity="0.15"/>
              <circle cx="444" cy="256" r="24" stroke="#00aaff" strokeWidth="4" strokeOpacity="0.8"/>
              <circle cx="444" cy="256" r="10" fill="#00aaff" fillOpacity="0.9"/>
              <circle cx="256" cy="68" r="18" fill="#0d1b3e"/>
              <circle cx="256" cy="68" r="18" fill="#00aaff" fillOpacity="0.12"/>
              <circle cx="256" cy="68" r="18" stroke="#00aaff" strokeWidth="3.5" strokeOpacity="0.65"/>
              <circle cx="256" cy="68" r="7" fill="#00aaff" fillOpacity="0.75"/>
              <circle cx="104" cy="356" r="14" fill="#0d1b3e"/>
              <circle cx="104" cy="356" r="14" stroke="#00aaff" strokeWidth="3" strokeOpacity="0.5"/>
              <circle cx="104" cy="356" r="5.5" fill="#00aaff" fillOpacity="0.55"/>
              <circle cx="380" cy="120" r="11" fill="#0d1b3e"/>
              <circle cx="380" cy="120" r="11" stroke="#00aaff" strokeWidth="2.5" strokeOpacity="0.45"/>
              <circle cx="380" cy="120" r="4.5" fill="#00aaff" fillOpacity="0.45"/>
              <circle cx="68" cy="256" r="16" fill="#0d1b3e"/>
              <circle cx="68" cy="256" r="16" stroke="#00aaff" strokeWidth="3" strokeOpacity="0.45"/>
              <circle cx="68" cy="256" r="6" fill="#00aaff" fillOpacity="0.4"/>
              <line x1="292" y1="256" x2="420" y2="256" stroke="#00aaff" strokeWidth="2.5" strokeOpacity="0.4"/>
              <line x1="256" y1="220" x2="256" y2="86" stroke="#00aaff" strokeWidth="2.5" strokeOpacity="0.35"/>
              <line x1="231" y1="280" x2="117" y2="344" stroke="#00aaff" strokeWidth="2" strokeOpacity="0.3"/>
              <line x1="278" y1="232" x2="371" y2="128" stroke="#00aaff" strokeWidth="2" strokeOpacity="0.28"/>
              <line x1="220" y1="256" x2="84" y2="256" stroke="#00aaff" strokeWidth="2" strokeOpacity="0.28"/>
            </svg>
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-teal">
              AgentMesh
            </span>
          </div>
          <div className="no-drag ml-auto flex items-center">
            <button
              onClick={() => window.agentmesh.winMinimize()}
              className="h-10 w-11 flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.06] transition-colors"
              title="Minimize"
            >
              <svg viewBox="0 0 10 1" width="10" height="1" fill="currentColor">
                <rect width="10" height="1" />
              </svg>
            </button>
            <button
              onClick={() => window.agentmesh.winMaximize()}
              className="h-10 w-11 flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.06] transition-colors"
              title="Maximize"
            >
              <svg viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="0.5" y="0.5" width="9" height="9" />
              </svg>
            </button>
            <button
              onClick={() => window.agentmesh.winClose()}
              className="h-10 w-11 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-red-600 transition-colors"
              title="Close"
            >
              <svg viewBox="0 0 10 10" width="10" height="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                <line x1="1" y1="1" x2="9" y2="9" />
                <line x1="9" y1="1" x2="1" y2="9" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-52 shrink-0 flex flex-col bg-mesh-bg2 border-r border-teal/[0.1]">
            <nav className="flex-1 py-2 overflow-y-auto">
              {NAV_STRUCTURE.map((section) => (
                <div key={section.label}>
                  <div className="nav-section-label">{section.label}</div>
                  {section.items.map(({ path, label, end, Icon, badgeKey }) => {
                    const badge = badgeKey ? badges[badgeKey] : null
                    return (
                      <NavLink
                        key={path}
                        to={path}
                        end={end}
                        className={({ isActive }) =>
                          [
                            'relative flex items-center gap-2.5 px-4 py-[9px] text-xs font-medium transition-all',
                            isActive
                              ? 'text-teal bg-teal/[0.08]'
                              : 'text-neutral-500 hover:text-neutral-200 hover:bg-teal/[0.04]',
                          ].join(' ')
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span
                              className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r transition-opacity ${
                                isActive ? 'bg-teal opacity-100' : 'opacity-0'
                              }`}
                            />
                            <span className={isActive ? 'opacity-90' : 'opacity-50'}>
                              <Icon />
                            </span>
                            <span className="flex-1">{label}</span>
                            {badge != null && badge > 0 && (
                              <span className="nav-badge">{badge}</span>
                            )}
                          </>
                        )}
                      </NavLink>
                    )
                  })}
                </div>
              ))}
            </nav>

            <div className="px-4 py-3 border-t border-teal/[0.08] shrink-0">
              <div className="flex items-center gap-2">
                <div
                  className={[
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    wsStatus === 'connected'
                      ? 'bg-teal animate-pulse'
                      : wsStatus === 'connecting'
                        ? 'bg-yellow-400 animate-pulse'
                        : 'bg-neutral-600',
                  ].join(' ')}
                />
                <span className="font-mono text-[9px] text-neutral-600 truncate">
                  ws://localhost:{serverPort}
                </span>
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1 overflow-auto bg-mesh-bg">
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
    </HashRouter>
  )
}
