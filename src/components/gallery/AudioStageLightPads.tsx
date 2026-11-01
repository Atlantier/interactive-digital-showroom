import { Music2 } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  AUDIO_STAGE_PAD_COLORS,
  AUDIO_STAGE_PAD_NOTES,
  getAudioStagePadColor,
} from '../../data/audioStage'
import {
  formatTranslation,
  useI18n,
} from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import { useAppStore } from '../../store/useAppStore'
import { useGalleryStore } from '../../store/useGalleryStore'
import { soundEngine } from '../../utils/soundEngine'

export function AudioStageLightPads() {
  const { t } = useI18n()
  const soundEnabled = useAppStore(
    (state) => state.soundEnabled,
  )
  const triggerPulse = useGalleryStore(
    (state) => state.triggerAudioStagePulse,
  )
  const [pressedPad, setPressedPad] = useState<number | null>(
    null,
  )
  const releaseTimerRef = useRef<number | null>(null)
  const copy = t.gallery.audioStageInteraction

  useEffect(
    () => () => {
      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current)
      }
    },
    [],
  )

  return (
    <section
      data-audio-stage-pads
      data-audio-stage-pad-active={
        pressedPad === null ? 'none' : String(pressedPad)
      }
      className="mt-5 border border-[var(--vfx-secondary)]/16 bg-[linear-gradient(180deg,rgba(8,18,22,0.78),rgba(3,7,10,0.76))] p-2.5"
    >
      <div className="mb-2.5 flex items-start justify-between gap-3 px-0.5">
        <span className="flex items-center gap-1.5 font-mono text-[7px] text-[var(--vfx-secondary)]/62">
          <Music2 size={9} strokeWidth={1.7} />
          {copy.lightPadsLabel}
        </span>
        <span className="max-w-[178px] text-right font-mono text-[6px] leading-3 text-mist/28">
          {copy.lightPadsHint}
        </span>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {AUDIO_STAGE_PAD_COLORS.map((color, index) => {
          const note =
            AUDIO_STAGE_PAD_NOTES[index] ??
            String(index + 1)
          const active = pressedPad === index
          return (
            <button
              key={note}
              type="button"
              data-audio-stage-pad
              data-audio-stage-pad-index={index}
              data-audio-stage-pad-note={note}
              aria-label={formatTranslation(copy.padAria, {
                index: String(index + 1).padStart(2, '0'),
                note,
              })}
              aria-pressed={active}
              title={`${String(index + 1).padStart(2, '0')} / ${note}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                triggerPulse(index)
                void soundEngine.playStagePad(
                  index,
                  !soundEnabled,
                )
                setPressedPad(index)
                if (releaseTimerRef.current !== null) {
                  window.clearTimeout(
                    releaseTimerRef.current,
                  )
                }
                releaseTimerRef.current = window.setTimeout(
                  () => setPressedPad(null),
                  260,
                )
              }}
              className={cn(
                'group/pad relative flex h-12 min-w-0 flex-col items-center justify-center overflow-hidden border font-mono transition-[transform,border-color,color,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:border-[var(--vfx-tertiary)] focus-visible:outline-none',
                active
                  ? '-translate-y-0.5 border-[var(--pad-color)] text-frost'
                  : 'border-white/[0.07] text-mist/48 hover:-translate-y-0.5 hover:border-[var(--pad-color)]/70 hover:text-frost',
              )}
              style={
                {
                  '--pad-color': color,
                  backgroundColor: active
                    ? `${getAudioStagePadColor(index)}38`
                    : `${getAudioStagePadColor(index)}10`,
                  boxShadow: active
                    ? `inset 0 0 18px ${color}28, 0 0 12px ${color}22`
                    : undefined,
                } as CSSProperties
              }
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-1 top-1 h-px opacity-80"
                style={{
                  backgroundColor: color,
                  boxShadow: `0 0 8px ${color}`,
                }}
              />
              <span className="mt-1 text-[8px] tracking-[0.08em]">
                {note}
              </span>
              <span className="mt-0.5 text-[5px] opacity-38">
                {String(index + 1).padStart(2, '0')}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
