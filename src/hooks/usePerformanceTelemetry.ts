import { useEffect } from 'react'
import {
  publishFrameTelemetry,
  recordMemoryUsage,
} from '../store/performanceTelemetry'
import { useAppStore } from '../store/useAppStore'
import { subscribeFrame } from '../utils/frameScheduler'

type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize: number
  }
}

const SAMPLE_INTERVAL_MS = 500
const MEMORY_SAMPLE_INTERVAL_MS = 1_500

export function usePerformanceTelemetry() {
  useEffect(() => {
    let lastMemorySampleAt = Number.NEGATIVE_INFINITY
    let frames = 0
    let sampledFrameTime = 0

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

    const unsubscribeFrame = subscribeFrame(
      (timestamp, deltaMs) => {
        if (deltaMs > 0) {
          frames += 1
          sampledFrameTime += deltaMs
        }

        if (sampledFrameTime >= SAMPLE_INTERVAL_MS) {
          const fps = (frames * 1_000) / sampledFrameTime
          publishFrameTelemetry(
            fps,
            sampledFrameTime / frames,
          )
          if (useAppStore.getState().fpsMonitorEnabled) {
            useAppStore.getState().setFps(Math.round(fps))
          }
          frames = 0
          sampledFrameTime = 0
          sampleMemory(timestamp)
        }
      },
    )

    return () => {
      unsubscribeFrame()
    }
  }, [])
}
