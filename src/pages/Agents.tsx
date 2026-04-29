import { useEffect, useRef, useState } from 'react'
import { useAgents, useAgentStore, useAgentLoading } from '../store/agentStore'
import * as wsClient from '../wsClient'
import type { Agent, AgentType } from '../../shared/types'

const AGENT_TYPES: AgentType[] = [
  'ollama', 'groq', 'huggingface', 'together', 'openrouter', 'local_script', 'local_docker',
]

export default function Agents() {
  const agents = useAgents()
  const loading = useAgentLoading()
  const { fetch, remove } = useAgentStore()
  const [showModal, setShowModal] = useState(false)
  const [promptTarget, setPromptTarget] = useState<Agent | null>(null)

  useEffect(() => { fetch() }, [fetch])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold text-neutral-100 mb-1">Agents</h1>
          <p className="text-sm text-neutral-500">Register and manage agent backends</p>
        </div>
        <button
          className="no-drag px-4 py-2 bg-teal text-white text-sm rounded hover:bg-teal/90 transition-colors font-medium"
          onClick={() => setShowModal(true)}
        >
          + Add Agent
        </button>
      </div>

      <div className="rounded-xl border border-teal/[0.08] bg-mesh-bg3">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-teal/[0.06]">
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Last seen</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {loading && agents.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-neutral-500 py-12 text-sm">
                  Loading…
                </td>
              </tr>
            ) : agents.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-neutral-500 py-12 text-sm">
                  No agents registered yet
                </td>
              </tr>
            ) : (
              agents.map((agent) => (
                <tr key={agent.id} className="border-b border-teal/[0.06] last:border-0">
                  <td className="px-4 py-3 text-neutral-200 font-medium">{agent.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-400">{agent.type}</td>
                  <td className="px-4 py-3">
                    <span className={`badge-${agent.status}`}>{agent.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {agent.last_seen
                      ? new Date(agent.last_seen).toLocaleTimeString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        className="text-xs text-neutral-500 hover:text-teal transition-colors"
                        onClick={() => setPromptTarget(agent)}
                      >
                        Prompt
                      </button>
                      <button
                        className="text-xs text-neutral-500 hover:text-red-400 transition-colors"
                        onClick={() => remove(agent.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && <AddAgentModal onClose={() => setShowModal(false)} />}
      {promptTarget && <DirectPromptModal agent={promptTarget} onClose={() => setPromptTarget(null)} />}
    </div>
  )
}

function DirectPromptModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [input, setInput] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const [error, setError] = useState('')
  const outputRef = useRef<HTMLPreElement>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => () => { unsubRef.current?.() }, [])

  const run = () => {
    if (!input.trim() || status === 'running') return
    if (!wsClient.isOpen()) { setError('WebSocket not connected'); return }

    const id = crypto.randomUUID()
    setOutput('')
    setError('')
    setStatus('running')
    let accumulated = ''

    unsubRef.current = wsClient.subscribe(id, (msg) => {
      if (msg.error) {
        setError((msg.error as { message: string }).message)
        setStatus('failed')
        unsubRef.current?.()
        return
      }
      const result = msg.result as Record<string, unknown> | undefined
      if (result?.chunk) {
        accumulated += result.chunk as string
        setOutput(accumulated)
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
      }
      if (result?.done) {
        if (result.output) { accumulated = result.output as string; setOutput(accumulated) }
        setStatus('done')
        unsubRef.current?.()
      }
    })

    wsClient.send({
      id,
      method: 'run_task',
      params: {
        agent_id: agent.id,
        input: input.trim(),
        ...(systemPrompt.trim() ? { system_prompt: systemPrompt.trim() } : {}),
      },
    })
  }

  const statusColor = {
    idle: '', running: 'text-blue-400', done: 'text-teal', failed: 'text-red-400',
  }[status]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-mesh-bg3 border border-teal/[0.1] rounded-xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-teal/[0.08] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Prompt — {agent.name}</h2>
            <span className="font-mono text-xs text-neutral-600">{agent.type}</span>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 text-lg leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs text-neutral-400 mb-1.5">Prompt</label>
            <textarea
              className="input resize-none h-28 font-mono text-xs"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What would you like this agent to do?"
              disabled={status === 'running'}
              autoFocus
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              {showAdvanced ? '▾' : '▸'} Advanced (system prompt)
            </button>
            {showAdvanced && (
              <div className="mt-2">
                <textarea
                  className="input resize-none h-20 font-mono text-xs mt-1.5"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="You are a helpful assistant. (leave blank for default)"
                  disabled={status === 'running'}
                />
              </div>
            )}
          </div>

          {(output || status === 'running') && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs text-neutral-400">Output</span>
                {status !== 'idle' && <span className={`text-xs font-mono ${statusColor}`}>{status}</span>}
              </div>
              <pre
                ref={outputRef}
                className="bg-mesh-bg border border-teal/[0.08] rounded p-3 text-xs text-neutral-300 font-mono whitespace-pre-wrap overflow-y-auto max-h-48"
              >
                {output || (status === 'running' ? '…' : '')}
              </pre>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-teal/[0.08] flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors">
            Close
          </button>
          <button
            onClick={run}
            disabled={status === 'running' || !input.trim()}
            className="px-4 py-2 bg-teal text-white text-sm rounded hover:bg-teal/90 disabled:opacity-50 transition-colors font-medium"
          >
            {status === 'running' ? 'Running…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

const MODEL_PLACEHOLDERS: Partial<Record<AgentType, string>> = {
  ollama: 'llama3',
  groq: 'llama-3.1-8b-instant',
  huggingface: 'mistralai/Mistral-7B-Instruct-v0.2',
  together: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  openrouter: 'meta-llama/llama-3.1-8b-instruct:free',
}

function AddAgentModal({ onClose }: { onClose: () => void }) {
  const { add } = useAgentStore()
  const [name, setName] = useState('')
  const [type, setType] = useState<AgentType>('ollama')
  const [endpoint, setEndpoint] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [script, setScript] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isOllama = type === 'ollama'
  const isApiKey = type === 'groq' || type === 'huggingface' || type === 'together' || type === 'openrouter'
  const isLocal = type === 'local_script' || type === 'local_docker'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (isLocal && !script.trim()) { setError('Script path is required'); return }
    setSaving(true)
    setError('')
    try {
      const config: Record<string, unknown> = {}
      if (model.trim()) config.model = model.trim()
      if (apiKey.trim()) config.api_key = apiKey.trim()
      if (script.trim()) config.script = script.trim()
      await add({
        name: name.trim(),
        type,
        endpoint: endpoint.trim() || undefined,
        skills: [],
        config,
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-mesh-bg3 border border-teal/[0.1] rounded-xl w-[480px] shadow-2xl">
        <div className="px-6 py-4 border-b border-teal/[0.08] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">Add Agent</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 text-lg leading-none">×</button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <Field label="Name *">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Ollama Agent"
              autoFocus
            />
          </Field>

          <Field label="Type *">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as AgentType)}>
              {AGENT_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </Field>

          {isOllama && (
            <Field label="Endpoint URL">
              <input
                className="input font-mono text-xs"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </Field>
          )}

          {(isOllama || isApiKey) && (
            <Field label="Model">
              <input
                className="input font-mono text-xs"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={MODEL_PLACEHOLDERS[type] ?? ''}
              />
            </Field>
          )}

          {isApiKey && (
            <Field label="API Key *">
              <input
                className="input font-mono text-xs"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
              />
            </Field>
          )}

          {isLocal && (
            <Field label="Script path *">
              <input
                className="input font-mono text-xs"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="/path/to/agent.sh"
              />
            </Field>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-teal text-white text-sm rounded hover:bg-teal/90 disabled:opacity-50 transition-colors font-medium"
            >
              {saving ? 'Saving…' : 'Add Agent'}
            </button>
          </div>
        </form>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-neutral-400 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
