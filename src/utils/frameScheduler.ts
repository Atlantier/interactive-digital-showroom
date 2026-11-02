import { diagnosticsEnabled } from './diagnostics'

type FrameCallback = (
  timestamp: number,
  deltaMs: number,
) => void

const callbacks = new Set<FrameCallback>()

let animationFrame = 0
let lastTimestamp = 0
let visibilityListenerAttached = false

function updateDiagnostics() {
  if (!diagnosticsEnabled) return
  const root = document.documentElement
  root.dataset.frameSubscribers = String(callbacks.size)
  root.dataset.frameActive =
    animationFrame > 0 ? 'true' : 'false'
}

function scheduleFrame() {
  if (
    animationFrame !== 0 ||
    callbacks.size === 0 ||
    document.visibilityState === 'hidden'
  ) {
    updateDiagnostics()
    return
  }

  animationFrame = window.requestAnimationFrame(runFrame)
  updateDiagnostics()
}

function runFrame(timestamp: number) {
  animationFrame = 0
  if (
    callbacks.size === 0 ||
    document.visibilityState === 'hidden'
  ) {
    updateDiagnostics()
    return
  }

  const deltaMs =
    lastTimestamp === 0
      ? 0
      : Math.min(250, timestamp - lastTimestamp)
  lastTimestamp = timestamp

  callbacks.forEach((callback) => callback(timestamp, deltaMs))
  scheduleFrame()
}

function handleVisibilityChange() {
  lastTimestamp = 0
  if (document.visibilityState === 'hidden') {
    if (animationFrame !== 0) {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = 0
    }
    updateDiagnostics()
    return
  }
  scheduleFrame()
}

function ensureVisibilityListener() {
  if (visibilityListenerAttached) return
  visibilityListenerAttached = true
  document.addEventListener(
    'visibilitychange',
    handleVisibilityChange,
  )
}

export function subscribeFrame(callback: FrameCallback) {
  ensureVisibilityListener()
  callbacks.add(callback)
  scheduleFrame()

  return () => {
    callbacks.delete(callback)
    if (callbacks.size === 0 && animationFrame !== 0) {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = 0
      lastTimestamp = 0
    }
    updateDiagnostics()
  }
}
