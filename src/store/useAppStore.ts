import { create } from 'zustand'
import type {
  AccentTheme,
  GravityMode,
} from '../data/preferences'
import type { VfxPreset } from '../data/vfxPresets'

export type PerformanceTier = 'high' | 'medium'

export interface TransientPointer {
  x: number
  y: number
}

export interface TransientPointerPixels {
  x: number
  y: number
}

export interface TransientState {
  pointer: TransientPointer
  pointerPixels: TransientPointerPixels
  pointerVelocity: TransientPointer
  pointerAcceleration: TransientPointer
  pointerActive: boolean
  pointerUpdatedAt: number
  scrollProgress: number
  scrollVelocity: number
  vscroll: number
}

interface AppState {
  soundEnabled: boolean
  performanceTier: PerformanceTier
  activeSection: string
  fpsMonitorEnabled: boolean
  telemetryOpen: boolean
  commandPaletteOpen: boolean
  qualityNoticeVisible: boolean
  accentTheme: AccentTheme
  vfxPreset: VfxPreset
  gravityMode: GravityMode
  fps: number
  transient: TransientState
  setSoundEnabled: (enabled: boolean) => void
  toggleSound: () => void
  setPerformanceTier: (tier: PerformanceTier) => void
  applyPerformanceDowngrade: () => void
  setActiveSection: (section: string) => void
  toggleFpsMonitor: () => void
  toggleTelemetry: () => void
  setTelemetryOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setAccentTheme: (theme: AccentTheme) => void
  setVfxPreset: (preset: VfxPreset) => void
  setGravityMode: (mode: GravityMode) => void
  dismissQualityNotice: () => void
  setFps: (fps: number) => void
  updatePointer: (
    normalizedX: number,
    normalizedY: number,
    pixelX: number,
    pixelY: number,
  ) => void
  setPointerActive: (active: boolean) => void
  updateScroll: (progress: number, velocity: number) => void
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function detectPerformanceTier(): PerformanceTier {
  if (typeof window === 'undefined') return 'high'

  const navigatorWithMemory = window.navigator as Navigator & {
    deviceMemory?: number
  }
  const limitedCpu =
    (window.navigator.hardwareConcurrency ?? 8) <= 4
  const limitedMemory =
    (navigatorWithMemory.deviceMemory ?? 8) <= 4
  const effectivePixelBudget =
    window.innerWidth *
    window.innerHeight *
    Math.min(window.devicePixelRatio || 1, 2) ** 2

  return limitedCpu || limitedMemory || effectivePixelBudget >= 6_500_000
    ? 'medium'
    : 'high'
}

// Stable mutable reference: frame-rate writes never notify Zustand subscribers.
const transientState: TransientState = {
  pointer: { x: 0, y: 0 },
  pointerPixels: { x: 0, y: 0 },
  pointerVelocity: { x: 0, y: 0 },
  pointerAcceleration: { x: 0, y: 0 },
  pointerActive: false,
  pointerUpdatedAt: 0,
  scrollProgress: 0,
  scrollVelocity: 0,
  vscroll: 0,
}

export const useAppStore = create<AppState>((set) => ({
  soundEnabled: false,
  performanceTier: detectPerformanceTier(),
  activeSection: 'home',
  fpsMonitorEnabled: false,
  telemetryOpen: false,
  commandPaletteOpen: false,
  qualityNoticeVisible: false,
  accentTheme: 'emerald',
  vfxPreset: 'emerald-cyber',
  gravityMode: 'moon',
  fps: 0,
  transient: transientState,
  setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
  setPerformanceTier: (performanceTier) => set({ performanceTier }),
  applyPerformanceDowngrade: () =>
    set((state) =>
      state.performanceTier === 'high'
        ? {
            performanceTier: 'medium',
            qualityNoticeVisible: true,
          }
        : {},
    ),
  setActiveSection: (activeSection) => set({ activeSection }),
  toggleFpsMonitor: () =>
    set((state) => ({ fpsMonitorEnabled: !state.fpsMonitorEnabled })),
  toggleTelemetry: () =>
    set((state) => ({ telemetryOpen: !state.telemetryOpen })),
  setTelemetryOpen: (telemetryOpen) => set({ telemetryOpen }),
  toggleCommandPalette: () =>
    set((state) => ({
      commandPaletteOpen: !state.commandPaletteOpen,
    })),
  setCommandPaletteOpen: (commandPaletteOpen) =>
    set({ commandPaletteOpen }),
  setAccentTheme: (accentTheme) => set({ accentTheme }),
  setVfxPreset: (vfxPreset) => set({ vfxPreset }),
  setGravityMode: (gravityMode) => set({ gravityMode }),
  dismissQualityNotice: () => set({ qualityNoticeVisible: false }),
  setFps: (fps) => set({ fps }),
  updatePointer: (normalizedX, normalizedY, pixelX, pixelY) => {
    const now = performance.now()
    const elapsed =
      transientState.pointerUpdatedAt > 0
        ? Math.max(
            8,
            now - transientState.pointerUpdatedAt,
          ) / 1_000
        : 0
    const nextX = clamp(normalizedX, -1, 1)
    const nextY = clamp(normalizedY, -1, 1)

    if (elapsed > 0) {
      const previousVelocityX =
        transientState.pointerVelocity.x
      const previousVelocityY =
        transientState.pointerVelocity.y
      const velocityX = clamp(
        (nextX - transientState.pointer.x) / elapsed,
        -12,
        12,
      )
      const velocityY = clamp(
        (nextY - transientState.pointer.y) / elapsed,
        -12,
        12,
      )
      transientState.pointerAcceleration.x = clamp(
        (velocityX - previousVelocityX) / elapsed,
        -320,
        320,
      )
      transientState.pointerAcceleration.y = clamp(
        (velocityY - previousVelocityY) / elapsed,
        -320,
        320,
      )
      transientState.pointerVelocity.x = velocityX
      transientState.pointerVelocity.y = velocityY
    } else {
      transientState.pointerVelocity.x = 0
      transientState.pointerVelocity.y = 0
      transientState.pointerAcceleration.x = 0
      transientState.pointerAcceleration.y = 0
    }

    transientState.pointer.x = nextX
    transientState.pointer.y = nextY
    transientState.pointerPixels.x = pixelX
    transientState.pointerPixels.y = pixelY
    transientState.pointerActive = true
    transientState.pointerUpdatedAt = now
  },
  setPointerActive: (pointerActive) => {
    transientState.pointerActive = pointerActive
    if (!pointerActive) {
      transientState.pointerVelocity.x = 0
      transientState.pointerVelocity.y = 0
      transientState.pointerAcceleration.x = 0
      transientState.pointerAcceleration.y = 0
    }
  },
  updateScroll: (progress, velocity) => {
    transientState.scrollProgress = clamp(progress, 0, 1)
    transientState.scrollVelocity = velocity
    transientState.vscroll = velocity
  },
}))

export const readTransientState = () => transientState
