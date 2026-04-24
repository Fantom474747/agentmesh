// Launches electron-vite dev with ELECTRON_RUN_AS_NODE unset.
// Invokes the CLI directly via process.execPath to avoid .cmd spawn issues on Windows.
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const cli = resolve(__dirname, '../node_modules/electron-vite/bin/electron-vite.js')
const child = spawn(process.execPath, [cli, 'dev'], {
  stdio: 'inherit',
  env,
  shell: false,
})

child.on('exit', (code) => process.exit(code ?? 0))
