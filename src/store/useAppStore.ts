import { create } from 'zustand'
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from 'zustand/middleware'
import type {
  AccentTheme,
  GravityMode,
} from '../data/preferences'
import {
  ACCENT_THEMES,
  GRAVITY_MODES,
} from '../data/preferences'
import {
  VFX_PRESETS,
  type VfxPreset,
} from '../data/vfxPresets'

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

export interface VisualPreferences {
  accentTheme: AccentTheme
  vfxPreset: VfxPreset
  gravityMode: GravityMode
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

export const VISUAL_PREFERENCES_STORAGE_KEY =
  'node01:visual-preferences'

const DEFAULT_VISUAL_PREFERENCES: VisualPreferences = {
  accentTheme: 'emerald',
  vfxPreset: 'emerald-cyber',
  gravityMode: 'moon',
}

function isAccentTheme(value: unknown): value is AccentTheme {
  return ACCENT_THEMES.some((theme) => theme.id === value)
}

function isVfxPreset(value: unknown): value is VfxPreset {
  return VFX_PRESETS.some((preset) => preset.id === value)
}

function isGravityMode(value: unknown): value is GravityMode {
  return GRAVITY_MODES.some((mode) => mode.id === value)
}

export function sanitizeVisualPreferences(
  value: unknown,
): VisualPreferences {
  const candidate =
    value && typeof value === 'object'
      ? (value as Partial<VisualPreferences>)
      : {}

  return {
    accentTheme: isAccentTheme(candidate.accentTheme)
      ? candidate.accentTheme
      : DEFAULT_VISUAL_PREFERENCES.accentTheme,
    vfxPreset: isVfxPreset(candidate.vfxPreset)
      ? candidate.vfxPreset
      : DEFAULT_VISUAL_PREFERENCES.vfxPreset,
    gravityMode: isGravityMode(candidate.gravityMode)
      ? candidate.gravityMode
      : DEFAULT_VISUAL_PREFERENCES.gravityMode,
  }
}

const memoryStorageValues = new Map<string, string>()
const memoryStorage: StateStorage = {
  getItem: (name) => memoryStorageValues.get(name) ?? null,
  setItem: (name, value) => {
    memoryStorageValues.set(name, value)
  },
  removeItem: (name) => {
    memoryStorageValues.delete(name)
  },
}

function getVisualPreferenceStorage() {
  if (typeof window === 'undefined') return memoryStorage
  try {
    return window.localStorage
  } catch {
    return memoryStorage
  }
}

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

export const useAppStore = create<AppState>()(
  persist<AppState, [], [], VisualPreferences>(
    (set) => ({
      soundEnabled: false,
      performanceTier: detectPerformanceTier(),
      activeSection: 'home',
      fpsMonitorEnabled: false,
      telemetryOpen: false,
      commandPaletteOpen: false,
      qualityNoticeVisible: false,
      accentTheme: DEFAULT_VISUAL_PREFERENCES.accentTheme,
      vfxPreset: DEFAULT_VISUAL_PREFERENCES.vfxPreset,
      gravityMode: DEFAULT_VISUAL_PREFERENCES.gravityMode,
      fps: 0,
      transient: transientState,
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      toggleSound: () =>
        set((state) => ({ soundEnabled: !state.soundEnabled })),
      setPerformanceTier: (performanceTier) =>
        set({ performanceTier }),
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
        set((state) => ({
          fpsMonitorEnabled: !state.fpsMonitorEnabled,
        })),
      toggleTelemetry: () =>
        set((state) => ({
          telemetryOpen: !state.telemetryOpen,
        })),
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
      dismissQualityNotice: () =>
        set({ qualityNoticeVisible: false }),
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
    }),
    {
      name: VISUAL_PREFERENCES_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage<VisualPreferences>(
        getVisualPreferenceStorage,
      ),
      partialize: (state): VisualPreferences => ({
        accentTheme: state.accentTheme,
        vfxPreset: state.vfxPreset,
        gravityMode: state.gravityMode,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizeVisualPreferences(persistedState),
      }),
    },
  ),
)

export const readTransientState = () => transientState
