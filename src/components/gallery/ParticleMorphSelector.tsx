import {
  Cpu,
  Dna,
  Globe2,
  Infinity as InfinityIcon,
  Orbit,
  type LucideIcon,
} from 'lucide-react'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import { useI18n } from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import { useExhibitParamsStore } from '../../store/gallery/hooks'
import type { ParticleManifold } from '../../store/useGalleryStore'

const MANIFOLD_ICONS: Record<ParticleManifold, LucideIcon> = {
  'mobius-ring': Orbit,
  'double-helix': Dna,
  'trefoil-knot': InfinityIcon,
  'fibonacci-sphere': Globe2,
  'wafer-city': Cpu,
}

const MANIFOLD_OPTIONS: readonly ParticleManifold[] = [
  'mobius-ring',
  'double-helix',
  'trefoil-knot',
  'fibonacci-sphere',
  'wafer-city',
]

export function ParticleMorphSelector({
  variant = 'stage',
}: {
  variant?: 'stage' | 'panel' | 'quick'
}) {
  const { t } = useI18n()
  const manifold = useExhibitParamsStore(
    (state) => state.particleManifold,
  )
  const setParticleManifold = useExhibitParamsStore(
    (state) => state.setParticleManifold,
  )
  const playSound = useInterfaceSound()
  const copy = t.gallery.particleManifolds
  const groupLabel =
    variant === 'quick'
      ? t.gallery.particleInteraction.quickLabel
      : copy.label

  return (
    <div
      role="group"
      aria-label={groupLabel}
      data-particle-manifold-switcher
      data-particle-manifold-active={manifold}
      data-particle-manifold-variant={variant}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        'z-20',
        variant === 'stage'
          ? 'pointer-events-auto absolute right-2.5 top-2.5 flex gap-0.5'
          : variant === 'quick'
            ? 'pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/[0.09] bg-black/35 p-0.5 shadow-[0_0_22px_rgb(var(--vfx-secondary-rgb)/0.08)] backdrop-blur-md'
            : 'grid grid-cols-5 gap-1',
      )}
    >
      {MANIFOLD_OPTIONS.map((option) => {
        const Icon = MANIFOLD_ICONS[option]
        const active = manifold === option
        const label = copy[option]
        return (
          <button
            key={option}
            type="button"
            data-particle-manifold-option={option}
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={(event) => {
              event.stopPropagation()
              if (active) return
              setParticleManifold(option)
              playSound('toggle')
            }}
            className={cn(
              'grid place-items-center border transition-colors',
              variant === 'stage'
                ? 'size-6'
                : variant === 'quick'
                  ? 'relative size-7 rounded-full'
                  : 'h-10 min-w-0 px-1',
              active
                ? variant === 'quick'
                  ? 'border-[var(--vfx-secondary)]/45 bg-[var(--vfx-secondary)]/[0.12] text-[var(--vfx-secondary)]'
                  : 'border-signal/48 bg-signal/[0.1] text-signal'
                : 'border-white/10 bg-black/28 text-[var(--text-secondary)] hover:border-white/24 hover:text-frost',
            )}
          >
            <Icon
              size={variant === 'panel' ? 12 : 10}
              strokeWidth={variant === 'quick' ? 1.7 : 1.55}
            />
            {variant === 'panel' ? (
              <span className="w-full truncate text-center font-mono text-[11px]">
                {copy.short[option]}
              </span>
            ) : null}
            {variant === 'quick' && active ? (
              <span className="absolute -bottom-px left-1/2 size-0.5 -translate-x-1/2 rounded-full bg-[var(--vfx-secondary)] shadow-[0_0_5px_var(--vfx-secondary)]" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
