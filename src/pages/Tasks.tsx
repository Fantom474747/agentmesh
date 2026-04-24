import { useEffect, useState } from 'react'
import { useTasks, useTaskStore } from '../store/taskStore'
import type { Task } from '../../shared/types'

export default function Tasks() {
  const tasks = useTasks()
  const fetch = useTaskStore((s) => s.fetch)
  const loading = useTaskStore((s) => s.loading)
  const startPolling = useTaskStore((s) => s.startPolling)
  const [selected, setSelected] = useState<Task | null>(null)

  useEffect(() => {
    fetch()
    return startPolling()
  }, [fetch, startPolling])

  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold text-neutral-100 mb-1">Tasks</h1>
      <p className="text-sm text-neutral-500 mb-8">Task history and execution logs</p>

      <div className="rounded border border-neutral-800 bg-neutral-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800">
              <Th>ID</Th>
              <Th>Skill</Th>
              <Th>Agent</Th>
              <Th>Status</Th>
              <Th>Duration</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {loading && tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-neutral-500 py-12 text-sm">Loading…</td>
              </tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-neutral-500 py-12 text-sm">No tasks yet</td>
              </tr>
            ) : (
              tasks.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-neutral-800 last:border-0 cursor-pointer hover:bg-neutral-800/40 transition-colors"
                  onClick={() => setSelected(t)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-neutral-500">{t.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-neutral-300">{t.skill}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                    {t.agent_id ? t.agent_id.slice(0, 8) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge-${t.status}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {t.completed_at
                      ? `${((t.completed_at - t.created_at) / 1000).toFixed(1)}s`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {new Date(t.created_at).toLocaleTimeString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && <TaskOutputModal task={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function TaskOutputModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const hasOutput = Boolean(task.result || task.error)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-[640px] max-h-[80vh] flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-neutral-100">{task.skill}</span>
            <span className="font-mono text-xs text-neutral-600">{task.id.slice(0, 8)}</span>
            <span className={`badge-${task.status}`}>{task.status}</span>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 text-lg leading-none">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
          <div>
            <p className="text-xs text-neutral-500 mb-1.5">Input</p>
            <pre className="bg-neutral-950 border border-neutral-800 rounded p-3 text-xs text-neutral-400 font-mono whitespace-pre-wrap">
              {task.input}
            </pre>
          </div>

          {task.result && (
            <div>
              <p className="text-xs text-neutral-500 mb-1.5">Output</p>
              <pre className="bg-neutral-950 border border-neutral-800 rounded p-3 text-xs text-neutral-300 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                {task.result}
              </pre>
            </div>
          )}

          {task.error && (
            <div>
              <p className="text-xs text-red-500 mb-1.5">Error</p>
              <pre className="bg-red-950/20 border border-red-900/40 rounded p-3 text-xs text-red-400 font-mono whitespace-pre-wrap">
                {task.error}
              </pre>
            </div>
          )}

          {!hasOutput && (
            <p className="text-sm text-neutral-500 text-center py-4">
              {task.status === 'pending' || task.status === 'running'
                ? 'Task is still running…'
                : 'No output recorded.'}
            </p>
          )}

          <div className="text-xs text-neutral-600 pt-2 border-t border-neutral-800 flex gap-6">
            <span>Created: {new Date(task.created_at).toLocaleString()}</span>
            {task.completed_at && (
              <span>Completed: {new Date(task.completed_at).toLocaleString()}</span>
            )}
            {task.completed_at && (
              <span>Duration: {((task.completed_at - task.created_at) / 1000).toFixed(1)}s</span>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-neutral-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
      {children}
    </th>
  )
}
