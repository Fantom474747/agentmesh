import type { Agent, AgentRunner } from '../../../shared/types.js'
import { makeOpenAICompatRunner, type RunnerExecParams } from './utils.js'

// Uses HuggingFace's OpenAI-compatible per-model endpoint (requires TGI-hosted models)
export function createHuggingFaceRunner(agent: Agent, exec?: RunnerExecParams): AgentRunner {
  const model = exec?.modelOverride ?? (agent.config.model as string | undefined) ?? 'mistralai/Mistral-7B-Instruct-v0.2'
  // HF endpoint URL is model-specific — use the effective model for the URL too
  return makeOpenAICompatRunner(
    `https://api-inference.huggingface.co/models/${model}/v1`,
    () => (agent.config.api_key as string | undefined) ?? '',
    () => model,
    {},
    exec,
  )
}
