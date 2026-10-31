import { create } from 'zustand'
import type {
  AccentTheme,
  GravityMode,
} from '../data/preferences'

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
  pointerActive: boolean
  scrollProgress: number
  scrollVelocity: number
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
  pointerActive: false,
  scrollProgress: 0,
  scrollVelocity: 0,
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
  setGravityMode: (gravityMode) => set({ gravityMode }),
  dismissQualityNotice: () => set({ qualityNoticeVisible: false }),
  setFps: (fps) => set({ fps }),
  updatePointer: (normalizedX, normalizedY, pixelX, pixelY) => {
    transientState.pointer.x = clamp(normalizedX, -1, 1)
    transientState.pointer.y = clamp(normalizedY, -1, 1)
    transientState.pointerPixels.x = pixelX
    transientState.pointerPixels.y = pixelY
    transientState.pointerActive = true
  },
  setPointerActive: (pointerActive) => {
    transientState.pointerActive = pointerActive
  },
  updateScroll: (progress, velocity) => {
    transientState.scrollProgress = clamp(progress, 0, 1)
    transientState.scrollVelocity = velocity
  },
}))

export const readTransientState = () => transientState
