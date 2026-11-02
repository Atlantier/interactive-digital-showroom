import { Shuffle } from 'lucide-react'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import { useI18n } from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import { useGalleryStore } from '../../store/useGalleryStore'

export function RayBounceMazeControls({
  variant = 'panel',
}: {
  variant?: 'stage' | 'panel'
}) {
  const { t } = useI18n()
  const layoutIndex = useGalleryStore(
    (state) => state.rayMazeLayoutIndex,
  )
  const shuffleLayout = useGalleryStore(
    (state) => state.shuffleRayMazeLayout,
  )
  const playSound = useInterfaceSound()
  const copy = t.gallery.rayMazeInteraction
  const layoutName = copy.layouts[layoutIndex] ?? copy.layouts[0]

  return (
    <div
      data-ray-maze-controls
      data-ray-maze-layout={String(layoutIndex)}
      className={cn(
        variant === 'panel'
          ? 'border border-[var(--vfx-secondary)]/18 bg-black/22 p-2'
          : 'relative',
      )}
    >
      <button
        type="button"
        data-ray-maze-shuffle
        aria-label={copy.shuffleLayout}
        title={copy.shuffleLayout}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          shuffleLayout()
          playSound('toggle')
        }}
        className={cn(
          'group/shuffle flex items-center justify-between gap-3 border font-mono transition-colors',
          variant === 'stage'
            ? 'h-9 border-[var(--vfx-secondary)]/28 bg-black/48 px-2 text-[11px] text-[var(--vfx-secondary)] backdrop-blur-md hover:border-[var(--vfx-secondary)]/62 hover:text-frost'
            : 'min-h-10 w-full border-[var(--vfx-secondary)]/30 bg-[var(--vfx-secondary)]/[0.04] px-3 text-[11px] text-[var(--vfx-secondary)] hover:border-[var(--vfx-secondary)]/62 hover:bg-[var(--vfx-secondary)]/[0.08] hover:text-frost',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Shuffle
            size={variant === 'stage' ? 9 : 11}
            strokeWidth={1.8}
            className="shrink-0 transition-transform duration-300 group-hover/shuffle:rotate-180"
          />
          <span className="truncate">{copy.shuffleLayout}</span>
        </span>
        <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">
          {String(layoutIndex + 1).padStart(2, '0')} / 03
        </span>
      </button>
      {variant === 'panel' ? (
        <div
          data-ray-maze-layout-name
          className="mt-2 flex items-center justify-between gap-3 px-1 font-mono text-[11px]"
          aria-live="polite"
        >
          <span className="text-[var(--text-secondary)]">{copy.activeTopology}</span>
          <span className="truncate text-[var(--vfx-secondary)]">
            {layoutName}
          </span>
        </div>
      ) : null}
    </div>
  )
}
