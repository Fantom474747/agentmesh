import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, normalize, relative, resolve } from 'node:path'

const MAX_FILE_BYTES = 512 * 1024  // 500 KB
const MAX_SEARCH_RESULTS = 100
const MAX_DEPTH = 10

// Resolve a user-supplied path, optionally restricting it to a sandbox root.
// Returns the resolved path, or an error string if it escapes the sandbox.
function resolvePath(p: string, sandbox?: string): { path: string } | { error: string } {
  const resolved = resolve(normalize(p))
  if (sandbox) {
    const sandboxResolved = resolve(normalize(sandbox))
    if (!resolved.startsWith(sandboxResolved + '/') && resolved !== sandboxResolved) {
      return { error: `Error: path '${p}' is outside the allowed sandbox '${sandbox}'` }
    }
  }
  return { path: resolved }
}

// list_dir — returns a tree-style listing, skipping hidden files and node_modules
export async function listDir(args: { path: string; recursive?: boolean }, sandbox?: string): Promise<string> {
  const r = resolvePath(args.path, sandbox)
  if ('error' in r) return r.error
  const target = r.path
  if (!existsSync(target)) return `Error: path does not exist: ${target}`

  try {
    if (!statSync(target).isDirectory()) return `Error: not a directory: ${target}`
    const lines = collectEntries(target, args.recursive ?? false, target, 0)
    return lines.length ? lines.join('\n') : '(empty directory)'
  } catch (err) {
    return `Error: ${(err as Error).message}`
  }
}

function collectEntries(dir: string, recursive: boolean, root: string, depth: number): string[] {
  if (depth > MAX_DEPTH) return []
  const results: string[] = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const fullPath = join(dir, entry.name)
    const rel = relative(root, fullPath)
    results.push(entry.isDirectory() ? `[dir]  ${rel}` : `[file] ${rel}`)
    if (recursive && entry.isDirectory()) {
      results.push(...collectEntries(fullPath, true, root, depth + 1))
    }
  }
  return results
}

const SKIP_DIRS = new Set(['node_modules', '__pycache__', '.git', 'dist', 'build', '.next', 'out'])

// read_file — reads file text, with optional line range
export async function readFile(args: {
  path: string
  start_line?: number
  end_line?: number
}, sandbox?: string): Promise<string> {
  const r = resolvePath(args.path, sandbox)
  if ('error' in r) return r.error
  const target = r.path
  if (!existsSync(target)) return `Error: file not found: ${target}`

  try {
    const stat = statSync(target)
    if (!stat.isFile()) return `Error: not a file: ${target}`
    if (stat.size > MAX_FILE_BYTES) {
      return (
        `Error: file is ${Math.round(stat.size / 1024)}KB which exceeds the 500KB limit. ` +
        `Use start_line and end_line to read a specific section.`
      )
    }

    const content = readFileSync(target, 'utf8')

    if (args.start_line !== undefined || args.end_line !== undefined) {
      const lines = content.split('\n')
      const start = Math.max(0, (args.start_line ?? 1) - 1)
      const end = args.end_line ?? lines.length
      return lines.slice(start, end).join('\n')
    }

    return content
  } catch (err) {
    return `Error: ${(err as Error).message}`
  }
}

// search_files — regex search across files in a directory, returns matched lines with location
export async function searchFiles(args: {
  pattern: string
  directory: string
  file_pattern?: string
}, sandbox?: string): Promise<string> {
  const r = resolvePath(args.directory, sandbox)
  if ('error' in r) return r.error
  const target = r.path
  if (!existsSync(target)) return `Error: directory does not exist: ${target}`

  let regex: RegExp
  try {
    regex = new RegExp(args.pattern, 'i')
  } catch {
    return `Error: invalid regex pattern: ${args.pattern}`
  }

  const results: string[] = []

  function searchDir(dir: string, depth: number) {
    if (depth > MAX_DEPTH || results.length >= MAX_SEARCH_RESULTS) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        searchDir(fullPath, depth + 1)
      } else if (entry.isFile()) {
        if (args.file_pattern && !matchGlob(entry.name, args.file_pattern)) continue
        try {
          const stat = statSync(fullPath)
          if (stat.size > MAX_FILE_BYTES) return
          const content = readFileSync(fullPath, 'utf8')
          const lines = content.split('\n')
          for (let i = 0; i < lines.length && results.length < MAX_SEARCH_RESULTS; i++) {
            if (regex.test(lines[i])) {
              const rel = relative(target, fullPath)
              results.push(`${rel}:${i + 1}: ${lines[i].trim()}`)
            }
          }
        } catch { /* skip unreadable */ }
      }
    }
  }

  searchDir(target, 0)
  if (results.length === 0) return 'No matches found'
  if (results.length >= MAX_SEARCH_RESULTS) results.push(`... (truncated at ${MAX_SEARCH_RESULTS} results)`)
  return results.join('\n')
}

function matchGlob(filename: string, pattern: string): boolean {
  const re = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
  )
  return re.test(filename)
}

// get_file_info — size, type, modification time, child count for directories
export async function getFileInfo(args: { path: string }, sandbox?: string): Promise<string> {
  const r = resolvePath(args.path, sandbox)
  if ('error' in r) return r.error
  const target = r.path
  if (!existsSync(target)) return `Error: path does not exist: ${target}`

  try {
    const stat = statSync(target)
    const type = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other'
    const lines = [
      `path:     ${target}`,
      `type:     ${type}`,
      `size:     ${stat.size} bytes`,
      `modified: ${new Date(stat.mtimeMs).toISOString()}`,
    ]
    if (type === 'directory') {
      const children = readdirSync(target)
      lines.push(`children: ${children.length}`)
    }
    return lines.join('\n')
  } catch (err) {
    return `Error: ${(err as Error).message}`
  }
}
