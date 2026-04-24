import type { Task, TaskResult, AgentRunner, ToolDefinition } from '../../../shared/types.js'
import { executeTool, type ToolContext } from '../tools/index.js'

// ── SSE parser ────────────────────────────────────────────────────────────────

export async function* parseSSE(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data !== '[DONE]') yield data
        }
      }
    }
    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6)
      if (data !== '[DONE]') yield data
    }
  } finally {
    reader.releaseLock()
  }
}

// ── OpenAI-compatible tool-calling loop ───────────────────────────────────────
//
// Two-phase approach:
//   1. Non-streaming calls in a loop until the model stops emitting tool_calls
//   2. One final streaming call to get the answer once all tools are resolved
//
// Yields intermediate status lines (wrapped in backticks so they render well)
// so the caller can stream progress to the WebSocket while tools execute.

interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

interface OAINonStreamChoice {
  message: OAIMessage
}

interface OAINonStreamResponse {
  choices?: OAINonStreamChoice[]
}

type FetchFn = (messages: OAIMessage[], stream: boolean) => Promise<Response>

export async function* openAIToolCallingLoop(
  messages: OAIMessage[],
  fetchFn: FetchFn,
  parseChunk: (raw: string) => string | null,
  toolCtx?: ToolContext,
): AsyncGenerator<string, string> {
  const msgs: OAIMessage[] = [...messages]

  for (let round = 0; round < 10; round++) {
    // Non-streaming request — we need to see the full message to detect tool_calls
    let resp: Response
    try {
      resp = await fetchFn(msgs, false)
    } catch (err) {
      return ''
    }

    if (!resp.ok) {
      // Fall through to the streaming attempt without tools on error
      break
    }

    const body = (await resp.json()) as OAINonStreamResponse
    const message = body.choices?.[0]?.message
    if (!message) break

    msgs.push(message)

    if (!message.tool_calls?.length) break  // no more tool calls → proceed to stream

    // Execute each tool call and collect results
    for (const tc of message.tool_calls) {
      const name = tc.function.name
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>
      } catch { /* malformed JSON from model — run with empty args */ }

      yield `\n[tool: ${name}] ${JSON.stringify(args)}\n`
      const result = await executeTool(name, args, toolCtx)
      // Show first 3 lines of result inline so the user can see what's happening
      const preview = result.split('\n').slice(0, 3).join('\n')
      yield `> ${preview}${result.split('\n').length > 3 ? '\n> ...' : ''}\n\n`

      msgs.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      })
    }

    // Temporarily strip tools from the request on the next round if the model
    // produced content alongside tool_calls (some providers do this)
    if (message.content) {
      // Content already yielded implicitly — continue the loop
    }
  }

  // Final streaming call — conversation history now includes all tool results
  let streamResp: Response
  try {
    streamResp = await fetchFn(msgs, true)
  } catch {
    return ''
  }

  if (!streamResp.ok) {
    return ''
  }

  let output = ''
  for await (const line of parseSSE(streamResp)) {
    const content = parseChunk(line)
    if (content) {
      output += content
      yield content
    }
  }
  return output
}

// ── Shared factory for OpenAI-compatible runners ──────────────────────────────

export interface RunnerExecParams {
  modelOverride?: string
  temperature?: number
  max_tokens?: number
  toolCtx?: ToolContext
}

export type { ToolContext }

export function makeOpenAICompatRunner(
  baseUrl: string,
  getApiKey: () => string,
  getModel: () => string,
  extraHeaders: Record<string, string> = {},
  exec: RunnerExecParams = {},
): AgentRunner {
  const resolveModel = () => exec.modelOverride ?? getModel()
  function buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
      ...extraHeaders,
    }
  }

  function parseOAIChunk(raw: string): string | null {
    try {
      const data = JSON.parse(raw) as { choices?: Array<{ delta?: { content?: string } }> }
      return data.choices?.[0]?.delta?.content ?? null
    } catch {
      return null
    }
  }

  return {
    async healthCheck(): Promise<boolean> {
      return getApiKey().trim().length > 0
    },

    async *run(task: Task, systemPrompt: string, tools: ToolDefinition[] = []): AsyncGenerator<string, TaskResult> {
      const start = Date.now()

      const baseMessages: OAIMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task.input },
      ]

      if (tools.length > 0) {
        // Tool-calling path: two-phase loop then stream
        const oaiTools = tools.map((t) => ({ type: 'function' as const, function: t }))

        function fetchWith(messages: OAIMessage[], stream: boolean): Promise<Response> {
          return fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify({
              model: resolveModel(),
              messages,
              tools: oaiTools,
              tool_choice: 'auto',
              stream,
              ...(exec.temperature !== undefined ? { temperature: exec.temperature } : {}),
              ...(exec.max_tokens !== undefined ? { max_tokens: exec.max_tokens } : {}),
            }),
          })
        }

        let output = ''
        const gen = openAIToolCallingLoop(baseMessages, fetchWith, parseOAIChunk, exec.toolCtx)
        let next = await gen.next()
        while (!next.done) {
          output += next.value
          yield next.value
          next = await gen.next()
        }
        // next.value is the final streamed output returned by the generator
        output = next.value || output
        return { success: true, output, durationMs: Date.now() - start }
      }

      // No-tools path: simple SSE stream (original behaviour)
      let resp: Response
      try {
        resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({
            model: resolveModel(),
            messages: baseMessages,
            stream: true,
            ...(exec.temperature !== undefined ? { temperature: exec.temperature } : {}),
            ...(exec.max_tokens !== undefined ? { max_tokens: exec.max_tokens } : {}),
          }),
        })
      } catch (err) {
        return { success: false, output: '', error: (err as Error).message }
      }

      if (!resp.ok) {
        const body = await resp.text()
        return { success: false, output: '', error: `HTTP ${resp.status}: ${body}` }
      }

      let output = ''
      for await (const line of parseSSE(resp)) {
        const content = parseOAIChunk(line)
        if (content) {
          output += content
          yield content
        }
      }
      return { success: true, output, durationMs: Date.now() - start }
    },
  }
}
