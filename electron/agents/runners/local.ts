import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Agent, Task, TaskResult, AgentRunner } from '../../../shared/types.js'

export function createLocalRunner(agent: Agent): AgentRunner {
  const script = (agent.config.script as string | undefined) ?? ''
  const args = (agent.config.args as string[] | undefined) ?? []

  return {
    async healthCheck(): Promise<boolean> {
      return script.length > 0 && existsSync(script)
    },

    async *run(task: Task, systemPrompt: string): AsyncGenerator<string, TaskResult> {
      const start = Date.now()
      let errorOutput = ''
      let output = ''

      const proc = spawn(script, args, {
        env: { ...process.env, SYSTEM_PROMPT: systemPrompt },
      })

      // Write task input to stdin, then close it
      await new Promise<void>((resolve, reject) => {
        proc.stdin.write(task.input, (err) => {
          if (err) reject(err)
          else proc.stdin.end(resolve)
        })
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        errorOutput += chunk.toString()
      })

      for await (const chunk of proc.stdout) {
        const s = (chunk as Buffer).toString()
        output += s
        yield s
      }

      await new Promise<void>((resolve) => proc.on('close', resolve))

      if (!output && errorOutput) {
        return { success: false, output: '', error: errorOutput }
      }
      return { success: true, output, durationMs: Date.now() - start }
    },
  }
}
