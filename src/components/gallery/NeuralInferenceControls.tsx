import { ArrowLeft, ArrowRight, Zap } from 'lucide-react'
import {
  NEURAL_TOKEN_LABELS,
} from '../../data/neuralNetwork'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import {
  formatTranslation,
  useI18n,
} from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import { useGalleryStore } from '../../store/useGalleryStore'

export function NeuralInferenceControls({
  variant = 'panel',
}: {
  variant?: 'stage' | 'panel'
}) {
  const { t } = useI18n()
  const selectedToken = useGalleryStore(
    (state) => state.neuralSelectedToken,
  )
  const inferencePulse = useGalleryStore(
    (state) => state.neuralInferencePulse,
  )
  const trainingMode = useGalleryStore(
    (state) => state.neuralTrainingMode,
  )
  const selectNeuralToken = useGalleryStore(
    (state) => state.selectNeuralToken,
  )
  const triggerInference = useGalleryStore(
    (state) => state.triggerNeuralInference,
  )
  const setTrainingMode = useGalleryStore(
    (state) => state.setNeuralTrainingMode,
  )
  const playSound = useInterfaceSound()
  const copy = t.gallery.neuralPulseInteraction
  const token =
    NEURAL_TOKEN_LABELS[selectedToken] ??
    NEURAL_TOKEN_LABELS[0]
  const actionLabel =
    trainingMode === 'backprop'
      ? copy.runBackprop
      : inferencePulse > 0
        ? copy.retrigger
        : copy.trigger

  return (
    <div
      data-neural-inference-controls
      data-neural-inference-variant={variant}
      data-neural-token={String(selectedToken)}
      data-neural-training-mode={trainingMode}
      className={cn(
        variant === 'panel'
          ? 'border border-[var(--vfx-secondary)]/18 bg-black/22 p-2'
          : 'relative',
      )}
    >
      {variant === 'panel' ? (
        <>
          <div className="mb-2 grid grid-cols-2 gap-1">
            {(['inference', 'backprop'] as const).map(
              (candidate) => {
                const active = trainingMode === candidate
                const label =
                  candidate === 'inference'
                    ? copy.forwardMode
                    : copy.backpropMode
                return (
                  <button
                    key={candidate}
                    type="button"
                    data-neural-training-mode-option={candidate}
                    aria-label={label}
                    aria-pressed={active}
                    title={label}
                    onPointerDown={(event) =>
                      event.stopPropagation()
                    }
                    onClick={(event) => {
                      event.stopPropagation()
                      setTrainingMode(candidate)
                      playSound('toggle')
                    }}
                    className={cn(
                      'flex min-h-8 items-center gap-2 border px-2 font-mono text-[7px] transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
                      active
                        ? 'border-[var(--vfx-secondary)]/54 bg-[var(--vfx-secondary)]/[0.09] text-frost'
                        : 'border-white/[0.07] bg-white/[0.018] text-mist/38 hover:border-white/20 hover:text-frost',
                    )}
                  >
                    {candidate === 'inference' ? (
                      <ArrowRight
                        size={9}
                        strokeWidth={1.8}
                      />
                    ) : (
                      <ArrowLeft
                        size={9}
                        strokeWidth={1.8}
                      />
                    )}
                    <span className="truncate">{label}</span>
                  </button>
                )
              },
            )}
          </div>
          <div className="mb-2 flex items-center justify-between gap-3 px-1 font-mono text-[7px]">
            <span className="text-mist/34">
              {copy.tokenSelect}
            </span>
            <span className="text-[var(--vfx-secondary)]/68">
              {token}
            </span>
          </div>
          <div className="mb-2 grid grid-cols-8 gap-1">
            {NEURAL_TOKEN_LABELS.map((label, index) => {
              const active = selectedToken === index
              return (
                <button
                  key={label}
                  type="button"
                  data-neural-token-option={index}
                  aria-label={formatTranslation(copy.tokenAria, {
                    token: label,
                  })}
                  aria-pressed={active}
                  title={label}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    selectNeuralToken(index)
                    playSound('toggle')
                  }}
                  className={cn(
                    'flex h-7 min-w-0 items-center justify-center border font-mono text-[6px] transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
                    active
                      ? 'border-[var(--vfx-secondary)]/62 bg-[var(--vfx-secondary)]/[0.1] text-frost'
                      : 'border-white/[0.07] bg-white/[0.018] text-mist/38 hover:border-white/20 hover:text-frost',
                  )}
                >
                  <span className="truncate px-0.5">{label}</span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <div className="mb-1 grid w-[102px] grid-cols-2 gap-px border border-[var(--vfx-secondary)]/24 bg-black/52 backdrop-blur-md">
          {(['inference', 'backprop'] as const).map(
            (candidate) => {
              const active = trainingMode === candidate
              const label =
                candidate === 'inference'
                  ? copy.forwardMode
                  : copy.backpropMode
              return (
                <button
                  key={candidate}
                  type="button"
                  data-neural-training-mode-option={candidate}
                  aria-label={label}
                  aria-pressed={active}
                  title={label}
                  onPointerDown={(event) =>
                    event.stopPropagation()
                  }
                  onClick={(event) => {
                    event.stopPropagation()
                    setTrainingMode(candidate)
                    playSound('toggle')
                  }}
                  className={cn(
                    'flex h-6 items-center justify-center gap-1 font-mono text-[5px] transition-colors',
                    active
                      ? 'bg-[var(--vfx-secondary)]/[0.1] text-frost'
                      : 'bg-[#04090c]/88 text-mist/40 hover:text-frost',
                  )}
                >
                  {candidate === 'inference' ? (
                    <ArrowRight size={7} strokeWidth={1.8} />
                  ) : (
                    <ArrowLeft size={7} strokeWidth={1.8} />
                  )}
                  <span>
                    {candidate === 'inference'
                      ? copy.forwardShort
                      : copy.backpropShort}
                  </span>
                </button>
              )
            },
          )}
        </div>
      )}
      <button
        type="button"
        data-neural-trigger-inference
        aria-label={actionLabel}
        title={actionLabel}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          triggerInference()
          playSound('toggle')
        }}
        className={cn(
          'group/inference flex items-center justify-between gap-3 border font-mono transition-colors',
          variant === 'stage'
            ? 'h-7 border-[var(--vfx-secondary)]/28 bg-black/48 px-2 text-[6px] text-[var(--vfx-secondary)]/82 backdrop-blur-md hover:border-[var(--vfx-secondary)]/62 hover:text-frost'
            : 'min-h-10 w-full border-[var(--vfx-secondary)]/30 bg-[var(--vfx-secondary)]/[0.04] px-3 text-[8px] text-[var(--vfx-secondary)]/82 hover:border-[var(--vfx-secondary)]/62 hover:bg-[var(--vfx-secondary)]/[0.08] hover:text-frost',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Zap
            size={variant === 'stage' ? 9 : 11}
            strokeWidth={1.8}
            className="shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/inference:-translate-y-0.5"
          />
          <span className="truncate">{actionLabel}</span>
        </span>
        <span className="shrink-0 text-[7px] opacity-58">
          {token}
        </span>
      </button>
      {variant === 'panel' ? (
        <p className="mt-2 px-1 font-mono text-[7px] leading-3 text-mist/30">
          {trainingMode === 'backprop'
            ? copy.backpropHint
            : copy.forwardHint}
        </p>
      ) : null}
    </div>
  )
}
