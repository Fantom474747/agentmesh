import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import type { Express } from 'express'
import { z } from 'zod'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as registry from '../agents/registry.js'
import * as queue from '../agents/queue.js'
import { executeTask, executeChain, buildSystemPrompt } from '../agents/executor.js'
import { resolveTools } from '../agents/tools/index.js'
import type { RunnerExecParams } from '../agents/runners/index.js'
import { buildSkillMd, buildSkillYaml, readSkillRaw } from './skills.js'
import type { SkillManifest } from '../../shared/types.js'

export function attachMcp(
  app: Express,
  getSkills: () => SkillManifest[],
  getSkillsDir: () => string,
  reloadSkills: () => void,
): void {
  const server = new McpServer({ name: 'agentmesh', version: '0.1.0' })

  server.tool(
    'agentmesh_list_skills',
    'List all available skill manifests loaded in AgentMesh',
    {},
    async () => ({
      content: [{
        type: 'text' as const,
        text: JSON.stringify(
          getSkills().map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            compatible_runners: s.compatible_runners,
          })),
          null,
          2,
        ),
      }],
    }),
  )

  server.tool(
    'agentmesh_list_agents',
    'List all registered agents and their current status',
    {},
    async () => ({
      content: [{
        type: 'text' as const,
        text: JSON.stringify(
          registry.listAgents().map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            status: a.status,
            skills: a.skills,
          })),
          null,
          2,
        ),
      }],
    }),
  )

  server.tool(
    'agentmesh_run_task',
    'Delegate a task to a local or free-tier AI agent using a skill manifest. Use this to offload token-heavy work (summarization, code review, translation, etc.) to cheaper models.',
    {
      skill: z.string().describe('Skill ID — use agentmesh_list_skills to see options (e.g. "summarize", "code_review")'),
      input: z.string().describe('The text input for the skill'),
      agent_id: z.string().optional().describe('Prefer a specific agent by ID (optional — auto-selects if omitted)'),
    },
    async ({ skill: skillId, input, agent_id }) => {
      const skill = getSkills().find((s) => s.id === skillId)
      if (!skill) {
        return { content: [{ type: 'text' as const, text: `Error: Unknown skill "${skillId}"` }], isError: true }
      }

      const agent = agent_id ? registry.getAgent(agent_id) : queue.selectAgent(skill)

      if (!agent) {
        const reason = skill.require_online
          ? `No online agent available for skill "${skillId}" (require_online is set)`
          : `No agent available for skill "${skillId}". Check that a compatible agent is registered.`
        return { content: [{ type: 'text' as const, text: `Error: ${reason}` }], isError: true }
      }

      const task = queue.createTask({ skill: skillId, input, agent_id: agent.id })
      let output = ''

      // Chain execution
      if (skill.chain?.length) {
        try {
          const result = await executeChain(skill.chain, input, getSkills, (s) => queue.selectAgent(s), task.id, (_id, chunk) => { output += chunk })
          queue.updateTaskStatus(task.id, result.success ? 'done' : 'failed', result.output, result.error)
          if (!result.success) return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true }
          return { content: [{ type: 'text' as const, text: result.output }] }
        } catch (err) {
          return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true }
        }
      }

      const systemPrompt = buildSystemPrompt(skill, skill.system_prompt)
      const exec: RunnerExecParams = {
        modelOverride: skill.model,
        temperature: skill.temperature,
        max_tokens: skill.max_tokens,
        toolCtx: skill.tool_sandbox || skill.tool_timeout_ms || skill.tools
          ? { sandbox: skill.tool_sandbox, timeoutMs: skill.tool_timeout_ms, allowedTools: skill.tools }
          : undefined,
      }

      try {
        await executeTask(task, systemPrompt, agent, resolveTools(skill.tools ?? []), exec, skill.timeout_ms, (_id, chunk) => { output += chunk })

        // Fallback skill
        const completed = queue.getTask(task.id)
        if (completed?.status === 'failed' && skill.fallback_skill) {
          const fallback = getSkills().find((s) => s.id === skill.fallback_skill)
          const fbAgent = fallback ? queue.selectAgent(fallback) : undefined
          if (fallback && fbAgent) {
            output = ''
            const fbExec: RunnerExecParams = { modelOverride: fallback.model, temperature: fallback.temperature, max_tokens: fallback.max_tokens }
            await executeTask(task, buildSystemPrompt(fallback, fallback.system_prompt), fbAgent, resolveTools(fallback.tools ?? []), fbExec, fallback.timeout_ms, (_id, chunk) => { output += chunk })
          }
        }

        return { content: [{ type: 'text' as const, text: output }] }
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    },
  )

  server.tool(
    'agentmesh_run_prompt',
    'Send a free-form prompt directly to an agent without using a skill manifest. Use when you need a quick response and no matching skill exists.',
    {
      input: z.string().describe('The prompt text to send to the agent'),
      system_prompt: z.string().optional().describe('System prompt override (defaults to "You are a helpful assistant.")'),
      agent_id: z.string().optional().describe('Prefer a specific agent by ID (optional — auto-selects any online agent if omitted)'),
    },
    async ({ input, system_prompt, agent_id }) => {
      const agents = registry.listAgents()
      const agent = agent_id
        ? registry.getAgent(agent_id)
        : (agents.find((a) => a.status === 'online') ?? agents[0])

      if (!agent) {
        return {
          content: [{ type: 'text' as const, text: 'Error: No agents available. Register an agent in AgentMesh first.' }],
          isError: true,
        }
      }

      const task = queue.createTask({ skill: '_raw', input, agent_id: agent.id })
      const sysPrompt = system_prompt ?? 'You are a helpful assistant.'
      let output = ''

      try {
        await executeTask(task, sysPrompt, agent, [], undefined, undefined, (_id, chunk) => { output += chunk })
        return { content: [{ type: 'text' as const, text: output }] }
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    },
  )

  server.tool(
    'agentmesh_skill_read',
    'Read the raw source of a skill (SKILL.md or manifest.yaml). Use before editing so you can see the current content.',
    {
      id: z.string().describe('Skill ID (e.g. "code_review")'),
    },
    async ({ id }) => {
      const result = readSkillRaw(getSkillsDir(), id)
      if (!result) {
        return { content: [{ type: 'text' as const, text: `Error: Skill "${id}" not found` }], isError: true }
      }
      return {
        content: [{
          type: 'text' as const,
          text: `format: ${result.format}\n\n${result.content}`,
        }],
      }
    },
  )

  server.tool(
    'agentmesh_skill_create',
    'Create a new skill. Use format="markdown" to write a SKILL.md (recommended — just write the system prompt as the body). Use format="yaml" for structured manifest. The skill is immediately available after creation.',
    {
      id: z.string().describe('Skill ID — lowercase, underscores only (e.g. "my_skill")'),
      name: z.string().describe('Human-readable name'),
      description: z.string().describe('What this skill does'),
      compatible_runners: z.array(z.string()).describe('Runner types: ollama, groq, together, openrouter, huggingface, local_script'),
      system_prompt: z.string().describe('The system prompt the agent will receive'),
      format: z.enum(['markdown', 'yaml']).default('markdown').describe('File format: markdown = SKILL.md, yaml = manifest.yaml'),
      tools: z.array(z.string()).optional().describe('Tool names to grant: list_dir, read_file, search_files, get_file_info'),
    },
    async ({ id, name, description, compatible_runners, system_prompt, format, tools }) => {
      if (/[/\\.]/.test(id)) {
        return { content: [{ type: 'text' as const, text: 'Error: Invalid skill id — use lowercase letters and underscores only' }], isError: true }
      }
      const manifest: SkillManifest = {
        id,
        name,
        description,
        compatible_runners: compatible_runners as SkillManifest['compatible_runners'],
        system_prompt,
        tools,
        input_schema: { type: 'object', properties: {} },
        output_schema: { type: 'object', properties: {} },
        source: format,
      }
      try {
        const dir = join(getSkillsDir(), id)
        mkdirSync(dir, { recursive: true })
        if (format === 'markdown') {
          writeFileSync(join(dir, 'SKILL.md'), buildSkillMd(manifest), 'utf8')
        } else {
          writeFileSync(join(dir, 'manifest.yaml'), buildSkillYaml(manifest), 'utf8')
        }
        reloadSkills()
        return { content: [{ type: 'text' as const, text: `Skill "${id}" created as ${format === 'markdown' ? 'SKILL.md' : 'manifest.yaml'} and loaded.` }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true }
      }
    },
  )

  server.tool(
    'agentmesh_skill_edit',
    'Edit an existing skill by replacing its full file content. Use agentmesh_skill_read first to get the current content, modify it, then call this. Handles both SKILL.md and manifest.yaml.',
    {
      id: z.string().describe('Skill ID to edit'),
      content: z.string().describe('Full new file content (complete SKILL.md or YAML — not a partial diff)'),
    },
    async ({ id, content }) => {
      if (/[/\\.]/.test(id)) {
        return { content: [{ type: 'text' as const, text: 'Error: Invalid skill id' }], isError: true }
      }
      const existing = readSkillRaw(getSkillsDir(), id)
      if (!existing) {
        return { content: [{ type: 'text' as const, text: `Error: Skill "${id}" not found. Use agentmesh_skill_create to create it.` }], isError: true }
      }
      try {
        const filename = existing.format === 'markdown' ? 'SKILL.md' : 'manifest.yaml'
        writeFileSync(join(getSkillsDir(), id, filename), content, 'utf8')
        reloadSkills()
        return { content: [{ type: 'text' as const, text: `Skill "${id}" updated and reloaded.` }] }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true }
      }
    },
  )

  // SSE transport — one transport instance per client connection
  const transports = new Map<string, SSEServerTransport>()

  app.get('/mcp/sse', async (_req, res) => {
    const transport = new SSEServerTransport('/mcp/messages', res)
    transports.set(transport.sessionId, transport)
    res.on('close', () => transports.delete(transport.sessionId))
    try {
      await server.connect(transport)
    } catch (err) {
      console.error('[mcp] connect error:', (err as Error).message)
    }
  })

  app.post('/mcp/messages', async (req, res) => {
    const sessionId = req.query['sessionId'] as string
    const transport = transports.get(sessionId)
    if (!transport) {
      res.status(400).json({ error: 'Unknown MCP session' })
      return
    }
    try {
      await transport.handlePostMessage(req, res)
    } catch (err) {
      console.error('[mcp] handlePostMessage error:', (err as Error).message)
      res.status(500).json({ error: 'Internal server error' })
    }
  })
}
