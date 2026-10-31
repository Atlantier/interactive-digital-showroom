import { useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import { soundEngine } from '../utils/soundEngine'

type SoundKind = 'hover' | 'navigate' | 'toggle'

export function useInterfaceSound() {
  const soundEnabled = useAppStore((state) => state.soundEnabled)

  return useCallback(
    (kind: SoundKind, forceEnabled?: boolean) => {
      const enabled = forceEnabled ?? soundEnabled
      if (!enabled) return

      void soundEngine.unlock()
      if (kind === 'hover') {
        soundEngine.playHoverTick()
      } else {
        soundEngine.playCardActivate()
      }
    },
    [soundEnabled],
  )
}
