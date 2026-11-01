import {
  Clock3,
  Orbit,
  Pause,
  Play,
  SlidersHorizontal,
  Sparkles,
  Waves,
} from 'lucide-react'
import {
  useRef,
  type CSSProperties,
} from 'react'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import {
  formatTranslation,
  useI18n,
} from '../../i18n/useI18n'
import {
  GALLERY_EXHIBITS,
  useGalleryStore,
} from '../../store/useGalleryStore'
import { ExhibitPedestal } from './ExhibitPedestal'

export function GallerySection() {
  const { t } = useI18n()
  const sectionRef = useRef<HTMLElement>(null)
  const isTourActive = useGalleryStore(
    (state) => state.isTourActive,
  )
  const opticalTourIndex = useGalleryStore(
    (state) => state.opticalTourIndex,
  )
  const opticalTourPaused = useGalleryStore(
    (state) => state.opticalTourPaused,
  )
  const startOpticalTour = useGalleryStore(
    (state) => state.startOpticalTour,
  )
  const toggleOpticalTourPaused = useGalleryStore(
    (state) => state.toggleOpticalTourPaused,
  )
  const timeScale = useGalleryStore((state) => state.timeScale)
  const setTimeScale = useGalleryStore((state) => state.setTimeScale)
  const modalOpen = useGalleryStore(
    (state) => state.activeExhibitId !== null,
  )
  const playSound = useInterfaceSound()
  const tourExhibit = GALLERY_EXHIBITS[opticalTourIndex]
  const directorCopy = t.gallery.tourDirector
  const tourActionLabel = !isTourActive
    ? directorCopy.launch
    : opticalTourPaused
      ? directorCopy.resume
      : directorCopy.pause

  return (
    <section
      ref={sectionRef}
      id="gallery"
      data-gallery-section
      data-gallery-tour-active={isTourActive ? 'true' : 'false'}
      data-gallery-tour-index={opticalTourIndex}
      data-gallery-tour-paused={
        opticalTourPaused ? 'true' : 'false'
      }
      data-gallery-timescale-value={timeScale.toFixed(2)}
      className="gallery-section relative z-10 overflow-hidden border-t border-white/[0.07] bg-[#020406]/96"
    >
      <div
        aria-hidden="true"
        className="gallery-section-grid pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[640px] w-[1100px] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgb(var(--vfx-primary-rgb)/7%),transparent_66%)]"
      />

      <div className="relative mx-auto max-w-[1600px] px-5 py-20 sm:px-8 sm:py-28 md:px-12 lg:py-32">
        <div className="grid h-[597px] gap-12 border-b border-white/[0.085] pb-12 max-[359px]:h-[712px] sm:h-[641px] md:h-[680px] lg:h-[583px] lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] lg:items-end lg:gap-20 xl:h-[575px] min-[1600px]:h-[485px]">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[9px] text-mist/45">
              <span className="flex items-center gap-2 text-[var(--vfx-secondary)]">
                <Waves size={12} strokeWidth={1.55} />
                {t.gallery.eyebrow}
              </span>
              <span className="h-2.5 w-px bg-white/12" />
              <span>{t.gallery.liveExhibits}</span>
            </div>
            <h2 className="mt-7 max-w-[900px] text-4xl font-medium leading-[1.02] text-frost sm:text-6xl md:text-7xl xl:text-[88px]">
              {t.gallery.titleLineOne}
              <br />
              {t.gallery.titleLineTwo}
            </h2>
            <p className="mt-7 max-w-2xl text-base leading-7 text-mist sm:text-lg sm:leading-8">
              {t.gallery.description}
            </p>
          </div>

          <div className="gallery-control-console border border-white/[0.085] bg-black/28 p-4 backdrop-blur-md sm:p-5">
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] pb-3">
              <div>
                <p className="flex items-center gap-2 font-mono text-[7px] text-[var(--vfx-secondary)]/62">
                  <Orbit size={9} strokeWidth={1.55} />
                  {t.gallery.demonstration}
                </p>
                <p className="mt-1.5 text-sm text-frost/82">
                  {isTourActive
                    ? formatTranslation(t.gallery.touring, {
                        exhibit:
                          t.gallery.exhibits[tourExhibit.id].name,
                      })
                    : t.gallery.tourStandby}
                </p>
              </div>
              <button
                type="button"
                data-gallery-tour-toggle
                aria-label={tourActionLabel}
                aria-pressed={isTourActive}
                onClick={() => {
                  if (isTourActive) {
                    toggleOpticalTourPaused()
                  } else {
                    startOpticalTour('gallery')
                  }
                  playSound('toggle')
                }}
                className={
                  isTourActive
                    ? 'flex h-9 items-center gap-2 border border-[#ffd36a]/42 bg-[#ffd36a]/[0.07] px-3 font-mono text-[8px] text-[#ffe7a8]'
                    : 'flex h-9 items-center gap-2 border border-[#ffd36a]/34 bg-[#ffd36a]/[0.05] px-3 font-mono text-[8px] text-[#ffe7a8] transition-colors hover:border-[#ffd36a]/70 hover:bg-[#ffd36a]/[0.1]'
                }
              >
                {!isTourActive ? (
                  <Sparkles size={11} strokeWidth={1.7} />
                ) : opticalTourPaused ? (
                  <Play size={11} strokeWidth={1.7} />
                ) : (
                  <Pause size={11} strokeWidth={1.7} />
                )}
                <span className="hidden xl:inline">
                  {tourActionLabel}
                </span>
                <span className="xl:hidden">
                  {isTourActive
                    ? opticalTourPaused
                      ? directorCopy.resume
                      : directorCopy.pause
                    : directorCopy.launchShort}
                </span>
              </button>
            </div>

            <label className="mt-4 block">
              <span className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-mono text-[8px] text-mist/42">
                  <Clock3 size={9} strokeWidth={1.55} />
                  {t.gallery.timeScale}
                </span>
                <span className="font-mono text-[9px] text-[var(--vfx-tertiary)]/75">
                  {t.common.symbols.deltaTime}{' '}
                  {timeScale.toFixed(2)}
                  {t.common.symbols.multiplier}
                </span>
              </span>
              <input
                type="range"
                data-gallery-timescale
                aria-label={t.gallery.timeScaleAria}
                min={0.05}
                max={2}
                step={0.01}
                value={timeScale}
                onChange={(event) =>
                  setTimeScale(Number(event.target.value))
                }
                className="darkroom-range mt-3 w-full"
                style={{
                  '--range-progress': `${
                    ((timeScale - 0.05) / 1.95) * 100
                  }%`,
                } as CSSProperties}
              />
            </label>

            <div className="mt-4 flex items-center justify-between border-t border-white/[0.065] pt-3 font-mono text-[7px] text-mist/28">
              <span className="flex items-center gap-1.5">
                <SlidersHorizontal size={8} />
                {t.gallery.sharedViews}
              </span>
              <span>
                {String(opticalTourIndex + 1).padStart(2, '0')}/
                {String(GALLERY_EXHIBITS.length).padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>

        <div
          data-gallery-grid
          className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12"
        >
          {GALLERY_EXHIBITS.map((exhibit, index) => (
            <ExhibitPedestal
              key={exhibit.id}
              exhibitId={exhibit.id}
              index={index}
              tourCurrent={
                isTourActive &&
                opticalTourIndex === index &&
                !modalOpen
              }
            />
          ))}
        </div>

        <div className="mt-8 flex h-[76px] flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] pt-4 font-mono text-[8px] text-mist/30 sm:h-[38px]">
          <span>
            {t.gallery.footerPipeline}
          </span>
          <span className="flex items-center gap-2">
            <span className="size-1 bg-[var(--vfx-secondary)] shadow-[0_0_8px_var(--vfx-secondary)]" />
            {t.gallery.opticalBusOnline}
          </span>
        </div>
      </div>
    </section>
  )
}
