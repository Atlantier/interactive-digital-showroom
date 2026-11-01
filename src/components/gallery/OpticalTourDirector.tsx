import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion'
import {
  ArrowRight,
  Atom,
  AudioWaveform,
  CircleDotDashed,
  Clapperboard,
  Cpu,
  GitFork,
  Network,
  Orbit,
  Pause,
  Play,
  ScanLine,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import {
  formatTranslation,
  useI18n,
} from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import { useAppStore } from '../../store/useAppStore'
import {
  GALLERY_EXHIBITS,
  OPTICAL_TOUR_CLIMAX_MS,
  OPTICAL_TOUR_STEP_MS,
  useGalleryStore,
  type GalleryExhibitId,
} from '../../store/useGalleryStore'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import { useSmoothScroll } from '../layout/SmoothScroll'

const DOCK_ICONS: Record<GalleryExhibitId, LucideIcon> = {
  'prism-caustics': Sparkles,
  'laser-scan-hologram': ScanLine,
  'particle-morph': Orbit,
  'plasma-reactor': Atom,
  'photonic-mesh': GitFork,
  'orbital-lens': AudioWaveform,
  'quantum-lattice': Network,
  'phase-torus': Cpu,
}

const DOCK_COLORS = [
  '#74f7e5',
  '#61b7ff',
  '#ff9e58',
  '#ffcf6e',
  '#7bffb2',
  '#a78bfa',
  '#56d8ff',
  '#ffd86b',
] as const

export function OpticalTourDirector() {
  const { t } = useI18n()
  const reducedMotion = useReducedMotion()
  const lenis = useSmoothScroll()
  const playSound = useInterfaceSound()
  const commandPaletteOpen = useAppStore(
    (state) => state.commandPaletteOpen,
  )
  const activeExhibitId = useGalleryStore(
    (state) => state.activeExhibitId,
  )
  const isTourActive = useGalleryStore(
    (state) => state.isTourActive,
  )
  const opticalTourIndex = useGalleryStore(
    (state) => state.opticalTourIndex,
  )
  const opticalTourPaused = useGalleryStore(
    (state) => state.opticalTourPaused,
  )
  const opticalTourMode = useGalleryStore(
    (state) => state.opticalTourMode,
  )
  const opticalTourClimaxExhibitId = useGalleryStore(
    (state) => state.opticalTourClimaxExhibitId,
  )
  const cinemaCleanView = useGalleryStore(
    (state) => state.cinemaCleanView,
  )
  const setActiveExhibitId = useGalleryStore(
    (state) => state.setActiveExhibitId,
  )
  const setOpticalTourIndex = useGalleryStore(
    (state) => state.setOpticalTourIndex,
  )
  const advanceOpticalTour = useGalleryStore(
    (state) => state.advanceOpticalTour,
  )
  const stopOpticalTour = useGalleryStore(
    (state) => state.stopOpticalTour,
  )
  const toggleOpticalTourPaused = useGalleryStore(
    (state) => state.toggleOpticalTourPaused,
  )
  const triggerOpticalTourClimax = useGalleryStore(
    (state) => state.triggerOpticalTourClimax,
  )
  const [galleryInView, setGalleryInView] = useState(false)
  const [viewportExhibitIndex, setViewportExhibitIndex] =
    useState(0)
  const progressRef = useRef<HTMLSpanElement>(null)
  const clockRef = useRef<HTMLSpanElement>(null)
  const hudRef = useRef<HTMLDivElement>(null)
  const elapsedRef = useRef(0)
  const lastTickRef = useRef(0)
  const lastStepRef = useRef(-1)
  const climaxFiredRef = useRef(false)
  const currentExhibit = GALLERY_EXHIBITS[opticalTourIndex]
  const activeExhibitIndex = activeExhibitId
    ? GALLERY_EXHIBITS.findIndex(
        (exhibit) => exhibit.id === activeExhibitId,
      )
    : -1
  const dockExhibitIndex =
    activeExhibitIndex >= 0
      ? activeExhibitIndex
      : isTourActive
        ? opticalTourIndex
        : viewportExhibitIndex
  const dockExhibit =
    GALLERY_EXHIBITS[dockExhibitIndex] ?? GALLERY_EXHIBITS[0]
  const dockVisible =
    (galleryInView || activeExhibitId !== null) &&
    !commandPaletteOpen &&
    !cinemaCleanView
  const directorCopy = t.gallery.tourDirector

  useEffect(() => {
    const section = document.getElementById('gallery')
    if (!section) return
    const observer = new IntersectionObserver(
      ([entry]) => setGalleryInView(entry.isIntersecting),
      {
        threshold: [0, 0.02, 0.08, 0.2],
        rootMargin: '80px 0px',
      },
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const pedestals = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-exhibit-pedestal]',
      ),
    )
    if (pedestals.length === 0) return
    const ratios = new Map<number, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!(entry.target instanceof HTMLElement)) continue
          ratios.set(
            Number(entry.target.dataset.exhibitIndex ?? 0),
            entry.isIntersecting ? entry.intersectionRatio : 0,
          )
        }
        let nearestIndex = 0
        let nearestRatio = 0
        for (const [index, ratio] of ratios) {
          if (ratio <= nearestRatio) continue
          nearestIndex = index
          nearestRatio = ratio
        }
        if (nearestRatio > 0) {
          setViewportExhibitIndex(nearestIndex)
        }
      },
      {
        threshold: [0, 0.08, 0.18, 0.32, 0.5, 0.72, 1],
        rootMargin: '-18% 0px -18% 0px',
      },
    )
    pedestals.forEach((pedestal) => observer.observe(pedestal))
    return () => observer.disconnect()
  }, [])

  const scrollToExhibit = useCallback(
    (index: number) => {
      const exhibit = GALLERY_EXHIBITS[index]
      if (!exhibit) return
      const element = document.querySelector<HTMLElement>(
        `[data-exhibit-pedestal][data-exhibit-index="${index}"]`,
      )
      if (!element) return
      if (lenis) {
        lenis.start()
        lenis.scrollTo(element, {
          offset: -112,
          duration: reducedMotion ? 0 : 1.2,
        })
        return
      }
      element.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'center',
      })
    },
    [lenis, reducedMotion],
  )

  useEffect(() => {
    if (!isTourActive) return
    if (opticalTourMode === 'darkroom') {
      setActiveExhibitId(currentExhibit.id)
      return
    }
    setActiveExhibitId(null)
    const frame = window.requestAnimationFrame(() => {
      scrollToExhibit(opticalTourIndex)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [
    currentExhibit.id,
    isTourActive,
    opticalTourIndex,
    opticalTourMode,
    scrollToExhibit,
    setActiveExhibitId,
  ])

  useEffect(() => {
    if (!isTourActive || opticalTourPaused || commandPaletteOpen) {
      return
    }
    if (lastStepRef.current !== opticalTourIndex) {
      lastStepRef.current = opticalTourIndex
      elapsedRef.current = 0
      lastTickRef.current = performance.now()
      climaxFiredRef.current = false
    }
    let animationFrame = 0
    const tick = (now: number) => {
      const delta = Math.min(250, now - lastTickRef.current)
      lastTickRef.current = now
      elapsedRef.current = Math.min(
        OPTICAL_TOUR_STEP_MS,
        elapsedRef.current + delta,
      )
      const progress = elapsedRef.current / OPTICAL_TOUR_STEP_MS
      if (progressRef.current) {
        progressRef.current.style.transform =
          `scaleX(${progress.toFixed(4)})`
      }
      if (clockRef.current) {
        clockRef.current.textContent =
          `${(elapsedRef.current / 1_000).toFixed(1)} / 6.0`
      }
      if (hudRef.current) {
        hudRef.current.dataset.opticalTourElapsed =
          (elapsedRef.current / 1_000).toFixed(2)
      }
      if (
        !climaxFiredRef.current &&
        elapsedRef.current >= OPTICAL_TOUR_CLIMAX_MS
      ) {
        climaxFiredRef.current = true
        triggerOpticalTourClimax(currentExhibit.id)
      }
      if (elapsedRef.current >= OPTICAL_TOUR_STEP_MS) {
        advanceOpticalTour()
        return
      }
      animationFrame = window.requestAnimationFrame(tick)
    }
    lastTickRef.current = performance.now()
    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [
    advanceOpticalTour,
    commandPaletteOpen,
    currentExhibit.id,
    isTourActive,
    opticalTourIndex,
    opticalTourPaused,
    triggerOpticalTourClimax,
  ])

  const jumpToExhibit = (index: number) => {
    playSound('navigate')
    setViewportExhibitIndex(index)
    if (isTourActive) {
      setOpticalTourIndex(index)
      if (opticalTourMode === 'gallery') scrollToExhibit(index)
      return
    }
    if (activeExhibitId !== null) {
      setActiveExhibitId(GALLERY_EXHIBITS[index].id)
      return
    }
    scrollToExhibit(index)
  }

  const toggleTourPaused = () => {
    playSound('toggle')
    toggleOpticalTourPaused()
  }

  const skipExhibit = () => {
    playSound('navigate')
    advanceOpticalTour()
  }

  const exitTour = () => {
    playSound('navigate')
    stopOpticalTour()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <AnimatePresence>
        {isTourActive && !commandPaletteOpen && !cinemaCleanView ? (
          <motion.div
            ref={hudRef}
            data-optical-tour-hud
            data-optical-tour-active="true"
            data-optical-tour-index={opticalTourIndex}
            data-optical-tour-paused={
              opticalTourPaused ? 'true' : 'false'
            }
            data-optical-tour-mode={opticalTourMode ?? 'gallery'}
            data-optical-tour-climax-exhibit={
              opticalTourClimaxExhibitId ?? ''
            }
            data-optical-tour-climax-fired={
              opticalTourClimaxExhibitId === currentExhibit.id
                ? 'true'
                : 'false'
            }
            data-optical-tour-step-ms={OPTICAL_TOUR_STEP_MS}
            data-optical-tour-climax-ms={OPTICAL_TOUR_CLIMAX_MS}
            initial={
              reducedMotion
                ? false
                : { opacity: 0, y: -16, scale: 0.985 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.987 }}
            transition={{
              duration: 0.32,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="fixed left-1/2 top-[74px] z-[145] w-[min(880px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden border border-[var(--vfx-secondary)]/28 bg-[#03080c]/92 shadow-[0_24px_72px_rgba(0,0,0,0.62)] backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-3 py-2 sm:px-4">
              <span className="flex items-center gap-2 font-mono text-[7px] text-[var(--vfx-secondary)]/72">
                <Clapperboard size={10} strokeWidth={1.7} />
                {directorCopy.live}
              </span>
              <span className="font-mono text-[7px] text-mist/32">
                {formatTranslation(directorCopy.chapter, {
                  current: String(opticalTourIndex + 1).padStart(
                    2,
                    '0',
                  ),
                  total: String(GALLERY_EXHIBITS.length).padStart(
                    2,
                    '0',
                  ),
                })}
              </span>
            </div>
            <div className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4">
              <div className="min-w-0">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[8px] text-[var(--vfx-tertiary)]/72">
                    E-
                    {String(opticalTourIndex + 1).padStart(2, '0')}
                  </span>
                  <p
                    aria-live="polite"
                    className="truncate text-[15px] text-frost/92 sm:text-lg"
                  >
                    {t.gallery.exhibits[currentExhibit.id].name}
                  </p>
                </div>
                <div className="mt-1.5 flex items-center gap-2 font-mono text-[6px] text-mist/30">
                  <span>{directorCopy.autoClimax}</span>
                  <span className="size-1 bg-[#ffd36a] shadow-[0_0_8px_#ffd36a]" />
                  <span className="truncate">
                    {currentExhibit.formula}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="mr-1 hidden min-w-14 text-right font-mono text-[7px] text-mist/36 sm:inline">
                  <span ref={clockRef}>0.0 / 6.0</span>
                </span>
                <button
                  type="button"
                  data-optical-tour-pause
                  aria-label={
                    opticalTourPaused
                      ? directorCopy.resume
                      : directorCopy.pause
                  }
                  title={
                    opticalTourPaused
                      ? directorCopy.resume
                      : directorCopy.pause
                  }
                  onClick={toggleTourPaused}
                  className="grid size-8 place-items-center border border-white/10 text-mist/62 transition-colors hover:border-[var(--vfx-secondary)]/45 hover:text-frost"
                >
                  {opticalTourPaused ? (
                    <Play size={12} strokeWidth={1.7} />
                  ) : (
                    <Pause size={12} strokeWidth={1.7} />
                  )}
                </button>
                <button
                  type="button"
                  data-optical-tour-skip
                  aria-label={directorCopy.skip}
                  title={directorCopy.skip}
                  onClick={skipExhibit}
                  className="grid size-8 place-items-center border border-white/10 text-mist/62 transition-colors hover:border-[var(--vfx-secondary)]/45 hover:text-frost"
                >
                  <ArrowRight size={13} strokeWidth={1.7} />
                </button>
                <button
                  type="button"
                  data-optical-tour-exit
                  aria-label={directorCopy.exit}
                  title={directorCopy.exit}
                  onClick={exitTour}
                  className="grid size-8 place-items-center border border-white/10 text-mist/42 transition-colors hover:border-[#ff8f66]/40 hover:text-[#ffb490]"
                >
                  <X size={13} strokeWidth={1.7} />
                </button>
              </div>
            </div>
            <div className="h-px overflow-hidden bg-white/[0.055]">
              <span
                ref={progressRef}
                className="block h-full origin-left bg-gradient-to-r from-[var(--vfx-secondary)] via-[#73fff1] to-[#ffd36a] shadow-[0_0_12px_var(--vfx-secondary)]"
                style={{ transform: 'scaleX(0)' }}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {dockVisible ? (
          <motion.nav
            data-gallery-quick-dock
            data-gallery-quick-active-index={dockExhibitIndex}
            data-gallery-quick-visible="true"
            aria-label={directorCopy.quickDock}
            initial={
              reducedMotion ? false : { opacity: 0, y: 18, scale: 0.98 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.985 }}
            transition={{
              duration: 0.28,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="fixed bottom-3 left-1/2 z-[150] w-[min(760px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-[18px] border border-white/[0.12] bg-[#05090d]/78 shadow-[0_22px_70px_rgba(0,0,0,0.64),inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-2xl sm:bottom-5"
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.065] px-3 py-2 sm:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <CircleDotDashed
                  size={10}
                  strokeWidth={1.7}
                  className="shrink-0 text-[var(--vfx-secondary)]"
                />
                <span className="truncate text-[10px] text-frost/82">
                  {t.gallery.exhibits[dockExhibit.id].name}
                </span>
                <span className="font-mono text-[6px] text-mist/26">
                  {String(dockExhibitIndex + 1).padStart(2, '0')} /
                  {String(GALLERY_EXHIBITS.length).padStart(2, '0')}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2 font-mono text-[6px] text-mist/32">
                <span className="hidden shrink-0 text-mist/24 sm:inline">
                  {directorCopy.coreFormula}
                </span>
                <code className="max-w-[46vw] truncate text-[var(--vfx-secondary)]/60">
                  {dockExhibit.formula}
                </code>
              </div>
            </div>
            <div className="flex items-end justify-center gap-1 px-2 py-2 sm:gap-1.5 sm:px-3">
              {GALLERY_EXHIBITS.map((exhibit, index) => {
                const Icon = DOCK_ICONS[exhibit.id]
                const active = index === dockExhibitIndex
                return (
                  <button
                    key={exhibit.id}
                    type="button"
                    data-gallery-quick-item={index}
                    data-gallery-quick-exhibit={exhibit.id}
                    aria-label={t.gallery.exhibits[exhibit.id].name}
                    aria-current={active ? 'true' : undefined}
                    title={`${String(index + 1).padStart(2, '0')} ${t.gallery.exhibits[exhibit.id].name}`}
                    onClick={() => jumpToExhibit(index)}
                    style={
                      {
                        '--dock-color': DOCK_COLORS[index],
                      } as CSSProperties
                    }
                    className={cn(
                      'group/dock relative grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:h-9 sm:w-9',
                      active
                        ? '-translate-y-1 scale-105 border-[var(--dock-color)]/45 bg-[var(--dock-color)]/[0.1] text-[var(--dock-color)] shadow-[0_8px_24px_color-mix(in_srgb,var(--dock-color)_22%,transparent)]'
                        : 'border-white/[0.08] bg-white/[0.03] text-mist/48 hover:-translate-y-0.5 hover:border-white/20 hover:text-frost',
                    )}
                  >
                    <Icon
                      size={14}
                      strokeWidth={active ? 1.85 : 1.55}
                    />
                    <span className="absolute -bottom-0.5 right-0.5 font-mono text-[5px] opacity-45">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </button>
                )
              })}
            </div>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </>,
    document.body,
  )
}
