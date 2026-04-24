import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '../shared/types.js'
import type { SkillManifest } from '../shared/types.js'

contextBridge.exposeInMainWorld('agentmesh', {
  getServerPort: () => ipcRenderer.invoke(IpcChannel.GET_SERVER_PORT),
  winMinimize: () => ipcRenderer.send('win:minimize'),
  winMaximize: () => ipcRenderer.send('win:maximize'),
  winClose: () => ipcRenderer.send('win:close'),
  skillSave: (manifest: SkillManifest) => ipcRenderer.invoke(IpcChannel.SKILL_SAVE, manifest),
  skillDelete: (id: string) => ipcRenderer.invoke(IpcChannel.SKILL_DELETE, id),
  skillReadRaw: (id: string) => ipcRenderer.invoke(IpcChannel.SKILL_READ_RAW, id),
})
