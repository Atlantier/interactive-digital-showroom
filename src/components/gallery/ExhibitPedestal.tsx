import { ArrowUpRight, Crosshair, ScanLine } from 'lucide-react'
import {
  lazy,
  Suspense,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useInViewAnimation } from '../../hooks/useInViewAnimation'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import {
  formatTranslation,
  useI18n,
} from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import {
  GALLERY_EXHIBITS,
  useGalleryStore,
} from '../../store/useGalleryStore'
import { HologramModelSelector } from './HologramModelSelector'
import { ParticleMorphSelector } from './ParticleMorphSelector'
import { PrismShapeSelector } from './PrismShapeSelector'
import { ReactorOverdriveButton } from './ReactorOverdriveButton'
import { RayBounceMazeControls } from './RayBounceMazeControls'
import { AudioStageModeSelector } from './AudioStageModeSelector'
import { AudioStagePlayButton } from './AudioStagePlayButton'
import { NeuralInferenceControls } from './NeuralInferenceControls'
import { GpuComputeModeControls } from './GpuComputeModeControls'

const ExhibitPreviewLoop = lazy(async () => {
  const module = await import('./ExhibitPreviewLoop')
  return { default: module.ExhibitPreviewLoop }
})

const PEDESTAL_LAYOUTS = [
  'xl:col-span-6 xl:min-h-[458px]',
  'xl:col-span-3 xl:min-h-[458px]',
  'xl:col-span-3 xl:min-h-[458px]',
  'xl:col-span-3 xl:min-h-[422px]',
  'xl:col-span-3 xl:min-h-[422px]',
  'xl:col-span-6 xl:min-h-[422px]',
  'xl:col-span-6 xl:min-h-[422px]',
  'xl:col-span-6 xl:min-h-[422px]',
] as const

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizedParameter(
  value: number,
  min: number,
  max: number,
) {
  return clamp((value - min) / Math.max(0.0001, max - min), 0, 1)
}

