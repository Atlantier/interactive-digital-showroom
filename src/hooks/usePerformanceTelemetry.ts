import { useEffect } from 'react'
import {
  publishFrameTelemetry,
  recordMemoryUsage,
} from '../store/performanceTelemetry'
import { useAppStore } from '../store/useAppStore'

type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize: number
  }
}

const SAMPLE_INTERVAL_MS = 500
const MEMORY_SAMPLE_INTERVAL_MS = 1_500

export function usePerformanceTelemetry() {
  useEffect(() => {
    let animationFrame = 0
    let sampleStartedAt = performance.now()
    let lastMemorySampleAt = Number.NEGATIVE_INFINITY
    let frames = 0

    const sampleMemory = (timestamp: number) => {
      if (timestamp - lastMemorySampleAt < MEMORY_SAMPLE_INTERVAL_MS) {
        return
      }

      lastMemorySampleAt = timestamp
      const memory = (performance as PerformanceWithMemory).memory
      recordMemoryUsage(
        memory ? memory.usedJSHeapSize / (1024 * 1024) : null,
      )
    }

    const tick = (timestamp: number) => {
      frames += 1

      const elapsed = timestamp - sampleStartedAt
      if (elapsed >= SAMPLE_INTERVAL_MS) {
        const fps = (frames * 1_000) / elapsed
        publishFrameTelemetry(fps, elapsed / frames)
        if (useAppStore.getState().fpsMonitorEnabled) {
          useAppStore.getState().setFps(Math.round(fps))
        }
        frames = 0
        sampleStartedAt = timestamp
        sampleMemory(timestamp)
      }

      animationFrame = requestAnimationFrame(tick)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      const now = performance.now()
      sampleStartedAt = now
      frames = 0
    }

    animationFrame = requestAnimationFrame(tick)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelAnimationFrame(animationFrame)
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
    }
  }, [])
}
