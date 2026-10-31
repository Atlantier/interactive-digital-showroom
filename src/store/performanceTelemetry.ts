export interface PerformanceTelemetrySnapshot {
  fps: number
  frameTimeMs: number
  activeParticles: number
  physicsSolveMs: number
  memoryMb: number | null
  memorySupported: boolean
}

export interface MemoryHistoryWindow {
  values: Float32Array
  count: number
  start: number
  maximum: number
}

const MEMORY_HISTORY_LENGTH = 64

const metrics: PerformanceTelemetrySnapshot = {
  fps: 0,
  frameTimeMs: 0,
  activeParticles: 0,
  physicsSolveMs: 0,
  memoryMb: null,
  memorySupported: false,
}

const memoryWindow: MemoryHistoryWindow = {
  values: new Float32Array(MEMORY_HISTORY_LENGTH),
  count: 0,
  start: 0,
  maximum: 1,
}

let memoryCursor = 0
let physicsTotalMs = 0
let physicsSamples = 0

export function recordPhysicsSolveTime(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return
  physicsTotalMs += durationMs
  physicsSamples += 1
}

export function publishFrameTelemetry(
  fps: number,
  frameTimeMs: number,
) {
  metrics.fps = Math.max(0, Math.round(fps))
  metrics.frameTimeMs = Math.max(0, frameTimeMs)
  metrics.physicsSolveMs =
    physicsSamples > 0 ? physicsTotalMs / physicsSamples : 0
  physicsTotalMs = 0
  physicsSamples = 0
}

export function setActiveParticleCount(count: number) {
  metrics.activeParticles = Math.max(0, Math.round(count))
}

export function recordMemoryUsage(memoryMb: number | null) {
  if (memoryMb === null || !Number.isFinite(memoryMb)) {
    metrics.memorySupported = false
    metrics.memoryMb = null
    return
  }

  metrics.memorySupported = true
  metrics.memoryMb = Math.max(0, memoryMb)
  memoryWindow.values[memoryCursor] = metrics.memoryMb
  memoryCursor = (memoryCursor + 1) % MEMORY_HISTORY_LENGTH
  memoryWindow.count = Math.min(
    MEMORY_HISTORY_LENGTH,
    memoryWindow.count + 1,
  )
  memoryWindow.start =
    memoryWindow.count === MEMORY_HISTORY_LENGTH ? memoryCursor : 0

  let maximum = 1
  for (let index = 0; index < memoryWindow.count; index += 1) {
    const sampleIndex =
      (memoryWindow.start + index) % MEMORY_HISTORY_LENGTH
    maximum = Math.max(maximum, memoryWindow.values[sampleIndex])
  }
  memoryWindow.maximum = maximum * 1.12
}

export function readPerformanceTelemetry() {
  return metrics
}

export function readMemoryHistoryWindow() {
  return memoryWindow
}
