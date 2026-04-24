import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { app } from 'electron'

let _db: Database | null = null
let _dbPath = ''

function db(): Database {
  if (!_db) throw new Error('DB not initialized — call initDb() first')
  return _db
}

function save(): void {
  writeFileSync(_dbPath, Buffer.from(db().export()))
}

export async function initDb(): Promise<void> {
  let SQL: SqlJsStatic
  try {
    SQL = await initSqlJs({
      locateFile: (file: string) =>
        app.isPackaged
          ? join(process.resourcesPath, file)
          : join(__dirname, '../../node_modules/sql.js/dist', file),
    })
  } catch {
    // Fall back to asm.js variant (no WASM file needed)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SQL = await (require('sql.js/dist/sql-asm.js') as () => Promise<SqlJsStatic>)()
  }

  _dbPath = app.isPackaged
    ? join(app.getPath('userData'), 'agentmesh.db')
    : join(process.cwd(), 'dev.db')

  mkdirSync(dirname(_dbPath), { recursive: true })
  const buf = existsSync(_dbPath) ? readFileSync(_dbPath) : undefined
  _db = buf ? new SQL.Database(buf) : new SQL.Database()

  migrate()
  save()
}

function migrate(): void {
  db().run(`CREATE TABLE IF NOT EXISTS agents (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL,
    endpoint   TEXT,
    skills     TEXT NOT NULL DEFAULT '[]',
    status     TEXT NOT NULL DEFAULT 'unknown',
    last_seen  INTEGER,
    config     TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  )`)

  db().run(`CREATE TABLE IF NOT EXISTS tasks (
    id           TEXT PRIMARY KEY,
    skill        TEXT NOT NULL,
    input        TEXT NOT NULL,
    agent_id     TEXT,
    status       TEXT NOT NULL DEFAULT 'pending',
    result       TEXT,
    error        TEXT,
    created_at   INTEGER NOT NULL,
    completed_at INTEGER
  )`)

  db().run(`CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks (agent_id)`)
}

export function dbRun(sql: string, params: unknown[] = []): void {
  db().run(sql, params as Parameters<Database['run']>[1])
  save()
}

export function dbGet<T>(sql: string, params: unknown[] = []): T | undefined {
  const stmt = db().prepare(sql)
  stmt.bind(params as Parameters<Database['run']>[1])
  const row = stmt.step() ? (stmt.getAsObject() as unknown as T) : undefined
  stmt.free()
  return row
}

export function dbAll<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = db().prepare(sql)
  stmt.bind(params as Parameters<Database['run']>[1])
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as T)
  stmt.free()
  return rows
}
