import { create } from 'zustand'

type WsStatus = 'disconnected' | 'connecting' | 'connected'

interface UiState {
  wsStatus: WsStatus
  serverPort: number
  setWsStatus: (status: WsStatus) => void
  setServerPort: (port: number) => void
}

const useUiStore = create<UiState>((set) => ({
  wsStatus: 'disconnected',
  serverPort: 4321,
  setWsStatus: (status) => set({ wsStatus: status }),
  setServerPort: (port) => set({ serverPort: port }),
}))

export const useWsStatus = () => useUiStore((s) => s.wsStatus)
export const useServerPort = () => useUiStore((s) => s.serverPort)
export const useSetWsStatus = () => useUiStore((s) => s.setWsStatus)
export const useSetServerPort = () => useUiStore((s) => s.setServerPort)

export default useUiStore
