import type { Task, Agent, ToolDefinition, SkillManifest } from '../../shared/types.js'
import * as queue from './queue.js'
import { createRunner, type RunnerExecParams } from './runners/index.js'
import type { ToolContext } from './tools/index.js'

// ── Context injection ─────────────────────────────────────────────────────────

export function buildSystemPrompt(skill: SkillManifest | undefined, basePrompt: string): string {
  if (!skill) return basePrompt

  let prompt = basePrompt

  // context_template wraps the system prompt — {{system_prompt}} is the insertion point
  if (skill.context_template) {
    prompt = skill.context_template.includes('{{system_prompt}}')
      ? skill.context_template.replace('{{system_prompt}}', prompt)
      : skill.context_template + '\n\n' + prompt
  }

  // Prepend date / cwd injections
  const injections: string[] = []
  if (skill.inject_date) injections.push(`Today's date: ${new Date().toISOString().split('T')[0]}`)
  if (skill.inject_cwd) injections.push(`Working directory: ${process.cwd()}`)
  if (injections.length) prompt = injections.join('\n') + '\n\n' + prompt

  return prompt
}

// ── Single-task execution ─────────────────────────────────────────────────────

export async function executeTask(
  task: Task,
  systemPrompt: string,
  agent: Agent,
  tools: ToolDefinition[] = [],
  exec?: RunnerExecParams,
  timeoutMs?: number,
  onChunk?: (taskId: string, chunk: string) => void,
): Promise<void> {
  queue.updateTaskStatus(task.id, 'running')

  try {
    const runner = createRunner(agent, exec)
    const gen = runner.run(task, systemPrompt, tools)

    async function drain() {
      let next = await gen.next()
      while (!next.done) {
        onChunk?.(task.id, next.value)
        next = await gen.next()
      }
      return next.value
    }

    const deadline = timeoutMs
      ? new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Task timed out after ${timeoutMs}ms`)), timeoutMs),
        )
      : null

    const result = await (deadline ? Promise.race([drain(), deadline]) : drain())

    queue.updateTaskStatus(
      task.id,
      result.success ? 'done' : 'failed',
      result.output,
      result.error,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    queue.updateTaskStatus(task.id, 'failed', undefined, message)
    throw err
  }
}

// ── Chain execution ───────────────────────────────────────────────────────────
//
// Runs a sequence of skills, feeding each step's output as the next step's input.
// Streams chunks from every step to onChunk with a [chain: step_id] prefix.
// Returns { success, output, error }.

export async function executeChain(
  chainSkillIds: string[],
  initialInput: string,
  getSkills: () => SkillManifest[],
  findAgent: (skill: SkillManifest) => Agent | undefined,
  parentTaskId: string,
  onChunk?: (taskId: string, chunk: string) => void,
): Promise<{ success: boolean; output: string; error?: string }> {
  let currentInput = initialInput

  for (let i = 0; i < chainSkillIds.length; i++) {
    const skillId = chainSkillIds[i]
    const skill = getSkills().find((s) => s.id === skillId)
    if (!skill) {
      return { success: false, output: currentInput, error: `Chain step ${i + 1}: unknown skill '${skillId}'` }
    }

    const agent = findAgent(skill)
    if (!agent) {
      return { success: false, output: currentInput, error: `Chain step ${i + 1}: no agent available for skill '${skillId}'` }
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

    const stepTask = queue.createTask({ skill: skillId, input: currentInput, agent_id: agent.id })
    let stepOutput = ''
    const prefix = `[chain ${i + 1}/${chainSkillIds.length}: ${skillId}] `

    onChunk?.(parentTaskId, prefix)

    try {
      const runner = createRunner(agent, exec)
      const gen = runner.run(stepTask, systemPrompt, [])

      const deadline = skill.timeout_ms
        ? new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Chain step '${skillId}' timed out`)), skill.timeout_ms!),
          )
        : null

      async function drainStep() {
        let next = await gen.next()
        while (!next.done) {
          stepOutput += next.value
          onChunk?.(parentTaskId, next.value)
          next = await gen.next()
        }
        return next.value
      }

      const result = await (deadline ? Promise.race([drainStep(), deadline]) : drainStep())
      queue.updateTaskStatus(stepTask.id, result.success ? 'done' : 'failed', result.output, result.error)

      if (!result.success) {
        return { success: false, output: stepOutput, error: result.error ?? `Chain step '${skillId}' failed` }
      }
      currentInput = result.output || stepOutput
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      queue.updateTaskStatus(stepTask.id, 'failed', undefined, message)
      return { success: false, output: stepOutput, error: message }
    }

    onChunk?.(parentTaskId, '\n')
  }

  return { success: true, output: currentInput }
}
