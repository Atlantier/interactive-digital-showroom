import {
  Fan,
  Orbit,
  Skull,
  type LucideIcon,
} from 'lucide-react'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import { useI18n } from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import {
  useGalleryStore,
  type HologramModel,
} from '../../store/useGalleryStore'

const MODEL_ICONS: Record<HologramModel, LucideIcon> = {
  'gyro-core': Orbit,
  'cyber-skull': Skull,
  'turbine-rotor': Fan,
}

const MODEL_OPTIONS: readonly HologramModel[] = [
  'gyro-core',
  'cyber-skull',
  'turbine-rotor',
]

export function HologramModelSelector({
  variant = 'stage',
}: {
  variant?: 'stage' | 'panel'
}) {
  const { t } = useI18n()
  const model = useGalleryStore((state) => state.hologramModel)
  const setHologramModel = useGalleryStore(
    (state) => state.setHologramModel,
  )
  const playSound = useInterfaceSound()
  const copy = t.gallery.hologramModels

  return (
    <div
      role="group"
      aria-label={copy.label}
      data-hologram-model-switcher
      data-hologram-model-active={model}
      data-hologram-model-variant={variant}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        'z-20',
        variant === 'stage'
          ? 'pointer-events-auto absolute right-2.5 top-2.5 flex gap-1'
          : 'grid grid-cols-3 gap-1',
      )}
    >
      {MODEL_OPTIONS.map((option) => {
        const Icon = MODEL_ICONS[option]
        const active = model === option
        const label = copy[option]
        return (
          <button
            key={option}
            type="button"
            data-hologram-model-option={option}
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={(event) => {
              event.stopPropagation()
              if (active) return
              setHologramModel(option)
              playSound('toggle')
            }}
            className={cn(
              'grid place-items-center border transition-colors',
              variant === 'stage' ? 'size-7' : 'h-9 px-2',
              active
                ? 'border-signal/48 bg-signal/[0.1] text-signal'
                : 'border-white/10 bg-black/28 text-[var(--text-secondary)] hover:border-white/24 hover:text-frost',
            )}
          >
            <Icon
              size={variant === 'stage' ? 11 : 12}
              strokeWidth={1.55}
            />
            {variant === 'panel' ? (
              <span className="truncate font-mono text-[11px]">
                {copy.short[option]}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
