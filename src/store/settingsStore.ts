import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type FontSize = 'sm' | 'md' | 'lg'
export type UiScale = 90 | 100 | 110

interface SettingsState {
  fontSize: FontSize
  uiScale: UiScale
  reducedMotion: boolean
  setFontSize: (v: FontSize) => void
  setUiScale: (v: UiScale) => void
  setReducedMotion: (v: boolean) => void
}

const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      fontSize: 'md',
      uiScale: 100,
      reducedMotion: false,
      setFontSize: (fontSize) => set({ fontSize }),
      setUiScale: (uiScale) => set({ uiScale }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
    }),
    { name: 'agentmesh-settings' },
  ),
)

export const useFontSize = () => useSettingsStore((s) => s.fontSize)
export const useUiScale = () => useSettingsStore((s) => s.uiScale)
export const useReducedMotion = () => useSettingsStore((s) => s.reducedMotion)
export const useSetFontSize = () => useSettingsStore((s) => s.setFontSize)
export const useSetUiScale = () => useSettingsStore((s) => s.setUiScale)
export const useSetReducedMotion = () => useSettingsStore((s) => s.setReducedMotion)

export default useSettingsStore
