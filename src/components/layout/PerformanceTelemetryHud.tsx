import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  Cpu,
  Gauge,
  Layers3,
  Palette,
  Timer,
  X,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import {
  readMemoryHistoryWindow,
  readPerformanceTelemetry,
} from '../../store/performanceTelemetry'
import { useAppStore } from '../../store/useAppStore'
import { getVfxPreset } from '../../data/vfxPresets'

const GRAPH_WIDTH = 280
const GRAPH_HEIGHT = 52

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        'input, textarea, select, [contenteditable="true"], [role="textbox"]',
      ),
    )
  )
}

export function PerformanceTelemetryHud() {
  const open = useAppStore((state) => state.telemetryOpen)
  const performanceTier = useAppStore((state) => state.performanceTier)
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const setTelemetryOpen = useAppStore((state) => state.setTelemetryOpen)
  const reducedMotion = useReducedMotion()
  const fpsRef = useRef<HTMLSpanElement>(null)
  const frameTimeRef = useRef<HTMLSpanElement>(null)
  const particlesRef = useRef<HTMLSpanElement>(null)
  const shaderPassesRef = useRef<HTMLSpanElement>(null)
  const physicsRef = useRef<HTMLSpanElement>(null)
  const memoryRef = useRef<HTMLSpanElement>(null)
  const memoryPathRef = useRef<SVGPathElement>(null)
  const statusRef = useRef<HTMLSpanElement>(null)
  const vfxConfig = getVfxPreset(vfxPreset)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !event.shiftKey ||
        event.key.toLowerCase() !== 'd' ||
        isEditableTarget(event.target)
      ) {
        return
      }

      event.preventDefault()
      useAppStore.getState().toggleTelemetry()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return

    let animationFrame = 0
    let lastFps = -1
    let lastFrameTime = -1
    let lastParticles = -1
    let lastShaderPasses = -1
    let lastPhysics = -1
    let lastMemory = Number.NaN
    let lastMemoryStart = -1
    let lastMemoryCount = -1
    let lastHealth = ''
    const draw = () => {
      const metrics = readPerformanceTelemetry()
      const memory = readMemoryHistoryWindow()

      if (metrics.fps !== lastFps && fpsRef.current) {
        lastFps = metrics.fps
        fpsRef.current.textContent = String(metrics.fps || '--')
      }
      if (
        metrics.frameTimeMs !== lastFrameTime &&
        frameTimeRef.current
      ) {
        lastFrameTime = metrics.frameTimeMs
        frameTimeRef.current.textContent =
          metrics.frameTimeMs > 0
            ? metrics.frameTimeMs.toFixed(1)
            : '--'
      }
      if (
        metrics.activeParticles !== lastParticles &&
        particlesRef.current
      ) {
        lastParticles = metrics.activeParticles
        particlesRef.current.textContent =
          metrics.activeParticles.toLocaleString('en-US')
      }
      if (
        metrics.shaderPasses !== lastShaderPasses &&
        shaderPassesRef.current
      ) {
        lastShaderPasses = metrics.shaderPasses
        shaderPassesRef.current.textContent = String(
          metrics.shaderPasses,
        )
      }
      if (
        metrics.physicsSolveMs !== lastPhysics &&
        physicsRef.current
      ) {
        lastPhysics = metrics.physicsSolveMs
        physicsRef.current.textContent =
          metrics.physicsSolveMs > 0
            ? metrics.physicsSolveMs.toFixed(2)
            : '0.00'
      }
      if (metrics.memoryMb !== lastMemory && memoryRef.current) {
        lastMemory = metrics.memoryMb ?? Number.NaN
        memoryRef.current.textContent = metrics.memorySupported
          ? `${(metrics.memoryMb ?? 0).toFixed(1)} MB`
          : 'N/A'
      }

      if (
        memoryPathRef.current &&
        (memory.start !== lastMemoryStart ||
          memory.count !== lastMemoryCount)
      ) {
        lastMemoryStart = memory.start
        lastMemoryCount = memory.count
        if (memory.count < 2) {
          memoryPathRef.current.setAttribute(
            'd',
            `M0 ${GRAPH_HEIGHT - 2} L${GRAPH_WIDTH} ${GRAPH_HEIGHT - 2}`,
          )
        } else {
          let path = ''
          for (let index = 0; index < memory.count; index += 1) {
            const value =
              memory.values[
                (memory.start + index) % memory.values.length
              ]
            const x =
              (index / (memory.count - 1)) * GRAPH_WIDTH
            const y = Math.min(
              GRAPH_HEIGHT - 3,
              Math.max(
                3,
                GRAPH_HEIGHT -
                  (value / memory.maximum) * (GRAPH_HEIGHT - 6),
              ),
            )
            path += `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
          }
          memoryPathRef.current.setAttribute('d', path)
        }
      }

      const health =
        metrics.fps >= 50
          ? 'nominal'
          : metrics.fps >= 40
            ? 'guarded'
            : 'limited'
      if (statusRef.current && health !== lastHealth) {
        lastHealth = health
        statusRef.current.dataset.health = health
      }
      animationFrame = requestAnimationFrame(draw)
    }

    animationFrame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animationFrame)
  }, [open])

  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          data-telemetry-hud
          aria-label="开发者性能遥测面板"
          initial={reducedMotion ? false : { opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.985 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="fixed right-3 top-[82px] z-[60] w-[calc(100%-1.5rem)] max-w-[380px] overflow-hidden rounded-md border border-signal/20 bg-[#05090f]/92 font-mono shadow-[0_28px_90px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(114,230,255,0.06)] backdrop-blur-2xl sm:right-5 sm:top-[88px]"
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal/70 to-transparent"
          />
          <header className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center border border-signal/25 bg-signal/[0.08] text-signal">
                <Gauge size={14} strokeWidth={1.6} />
              </span>
              <div>
                <p className="text-[9px] tracking-[0.18em] text-signal">
                  RUNTIME TELEMETRY
                </p>
                <p className="mt-1 text-[8px] text-mist/38">
                  SHIFT + D / LIVE 500 MS SAMPLE
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="关闭性能遥测面板"
              title="关闭性能遥测面板"
              onClick={() => setTelemetryOpen(false)}
              className="grid size-7 place-items-center border border-white/10 text-mist/55 transition-colors hover:border-white/25 hover:text-frost"
            >
              <X size={13} strokeWidth={1.7} />
            </button>
          </header>

          <div className="grid grid-cols-2 gap-px bg-white/[0.06]">
            <div className="bg-[#05090f] px-4 py-3">
              <p className="flex items-center gap-1.5 text-[8px] text-mist/42">
                <Activity size={9} /> CURRENT FPS
              </p>
              <p className="mt-2 flex items-end gap-1.5">
                <span
                  ref={fpsRef}
                  data-telemetry-fps
                  className="text-2xl leading-none text-frost"
                >
                  --
                </span>
                <span className="pb-0.5 text-[8px] text-mist/40">FPS</span>
              </p>
            </div>
            <div className="bg-[#05090f] px-4 py-3">
              <p className="flex items-center gap-1.5 text-[8px] text-mist/42">
                <Timer size={9} /> FRAME TIME
              </p>
              <p className="mt-2 flex items-end gap-1.5">
                <span
                  ref={frameTimeRef}
                  data-telemetry-frame-time
                  className="text-2xl leading-none text-frost"
                >
                  --
                </span>
                <span className="pb-0.5 text-[8px] text-mist/40">MS</span>
              </p>
            </div>
            <div className="bg-[#05090f] px-4 py-3">
              <p className="flex items-center gap-1.5 text-[8px] text-mist/42">
                <Cpu size={9} /> ACTIVE PARTICLES
              </p>
              <span
                ref={particlesRef}
                data-telemetry-particles
                className="mt-2 block text-lg text-signal"
              >
                0
              </span>
            </div>
            <div className="bg-[#05090f] px-4 py-3">
              <p className="flex items-center gap-1.5 text-[8px] text-mist/42">
                <Timer size={9} /> PHYSICS SOLVE
              </p>
              <p className="mt-2 flex items-end gap-1.5">
                <span
                  ref={physicsRef}
                  data-telemetry-physics
                  className="text-lg text-amber"
                >
                  0.00
                </span>
                <span className="pb-0.5 text-[8px] text-mist/40">MS</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-[0.8fr_1.2fr] gap-px border-t border-white/[0.06] bg-white/[0.06]">
            <div className="bg-[#05090f] px-4 py-3">
              <p className="flex items-center gap-1.5 text-[8px] text-mist/42">
                <Layers3 size={9} /> SHADER PASSES
              </p>
              <span
                ref={shaderPassesRef}
                data-telemetry-shader-passes
                className="mt-2 block text-lg text-frost"
              >
                0
              </span>
            </div>
            <div
              data-telemetry-vfx-preset={vfxPreset}
              className="min-w-0 bg-[#05090f] px-4 py-3"
            >
              <p className="flex items-center gap-1.5 text-[8px] text-mist/42">
                <Palette size={9} /> VFX SPECTRUM
              </p>
              <span
                className="mt-2 block truncate text-[11px]"
                style={{ color: vfxConfig.tertiary }}
              >
                {vfxConfig.label}
              </span>
              <span className="mt-1 block truncate font-mono text-[7px] text-mist/35">
                {vfxConfig.subtitle}
              </span>
            </div>
          </div>

          <div className="border-t border-white/[0.07] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[8px] text-mist/42">
                JS HEAP / 64 SAMPLES
              </span>
              <span
                ref={memoryRef}
                data-telemetry-memory
                className="text-[9px] text-frost/75"
              >
                N/A
              </span>
            </div>
            <svg
              aria-hidden="true"
              viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
              preserveAspectRatio="none"
              className="mt-2 h-14 w-full overflow-visible"
            >
              <defs>
                <linearGradient id="telemetry-memory-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-signal)"
                    stopOpacity="0.22"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-signal)"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              <path
                d={`M0 ${GRAPH_HEIGHT - 2} L${GRAPH_WIDTH} ${GRAPH_HEIGHT - 2}`}
                fill="none"
                stroke="rgba(134,160,171,0.13)"
                strokeWidth="1"
              />
              <path
                data-telemetry-memory-path
                ref={memoryPathRef}
                d={`M0 ${GRAPH_HEIGHT - 2} L${GRAPH_WIDTH} ${GRAPH_HEIGHT - 2}`}
                fill="none"
                stroke="var(--color-signal)"
                strokeWidth="1.4"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>

          <footer className="flex items-center justify-between border-t border-white/[0.07] bg-black/20 px-4 py-2">
            <span className="flex items-center gap-2 text-[8px] text-mist/42">
              <span
                ref={statusRef}
                data-health="limited"
                className="size-1.5 bg-signal data-[health=guarded]:bg-amber data-[health=limited]:bg-red-400"
              />
              RENDER GOVERNOR ACTIVE
            </span>
            <span className="border border-white/10 px-2 py-1 text-[8px] uppercase text-mist/55">
              {performanceTier} TIER
            </span>
          </footer>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}
