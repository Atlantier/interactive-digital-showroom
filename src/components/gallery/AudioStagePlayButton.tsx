import { Pause, Play } from 'lucide-react'
import { useEffect } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import { useAppStore } from '../../store/useAppStore'
import {
  useAudioStageStore,
  useExhibitParamsStore,
} from '../../store/gallery/hooks'
import { soundEngine } from '../../utils/soundEngine'

export function AudioStagePlayButton({
  variant = 'panel',
}: {
  variant?: 'stage' | 'panel'
}) {
  const { t } = useI18n()
  const soundEnabled = useAppStore(
    (state) => state.soundEnabled,
  )
  const playing = useAudioStageStore(
    (state) => state.audioStagePlaying,
  )
  const setPlaying = useAudioStageStore(
    (state) => state.setAudioStagePlaying,
  )
  const tempo = useExhibitParamsStore(
    (state) =>
      state.exhibits.find(
        (exhibit) => exhibit.id === 'orbital-lens',
      )?.params.tempo ?? 104,
  )
  const copy = t.gallery.audioStageInteraction

  useEffect(() => {
    soundEngine.setArpeggiatorMuted(!soundEnabled)
  }, [soundEnabled])

  useEffect(() => {
    soundEngine.setArpeggiatorTempo(tempo)
  }, [tempo])

  const label = playing ? copy.pause : copy.play
  const statusLabel = playing
    ? soundEnabled
      ? copy.live
      : copy.muted
    : copy.idle

  return (
    <div
      data-audio-stage-controls
      data-audio-stage-playing={playing ? 'true' : 'false'}
      className={cn(
        variant === 'panel'
          ? 'border border-[var(--vfx-secondary)]/18 bg-black/22 p-2'
          : 'relative',
      )}
    >
      <button
        type="button"
        data-audio-stage-play
        aria-label={`${label}${statusLabel}`}
        aria-pressed={playing}
        title={`${label} ${statusLabel}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          if (playing) {
            soundEngine.stopArpeggiator()
            setPlaying(false)
            return
          }
          void soundEngine
            .startArpeggiator(!soundEnabled, tempo)
            .finally(() => setPlaying(true))
        }}
        className={cn(
          'group/audio-stage flex items-center justify-between gap-3 border font-mono transition-colors',
          variant === 'stage'
            ? 'h-9 border-[var(--vfx-secondary)]/28 bg-black/48 px-2 text-[11px] text-[var(--vfx-secondary)] backdrop-blur-md hover:border-[var(--vfx-secondary)]/62 hover:text-frost'
            : 'min-h-10 w-full border-[var(--vfx-secondary)]/30 bg-[var(--vfx-secondary)]/[0.04] px-3 text-[11px] text-[var(--vfx-secondary)] hover:border-[var(--vfx-secondary)]/62 hover:bg-[var(--vfx-secondary)]/[0.08] hover:text-frost',
          playing &&
            'border-[var(--vfx-tertiary)]/55 bg-[var(--vfx-tertiary)]/[0.08] text-[var(--vfx-tertiary)]',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {playing ? (
            <Pause
              size={variant === 'stage' ? 9 : 11}
              strokeWidth={1.8}
              className="shrink-0"
            />
          ) : (
            <Play
              size={variant === 'stage' ? 9 : 11}
              strokeWidth={1.8}
              className="shrink-0 transition-transform duration-300 group-hover/audio-stage:translate-x-0.5"
            />
          )}
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">
          {statusLabel}
        </span>
      </button>
      {variant === 'panel' ? (
        <p className="mt-2 px-1 font-mono text-[11px] leading-4 text-[var(--text-secondary)]">
          {playing && !soundEnabled
            ? copy.mutedVisualHint
            : copy.sequenceHint}
        </p>
      ) : null}
    </div>
  )
}