export function ExhibitPedestal({
  exhibitId,
  index,
  tourCurrent,
}: {
  exhibitId: string
  index: number
  tourCurrent: boolean
}) {
  const { t } = useI18n()
  const exhibit = useGalleryStore(
    (state) =>
      state.exhibits.find(
        (candidate) => candidate.id === exhibitId,
      ) ?? GALLERY_EXHIBITS[index],
  )
  const stageRef = useRef<HTMLDivElement>(null)
  const inView = useInViewAnimation(stageRef, {
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.04,
  })
  const modalOpen = useGalleryStore(
    (state) => state.activeExhibitId !== null,
  )
  const setActiveExhibitId = useGalleryStore(
    (state) => state.setActiveExhibitId,
  )
  const stopOpticalTour = useGalleryStore(
    (state) => state.stopOpticalTour,
  )
  const triggerHologramGlitch = useGalleryStore(
    (state) => state.triggerHologramGlitch,
  )
  const tourClimaxExhibitId = useGalleryStore(
    (state) => state.opticalTourClimaxExhibitId,
  )
  const tourClimaxPulse = useGalleryStore(
    (state) => state.opticalTourClimaxPulse,
  )
  const playSound = useInterfaceSound()
  const exhibitCopy = t.gallery.exhibits[exhibit.id]
  const layoutClass = PEDESTAL_LAYOUTS[index] ?? PEDESTAL_LAYOUTS[7]
  const previewActive = inView && !modalOpen
  const climaxActive =
    tourCurrent && tourClimaxExhibitId === exhibit.id
  const featuredParameters = useMemo(
    () =>
      exhibit.controls.slice(0, 3).map((control) => ({
        ...control,
        value: exhibit.params[control.key] ?? control.min,
      })),
    [exhibit.controls, exhibit.params],
  )

  const updatePointer = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const u = clamp(
      ((event.clientX - bounds.left) / Math.max(1, bounds.width)) *
        2 -
        1,
      -1,
      1,
    )
    const v = clamp(
      1 -
        ((event.clientY - bounds.top) / Math.max(1, bounds.height)) *
          2,
      -1,
      1,
    )
    event.currentTarget.dataset.galleryPointerU = u.toFixed(2)
    event.currentTarget.dataset.galleryPointerV = v.toFixed(2)
    event.currentTarget.style.setProperty(
      '--gallery-pointer-x',
      `${((u + 1) * 50).toFixed(2)}%`,
    )
    event.currentTarget.style.setProperty(
      '--gallery-pointer-y',
      `${((1 - v) * 50).toFixed(2)}%`,
    )
  }

  const openDarkroom = () => {
    playSound('navigate')
    stopOpticalTour()
    setActiveExhibitId(exhibit.id)
  }

  return (
    <article
      data-exhibit-pedestal
      data-exhibit-id={exhibit.id}
      data-exhibit-index={index}
      data-tour-current={tourCurrent ? 'true' : 'false'}
      data-gallery-in-view={inView ? 'true' : 'false'}
      data-gallery-preview-active={
        previewActive ? 'true' : 'false'
      }
      className={cn(
        'gallery-pedestal group relative flex h-[476px] min-w-0 flex-col overflow-hidden border border-white/[0.09] bg-[#05090d]/88 md:h-[496px]',
        layoutClass,
        tourCurrent && 'gallery-pedestal-tour',
      )}
    >
      <div
        aria-hidden="true"
        className="gallery-pedestal-noise pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--vfx-secondary)]/60 to-transparent"
      />

      <header className="relative z-10 flex h-[104px] shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[8px] text-mist/44">
            <span className="text-[var(--vfx-secondary)]">
              E-{String(index + 1).padStart(2, '0')}
            </span>
            <span className="h-2 w-px bg-white/12" />
            <span>{exhibitCopy.opticalTag}</span>
            <span className="text-white/16">/</span>
            <span>{exhibitCopy.algorithmTag}</span>
          </div>
          <h3 className="mt-2 truncate text-lg text-frost sm:text-xl">
            {exhibitCopy.name}
          </h3>
          <p className="mt-0.5 truncate font-mono text-[8px] text-mist/45">
            {exhibitCopy.designation}
          </p>
        </div>
        <span className="grid size-7 shrink-0 place-items-center border border-white/10 text-mist/42">
          <ScanLine size={12} strokeWidth={1.6} />
        </span>
      </header>

      <div
        ref={stageRef}
        data-gallery-stage
        data-gallery-pointer-u="0.00"
        data-gallery-pointer-v="0.00"
        className={cn(
          'gallery-exhibit-stage relative z-0 mx-3 h-[205px] shrink-0 touch-pan-y overflow-hidden border border-white/[0.055] bg-[#020507]/72 sm:mx-4 sm:h-[225px]',
        )}
        onPointerMove={updatePointer}
        onClick={(event) => {
          if (
            exhibit.id !== 'laser-scan-hologram' ||
            (event.target instanceof HTMLElement &&
              event.target.closest('button, input'))
          ) {
            return
          }
          triggerHologramGlitch()
          playSound('toggle')
        }}
      >
        <Suspense
          fallback={
            <span
              aria-hidden="true"
              className="exhibit-preview-fallback"
            />
          }
        >
          <ExhibitPreviewLoop
            exhibitId={exhibit.id}
            active={previewActive}
            tourCurrent={tourCurrent}
            climaxActive={climaxActive}
            climaxPulse={tourClimaxPulse}
          />
        </Suspense>

        <div
          aria-hidden="true"
          className="gallery-pointer-glow pointer-events-none absolute inset-0"
        />
        <div
          aria-hidden="true"
          className="gallery-stage-grid pointer-events-none absolute inset-0"
        />
        <div className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1.5 font-mono text-[7px] text-[var(--vfx-secondary)]/55">
          <Crosshair size={8} strokeWidth={1.5} />
          {t.gallery.pedestal.previewField}
        </div>
        <div className="pointer-events-none absolute bottom-2 left-2.5 font-mono text-[7px] text-mist/30">
          {t.gallery.pedestal.previewHint}
        </div>
        <div className="pointer-events-none absolute bottom-2 right-2.5 font-mono text-[7px] text-mist/30">
          {t.gallery.pedestal.wavelengthLive}
        </div>
        {exhibit.id === 'prism-caustics' ? (
          <PrismShapeSelector />
        ) : null}
        {exhibit.id === 'laser-scan-hologram' ? (
          <HologramModelSelector />
        ) : null}
        {exhibit.id === 'plasma-reactor' ? (
          <div className="absolute right-2.5 top-2.5 z-20">
            <ReactorOverdriveButton variant="stage" />
          </div>
        ) : null}
        {exhibit.id === 'photonic-mesh' ? (
          <div className="absolute right-2.5 top-2.5 z-20">
            <RayBounceMazeControls variant="stage" />
          </div>
        ) : null}
        {exhibit.id === 'orbital-lens' ? (
          <div className="absolute right-2.5 top-2.5 z-20 flex flex-col items-end gap-1.5">
            <AudioStageModeSelector variant="stage" />
            <AudioStagePlayButton variant="stage" />
          </div>
        ) : null}
        {exhibit.id === 'quantum-lattice' ? (
          <div className="absolute right-2.5 top-2.5 z-20">
            <NeuralInferenceControls variant="stage" />
          </div>
        ) : null}
        {exhibit.id === 'phase-torus' ? (
          <div className="absolute right-2.5 top-2.5 z-20">
            <GpuComputeModeControls variant="stage" />
          </div>
        ) : null}
      </div>

      <div className="relative z-10 mt-auto px-4 pb-4 pt-3 sm:px-5">
        <p className="line-clamp-2 min-h-9 text-[11px] leading-[1.55] text-mist/66">
          {exhibitCopy.summary}
        </p>

        {exhibit.id === 'particle-morph' ? (
          <div
            data-particle-quick-controls
            className="mt-3 flex min-h-[41px] items-center justify-between gap-3 border-y border-white/[0.06] py-1.5"
          >
            <span className="min-w-0 font-mono text-[7px] leading-3 text-mist/38">
              {t.gallery.particleManifolds.label}
            </span>
            <ParticleMorphSelector variant="quick" />
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2 border-y border-white/[0.06] py-2.5">
            {featuredParameters.map((parameter) => {
              const ratio = normalizedParameter(
                parameter.value,
                parameter.min,
                parameter.max,
              )
              return (
                <div key={parameter.key} className="min-w-0">
                  <div className="flex items-center justify-between gap-1 font-mono text-[7px] text-mist/38">
                    <span className="truncate">{parameter.symbol}</span>
                    <span className="text-frost/65">
                      {parameter.value.toFixed(
                        parameter.step < 1 ? 2 : 0,
                      )}
                    </span>
                  </div>
                  <span className="mt-1.5 block h-px bg-white/8">
                    <span
                      className="gallery-parameter-bar block h-px"
                      style={{ width: `${Math.max(4, ratio * 100)}%` }}
                    />
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <button
          type="button"
          data-enter-darkroom={exhibit.id}
          aria-label={formatTranslation(
            t.gallery.pedestal.enterAria,
            { exhibit: exhibitCopy.name },
          )}
          onClick={openDarkroom}
          className="mt-3 flex h-9 w-full items-center justify-between border border-white/10 bg-white/[0.018] px-3 font-mono text-[8px] text-mist/60 transition-colors hover:border-[var(--vfx-secondary)]/40 hover:bg-[var(--vfx-secondary)]/[0.055] hover:text-frost"
        >
          <span>{t.gallery.pedestal.enter}</span>
          <span className="flex items-center gap-2 text-[var(--vfx-secondary)]/70">
            {t.gallery.pedestal.enterCompact}
            <ArrowUpRight size={11} strokeWidth={1.6} />
          </span>
        </button>
      </div>
    </article>
  )
}
