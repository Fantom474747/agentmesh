import type { Agent, Task, TaskResult, AgentRunner, ToolDefinition } from '../../../shared/types.js'
import type { RunnerExecParams } from './utils.js'
import { executeTool, type ToolContext } from '../tools/index.js'

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>
}

interface OllamaResponse {
  message?: OllamaMessage
  done?: boolean
}

export function createOllamaRunner(agent: Agent, exec?: RunnerExecParams): AgentRunner {
  const endpoint = (agent.endpoint ?? 'http://localhost:11434').replace(/\/$/, '')
  const model = exec?.modelOverride ?? (agent.config.model as string | undefined) ?? 'llama3'
  const toolCtx: ToolContext | undefined = exec?.toolCtx
  const ollamaOptions = {
    ...(exec?.temperature !== undefined ? { temperature: exec.temperature } : {}),
    ...(exec?.max_tokens !== undefined ? { num_predict: exec.max_tokens } : {}),
  }

  return {
    async healthCheck(): Promise<boolean> {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 5_000)
        try {
          const res = await fetch(`${endpoint}/api/tags`, { signal: ctrl.signal })
          return res.ok
        } finally {
          clearTimeout(timer)
        }
      } catch {
        return false
      }
    },

    async *run(task: Task, systemPrompt: string, tools: ToolDefinition[] = []): AsyncGenerator<string, TaskResult> {
      const start = Date.now()

      const msgs: OllamaMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task.input },
      ]

      if (tools.length > 0) {
        const ollamaTools = tools.map((t) => ({ type: 'function', function: t }))

        // Tool-calling loop — non-streaming until no more tool calls
        for (let round = 0; round < 10; round++) {
          let resp: Response
          try {
            resp = await fetch(`${endpoint}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model, messages: msgs, tools: ollamaTools, stream: false, ...(Object.keys(ollamaOptions).length ? { options: ollamaOptions } : {}) }),
            })
          } catch (err) {
            return { success: false, output: '', error: (err as Error).message }
          }

          if (!resp.ok) {
            const body = await resp.text()
            return { success: false, output: '', error: `HTTP ${resp.status}: ${body}` }
          }

          const data = (await resp.json()) as OllamaResponse
          const message = data.message
          if (!message) break

          msgs.push(message)

          if (!message.tool_calls?.length) break  // no more tool calls → stream final answer

          for (const tc of message.tool_calls) {
            const name = tc.function.name
            const args = tc.function.arguments ?? {}

            yield `\n[tool: ${name}] ${JSON.stringify(args)}\n`
            const result = await executeTool(name, args, toolCtx)
            const preview = result.split('\n').slice(0, 3).join('\n')
            yield `> ${preview}${result.split('\n').length > 3 ? '\n> ...' : ''}\n\n`

            // Ollama tool result messages don't need a tool_call_id
            msgs.push({ role: 'tool', content: result })
          }
        }
      }

      // Streaming final answer (also used when no tools were requested)
      let resp: Response
      try {
        resp = await fetch(`${endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: msgs, stream: true, ...(Object.keys(ollamaOptions).length ? { options: ollamaOptions } : {}) }),
        })
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message }
      }

      if (!resp.ok) {
        const body = await resp.text()
        return { success: false, output: '', error: `HTTP ${resp.status}: ${body}` }
      }

      const reader = resp.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let output = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const obj = JSON.parse(line) as OllamaResponse
              const content = obj.message?.content
              if (content) {
                output += content
                yield content
              }
            } catch { /* skip malformed NDJSON */ }
          }
        }
      } finally {
        reader.releaseLock()
      }

      return { success: true, output, durationMs: Date.now() - start }
    },
  }
}
