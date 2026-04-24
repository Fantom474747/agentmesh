import type { Agent, AgentRunner } from '../../../shared/types.js'
import { makeOpenAICompatRunner, type RunnerExecParams } from './utils.js'

export function createOpenRouterRunner(agent: Agent, exec?: RunnerExecParams): AgentRunner {
  return makeOpenAICompatRunner(
    'https://openrouter.ai/api/v1',
    () => (agent.config.api_key as string | undefined) ?? '',
    () => (agent.config.model as string | undefined) ?? 'meta-llama/llama-3.1-8b-instruct:free',
    {
      'HTTP-Referer': 'http://localhost:4321',
      'X-Title': 'AgentMesh',
    },
    exec,
  )
}
