import { useCallback, useEffect, useRef, useState } from 'react'
import { useAgents } from '../store/agentStore'
import * as api from '../api'
import * as wsClient from '../wsClient'
import type { AgentType, SkillManifest } from '../../shared/types'

const ALL_RUNNER_TYPES: AgentType[] = [
  'ollama', 'groq', 'huggingface', 'together', 'openrouter', 'local_script', 'local_docker',
]

const BLANK_SKILL: SkillManifest = {
  id: '',
  name: '',
  description: '',
  system_prompt: '',
  compatible_runners: [],
  input_schema: { type: 'object', properties: {} },
  output_schema: { type: 'object', properties: {} },
  model: '',
  allow_all_runners: false,
  temperature: undefined,
  max_tokens: undefined,
  timeout_ms: undefined,
  retry: undefined,
}

function skillMdTemplate(id: string): string {
  return `---
name: ${id || 'My Skill'}
description: What this skill does
compatible_runners:
  - ollama
  - groq
# allow_all_runners: true   # uncomment to route to any online agent regardless of type
# model: qwen2.5-coder      # optional — overrides the agent's default model
# tools:
#   - list_dir
#   - read_file
#   - search_files
#   - get_file_info
---

You are a helpful assistant that...
`
}

export default function Skills() {
  const [skills, setSkills] = useState<SkillManifest[]>([])
  const [loading, setLoading] = useState(true)
  const [runTarget, setRunTarget] = useState<SkillManifest | null>(null)
  const [editTarget, setEditTarget] = useState<SkillManifest | 'new' | null>(null)
  const [tagFilter, setTagFilter] = useState('')

  const refetch = useCallback(() => {
    setLoading(true)
    api.getSkills()
      .then(setSkills)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refetch() }, [refetch])

  const handleDelete = async (skill: SkillManifest) => {
    if (!confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) return
    try {
      await window.agentmesh.skillDelete(skill.id)
      refetch()
    } catch (err) {
      alert(`Failed to delete: ${(err as Error).message}`)
    }
  }

  // All unique tags across all visible skills
  const allTags = Array.from(new Set(skills.flatMap((s) => s.tags ?? []))).sort()

  // Visible = not hidden, optionally filtered by tag
  const visible = skills.filter((s) => {
    if (s.hidden) return false
    if (tagFilter && !(s.tags ?? []).includes(tagFilter)) return false
    return true
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-neutral-100 mb-1">Skills</h1>
          <p className="text-sm text-neutral-500">Installed skill manifests</p>
        </div>
        <button
          className="no-drag px-4 py-2 bg-teal text-white text-sm rounded hover:bg-teal/90 transition-colors font-medium"
          onClick={() => setEditTarget('new')}
        >
          + New Skill
        </button>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setTagFilter('')}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              !tagFilter ? 'bg-teal/20 border-teal/50 text-teal' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'
            }`}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                tagFilter === tag ? 'bg-teal/20 border-teal/50 text-teal' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-6">
          <p className="text-sm text-neutral-500 text-center py-8">
            {tagFilter ? `No skills tagged "${tagFilter}".` : (
              <>No skill manifests loaded. Skills are auto-loaded from{' '}
              <span className="font-mono text-neutral-400">skills/*/manifest.yaml</span> or{' '}
              <span className="font-mono text-neutral-400">skills/*/SKILL.md</span> at startup.</>
            )}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {visible.map((s) => (
            <SkillCard
              key={s.id}
              skill={s}
              onRun={() => setRunTarget(s)}
              onEdit={() => setEditTarget(s)}
              onDelete={() => handleDelete(s)}
            />
          ))}
        </div>
      )}

      {runTarget && (
        <RunTaskModal skill={runTarget} onClose={() => setRunTarget(null)} />
      )}
      {editTarget && (
        <SkillFormModal
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={refetch}
        />
      )}
    </div>
  )
}

// ── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source?: 'yaml' | 'markdown' }) {
  if (source === 'markdown') {
    return (
      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-violet-950 text-violet-400 border border-violet-800">
        SKILL.md
      </span>
    )
  }
  return (
    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-amber-950 text-amber-500 border border-amber-800">
      YAML
    </span>
  )
}

// ── Skill card ────────────────────────────────────────────────────────────────

function SkillCard({
  skill,
  onRun,
  onEdit,
  onDelete,
}: {
  skill: SkillManifest
  onRun: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 flex flex-col">
      <div className="p-5 flex items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {skill.icon && <span className="text-base leading-none">{skill.icon}</span>}
            <span className="font-semibold text-neutral-100">{skill.name}</span>
            <span className="font-mono text-xs text-neutral-600">{skill.id}</span>
            <SourceBadge source={skill.source} />
            {skill.version && (
              <span className="font-mono text-xs text-neutral-600">v{skill.version}</span>
            )}
            {skill.tools?.length ? (
              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-teal/10 text-teal border border-teal/30">
                {skill.tools.length} tool{skill.tools.length > 1 ? 's' : ''}
              </span>
            ) : null}
            {skill.chain?.length ? (
              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-purple-950 text-purple-400 border border-purple-800">
                chain×{skill.chain.length}
              </span>
            ) : null}
            {skill.allow_all_runners && (
              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300 border border-neutral-600">
                any runner
              </span>
            )}
          </div>

          {/* Description */}
          <p className="text-sm text-neutral-400 mb-2">{skill.description}</p>

          {/* Author */}
          {skill.author && (
            <p className="text-xs text-neutral-600 mb-2">by {skill.author}</p>
          )}

          {/* Tags */}
          {skill.tags?.length ? (
            <div className="flex flex-wrap gap-1 mb-2">
              {skill.tags.map((t) => (
                <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 border border-neutral-700">
                  {t}
                </span>
              ))}
            </div>
          ) : null}

          {/* Runner / model / exec badges */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {skill.model && (
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                {skill.model}
              </span>
            )}
            {skill.temperature !== undefined && (
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-orange-950 text-orange-400 border border-orange-800">
                t={skill.temperature}
              </span>
            )}
            {skill.max_tokens !== undefined && (
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                {skill.max_tokens} tok
              </span>
            )}
            {skill.timeout_ms !== undefined && (
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                {skill.timeout_ms / 1000}s
              </span>
            )}
            {(skill.retry ?? 0) > 0 && (
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                retry×{skill.retry}
              </span>
            )}
            {skill.fallback_skill && (
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-500 border border-neutral-700">
                ↩ {skill.fallback_skill}
              </span>
            )}
            {skill.require_online && (
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800">
                require online
              </span>
            )}
            {skill.allow_all_runners ? (
              <span className="font-mono text-xs text-neutral-500 italic">all runner types</span>
            ) : (
              skill.compatible_runners.map((r) => (
                <span key={r} className="font-mono text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                  {r}
                </span>
              ))
            )}
          </div>
        </div>
        <button
          onClick={onRun}
          className="shrink-0 px-4 py-2 bg-teal text-white text-sm rounded hover:bg-teal/90 transition-colors font-medium"
        >
          Run
        </button>
      </div>
      <div className="px-5 py-2.5 border-t border-neutral-800 flex gap-3">
        <button onClick={onEdit} className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
          Edit
        </button>
        <button onClick={onDelete} className="text-xs text-neutral-500 hover:text-red-400 transition-colors">
          Delete
        </button>
      </div>
    </div>
  )
}

// ── Skill form modal ──────────────────────────────────────────────────────────

function SkillFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: SkillManifest | 'new'
  onClose: () => void
  onSaved: () => void
}) {
  const isNew = initial === 'new'
  const existingSource = isNew ? undefined : (initial as SkillManifest).source

  const [format, setFormat] = useState<'yaml' | 'markdown'>(existingSource ?? 'yaml')
  const [form, setForm] = useState<SkillManifest>(isNew ? { ...BLANK_SKILL } : { ...initial as SkillManifest })
  const [inputSchemaStr, setInputSchemaStr] = useState(
    JSON.stringify(isNew ? BLANK_SKILL.input_schema : (initial as SkillManifest).input_schema, null, 2),
  )
  const [outputSchemaStr, setOutputSchemaStr] = useState(
    JSON.stringify(isNew ? BLANK_SKILL.output_schema : (initial as SkillManifest).output_schema, null, 2),
  )
  const [showExecControl, setShowExecControl] = useState(false)
  const [showRouting, setShowRouting] = useState(false)
  const [showComposition, setShowComposition] = useState(false)
  const [showMeta, setShowMeta] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [mdContent, setMdContent] = useState('')
  const [mdLoading, setMdLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (format !== 'markdown') return
    if (!isNew) {
      setMdLoading(true)
      window.agentmesh.skillReadRaw((initial as SkillManifest).id)
        .then(({ content }) => setMdContent(content))
        .catch(() => setMdContent(skillMdTemplate((initial as SkillManifest).id)))
        .finally(() => setMdLoading(false))
    } else {
      setMdContent(skillMdTemplate(form.id))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format])

  useEffect(() => {
    if (isNew && format === 'markdown' && mdContent.startsWith('---')) {
      setMdContent(skillMdTemplate(form.id))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id])

  const toggleRunner = (runner: AgentType) => {
    setForm((f) => ({
      ...f,
      compatible_runners: f.compatible_runners.includes(runner)
        ? f.compatible_runners.filter((r) => r !== runner)
        : [...f.compatible_runners, runner],
    }))
  }

  const submitYaml = async () => {
    if (!form.id.trim()) { setError('ID is required'); return }
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.system_prompt.trim()) { setError('System prompt is required'); return }
    if (!form.allow_all_runners && form.compatible_runners.length === 0) {
      setError('Select at least one compatible runner, or enable "Allow any runner type"')
      return
    }
    let inputSchema: Record<string, unknown>
    let outputSchema: Record<string, unknown>
    try {
      inputSchema = JSON.parse(inputSchemaStr) as Record<string, unknown>
      outputSchema = JSON.parse(outputSchemaStr) as Record<string, unknown>
    } catch {
      setError('Schema fields must be valid JSON')
      return
    }
    setSaving(true)
    try {
      await window.agentmesh.skillSave({ ...form, source: 'yaml', input_schema: inputSchema, output_schema: outputSchema })
      onSaved(); onClose()
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  const submitMarkdown = async () => {
    if (!form.id.trim()) { setError('ID is required'); return }
    if (!mdContent.trim()) { setError('Content is required'); return }
    setSaving(true)
    try {
      if (isNew) {
        const nameMatch = mdContent.match(/^name:\s*(.+)$/m)
        const extractedName = nameMatch?.[1]?.trim() ?? form.id
        await window.agentmesh.skillSave({
          id: form.id,
          name: extractedName,
          description: '',
          system_prompt: mdContent,
          compatible_runners: [],
          input_schema: {},
          output_schema: {},
          source: 'markdown',
        })
      } else {
        const skill = initial as SkillManifest
        await window.agentmesh.skillSave({
          ...skill,
          source: 'markdown',
          system_prompt: mdContent.replace(/^---[\s\S]*?---\r?\n?/, '').trim(),
        })
      }
      onSaved(); onClose()
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (format === 'markdown') await submitMarkdown()
    else await submitYaml()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-[640px] max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold text-neutral-100">
            {isNew ? 'New Skill' : `Edit — ${form.name}`}
          </h2>
          <div className="flex items-center gap-3">
            {isNew ? (
              <div className="flex items-center bg-neutral-800 rounded p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => setFormat('yaml')}
                  className={`px-3 py-1 text-xs rounded transition-colors font-mono ${
                    format === 'yaml' ? 'bg-amber-900 text-amber-400' : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  YAML
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('markdown')}
                  className={`px-3 py-1 text-xs rounded transition-colors font-mono ${
                    format === 'markdown' ? 'bg-violet-900 text-violet-400' : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  SKILL.md
                </button>
              </div>
            ) : (
              <SourceBadge source={format} />
            )}
            <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 text-lg leading-none">×</button>
          </div>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <Field label="ID *">
            <input
              className="input font-mono text-xs"
              value={form.id}
              onChange={(e) => setForm((f) => ({ ...f, id: e.target.value.toLowerCase().replace(/[\s/\\]+/g, '_') }))}
              disabled={!isNew}
              placeholder="my_skill"
              autoFocus
            />
          </Field>

          {format === 'markdown' ? (
            <Field label="SKILL.md content *">
              {mdLoading ? (
                <p className="text-xs text-neutral-500 py-4">Loading…</p>
              ) : (
                <textarea
                  className="input resize-none font-mono text-xs"
                  style={{ minHeight: '320px' }}
                  value={mdContent}
                  onChange={(e) => setMdContent(e.target.value)}
                  placeholder={skillMdTemplate('my_skill')}
                  spellCheck={false}
                />
              )}
              <p className="text-xs text-neutral-600 mt-1.5">
                YAML frontmatter between <span className="font-mono">---</span> delimiters, then the system prompt as the body.
              </p>
            </Field>
          ) : (
            <>
              <Field label="Name *">
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="My Skill"
                />
              </Field>

              <Field label="Description">
                <textarea
                  className="input resize-none h-16 text-xs"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What this skill does…"
                />
              </Field>

              <Field label="System Prompt *">
                <textarea
                  className="input resize-none h-32 font-mono text-xs"
                  value={form.system_prompt}
                  onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
                  placeholder="You are a helpful assistant that…"
                />
              </Field>

              <Field label="Model override">
                <input
                  className="input font-mono text-xs"
                  value={form.model ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value || undefined }))}
                  placeholder="e.g. qwen2.5-coder, llama3.1:70b (leave blank to use agent default)"
                />
              </Field>

              {/* ── Execution Control ─────────────────────────────────────── */}
              <Collapsible label="Execution Control" open={showExecControl} onToggle={() => setShowExecControl((v) => !v)}>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Temperature (0–2)">
                    <input
                      type="number"
                      className="input font-mono text-xs"
                      value={form.temperature ?? ''}
                      min={0} max={2} step={0.05}
                      onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      placeholder="model default"
                    />
                  </Field>
                  <Field label="Max Tokens">
                    <input
                      type="number"
                      className="input font-mono text-xs"
                      value={form.max_tokens ?? ''}
                      min={1} step={1}
                      onChange={(e) => setForm((f) => ({ ...f, max_tokens: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
                      placeholder="model default"
                    />
                  </Field>
                  <Field label="Timeout (ms)">
                    <input
                      type="number"
                      className="input font-mono text-xs"
                      value={form.timeout_ms ?? ''}
                      min={1000} step={1000}
                      onChange={(e) => setForm((f) => ({ ...f, timeout_ms: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
                      placeholder="no limit"
                    />
                  </Field>
                  <Field label="Retry (0–10)">
                    <input
                      type="number"
                      className="input font-mono text-xs"
                      value={form.retry ?? ''}
                      min={0} max={10} step={1}
                      onChange={(e) => setForm((f) => ({ ...f, retry: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
                      placeholder="0"
                    />
                  </Field>
                  <Field label="Tool Sandbox (directory)">
                    <input
                      className="input font-mono text-xs"
                      value={form.tool_sandbox ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, tool_sandbox: e.target.value || undefined }))}
                      placeholder="e.g. C:/projects/myapp"
                    />
                  </Field>
                  <Field label="Per-tool Timeout (ms)">
                    <input
                      type="number"
                      className="input font-mono text-xs"
                      value={form.tool_timeout_ms ?? ''}
                      min={100} step={500}
                      onChange={(e) => setForm((f) => ({ ...f, tool_timeout_ms: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
                      placeholder="no limit"
                    />
                  </Field>
                </div>
                <div className="mt-3 space-y-2">
                  <Field label="Context Template">
                    <input
                      className="input font-mono text-xs"
                      value={form.context_template ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, context_template: e.target.value || undefined }))}
                      placeholder="e.g. Project: MyApp\n\n{{system_prompt}}"
                    />
                    <p className="text-xs text-neutral-600 mt-1">Use {'{{system_prompt}}'} as placeholder.</p>
                  </Field>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!form.inject_date} onChange={(e) => setForm((f) => ({ ...f, inject_date: e.target.checked || undefined }))} className="accent-teal" />
                      <span className="text-xs text-neutral-300">Inject today's date</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!form.inject_cwd} onChange={(e) => setForm((f) => ({ ...f, inject_cwd: e.target.checked || undefined }))} className="accent-teal" />
                      <span className="text-xs text-neutral-300">Inject working directory</span>
                    </label>
                  </div>
                </div>
              </Collapsible>

              {/* ── Routing ───────────────────────────────────────────────── */}
              <Collapsible label="Routing" open={showRouting} onToggle={() => setShowRouting((v) => !v)}>
                <div className="mt-3 space-y-3">
                  <Field label="Preferred Agent ID">
                    <input
                      className="input font-mono text-xs"
                      value={form.preferred_agent ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, preferred_agent: e.target.value || undefined }))}
                      placeholder="Agent UUID (falls back to auto if offline)"
                    />
                  </Field>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!form.require_online} onChange={(e) => setForm((f) => ({ ...f, require_online: e.target.checked || undefined }))} className="accent-teal" />
                    <span className="text-xs text-neutral-300">Require online agent (fail immediately if none available)</span>
                  </label>
                </div>
              </Collapsible>

              {/* ── Compatible Runners ────────────────────────────────────── */}
              <Field label="Compatible Runners">
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.allow_all_runners}
                    onChange={(e) => setForm((f) => ({ ...f, allow_all_runners: e.target.checked }))}
                    className="accent-teal"
                  />
                  <span className="text-xs text-neutral-300">Allow any runner type</span>
                  <span className="text-xs text-neutral-600">(ignores runner filter below)</span>
                </label>
                <div className={`flex flex-wrap gap-x-4 gap-y-2 mt-1 transition-opacity ${form.allow_all_runners ? 'opacity-30 pointer-events-none' : ''}`}>
                  {ALL_RUNNER_TYPES.map((r) => (
                    <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.compatible_runners.includes(r)}
                        onChange={() => toggleRunner(r)}
                        className="accent-teal"
                      />
                      <span className="font-mono text-xs text-neutral-400">{r}</span>
                    </label>
                  ))}
                </div>
              </Field>

              {/* ── Skill Composition ─────────────────────────────────────── */}
              <Collapsible label="Skill Composition" open={showComposition} onToggle={() => setShowComposition((v) => !v)}>
                <div className="mt-3 space-y-3">
                  <Field label="Chain (comma-separated skill IDs)">
                    <input
                      className="input font-mono text-xs"
                      value={(form.chain ?? []).join(', ')}
                      onChange={(e) => setForm((f) => ({ ...f, chain: e.target.value ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean) : undefined }))}
                      placeholder="e.g. summarize, translate"
                    />
                    <p className="text-xs text-neutral-600 mt-1">Runs skill IDs in sequence; output of each feeds the next.</p>
                  </Field>
                  <Field label="Fallback Skill ID">
                    <input
                      className="input font-mono text-xs"
                      value={form.fallback_skill ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, fallback_skill: e.target.value || undefined }))}
                      placeholder="e.g. summarize"
                    />
                    <p className="text-xs text-neutral-600 mt-1">Used if this skill fails after all retries.</p>
                  </Field>
                </div>
              </Collapsible>

              {/* ── Metadata ──────────────────────────────────────────────── */}
              <Collapsible label="Metadata (tags, icon, version, author)" open={showMeta} onToggle={() => setShowMeta((v) => !v)}>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Tags (comma-separated)">
                    <input
                      className="input text-xs"
                      value={(form.tags ?? []).join(', ')}
                      onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean) : undefined }))}
                      placeholder="e.g. coding, review"
                    />
                  </Field>
                  <Field label="Icon (emoji)">
                    <input
                      className="input text-lg"
                      value={form.icon ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value || undefined }))}
                      placeholder="🔍"
                      maxLength={4}
                    />
                  </Field>
                  <Field label="Version">
                    <input
                      className="input font-mono text-xs"
                      value={form.version ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, version: e.target.value || undefined }))}
                      placeholder="1.0"
                    />
                  </Field>
                  <Field label="Author">
                    <input
                      className="input text-xs"
                      value={form.author ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, author: e.target.value || undefined }))}
                      placeholder="Your name"
                    />
                  </Field>
                </div>
                <div className="mt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!form.hidden} onChange={(e) => setForm((f) => ({ ...f, hidden: e.target.checked || undefined }))} className="accent-teal" />
                    <span className="text-xs text-neutral-300">Hidden (MCP-only — not shown in Skills UI)</span>
                  </label>
                </div>
              </Collapsible>

              {/* ── Advanced ──────────────────────────────────────────────── */}
              <Collapsible label="Advanced (input/output schemas)" open={showAdvanced} onToggle={() => setShowAdvanced((v) => !v)}>
                <div className="mt-3 space-y-3">
                  <Field label="Input Schema (JSON)">
                    <textarea className="input resize-none h-24 font-mono text-xs" value={inputSchemaStr} onChange={(e) => setInputSchemaStr(e.target.value)} />
                  </Field>
                  <Field label="Output Schema (JSON)">
                    <textarea className="input resize-none h-24 font-mono text-xs" value={outputSchemaStr} onChange={(e) => setOutputSchemaStr(e.target.value)} />
                  </Field>
                </div>
              </Collapsible>
            </>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>

        <div className="px-6 py-4 border-t border-neutral-800 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 bg-teal text-white text-sm rounded hover:bg-teal/90 disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? 'Saving…' : 'Save Skill'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Run task modal ────────────────────────────────────────────────────────────

function RunTaskModal({ skill, onClose }: { skill: SkillManifest; onClose: () => void }) {
  const agents = useAgents()
  const compatibleAgents = agents.filter((a) => skill.compatible_runners.includes(a.type))

  const [input, setInput] = useState('')
  const [agentId, setAgentId] = useState('')
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
        skill: skill.id,
        input: input.trim(),
        ...(agentId ? { agent_id: agentId } : {}),
      },
    })
  }

  const statusColor = {
    idle: '', running: 'text-blue-400', done: 'text-teal', failed: 'text-red-400',
  }[status]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-[600px] max-h-[80vh] flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {skill.icon && <span className="text-base">{skill.icon}</span>}
            <h2 className="text-sm font-semibold text-neutral-100">Run — {skill.name}</h2>
            <SourceBadge source={skill.source} />
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 text-lg leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <Field label="Input">
            <textarea
              className="input resize-none h-28 font-mono text-xs"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter input for this skill…"
              disabled={status === 'running'}
            />
          </Field>

          {compatibleAgents.length > 0 && (
            <Field label="Agent (optional — auto-selects if blank)">
              <select className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)} disabled={status === 'running'}>
                <option value="">Auto</option>
                {compatibleAgents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                ))}
              </select>
            </Field>
          )}

          {(output || status === 'running') && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs text-neutral-400">Output</span>
                {status !== 'idle' && <span className={`text-xs font-mono ${statusColor}`}>{status}</span>}
              </div>
              <pre
                ref={outputRef}
                className="bg-neutral-950 border border-neutral-800 rounded p-3 text-xs text-neutral-300 font-mono whitespace-pre-wrap overflow-y-auto max-h-48"
              >
                {output || (status === 'running' ? '…' : '')}
              </pre>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-neutral-800 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors">
            Close
          </button>
          <button
            onClick={run}
            disabled={status === 'running' || !input.trim()}
            className="px-4 py-2 bg-teal text-white text-sm rounded hover:bg-teal/90 disabled:opacity-50 transition-colors font-medium"
          >
            {status === 'running' ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-neutral-400 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Collapsible({
  label,
  open,
  onToggle,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        {open ? '▾' : '▸'} {label}
      </button>
      {open && children}
    </div>
  )
}
