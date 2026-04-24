import type { Agent, AgentRunner } from '../../../shared/types.js'
import { makeOpenAICompatRunner, type RunnerExecParams } from './utils.js'

export function createTogetherRunner(agent: Agent, exec?: RunnerExecParams): AgentRunner {
  return makeOpenAICompatRunner(
    'https://api.together.xyz/v1',
    () => (agent.config.api_key as string | undefined) ?? '',
    () => (agent.config.model as string | undefined) ?? 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    {},
    exec,
  )
}
