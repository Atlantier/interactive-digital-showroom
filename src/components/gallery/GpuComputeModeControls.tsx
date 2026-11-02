import {
  Gauge,
  Grid3X3,
  Network,
  Zap,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  type CSSProperties,
} from 'react'
import {
  getGpuComputeTelemetry,
  GPU_COMPUTE_MODES,
  GPU_WORKLOAD_MAX,
  GPU_WORKLOAD_MIN,
} from '../../data/gpuCompute'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import { useI18n } from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import { useGpuStore } from '../../store/gallery/hooks'

export function GpuComputeModeControls({
  variant = 'panel',
}: {
  variant?: 'stage' | 'panel'
}) {
  const { t } = useI18n()
  const mode = useGpuStore((state) => state.gpuComputeMode)
  const workload = useGpuStore(
    (state) => state.gpuComputeWorkload,
  )
  const setMode = useGpuStore(
    (state) => state.setGpuComputeMode,
  )
  const setWorkload = useGpuStore(
    (state) => state.setGpuComputeWorkload,
  )
  const playSound = useInterfaceSound()
  const tflopsRef = useRef<HTMLSpanElement>(null)
  const bandwidthRef = useRef<HTMLSpanElement>(null)
  const copy = t.gallery.gpuComputeInteraction
  const percent = Math.round(workload * 100)
  const saturated = workload >= 0.985
  const rangeProgress =
    ((workload - GPU_WORKLOAD_MIN) /
      (GPU_WORKLOAD_MAX - GPU_WORKLOAD_MIN)) *
    100

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const updateTelemetry = () => {
      const telemetry = getGpuComputeTelemetry(
        workload,
        performance.now() / 1000,
      )
      if (tflopsRef.current) {
        tflopsRef.current.textContent = telemetry.tflops
          .toFixed(1)
          .padStart(5, '0')
      }
      if (bandwidthRef.current) {
        bandwidthRef.current.textContent =
          `${telemetry.memoryBandwidth.toFixed(2)} TB/s`
      }
    }
    updateTelemetry()
    const timer = window.setInterval(
      updateTelemetry,
      reducedMotion ? 420 : 90,
    )
    return () => window.clearInterval(timer)
  }, [workload])

  return (
    <div
      data-gpu-compute-controls
      data-gpu-compute-mode-active={mode}
      data-gpu-workload-active={percent}
      className={
        variant === 'panel'
          ? 'border border-[var(--vfx-secondary)]/18 bg-black/22 p-2'
          : 'w-[196px] border border-[var(--vfx-secondary)]/28 bg-black/64 backdrop-blur-md'
      }
    >
      {variant === 'panel' ? (
        <div className="mb-2 flex items-center justify-between gap-3 px-1 font-mono text-[11px]">
          <span className="text-[var(--text-secondary)]">{copy.modeLabel}</span>
          <span className="text-[var(--vfx-secondary)]">
            {mode === 'tensor' ? copy.tensorShort : copy.bvhShort}
          </span>
        </div>
      ) : null}
      <div
        className={
          variant === 'panel'
            ? 'grid grid-cols-2 gap-px border border-white/[0.06] bg-[var(--vfx-secondary)]/20'
            : 'grid grid-cols-2 gap-px border-b border-[var(--vfx-secondary)]/18 bg-[var(--vfx-secondary)]/20'
        }
      >
        {GPU_COMPUTE_MODES.map((candidate) => {
          const active = candidate === mode
          const label =
            candidate === 'tensor' ? copy.tensor : copy.bvh
          return (
            <button
              key={candidate}
              type="button"
              data-gpu-compute-mode={candidate}
              aria-label={label}
              aria-pressed={active}
              title={label}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                setMode(candidate)
                playSound('toggle')
              }}
              className={cn(
                'group/gpu-mode transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                variant === 'stage'
                  ? 'flex h-9 items-center justify-center gap-1 font-mono text-[11px]'
                  : 'flex min-h-12 items-start justify-between gap-2 px-2 py-2 text-left',
                active
                  ? 'bg-[var(--vfx-secondary)]/[0.12] text-frost'
                  : 'bg-[#04090c]/88 text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-frost',
              )}
            >
              <span className="flex items-center gap-1.5">
                {candidate === 'tensor' ? (
                  <Grid3X3
                    size={variant === 'stage' ? 9 : 12}
                    strokeWidth={1.6}
                  />
                ) : (
                  <Network
                    size={variant === 'stage' ? 9 : 12}
                    strokeWidth={1.6}
                  />
                )}
                <span
                  className={
                    variant === 'panel'
                      ? 'truncate text-[11px]'
                      : undefined
                  }
                >
                  {variant === 'stage'
                    ? candidate === 'tensor'
                      ? copy.tensorShort
                      : copy.bvhShort
                    : label}
                </span>
              </span>
              {variant === 'panel' ? (
                <span className="mt-2 block max-w-[110px] font-mono text-[11px] leading-4 text-[var(--text-tertiary)]">
                  {candidate === 'tensor'
                    ? 'D = A x B + C'
                    : 'RAY x BVH'}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div
        data-gpu-workload-control
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        className={
          variant === 'panel'
            ? 'mt-2 border border-white/[0.06] bg-black/18 px-2 py-2'
            : 'px-2 pb-2 pt-1.5'
        }
      >
        <label
          htmlFor={`gpu-workload-${variant}`}
          className="flex items-center justify-between gap-2 font-mono text-[11px]"
        >
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <Gauge
              size={variant === 'stage' ? 9 : 11}
              strokeWidth={1.6}
            />
            {variant === 'stage'
              ? copy.workloadShort
              : copy.workload}
          </span>
          <span
            data-gpu-workload-readout
            className={cn(
              'text-[var(--vfx-secondary)]',
              saturated && 'text-[#ffd36a]',
            )}
          >
            {percent}%
          </span>
        </label>
        <input
          id={`gpu-workload-${variant}`}
          type="range"
          data-gpu-workload-slider
          aria-label={copy.workload}
          aria-valuetext={`${percent}%`}
          min={GPU_WORKLOAD_MIN * 100}
          max={GPU_WORKLOAD_MAX * 100}
          step={1}
          value={percent}
          onChange={(event) => {
            setWorkload(Number(event.target.value) / 100)
          }}
          className="darkroom-range mt-2 h-1 w-full cursor-pointer"
          style={
            {
              '--range-progress': `${rangeProgress}%`,
            } as CSSProperties
          }
        />
        <div
          data-gpu-live-telemetry
          className="mt-2 flex items-center justify-between gap-2 font-mono text-[11px] text-[var(--text-secondary)]"
        >
          <span>
            <span
              ref={tflopsRef}
              data-gpu-live-tflops
              className="text-[#91fff4]"
            >
              --.-
            </span>{' '}
            {copy.tflops}
          </span>
          <span className="h-2.5 w-px bg-white/10" />
          <span>
            <span
              ref={bandwidthRef}
              data-gpu-live-bandwidth
              className="text-[#ffe08a]"
            >
              --.-- TB/s
            </span>
          </span>
        </div>
      </div>

      {variant === 'panel' ? (
        <div className="mt-2 flex items-start justify-between gap-3 px-1">
          <p className="font-mono text-[11px] leading-4 text-[var(--text-secondary)]">
            {mode === 'tensor' ? copy.tensorHint : copy.bvhHint}
          </p>
          <span
            className={cn(
              'flex shrink-0 items-center gap-1 font-mono text-[11px]',
              saturated
                ? 'text-[#ffd36a]'
                : 'text-[var(--vfx-secondary)]',
            )}
          >
            <Zap size={8} strokeWidth={1.7} />
            {saturated
              ? copy.thermalSaturated
              : copy.thermalNominal}
          </span>
        </div>
      ) : null}
      <p
        className={cn(
          'font-mono text-[var(--text-tertiary)]',
          variant === 'panel'
            ? 'mt-2 px-1 text-[11px] leading-4'
            : 'hidden border-t border-white/[0.05] px-2 py-1.5 text-[11px] leading-4 sm:block',
        )}
      >
        {variant === 'panel' ? copy.workloadHint : copy.warpHint}
      </p>
    </div>
  )
}
