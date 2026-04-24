import { useServerPort } from '../store/uiStore'

export default function Settings() {
  const port = useServerPort()

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-lg font-semibold text-neutral-100 mb-1">Settings</h1>
      <p className="text-sm text-neutral-500 mb-8">Server configuration and API keys</p>

      <section className="mb-8">
        <h2 className="text-sm font-medium text-neutral-300 mb-4 uppercase tracking-wider">
          Server
        </h2>
        <div className="rounded border border-neutral-800 bg-neutral-900 divide-y divide-neutral-800">
          <Row label="Port" value={String(port)} />
          <Row label="WebSocket URL" value={`ws://localhost:${port}/ws`} mono />
          <Row label="REST base URL" value={`http://localhost:${port}`} mono />
          <Row label="MCP endpoint" value={`http://localhost:${port}/mcp/sse`} mono />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-neutral-300 mb-4 uppercase tracking-wider">
          Claude Code integration
        </h2>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4 space-y-4">
          <p className="text-sm text-neutral-400">
            Claude Code uses a <strong className="text-neutral-300">stdio MCP proxy</strong> that starts with Claude Code
            and connects to AgentMesh at call time — tools are always registered even if this app
            starts later. Add this to any project&apos;s <span className="font-mono text-neutral-300">.mcp.json</span>:
          </p>
          <pre className="bg-neutral-950 border border-neutral-800 rounded px-3 py-3 text-xs font-mono text-neutral-300 whitespace-pre">
{`{
  "mcpServers": {
    "agentmesh": {
      "command": "node",
      "args": ["<path-to-agentmesh>/scripts/agentmesh-mcp.mjs"]
    }
  }
}`}
          </pre>
          <p className="text-xs text-neutral-500">
            This project is already configured. For other projects, point <span className="font-mono text-neutral-400">args</span> to the
            absolute path of <span className="font-mono text-neutral-400">scripts/agentmesh-mcp.mjs</span> in this directory.
            Set <span className="font-mono text-neutral-400">AGENTMESH_URL</span> env var if you change the port.
          </p>
        </div>
      </section>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-neutral-400">{label}</span>
      <span className={['text-sm text-neutral-200 font-mono text-xs', mono ? '' : 'font-sans text-sm'].join(' ')}>
        {value}
      </span>
    </div>
  )
}
