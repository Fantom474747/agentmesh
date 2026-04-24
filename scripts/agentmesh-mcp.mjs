#!/usr/bin/env node
/**
 * AgentMesh stdio MCP proxy — Claude Code spawns this as a subprocess.
 * Uses stdio transport (always available at startup) and connects to the
 * AgentMesh REST + WebSocket API at call time (lazy, no startup race).
 *
 * If AgentMesh is not running, tools return a descriptive error instead
 * of silently disappearing from Claude Code's tool list.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import WebSocket from 'ws'

const BASE = process.env.AGENTMESH_URL ?? 'http://127.0.0.1:4321'
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws'
const TIMEOUT_MS = 120_000

async function apiFetch(path) {
  let res
  try {
    res = await fetch(`${BASE}${path}`)
  } catch {
    throw new Error(`AgentMesh is not running at ${BASE}. Start the app with "npm run dev" in the AgentMesh project.`)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

function runViaWs(params) {
  return new Promise((resolve, reject) => {
    let ws
    try {
      ws = new WebSocket(WS_URL)
    } catch (err) {
      return reject(new Error(`Cannot connect to AgentMesh WebSocket at ${WS_URL}: ${err.message}`))
    }

    const id = crypto.randomUUID()
    let output = ''
    const timer = setTimeout(() => {
      ws.terminate()
      reject(new Error(`AgentMesh task timed out after ${TIMEOUT_MS / 1000}s`))
    }, TIMEOUT_MS)

    ws.on('open', () => {
      ws.send(JSON.stringify({ id, method: 'run_task', params }))
    })

    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (msg.id !== id) return

      if (msg.error) {
        clearTimeout(timer)
        ws.close()
        reject(new Error(msg.error.message))
        return
      }

      const result = msg.result
      if (result?.chunk) output += result.chunk
      if (result?.done) {
        clearTimeout(timer)
        ws.close()
        resolve(result.output ?? output)
      }
    })

    ws.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`AgentMesh WebSocket error: ${err.message}. Is the app running?`))
    })
  })
}

const server = new McpServer({ name: 'agentmesh', version: '0.1.0' })

server.tool(
  'agentmesh_list_skills',
  'List all skill manifests loaded in AgentMesh (id, name, description, compatible_runners). Call this before agentmesh_run_task to see available skills.',
  {},
  async () => {
    try {
      const skills = await apiFetch('/skills')
      return { content: [{ type: 'text', text: JSON.stringify(skills, null, 2) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: err.message }], isError: true }
    }
  },
)

server.tool(
  'agentmesh_list_agents',
  'List all registered agents with their id, name, type, and status (online/offline/unknown).',
  {},
  async () => {
    try {
      const agents = await apiFetch('/agents')
      return { content: [{ type: 'text', text: JSON.stringify(agents, null, 2) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: err.message }], isError: true }
    }
  },
)

server.tool(
  'agentmesh_run_task',
  'Delegate a task to a local or free-tier AI agent using a skill manifest. ' +
  'Use this to offload token-heavy but low-reasoning work: summarizing long documents, ' +
  'first-pass code review, translation, classification, data extraction. ' +
  'Returns the full output once the agent finishes.',
  {
    skill: z.string().describe('Skill ID — use agentmesh_list_skills to see options (e.g. "summarize", "code_review")'),
    input: z.string().describe('The text input for the skill'),
    agent_id: z.string().optional().describe('Pin to a specific agent by ID (optional — auto-selects if omitted)'),
  },
  async ({ skill, input, agent_id }) => {
    try {
      const output = await runViaWs({ skill, input, ...(agent_id ? { agent_id } : {}) })
      return { content: [{ type: 'text', text: output }] }
    } catch (err) {
      return { content: [{ type: 'text', text: err.message }], isError: true }
    }
  },
)

server.tool(
  'agentmesh_run_prompt',
  'Send a free-form prompt directly to any agent without a skill manifest. ' +
  'Use when no matching skill exists or you need a quick one-off response.',
  {
    input: z.string().describe('The prompt text to send to the agent'),
    system_prompt: z.string().optional().describe('Override the system prompt (defaults to "You are a helpful assistant.")'),
    agent_id: z.string().optional().describe('Pin to a specific agent by ID (optional — auto-selects if omitted)'),
  },
  async ({ input, system_prompt, agent_id }) => {
    try {
      const output = await runViaWs({
        input,
        ...(system_prompt ? { system_prompt } : {}),
        ...(agent_id ? { agent_id } : {}),
      })
      return { content: [{ type: 'text', text: output }] }
    } catch (err) {
      return { content: [{ type: 'text', text: err.message }], isError: true }
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
