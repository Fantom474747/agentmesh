import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAgents, useAgentStore } from '../store/agentStore'
import { useTaskStore, useTasks } from '../store/taskStore'
import { getSkills } from '../api'
import type { SkillManifest } from '../../shared/types'

const CIRCUMFERENCE = 2 * Math.PI * 18 // 113.097

const MCP_TOOLS = [
  'agentmesh_run_task',
  'agentmesh_run_prompt',
  'agentmesh_list_skills',
  'agentmesh_list_agents',
]

export default function Dashboard() {
  const agents = useAgents()
  const tasks = useTasks()
  const fetchAgents = useAgentStore((s) => s.fetch)
  const fetchTasks = useTaskStore((s) => s.fetch)
  const [skills, setSkills] = useState<SkillManifest[]>([])
  const [clock, setClock] = useState('')

  useEffect(() => {
    fetchAgents()
    fetchTasks()
    getSkills()
      .then((s: SkillManifest[]) => setSkills(s))
      .catch(() => {})
  }, [fetchAgents, fetchTasks])

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString('en-US', {
          hour12: true,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      )
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Ring chart
  const online = agents.filter((a) => a.status === 'online').length
  const total = agents.length
  const pct = total > 0 ? online / total : 0
  const dashoffset = CIRCUMFERENCE * (1 - pct)

  // Sparkline: last 7 days bucketed by day index (0 = oldest, 6 = today)
  const dayBuckets = useMemo(() => {
    const now = Date.now()
    const buckets = Array(7).fill(0)
    tasks.forEach((t) => {
      const daysAgo = Math.floor((now - t.created_at) / 86_400_000)
      if (daysAgo >= 0 && daysAgo < 7) buckets[6 - daysAgo]++
    })
    return buckets
  }, [tasks])

  const maxBucket = Math.max(...dayBuckets, 1)
  const last7Total = dayBuckets.reduce((s, v) => s + v, 0)
  const avg = (last7Total / 7).toFixed(1)
  const todayCount = dayBuckets[6]

  const recent = tasks.slice(0, 5)
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <div className="px-6 py-4 border-b border-teal/[0.08] flex items-end justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-neutral-100 tracking-tight leading-none">Dashboard</h1>
          <p className="font-mono text-[10px] text-neutral-600 uppercase tracking-[0.07em] mt-1">
            Agent health &amp; task activity
          </p>
        </div>
        <div className="font-mono text-[10px] text-neutral-500 px-2.5 py-1.5 bg-mesh-bg3 border border-teal/[0.1] rounded">
          {clock}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-3 gap-3">

          {/* Card 1: Online Agents — ring chart */}
          <Link to="/agents" className="bg-mesh-bg3 border border-teal/[0.1] rounded-xl p-4 relative overflow-hidden block hover:border-teal/30 transition-colors">
            <div className="absolute -top-8 -right-6 w-24 h-24 rounded-full bg-teal/[0.06] blur-2xl pointer-events-none" />
            <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-neutral-600 mb-3">
              Online Agents
            </div>
            <div className="flex items-center gap-3">
              {/* Donut */}
              <div className="relative w-12 h-12 flex-shrink-0">
                <svg viewBox="0 0 48 48" fill="none" className="w-full h-full">
                  <circle cx="24" cy="24" r="18" stroke="rgba(18,163,227,0.1)" strokeWidth="5" />
                  <circle
                    cx="24" cy="24" r="18"
                    stroke="#12a3e3"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE.toFixed(2)}
                    strokeDashoffset={dashoffset.toFixed(2)}
                    transform="rotate(-90 24 24)"
                    style={{ transition: 'stroke-dashoffset 0.7s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-mono text-[9px] font-bold text-teal">
                  {total > 0 ? `${Math.round(pct * 100)}%` : '--'}
                </div>
              </div>
              <div>
                <div className="text-[22px] font-bold tracking-tight text-neutral-100 leading-none">
                  {online}
                  <span className="text-xs font-normal text-neutral-500 ml-1">/ {total}</span>
                </div>
                <div className="font-mono text-[9px] uppercase tracking-[0.07em] text-neutral-600 mt-1.5">
                  {total === 0
                    ? 'No agents'
                    : online === total
                      ? 'All nodes online'
                      : `${total - online} offline`}
                </div>
              </div>
            </div>
            {agents.length > 0 && (
              <div className="mt-3 font-mono text-[9px] text-teal/80 truncate">
                {agents.map((a) => a.name).join(' · ')}
              </div>
            )}
          </Link>

          {/* Card 2: Tasks Today — sparkline */}
          <Link to="/tasks" className="bg-mesh-bg3 border border-teal/[0.1] rounded-xl p-4 relative overflow-hidden block hover:border-teal/30 transition-colors">
            <div className="absolute -top-8 -right-6 w-24 h-24 rounded-full bg-teal/[0.06] blur-2xl pointer-events-none" />
            <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-neutral-600 mb-2">
              Tasks Today
            </div>
            <div className="text-[28px] font-bold tracking-tight text-neutral-100 leading-none">
              {todayCount}
              <span className="text-sm font-normal text-neutral-500 ml-2">completed</span>
            </div>
            {/* Sparkline */}
            <div className="flex items-end gap-0.5 h-8 mt-3">
              {dayBuckets.map((count, i) => {
                const isToday = i === 6
                const heightPct = Math.max((count / maxBucket) * 100, 6)
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-t-[2px] transition-all ${
                      isToday
                        ? 'bg-teal/40 border-t border-teal'
                        : 'bg-teal/[0.07] border-t border-teal/[0.15]'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                )
              })}
            </div>
            <div className="mt-1.5 font-mono text-[9px] text-teal/80">
              7-day trend · avg {avg}/day
            </div>
          </Link>

          {/* Card 3: Skills — chips */}
          <Link to="/skills" className="bg-mesh-bg3 border border-teal/[0.1] rounded-xl p-4 relative overflow-hidden block hover:border-teal/30 transition-colors">
            <div className="absolute -top-8 -right-6 w-24 h-24 rounded-full bg-teal/[0.06] blur-2xl pointer-events-none" />
            <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-neutral-600 mb-2">
              Skills Loaded
            </div>
            <div className="text-[28px] font-bold tracking-tight text-neutral-100 leading-none">
              {skills.length}
            </div>
            <div className="flex flex-wrap gap-1 mt-3">
              {skills.slice(0, 6).map((sk, i) => (
                <span
                  key={sk.id}
                  className={`font-mono text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-[0.04em] ${
                    i < 4
                      ? 'bg-teal/[0.07] border-teal/[0.2] text-teal'
                      : 'bg-mesh-bg border-teal/[0.08] text-neutral-600'
                  }`}
                >
                  {sk.name}
                </span>
              ))}
            </div>
          </Link>
        </div>

        {/* ── Bottom grid ── */}
        <div className="grid grid-cols-2 gap-3">

          {/* Recent tasks */}
          <div className="bg-mesh-bg3 border border-teal/[0.1] rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-teal/[0.06] flex items-center justify-between shrink-0">
              <span className="font-mono text-[10px] uppercase tracking-[0.07em] text-neutral-500 font-bold">
                Recent Tasks
              </span>
              <Link to="/tasks" className="font-mono text-[9px] text-teal/60 hover:text-teal transition-colors">
                View all →
              </Link>
            </div>

            {recent.length === 0 ? (
              <p className="text-xs text-neutral-600 text-center py-10">
                No tasks yet — run one from the Agents page.
              </p>
            ) : (
              <div className="divide-y divide-teal/[0.05]">
                {recent.map((t) => {
                  const agent = t.agent_id ? agentMap.get(t.agent_id) : undefined
                  const initials = agent ? agent.name.slice(0, 2).toUpperCase() : '??'
                  return (
                    <div
                      key={t.id}
                      className="flex items-center px-4 py-2.5 gap-2.5 hover:bg-teal/[0.03] transition-colors cursor-default"
                    >
                      <span className="font-mono text-[9px] text-neutral-600 w-[52px] flex-shrink-0">
                        {t.id.slice(0, 8)}
                      </span>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 font-mono text-[8px] font-bold bg-teal/10 text-teal border border-teal/25">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-neutral-200 truncate">{t.skill}</div>
                        {agent && (
                          <div className="font-mono text-[8px] text-neutral-600 mt-0.5">
                            {agent.name} · {agent.type}
                          </div>
                        )}
                      </div>
                      <span className={`badge-${t.status} flex-shrink-0`}>{t.status}</span>
                      <span className="font-mono text-[9px] text-neutral-600 w-[48px] text-right flex-shrink-0">
                        {new Date(t.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Active agents */}
          <div className="bg-mesh-bg3 border border-teal/[0.1] rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-teal/[0.06] flex items-center justify-between shrink-0">
              <span className="font-mono text-[10px] uppercase tracking-[0.07em] text-neutral-500 font-bold">
                Active Agents
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] text-teal bg-teal/[0.07] border border-teal/[0.2] px-1.5 py-0.5 rounded">
                  {online} / {total} online
                </span>
                <Link to="/agents" className="font-mono text-[9px] text-teal/60 hover:text-teal transition-colors">
                  View all →
                </Link>
              </div>
            </div>

            <div className="flex-1 divide-y divide-teal/[0.05]">
              {agents.length === 0 ? (
                <p className="text-xs text-neutral-600 text-center py-8">No agents registered</p>
              ) : (
                agents.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center px-4 py-2.5 gap-2.5 hover:bg-teal/[0.03] transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 font-mono text-[9px] font-bold bg-teal/[0.08] text-teal border border-teal/20">
                      {a.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-neutral-200">{a.name}</div>
                      <div className="font-mono text-[9px] text-neutral-600 mt-0.5 uppercase tracking-[0.04em]">
                        {a.type}
                      </div>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 font-mono text-[9px] ${
                        a.status === 'online' ? 'text-teal' : 'text-neutral-600'
                      }`}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          a.status === 'online' ? 'bg-teal' : 'bg-neutral-700'
                        }`}
                      />
                      {a.status}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* MCP Tools */}
            <div className="px-4 py-3 border-t border-teal/[0.06] shrink-0">
              <div className="font-mono text-[9px] uppercase tracking-[0.07em] text-neutral-600 font-bold mb-2">
                MCP Tools
              </div>
              <div className="flex flex-col gap-1">
                {MCP_TOOLS.map((tool, i) => (
                  <div key={tool} className="flex items-center gap-2">
                    <div
                      className={`w-1 h-1 rounded-full flex-shrink-0 ${
                        i < 3 ? 'bg-teal' : 'bg-teal/30'
                      }`}
                    />
                    <span className="font-mono text-[9px] text-neutral-600">{tool}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
