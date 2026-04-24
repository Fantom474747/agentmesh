import type { Agent, AgentRunner } from '../../../shared/types.js'
import { makeOpenAICompatRunner, type RunnerExecParams } from './utils.js'

export function createGroqRunner(agent: Agent, exec?: RunnerExecParams): AgentRunner {
  return makeOpenAICompatRunner(
    'https://api.groq.com/openai/v1',
    () => (agent.config.api_key as string | undefined) ?? '',
    () => (agent.config.model as string | undefined) ?? 'llama-3.1-8b-instant',
    {},
    exec,
  )
}
