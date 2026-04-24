import { useEffect, useState } from 'react'
import { useAgents, useAgentStore } from '../store/agentStore'
import { useTaskStore, useTasks } from '../store/taskStore'
import { getSkills } from '../api'
import type { SkillManifest } from '../../shared/types'

export default function Dashboard() {
  const agents = useAgents()
  const tasks = useTasks()
  const fetchAgents = useAgentStore((s) => s.fetch)
  const fetchTasks = useTaskStore((s) => s.fetch)
  const [skillCount, setSkillCount] = useState(0)

  useEffect(() => {
    fetchAgents()
    fetchTasks()
    getSkills()
      .then((skills: SkillManifest[]) => setSkillCount(skills.length))
      .catch(() => {})
  }, [fetchAgents, fetchTasks])

  const online = agents.filter((a) => a.status === 'online').length
  const todayMs = Date.now() - 86_400_000
  const todayTasks = tasks.filter((t) => t.created_at > todayMs).length
  const recent = tasks.slice(0, 5)

  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold text-neutral-100 mb-1">Dashboard</h1>
      <p className="text-sm text-neutral-500 mb-8">Agent health and task activity</p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Online agents" value={`${online} / ${agents.length}`} />
        <StatCard label="Tasks today" value={String(todayTasks)} />
        <StatCard label="Skills loaded" value={String(skillCount)} />
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-900">
        <div className="px-4 py-3 border-b border-neutral-800">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
            Recent tasks
          </span>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-10">
            No tasks yet — tasks will appear here after agents run.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {recent.map((t) => (
                <tr key={t.id} className="border-b border-neutral-800 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-neutral-500 w-20">
                    {t.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-neutral-300">{t.skill}</td>
                  <td className="px-4 py-3">
                    <span className={`badge-${t.status}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {new Date(t.created_at).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 px-5 py-4">
      <div className="font-mono text-2xl font-semibold text-neutral-100">{value}</div>
      <div className="mt-1 text-xs text-neutral-500">{label}</div>
    </div>
  )
}
