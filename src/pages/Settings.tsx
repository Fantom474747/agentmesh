import { useEffect, useState } from 'react'
import { useServerPort } from '../store/uiStore'
import {
  useFontSize, useUiScale, useReducedMotion,
  useSetFontSize, useSetUiScale, useSetReducedMotion,
  type FontSize, type UiScale,
} from '../store/settingsStore'

export default function Settings() {
  const port = useServerPort()
  const [userDataPath, setUserDataPath] = useState('')
  const fontSize = useFontSize()
  const uiScale = useUiScale()
  const reducedMotion = useReducedMotion()
  const setFontSize = useSetFontSize()
  const setUiScale = useSetUiScale()
  const setReducedMotion = useSetReducedMotion()

  useEffect(() => {
    window.agentmesh.getUserDataPath().then(setUserDataPath).catch(() => {})
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <div className="px-6 py-4 border-b border-teal/[0.08] shrink-0">
        <h1 className="text-xl font-bold text-neutral-100 tracking-tight leading-none">Settings</h1>
        <p className="font-mono text-[10px] text-neutral-600 uppercase tracking-[0.07em] mt-1">
          Server configuration &amp; appearance
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 max-w-2xl">

        {/* ── Appearance ── */}
        <section>
          <SectionLabel>Appearance</SectionLabel>
          <div className="bg-mesh-bg3 border border-teal/[0.08] rounded-xl divide-y divide-teal/[0.06]">

            <ToggleRow label="Font Size">
              {([['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']] as [FontSize, string][]).map(([v, label]) => (
                <ToggleBtn key={v} active={fontSize === v} onClick={() => setFontSize(v)}>
                  {label}
                </ToggleBtn>
              ))}
            </ToggleRow>

            <ToggleRow label="UI Scale">
              {([90, 100, 110] as UiScale[]).map((v) => (
                <ToggleBtn key={v} active={uiScale === v} onClick={() => setUiScale(v)}>
                  {v}%
                </ToggleBtn>
              ))}
            </ToggleRow>

            <ToggleRow label="Reduced Motion">
              <ToggleBtn active={reducedMotion} onClick={() => setReducedMotion(true)}>On</ToggleBtn>
              <ToggleBtn active={!reducedMotion} onClick={() => setReducedMotion(false)}>Off</ToggleBtn>
            </ToggleRow>

          </div>
          <p className="font-mono text-[10px] text-neutral-600 mt-2">
            Changes apply immediately and persist across restarts.
          </p>
        </section>

        {/* ── Server ── */}
        <section>
          <SectionLabel>Server</SectionLabel>
          <div className="bg-mesh-bg3 border border-teal/[0.08] rounded-xl divide-y divide-teal/[0.06]">
            <Row label="Port" value={String(port)} />
            <Row label="WebSocket URL" value={`ws://localhost:${port}/ws`} mono />
            <Row label="REST base URL" value={`http://localhost:${port}`} mono />
            <Row label="MCP endpoint" value={`http://localhost:${port}/mcp/sse`} mono />
          </div>
        </section>

        {/* ── Data folders ── */}
        <section>
          <SectionLabel>Data Folders</SectionLabel>
          <div className="bg-mesh-bg3 border border-teal/[0.08] rounded-xl divide-y divide-teal/[0.06]">
            <Row label="User data" value={userDataPath} mono />
            <Row label="Skills" value={userDataPath ? `${userDataPath}\\skills` : ''} mono />
            <Row label="Agent connections" value={userDataPath ? `${userDataPath}\\agents` : ''} mono />
          </div>
          <p className="font-mono text-[10px] text-neutral-600 mt-2">
            Drop skill folders into the <span className="text-neutral-400">skills</span> directory and reload from the Skills page.
          </p>
        </section>

        {/* ── Claude Code integration ── */}
        <section>
          <SectionLabel>Claude Code Integration</SectionLabel>
          <div className="bg-mesh-bg3 border border-teal/[0.08] rounded-xl p-4 space-y-4">
            <p className="text-sm text-neutral-400">
              Add this to any project&apos;s{' '}
              <span className="font-mono text-[11px] text-neutral-300">.mcp.json</span> to connect Claude Code:
            </p>
            <pre className="bg-mesh-bg border border-teal/[0.08] rounded-lg px-3 py-3 text-xs font-mono text-neutral-300 whitespace-pre overflow-x-auto">
{`{
  "mcpServers": {
    "agentmesh": {
      "command": "node",
      "args": ["<path-to-agentmesh>/scripts/agentmesh-mcp.mjs"]
    }
  }
}`}
            </pre>
            <p className="font-mono text-[10px] text-neutral-600">
              Set <span className="text-neutral-400">AGENTMESH_URL</span> env var if you change the port.
            </p>
          </div>
        </section>

      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-600 mb-2 px-1">
      {children}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <span className="text-sm text-neutral-400 shrink-0">{label}</span>
      <span className={`text-neutral-200 truncate text-right ${mono ? 'font-mono text-xs' : 'text-sm'}`}>
        {value || <span className="text-neutral-600">—</span>}
      </span>
    </div>
  )
}

function ToggleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-neutral-500">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  )
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'no-drag px-3 py-1 text-xs rounded border font-mono transition-all',
        active
          ? 'bg-teal/10 text-teal border-teal/30'
          : 'bg-mesh-bg text-neutral-500 border-teal/[0.08] hover:text-neutral-300 hover:border-teal/20',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
