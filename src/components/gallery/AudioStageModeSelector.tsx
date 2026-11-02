import { Grid3X3, Orbit, Waves } from 'lucide-react'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import { useI18n } from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import {
  AUDIO_STAGE_MODES,
  type AudioStageMode,
} from '../../data/audioStage'
import { useAudioStageStore } from '../../store/gallery/hooks'

function ModeGlyph({
  mode,
  size,
}: {
  mode: AudioStageMode
  size: number
}) {
  if (mode === 'matrix') {
    return <Grid3X3 size={size} strokeWidth={1.6} />
  }
  if (mode === 'sunburst') {
    return <Orbit size={size} strokeWidth={1.6} />
  }
  return <Waves size={size} strokeWidth={1.6} />
}

export function AudioStageModeSelector({
  variant = 'panel',
}: {
  variant?: 'stage' | 'panel'
}) {
  const { t } = useI18n()
  const mode = useAudioStageStore((state) => state.audioStageMode)
  const setMode = useAudioStageStore(
    (state) => state.setAudioStageMode,
  )
  const playSound = useInterfaceSound()
  const copy = t.gallery.audioStageInteraction

  return (
    <div
      data-audio-stage-mode-selector
      data-audio-stage-mode-active={mode}
      className={cn(
        variant === 'panel'
          ? 'border border-[var(--vfx-secondary)]/18 bg-black/22 p-2'
          : 'relative',
      )}
    >
      {variant === 'panel' ? (
        <div className="mb-2 flex items-center justify-between gap-3 px-1 font-mono text-[11px]">
          <span className="text-[var(--text-secondary)]">{copy.modeLabel}</span>
          <span className="text-[var(--vfx-secondary)]">
            {copy.modes[mode].label}
          </span>
        </div>
      ) : null}
      <div
        className={cn(
          'grid grid-cols-3 gap-px bg-[var(--vfx-secondary)]/18',
          variant === 'panel'
            ? 'border border-white/[0.06]'
            : 'border border-[var(--vfx-secondary)]/28 bg-black/52 backdrop-blur-md',
        )}
      >
        {AUDIO_STAGE_MODES.map((candidate, index) => {
          const active = candidate === mode
          const modeCopy = copy.modes[candidate]
          return (
            <button
              key={candidate}
              type="button"
              data-audio-stage-mode={candidate}
              aria-label={modeCopy.label}
              aria-pressed={active}
              title={modeCopy.label}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                setMode(candidate)
                playSound('toggle')
              }}
              className={cn(
                'group/mode transition-[transform,color,background-color,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                variant === 'stage'
                  ? 'flex h-9 items-center justify-center gap-1 px-1.5 font-mono text-[11px]'
                  : 'flex min-h-12 flex-col items-start justify-between px-2 py-2 text-left',
                active
                  ? 'bg-[var(--vfx-secondary)]/[0.12] text-frost'
                  : 'bg-[#04090c]/88 text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-frost',
              )}
            >
              <span className="flex items-center gap-1.5">
                <ModeGlyph
                  mode={candidate}
                  size={variant === 'stage' ? 9 : 12}
                />
                {variant === 'stage' ? (
                  <span>{String.fromCharCode(65 + index)}</span>
                ) : null}
              </span>
              {variant === 'panel' ? (
                <span className="mt-2 block w-full">
                  <span className="block truncate text-[11px]">
                    {modeCopy.label}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--text-tertiary)]">
                    {modeCopy.short}
                  </span>
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {variant === 'panel' ? (
        <p className="mt-2 px-1 font-mono text-[11px] leading-4 text-[var(--text-secondary)]">
          {copy.modeHint}
        </p>
      ) : null}
    </div>
  )
}
