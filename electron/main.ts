import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { mkdirSync, writeFileSync, rmSync, existsSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { initDb } from './db.js'
import { startServer, emit, getSkillsDir, reloadSkills } from './server/index.js'
import { buildSkillMd, buildSkillYaml, readSkillRaw } from './server/skills.js'
import { startHealthChecks } from './agents/registry.js'
import { IpcChannel } from '../shared/types.js'
import type { SkillManifest } from '../shared/types.js'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let serverPort = 4321

process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason)
})

function seedSkillsIfNeeded(): void {
  const dest = getSkillsDir()
  if (existsSync(dest)) return
  const seedSrc = app.isPackaged
    ? join(process.resourcesPath, 'skills')
    : join(__dirname, '../../skills')
  mkdirSync(dest, { recursive: true })
  cpSync(seedSrc, dest, { recursive: true })
}

async function createWindow(): Promise<void> {
  seedSkillsIfNeeded()
  await initDb()
  serverPort = await startServer()

  startHealthChecks((id, status) => {
    emit('agent_status', { id, status })
    mainWindow?.webContents.send(IpcChannel.AGENT_UPDATE, { id, status })
  })

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../build/icons/icon.png')

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
    show: false,
  })

  // IPC handlers
  ipcMain.handle(IpcChannel.GET_SERVER_PORT, () => serverPort)
  ipcMain.handle(IpcChannel.GET_USERDATA_PATH, () => app.getPath('userData'))
  ipcMain.on('win:minimize', () => mainWindow?.minimize())
  ipcMain.on('win:maximize', () => {
    mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize()
  })
  ipcMain.on('win:close', () => mainWindow?.close())

  ipcMain.handle(IpcChannel.SKILL_SAVE, (_event, manifest: SkillManifest) => {
    if (/[/\\.]/.test(manifest.id)) throw new Error('Invalid skill id')
    const dir = join(getSkillsDir(), manifest.id)
    mkdirSync(dir, { recursive: true })
    if (manifest.source === 'markdown') {
      writeFileSync(join(dir, 'SKILL.md'), buildSkillMd(manifest), 'utf8')
    } else {
      writeFileSync(join(dir, 'manifest.yaml'), buildSkillYaml(manifest), 'utf8')
    }
    reloadSkills()
  })

  ipcMain.handle(IpcChannel.SKILL_READ_RAW, (_event, id: string) => {
    if (/[/\\.]/.test(id)) throw new Error('Invalid skill id')
    const result = readSkillRaw(getSkillsDir(), id)
    if (!result) throw new Error(`Skill not found: ${id}`)
    return result
  })

  ipcMain.handle(IpcChannel.SKILL_DELETE, (_event, id: string) => {
    if (/[/\\.]/.test(id)) throw new Error('Invalid skill id')
    rmSync(join(getSkillsDir(), id), { recursive: true, force: true })
    reloadSkills()
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (isDev) mainWindow?.webContents.openDevTools()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
