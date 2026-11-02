import {
  Diamond,
  Gem,
  Triangle,
  type LucideIcon,
} from 'lucide-react'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import { useI18n } from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import {
  useGalleryStore,
  type PrismShape,
} from '../../store/useGalleryStore'

const SHAPE_ICONS: Record<PrismShape, LucideIcon> = {
  octahedron: Diamond,
  prism: Triangle,
  icosahedron: Gem,
}

const SHAPE_OPTIONS: readonly PrismShape[] = [
  'octahedron',
  'prism',
  'icosahedron',
]

export function PrismShapeSelector({
  variant = 'stage',
}: {
  variant?: 'stage' | 'panel'
}) {
  const { t } = useI18n()
  const shape = useGalleryStore((state) => state.prismShape)
  const setPrismShape = useGalleryStore(
    (state) => state.setPrismShape,
  )
  const playSound = useInterfaceSound()
  const copy = t.gallery.prismShapes

  return (
    <div
      role="group"
      aria-label={copy.label}
      data-prism-shape-switcher
      data-prism-shape-active={shape}
      data-prism-shape-variant={variant}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        'z-20',
        variant === 'stage'
          ? 'pointer-events-auto absolute right-2.5 top-2.5 flex gap-1'
          : 'grid grid-cols-3 gap-1',
      )}
    >
      {SHAPE_OPTIONS.map((option) => {
        const Icon = SHAPE_ICONS[option]
        const active = shape === option
        const label = copy[option]
        return (
          <button
            key={option}
            type="button"
            data-prism-shape-option={option}
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={(event) => {
              event.stopPropagation()
              if (active) return
              setPrismShape(option)
              playSound('toggle')
            }}
            className={cn(
              'grid place-items-center border transition-colors',
              variant === 'stage' ? 'size-7' : 'h-9 px-2',
              active
                ? 'border-[var(--vfx-secondary)]/48 bg-[var(--vfx-secondary)]/[0.1] text-[var(--vfx-secondary)]'
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
