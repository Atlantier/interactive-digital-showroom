import { Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  REACTOR_OVERDRIVE_TIMING,
  resolveReactorOverdrivePhase,
  type ReactorOverdrivePhase,
} from '../../data/reactorTiming'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import { useI18n } from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import { useGalleryStore } from '../../store/useGalleryStore'

export function ReactorOverdriveButton({
  variant = 'panel',
}: {
  variant?: 'stage' | 'panel'
}) {
  const { t } = useI18n()
  const triggerReactorOverdrive = useGalleryStore(
    (state) => state.triggerReactorOverdrive,
  )
  const reactorOverdriveStartedAt = useGalleryStore(
    (state) => state.reactorOverdriveStartedAt,
  )
  const playSound = useInterfaceSound()
  const [phase, setPhase] =
    useState<ReactorOverdrivePhase>('idle')
  const copy = t.gallery.reactorInteraction
  const busy = phase !== 'idle'
  const charging = phase === 'charging'
  const shockwave = phase === 'shockwave'
  const cooldown = phase === 'cooldown'
  const phaseLabel = charging
    ? copy.charging
    : shockwave
      ? copy.shockwave
      : cooldown
        ? copy.recovering
        : copy.overclock
  const phaseStatus = charging
    ? copy.chargeTimeShort
    : shockwave
      ? copy.surgeShort
      : cooldown
        ? copy.recoverShort
        : copy.speedShort
  const accessibleLabel =
    variant === 'panel'
      ? `${phaseLabel} ${phaseStatus}. ${copy.injectFuel}`
      : `${phaseLabel}. ${copy.injectFuel}`

  useEffect(() => {
    if (reactorOverdriveStartedAt === null) {
      setPhase('idle')
      return
    }

    const {
      chargeSeconds,
      shockwaveSeconds,
      fadeEndSeconds,
    } = REACTOR_OVERDRIVE_TIMING
    const elapsedSeconds =
      (performance.now() - reactorOverdriveStartedAt) / 1_000
    const updatePhase = () =>
      setPhase(resolveReactorOverdrivePhase(elapsedSeconds))
    updatePhase()

    const timers = [
      chargeSeconds,
      chargeSeconds + shockwaveSeconds,
      fadeEndSeconds,
    ]
      .filter((boundary) => boundary > elapsedSeconds)
      .map((boundary) =>
        window.setTimeout(() => {
          setPhase(
            resolveReactorOverdrivePhase(
              boundary + 0.001,
            ),
          )
        }, (boundary - elapsedSeconds) * 1_000),
      )

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [reactorOverdriveStartedAt])

  return (
    <button
      type="button"
      data-reactor-overdrive
      data-reactor-overdrive-variant={variant}
      data-reactor-overdrive-active={busy ? 'true' : 'false'}
      data-reactor-overdrive-phase={phase}
      aria-label={accessibleLabel}
      aria-pressed={busy}
      aria-disabled={busy}
      title={accessibleLabel}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        if (busy) return
        triggerReactorOverdrive()
        playSound('toggle')
        setPhase('charging')
      }}
      className={cn(
        'group/overdrive relative overflow-hidden border font-mono transition-colors',
        variant === 'stage'
          ? 'pointer-events-auto flex h-9 items-center gap-1.5 border-[var(--vfx-secondary)]/28 bg-black/45 px-2 text-[11px] text-[var(--vfx-secondary)] backdrop-blur-md hover:border-[var(--vfx-secondary)]/62 hover:text-frost'
          : 'flex min-h-10 w-full items-center justify-between gap-3 border-[var(--vfx-secondary)]/32 bg-[var(--vfx-secondary)]/[0.045] px-3 text-[11px] text-[var(--vfx-secondary)] hover:border-[var(--vfx-secondary)]/62 hover:bg-[var(--vfx-secondary)]/[0.085] hover:text-frost',
        charging &&
          'border-[var(--vfx-tertiary)]/72 bg-[var(--vfx-tertiary)]/[0.11] text-[var(--vfx-tertiary)]',
        shockwave &&
          'border-sky-200/80 bg-sky-200/[0.14] text-sky-50 shadow-[0_0_18px_rgba(125,211,252,0.22)]',
        cooldown &&
          'border-[var(--vfx-secondary)]/24 bg-black/35 text-[var(--vfx-secondary)]/48',
        busy && 'cursor-wait',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 bg-[var(--vfx-tertiary)]/14 transition-[width,opacity] ease-out',
          charging && 'w-full opacity-100 duration-[1500ms]',
          shockwave && 'w-full opacity-100 duration-150',
          cooldown &&
            'w-0 opacity-40 duration-[2050ms] ease-in',
          phase === 'idle' && 'w-0 opacity-0 duration-150',
        )}
      />
      <span className="relative flex items-center gap-2">
        <Zap
          size={variant === 'stage' ? 9 : 11}
          strokeWidth={1.8}
          className={
            charging || shockwave ? 'animate-pulse' : undefined
          }
        />
        <span>{phaseLabel}</span>
      </span>
      {variant === 'panel' ? (
        <span className="relative font-mono text-[11px] text-[var(--text-tertiary)]">
          {phaseStatus}
        </span>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {phaseLabel}
      </span>
    </button>
  )
}
