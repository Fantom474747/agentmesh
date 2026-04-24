import type { Agent, AgentRunner } from '../../../shared/types.js'
import type { RunnerExecParams } from './utils.js'
import { createOllamaRunner } from './ollama.js'
import { createGroqRunner } from './groq.js'
import { createHuggingFaceRunner } from './huggingface.js'
import { createTogetherRunner } from './together.js'
import { createOpenRouterRunner } from './openrouter.js'
import { createLocalRunner } from './local.js'

export { type RunnerExecParams }

export function createRunner(agent: Agent, exec?: RunnerExecParams): AgentRunner {
  switch (agent.type) {
    case 'ollama':       return createOllamaRunner(agent, exec)
    case 'groq':        return createGroqRunner(agent, exec)
    case 'huggingface': return createHuggingFaceRunner(agent, exec)
    case 'together':    return createTogetherRunner(agent, exec)
    case 'openrouter':  return createOpenRouterRunner(agent, exec)
    case 'local_script':
    case 'local_docker': return createLocalRunner(agent)
  }
}
