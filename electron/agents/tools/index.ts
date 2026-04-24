import type { ToolDefinition } from '../../../shared/types.js'
import { listDir, readFile, searchFiles, getFileInfo } from './filesystem.js'

export interface ToolContext {
  sandbox?: string       // restrict filesystem tools to this directory
  timeoutMs?: number     // per-tool-call timeout
  allowedTools?: string[] // if set, reject calls to tools not in this list
}

type ToolFn = (args: Record<string, unknown>, sandbox?: string) => Promise<string>

const TOOL_FNS: Record<string, ToolFn> = {
  list_dir:      (a, sb) => listDir(a as Parameters<typeof listDir>[0], sb),
  read_file:     (a, sb) => readFile(a as Parameters<typeof readFile>[0], sb),
  search_files:  (a, sb) => searchFiles(a as Parameters<typeof searchFiles>[0], sb),
  get_file_info: (a, sb) => getFileInfo(a as Parameters<typeof getFileInfo>[0], sb),
}

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  list_dir: {
    name: 'list_dir',
    description:
      'List files and directories at a path. Set recursive=true to walk the entire tree (node_modules and .git are always skipped).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to list' },
        recursive: { type: 'boolean', description: 'Walk subdirectories (default: false)' },
      },
      required: ['path'],
    },
  },
  read_file: {
    name: 'read_file',
    description:
      'Read the text content of a file. Files larger than 500KB return an error — use start_line/end_line to read a section.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
        start_line: { type: 'number', description: 'First line to read (1-indexed, optional)' },
        end_line: { type: 'number', description: 'Last line to read (optional)' },
      },
      required: ['path'],
    },
  },
  search_files: {
    name: 'search_files',
    description: 'Search file contents for a regex pattern. Returns matching lines with file:line context.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Case-insensitive regex to search for' },
        directory: { type: 'string', description: 'Directory to search in (searched recursively)' },
        file_pattern: {
          type: 'string',
          description: 'Glob filter for file names, e.g. "*.ts" or "*.py" (optional)',
        },
      },
      required: ['pattern', 'directory'],
    },
  },
  get_file_info: {
    name: 'get_file_info',
    description: 'Get metadata about a file or directory: size, type, last modified, child count.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file or directory' },
      },
      required: ['path'],
    },
  },
}

export function resolveTools(names: string[]): ToolDefinition[] {
  return names
    .map((n) => TOOL_DEFINITIONS[n])
    .filter((t): t is ToolDefinition => t !== undefined)
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<string> {
  // Enforcement: reject tools not in the skill's allowed list
  if (ctx?.allowedTools && !ctx.allowedTools.includes(name)) {
    return `Error: tool '${name}' is not permitted for this skill. Allowed: ${ctx.allowedTools.join(', ')}`
  }

  const fn = TOOL_FNS[name]
  if (!fn) return `Error: unknown tool "${name}". Available: ${Object.keys(TOOL_FNS).join(', ')}`

  const call = fn(args, ctx?.sandbox).catch((err: Error) => `Error executing ${name}: ${err.message}`)

  if (ctx?.timeoutMs) {
    const timeout = new Promise<string>((resolve) =>
      setTimeout(() => resolve(`Error: tool '${name}' timed out after ${ctx.timeoutMs}ms`), ctx.timeoutMs),
    )
    return Promise.race([call, timeout])
  }

  return call
}
