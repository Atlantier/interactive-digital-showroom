import { View } from '@react-three/drei'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CircleGauge,
  Crosshair,
  Eye,
  EyeOff,
  Maximize2,
  RotateCcw,
  ScanEye,
  Sparkles,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useInViewAnimation } from '../../hooks/useInViewAnimation'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import {
  formatTranslation,
  useI18n,
} from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import {
  GALLERY_PRESETS,
  useGalleryStore,
  type ExhibitMeta,
} from '../../store/useGalleryStore'
import {
  SPECTRUM_RANGE,
  wavelengthGradientCss,
  wavelengthToRgb,
} from '../../utils/optics'
import { useSmoothScroll } from '../layout/SmoothScroll'
import {
  createGalleryPointerState,
  createOrbitCameraState,
  ExhibitSceneEntrance,
  OpticalExhibitScene,
} from './OpticalExhibitScene'
import { HologramModelSelector } from './HologramModelSelector'
import { ParticleMorphSelector } from './ParticleMorphSelector'
import { PrismInteractionSurface } from './PrismInteractionSurface'
import { PrismShapeSelector } from './PrismShapeSelector'
import { ReactorOverdriveButton } from './ReactorOverdriveButton'
import { RayBounceMazeControls } from './RayBounceMazeControls'
import { AudioStageLightPads } from './AudioStageLightPads'
import { AudioStageModeSelector } from './AudioStageModeSelector'
import { AudioStagePlayButton } from './AudioStagePlayButton'
import { NeuralInferenceControls } from './NeuralInferenceControls'
import { GpuComputeModeControls } from './GpuComputeModeControls'

const TIME_SCALE_MIN = 0.05
const TIME_SCALE_MAX = 2
const SPECTRAL_GRADIENT = wavelengthGradientCss(5)

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function photonFlux(exhibit: ExhibitMeta) {
  const values = Object.values(exhibit.params)
  const power = Math.max(
    0.1,
    values.reduce((sum, value) => sum + Math.abs(value), 0) /
      Math.max(1, values.length),
  )
  return power * 8.2e6
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        'input, textarea, select, [contenteditable="true"], [role="textbox"]',
      ),
    )
  )
}

export function DarkroomInspectorModal() {
  const { t } = useI18n()
  const activeExhibit = useGalleryStore(
    (state) =>
      state.exhibits.find(
        (exhibit) => exhibit.id === state.activeExhibitId,
      ) ?? null,
  )
  const isTourActive = useGalleryStore(
    (state) => state.isTourActive,
  )
  const opticalTourPaused = useGalleryStore(
    (state) => state.opticalTourPaused,
  )
  const cinemaCleanView = useGalleryStore(
    (state) => state.cinemaCleanView,
  )
  const setCinemaCleanView = useGalleryStore(
    (state) => state.setCinemaCleanView,
  )
  const toggleCinemaCleanView = useGalleryStore(
    (state) => state.toggleCinemaCleanView,
  )
  const timeScale = useGalleryStore((state) => state.timeScale)
  const laserWavelength = useGalleryStore(
    (state) => state.laserWavelength,
  )
  const presetByExhibit = useGalleryStore(
    (state) => state.presetByExhibit,
  )
  const setActiveExhibitId = useGalleryStore(
    (state) => state.setActiveExhibitId,
  )
  const startOpticalTour = useGalleryStore(
    (state) => state.startOpticalTour,
  )
  const stopOpticalTour = useGalleryStore(
    (state) => state.stopOpticalTour,
  )
  const toggleOpticalTourPaused = useGalleryStore(
    (state) => state.toggleOpticalTourPaused,
  )
  const setOpticalTourIndex = useGalleryStore(
    (state) => state.setOpticalTourIndex,
  )
  const setTimeScale = useGalleryStore((state) => state.setTimeScale)
  const setLaserWavelength = useGalleryStore(
    (state) => state.setLaserWavelength,
  )
  const applyExhibitPreset = useGalleryStore(
    (state) => state.applyExhibitPreset,
  )
  const updateExhibitParam = useGalleryStore(
    (state) => state.updateExhibitParam,
  )
  const resetExhibitParams = useGalleryStore(
    (state) => state.resetExhibitParams,
  )
  const stepActiveExhibit = useGalleryStore(
    (state) => state.stepActiveExhibit,
  )
  const triggerHologramGlitch = useGalleryStore(
    (state) => state.triggerHologramGlitch,
  )
  const stageRef = useRef<HTMLDivElement>(null)
  const viewTrackRef = stageRef as unknown as RefObject<HTMLElement>
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const pointerRef = useRef(createGalleryPointerState())
  const orbitRef = useRef(createOrbitCameraState())
  const dragStateRef = useRef({
    pointerId: -1,
    x: 0,
    y: 0,
    mode: 'none' as
      | 'none'
      | 'force'
      | 'optical'
      | 'orbit'
      | 'pan',
  })
  const fpsRef = useRef<HTMLSpanElement>(null)
  const fluxRef = useRef<HTMLParagraphElement>(null)
  const activeExhibitRef = useRef<ExhibitMeta | null>(activeExhibit)
  activeExhibitRef.current = activeExhibit
  const activePresetId = activeExhibit
    ? (presetByExhibit[activeExhibit.id] ?? null)
    : null
  const laserRgb = useMemo(
    () => wavelengthToRgb(laserWavelength),
    [laserWavelength],
  )
  const laserColor = `rgb(${laserRgb.r}, ${laserRgb.g}, ${laserRgb.b})`
  const open = activeExhibit !== null
  const inView = useInViewAnimation(stageRef, {
    rootMargin: '0px',
    threshold: 0.01,
    enabled: open,
  })
  const lenis = useSmoothScroll()
  const playSound = useInterfaceSound()
  const reducedMotion = useReducedMotion()
  const exhibitIndex = useGalleryStore((state) =>
    Math.max(
      0,
      state.exhibits.findIndex(
        (exhibit) => exhibit.id === state.activeExhibitId,
      ),
    ),
  )
  const totalExhibits = useGalleryStore(
    (state) => state.exhibits.length,
  )

  const close = useCallback(() => {
    playSound('navigate')
    stopOpticalTour()
    setActiveExhibitId(null)
  }, [playSound, setActiveExhibitId, stopOpticalTour])

  const navigateExhibit = useCallback(
    (direction: 1 | -1) => {
      playSound('navigate')
      const galleryState = useGalleryStore.getState()
      if (galleryState.isTourActive) {
        const currentIndex = Math.max(
          0,
          galleryState.exhibits.findIndex(
            (exhibit) =>
              exhibit.id === galleryState.activeExhibitId,
          ),
        )
        setOpticalTourIndex(
          (currentIndex +
            direction +
            galleryState.exhibits.length) %
            galleryState.exhibits.length,
        )
        return
      }
      stepActiveExhibit(direction)
    },
    [playSound, setOpticalTourIndex, stepActiveExhibit],
  )

  useEffect(() => {
    if (!open) return

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    lenis?.stop()
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (cinemaCleanView) {
          setCinemaCleanView(false)
        } else {
          close()
        }
        return
      }
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isInteractiveTarget(event.target)
      ) {
        return
      }
      if (
        !event.shiftKey &&
        event.key.toLocaleLowerCase() === 'h'
      ) {
        event.preventDefault()
        toggleCinemaCleanView()
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        navigateExhibit(event.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      lenis?.start()
      returnFocusRef.current?.focus()
    }
  }, [
    cinemaCleanView,
    close,
    lenis,
    navigateExhibit,
    open,
    setCinemaCleanView,
    toggleCinemaCleanView,
  ])

  useEffect(() => {
    if (!open) return
    const stage = stageRef.current
    if (!stage) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      orbitRef.current.distance = clamp(
        orbitRef.current.distance + event.deltaY * 0.0025,
        2.3,
        8.4,
      )
      stage.dataset.cameraDistance =
        orbitRef.current.distance.toFixed(3)
    }

    stage.addEventListener('wheel', handleWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleWheel)
  }, [open])

  useEffect(() => {
    if (!open) return
    let animationFrame = 0
    let frames = 0
    let sampleStartedAt = performance.now()

    const tick = (timestamp: number) => {
      frames += 1
      const elapsed = timestamp - sampleStartedAt
      if (elapsed >= 500) {
        const fps = (frames * 1_000) / elapsed
        if (fpsRef.current) {
          fpsRef.current.textContent = fps.toFixed(0)
        }
        if (fluxRef.current) {
          const exhibit = activeExhibitRef.current
          const flux = exhibit
            ? (photonFlux(exhibit) / Math.max(0.1, timeScale)).toExponential(
                2,
              )
            : '0.00e+0'
          fluxRef.current.textContent = flux
        }
        frames = 0
        sampleStartedAt = timestamp
      }
      animationFrame = window.requestAnimationFrame(tick)
    }

    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [open, timeScale])

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
    pointerRef.current.u = u
    pointerRef.current.v = v
    pointerRef.current.active = true
    event.currentTarget.style.setProperty(
      '--gallery-pointer-x',
      `${((u + 1) * 50).toFixed(2)}%`,
    )
    event.currentTarget.style.setProperty(
      '--gallery-pointer-y',
      `${((1 - v) * 50).toFixed(2)}%`,
    )
  }

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      event.target instanceof Element &&
      event.target.closest('button, input, a')
    ) {
      return
    }
    if (event.button !== 0 && event.button !== 2) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStateRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      mode:
        event.button === 2
          ? 'pan'
          : activeExhibitRef.current?.id === 'photonic-mesh' &&
              !event.altKey
            ? 'optical'
          : activeExhibitRef.current?.id === 'particle-morph' &&
              !event.altKey
            ? 'force'
            : 'orbit',
    }
    pointerRef.current.dragging = true
    pointerRef.current.forceActive =
      dragStateRef.current.mode === 'force'
    event.currentTarget.dataset.dragging = 'true'
    event.currentTarget.dataset.galleryDragMode =
      dragStateRef.current.mode
    updatePointer(event)
    if (
      event.button === 0 &&
      (activeExhibitRef.current?.id === 'plasma-reactor' ||
        activeExhibitRef.current?.id === 'quantum-lattice' ||
        activeExhibitRef.current?.id === 'phase-torus')
    ) {
      pointerRef.current.impulse += 1
    }
  }

  const handlePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    updatePointer(event)
    const drag = dragStateRef.current
    if (drag.mode === 'none' || drag.pointerId !== event.pointerId) {
      return
    }
    if (drag.mode === 'force' || drag.mode === 'optical') return
    const deltaX = event.clientX - drag.x
    const deltaY = event.clientY - drag.y
    drag.x = event.clientX
    drag.y = event.clientY

    if (drag.mode === 'orbit') {
      orbitRef.current.yaw -= deltaX * 0.005
      orbitRef.current.pitch = clamp(
        orbitRef.current.pitch - deltaY * 0.0045,
        -1.05,
        1.05,
      )
    } else {
      orbitRef.current.panX -= deltaX * orbitRef.current.distance * 0.0018
      orbitRef.current.panY += deltaY * orbitRef.current.distance * 0.0018
    }
    event.currentTarget.dataset.cameraYaw =
      orbitRef.current.yaw.toFixed(4)
    event.currentTarget.dataset.cameraPanX =
      orbitRef.current.panX.toFixed(4)
  }

  const releasePointer = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragStateRef.current.mode = 'none'
    pointerRef.current.dragging = false
    pointerRef.current.forceActive = false
    event.currentTarget.dataset.dragging = 'false'
    event.currentTarget.dataset.galleryDragMode = 'none'
  }

  const handlePointerLeave = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    releasePointer(event)
    pointerRef.current.active = false
  }

  const resetView = () => {
    Object.assign(
      orbitRef.current,
      createOrbitCameraState(),
    )
    Object.assign(
      pointerRef.current,
      createGalleryPointerState(),
    )
    if (stageRef.current) {
      stageRef.current.dataset.cameraPanX = '0.0000'
      stageRef.current.dataset.cameraPanY = '0.0000'
      stageRef.current.dataset.cameraYaw =
        orbitRef.current.yaw.toFixed(4)
    }
    playSound('toggle')
  }

  const resetParameters = () => {
    if (!activeExhibit) return
    resetExhibitParams(activeExhibit.id)
    playSound('toggle')
  }

  const modal = useMemo(() => {
    if (!activeExhibit) return null
    const exhibitCopy = t.gallery.exhibits[activeExhibit.id]
    const presetLabel = activePresetId
      ? t.gallery.presets[activePresetId].subtitle
      : t.gallery.darkroom.custom

    return (
      <motion.div
        data-darkroom-inspector
        data-localized-portal
        role="dialog"
        aria-modal="true"
        aria-labelledby="darkroom-title"
        data-darkroom-clean-view={
          cinemaCleanView ? 'true' : 'false'
        }
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.24 }}
        className={cn(
          'fixed inset-0 z-[110]',
          cinemaCleanView
            ? 'bg-[#010204] backdrop-blur-none'
            : 'bg-[#010204]/96 backdrop-blur-2xl',
        )}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) close()
        }}
      >
        <div
          aria-hidden="true"
          className={cn(
            'darkroom-grid pointer-events-none absolute inset-0 opacity-55',
            cinemaCleanView && 'hidden',
          )}
        />
        <p className="sr-only" aria-live="polite">
          {cinemaCleanView
            ? t.gallery.darkroom.cinemaCleanHint
            : ''}
        </p>
        {cinemaCleanView ? (
          <button
            type="button"
            data-darkroom-clean-exit
            aria-label={t.gallery.darkroom.cinemaCleanExit}
            title={t.gallery.darkroom.cinemaCleanExit}
            onClick={() => {
              setCinemaCleanView(false)
              playSound('toggle')
            }}
            className="absolute right-3 top-3 z-30 grid size-9 touch-manipulation place-items-center border border-white/[0.06] bg-black/25 text-white/25 opacity-40 backdrop-blur-md transition-[opacity,border-color,color] hover:border-white/20 hover:text-white/85 hover:opacity-100 focus-visible:border-white/30 focus-visible:text-white focus-visible:opacity-100 sm:right-4 sm:top-4"
          >
            <EyeOff size={13} strokeWidth={1.55} />
          </button>
        ) : null}
        {cinemaCleanView ? (
          <h2 id="darkroom-title" className="sr-only">
            {exhibitCopy.name}
          </h2>
        ) : null}
        <div
          className={cn(
            'relative grid h-svh',
            cinemaCleanView
              ? 'grid-cols-1 grid-rows-1'
              : 'grid-rows-[auto_minmax(280px,48svh)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_370px] lg:grid-rows-[72px_minmax(0,1fr)]',
          )}
        >
          {!cinemaCleanView ? (
            <header className="col-span-full flex min-w-0 flex-col items-stretch gap-2 border-b border-white/[0.08] bg-black/28 px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center border border-[var(--vfx-secondary)]/28 bg-[var(--vfx-secondary)]/[0.055] text-[var(--vfx-secondary)]">
                <ScanEye size={15} strokeWidth={1.55} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--vfx-secondary)]">
                  <span>{t.gallery.darkroom.eyebrow}</span>
                  <span className="h-2 w-px bg-white/12" />
                  <span>
                    {String(exhibitIndex + 1).padStart(2, '0')} /{' '}
                    {String(totalExhibits).padStart(2, '0')}
                  </span>
                </div>
                <h2
                  id="darkroom-title"
                  className="mt-1 text-base leading-tight text-frost sm:text-lg"
                >
                  {exhibitCopy.name}
                  <span className="ml-2 hidden font-mono text-[11px] font-normal text-[var(--text-tertiary)] sm:inline">
                    {exhibitCopy.designation}
                  </span>
                </h2>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-1.5">
              <button
                type="button"
                aria-label={t.gallery.darkroom.previous}
                title={t.gallery.darkroom.previous}
                onClick={() => navigateExhibit(-1)}
                className="grid size-8 place-items-center border border-white/10 text-[var(--text-secondary)] transition-colors hover:border-white/25 hover:text-frost"
              >
                <ArrowLeft size={13} strokeWidth={1.6} />
              </button>
              <button
                type="button"
                aria-label={t.gallery.darkroom.next}
                title={t.gallery.darkroom.next}
                onClick={() => navigateExhibit(1)}
                className="grid size-8 place-items-center border border-white/10 text-[var(--text-secondary)] transition-colors hover:border-white/25 hover:text-frost"
              >
                <ArrowRight size={13} strokeWidth={1.6} />
              </button>
              <button
                type="button"
                data-darkroom-tour-toggle
                aria-label={
                  isTourActive
                    ? opticalTourPaused
                      ? t.gallery.tourDirector.resume
                      : t.gallery.tourDirector.pause
                    : t.gallery.tourDirector.launch
                }
                aria-pressed={isTourActive}
                onClick={() => {
                  if (isTourActive) {
                    toggleOpticalTourPaused()
                  } else {
                    startOpticalTour('darkroom')
                  }
                  playSound('toggle')
                }}
                className={
                  isTourActive
                    ? 'grid size-8 place-items-center border border-[var(--vfx-secondary)]/45 bg-[var(--vfx-secondary)]/10 text-[var(--vfx-secondary)]'
                    : 'grid size-8 place-items-center border border-white/10 text-[var(--text-secondary)] transition-colors hover:border-white/25 hover:text-frost'
                }
              >
                <Sparkles size={13} strokeWidth={1.6} />
              </button>
              <button
                type="button"
                data-darkroom-clean-toggle
                aria-label={t.gallery.darkroom.cinemaClean}
                title={t.gallery.darkroom.cinemaClean}
                onClick={() => {
                  toggleCinemaCleanView()
                  playSound('toggle')
                }}
                className="grid size-8 place-items-center border border-white/10 text-[var(--text-secondary)] transition-colors hover:border-[var(--vfx-secondary)]/45 hover:text-[var(--vfx-secondary)]"
              >
                <Eye size={13} strokeWidth={1.6} />
              </button>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label={t.gallery.darkroom.close}
                title={t.gallery.darkroom.close}
                onClick={close}
                className="ml-1 grid size-9 place-items-center border border-white/12 text-[var(--text-secondary)] transition-colors hover:border-white/30 hover:text-frost"
              >
                <X size={15} strokeWidth={1.6} />
              </button>
            </div>
          </header>
          ) : null}

          <div
            className={cn(
              'relative min-h-0',
              !cinemaCleanView &&
                'border-b border-white/[0.07] lg:border-b-0 lg:border-r',
            )}
          >
            <div
              ref={stageRef}
              data-darkroom-viewport
              data-gallery-runtime-active={
                inView ? 'true' : 'false'
              }
              data-gallery-view-frames={
                inView ? 'infinite' : '0'
              }
              data-darkroom-active-exhibit={activeExhibit.id}
              data-darkroom-clean-render={
                cinemaCleanView ? 'true' : 'false'
              }
              data-particle-force-control={
                activeExhibit.id === 'particle-morph'
                  ? 'hold-left-alt-orbit'
                  : 'inactive'
              }
              className={cn(
                'darkroom-viewport relative h-full min-h-[260px] touch-none overflow-hidden lg:min-h-0',
                activeExhibit.id === 'laser-scan-hologram' &&
                  'cursor-ns-resize',
                activeExhibit.id === 'photonic-mesh' &&
                  'cursor-move',
              )}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={releasePointer}
              onPointerCancel={handlePointerLeave}
              onPointerLeave={handlePointerLeave}
              onContextMenu={(event) => event.preventDefault()}
              onClick={(event) => {
                if (
                  activeExhibit.id !== 'laser-scan-hologram' ||
                  (event.target instanceof HTMLElement &&
                    event.target.closest('button, input'))
                ) {
                  return
                }
                triggerHologramGlitch()
                playSound('toggle')
              }}
            >
              <View
                track={viewTrackRef}
                visible={inView}
                frames={inView ? Number.POSITIVE_INFINITY : 0}
                className="pointer-events-none absolute inset-0"
              >
                <ExhibitSceneEntrance key={activeExhibit.id}>
                  <OpticalExhibitScene
                    exhibit={activeExhibit}
                    pointerRef={pointerRef}
                    mode="darkroom"
                    orbitRef={orbitRef}
                    laserColor={laserColor}
                  />
                </ExhibitSceneEntrance>
              </View>

              {!cinemaCleanView ? (
                <>
                  <div
                    aria-hidden="true"
                    className="gallery-pointer-glow pointer-events-none absolute inset-0"
                  />
                  {activeExhibit.id === 'prism-caustics' ? (
                    <PrismInteractionSurface
                      exhibit={activeExhibit}
                      pointerRef={pointerRef}
                    />
                  ) : null}
                  <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 bg-black/55 px-2 py-1 font-mono text-[11px] text-[var(--vfx-secondary)]">
                <Crosshair size={9} strokeWidth={1.5} />
                {activeExhibit.id === 'particle-morph'
                  ? t.gallery.particleInteraction.darkroomHint
                  : activeExhibit.id === 'photonic-mesh'
                    ? t.gallery.rayMazeInteraction.darkroomHint
                    : activeExhibit.id === 'orbital-lens'
                      ? t.gallery.audioStageInteraction.sequenceHint
                      : activeExhibit.id === 'quantum-lattice'
                        ? t.gallery.neuralPulseInteraction.darkroomHint
                        : activeExhibit.id === 'phase-torus'
                          ? t.gallery.gpuComputeInteraction.stageHint
                  : t.gallery.darkroom.navigationHint}
                  </div>
                  {activeExhibit.id === 'laser-scan-hologram' ? (
                    <div className="pointer-events-none absolute left-4 top-14 bg-black/55 px-2 py-1 font-mono text-[11px] text-signal">
                      {t.gallery.hologramInteraction.hint}
                    </div>
                  ) : null}
                  <div className="pointer-events-none absolute bottom-4 left-4 bg-black/55 px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]">
                    {t.common.symbols.deltaTime}{' '}
                    {timeScale.toFixed(2)}
                    {t.common.symbols.multiplier} /{' '}
                    {t.gallery.darkroom.liveField}
                  </div>
                  <button
                    type="button"
                    aria-label={t.gallery.darkroom.resetCamera}
                    title={t.gallery.darkroom.resetCamera}
                    onClick={resetView}
                    className="absolute right-4 top-4 grid size-8 place-items-center border border-white/10 bg-black/28 text-[var(--text-secondary)] backdrop-blur-md transition-colors hover:border-white/25 hover:text-frost"
                  >
                    <Maximize2 size={12} strokeWidth={1.6} />
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {!cinemaCleanView ? (
            <aside
              data-darkroom-active-preset={activePresetId ?? 'custom'}
              className="flex min-h-0 flex-col overflow-hidden bg-[#04080b]/92"
            >
            <div className="terminal-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
              <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <p className="font-mono text-[11px] text-[var(--vfx-secondary)]">
                  {t.gallery.darkroom.parameterMatrix}
                </p>
                <h3 className="mt-2 text-lg text-frost">
                  {t.gallery.darkroom.parametersTitle}
                </h3>
              </div>
              <button
                type="button"
                aria-label={t.gallery.darkroom.resetParameters}
                title={t.gallery.darkroom.resetParameters}
                onClick={resetParameters}
                className="flex h-9 items-center gap-2 border border-white/10 px-2.5 font-mono text-[11px] text-[var(--text-secondary)] transition-colors hover:border-white/25 hover:text-frost"
              >
                <RotateCcw size={11} strokeWidth={1.6} />
                {t.gallery.darkroom.reset}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden border border-white/[0.065] bg-white/[0.065]">
              <div className="bg-[#050a0e] px-3 py-3">
                <p className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-secondary)]">
                  <CircleGauge size={8} /> {t.gallery.darkroom.render}
                </p>
                <p className="mt-1.5 flex items-end gap-1">
                  <span
                    ref={fpsRef}
                    data-darkroom-fps
                    className="text-xl leading-none text-frost"
                  >
                    --
                  </span>
                  <span className="pb-0.5 font-mono text-[11px] text-[var(--text-tertiary)]">
                    {t.common.units.fps}
                  </span>
                </p>
              </div>
              <div className="bg-[#050a0e] px-3 py-3">
                <p className="font-mono text-[11px] text-[var(--text-secondary)]">
                  {t.gallery.darkroom.photonFlux}
                </p>
                <p
                  ref={fluxRef}
                  data-darkroom-photon-flux
                  className="mt-1.5 text-[11px] text-[var(--vfx-secondary)]"
                >
                  0.00e+0
                </p>
                <span className="mt-1 block font-mono text-[11px] text-[var(--text-tertiary)]">
                  {t.gallery.darkroom.photonsPerSecond}
                </span>
              </div>
            </div>

            {activeExhibit.id === 'prism-caustics' ? (
              <div
                data-darkroom-prism-shape
                className="mt-4 border border-white/[0.065] bg-white/[0.018] p-2.5"
              >
                <span className="mb-2 block font-mono text-[11px] text-[var(--text-secondary)]">
                  {t.gallery.prismShapes.label}
                </span>
                <PrismShapeSelector variant="panel" />
              </div>
            ) : null}

            {activeExhibit.id === 'laser-scan-hologram' ? (
              <div
                data-darkroom-hologram-model
                className="mt-4 border border-white/[0.065] bg-white/[0.018] p-2.5"
              >
                <span className="mb-2 block font-mono text-[11px] text-[var(--text-secondary)]">
                  {t.gallery.hologramModels.label}
                </span>
                <HologramModelSelector variant="panel" />
              </div>
            ) : null}

            {activeExhibit.id === 'particle-morph' ? (
              <div
                data-darkroom-particle-manifold
                className="mt-4 border border-white/[0.065] bg-white/[0.018] p-2.5"
              >
                <span className="mb-2 block font-mono text-[11px] text-[var(--text-secondary)]">
                  {t.gallery.particleManifolds.label}
                </span>
                <ParticleMorphSelector variant="panel" />
              </div>
            ) : null}

              <div className="mt-4" data-darkroom-presets>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                    {t.gallery.darkroom.presets}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--vfx-secondary)]">
                    {presetLabel}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {GALLERY_PRESETS.map((preset) => {
                    const active = activePresetId === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        data-darkroom-preset={preset.id}
                        aria-pressed={active}
                        onClick={() => {
                          applyExhibitPreset(
                            activeExhibit.id,
                            preset.id,
                          )
                          playSound('toggle')
                        }}
                        className={
                          active
                            ? 'group/preset relative min-w-0 border border-[var(--vfx-secondary)]/40 bg-[var(--vfx-secondary)]/[0.07] px-2 py-2 text-left'
                            : 'group/preset relative min-w-0 border border-white/[0.08] bg-white/[0.018] px-2 py-2 text-left transition-colors hover:border-white/20 hover:bg-white/[0.04]'
                        }
                      >
                        <span
                          aria-hidden="true"
                          className={
                            active
                              ? 'mb-2 block h-px w-full bg-[var(--vfx-secondary)] shadow-[0_0_7px_var(--vfx-secondary)]'
                              : 'mb-2 block h-px w-full bg-white/12 transition-colors group-hover/preset:bg-white/28'
                          }
                        />
                        <span
                          className={
                            active
                              ? 'block truncate text-[11px] text-frost'
                              : 'block truncate text-[11px] text-[var(--text-secondary)]'
                          }
                        >
                          {t.gallery.presets[preset.id].label}
                        </span>
                        <span className="mt-1 block truncate font-mono text-[11px] text-[var(--text-tertiary)]">
                          {t.gallery.presets[preset.id].subtitle}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {activeExhibit.id === 'plasma-reactor' ? (
                <div
                  data-darkroom-reactor-overdrive
                  className="mt-4 border border-[var(--vfx-tertiary)]/18 bg-black/22 p-2"
                >
                  <ReactorOverdriveButton variant="panel" />
                </div>
              ) : null}
              {activeExhibit.id === 'photonic-mesh' ? (
                <div
                  data-darkroom-ray-maze-controls
                  className="mt-4"
                >
                  <RayBounceMazeControls variant="panel" />
                </div>
              ) : null}
              {activeExhibit.id === 'orbital-lens' ? (
                <div
                  data-darkroom-audio-stage-controls
                  className="mt-4 grid gap-2"
                >
                  <AudioStageModeSelector variant="panel" />
                  <AudioStagePlayButton variant="panel" />
                </div>
              ) : null}
              {activeExhibit.id === 'quantum-lattice' ? (
                <div
                  data-darkroom-neural-pulse-controls
                  className="mt-4"
                >
                  <NeuralInferenceControls variant="panel" />
                </div>
              ) : null}
              {activeExhibit.id === 'phase-torus' ? (
                <div
                  data-darkroom-gpu-compute-controls
                  className="mt-4"
                >
                  <GpuComputeModeControls variant="panel" />
                </div>
              ) : null}

              <div className="mt-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                  {t.gallery.darkroom.exhibitParameters}
                </span>
                <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                  {formatTranslation(t.gallery.darkroom.channels, {
                    count: activeExhibit.controls.length,
                  })}
                </span>
              </div>
              <div className="grid gap-4" data-darkroom-controls>
                {activeExhibit.controls.map((control) => {
                  const value =
                    activeExhibit.params[control.key] ?? control.min
                  const ratio = clamp(
                    (value - control.min) /
                      Math.max(0.0001, control.max - control.min),
                    0,
                    1,
                  )
                  return (
                    <label
                      key={control.key}
                      className="block"
                      data-darkroom-control={control.key}
                      data-darkroom-value={value.toFixed(
                        control.step < 1 ? 2 : 0,
                      )}
                    >
                      <span className="flex items-end justify-between gap-3">
                        <span>
                          <span className="block text-[12px] text-[var(--text-primary)]">
                            {
                              t.gallery.controls[control.key]
                            }
                          </span>
                          <span className="mt-0.5 block font-mono text-[11px] text-[var(--text-tertiary)]">
                            {control.symbol}
                          </span>
                        </span>
                        <span className="font-mono text-[12px] text-[var(--vfx-secondary)]">
                          {value.toFixed(control.step < 1 ? 2 : 0)}
                          {control.unit ? ` ${control.unit}` : ''}
                        </span>
                      </span>
                      <input
                        type="range"
                        data-darkroom-param={control.key}
                        aria-label={formatTranslation(
                          t.gallery.darkroom.parameterAria,
                          {
                            exhibit: exhibitCopy.name,
                            parameter:
                              t.gallery.controls[control.key],
                          },
                        )}
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={value}
                        onChange={(event) =>
                          updateExhibitParam(
                            activeExhibit.id,
                            control.key,
                            Number(event.target.value),
                          )
                        }
                        className="darkroom-range mt-2.5 w-full"
                        style={{
                          '--range-progress': `${ratio * 100}%`,
                        } as CSSProperties}
                      />
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="mt-5 border-t border-white/[0.08] pt-4">
              <label className="block">
                <span className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                    {t.gallery.darkroom.globalTimeScale}
                  </span>
                  <span className="font-mono text-[12px] text-[var(--vfx-tertiary)]">
                    {t.common.symbols.deltaTime}{' '}
                    {timeScale.toFixed(2)}
                    {t.common.symbols.multiplier}
                  </span>
                </span>
                <input
                  type="range"
                  data-darkroom-timescale
                  aria-label={t.gallery.darkroom.globalTimeScaleAria}
                  min={TIME_SCALE_MIN}
                  max={TIME_SCALE_MAX}
                  step={0.01}
                  value={timeScale}
                  onChange={(event) =>
                    setTimeScale(Number(event.target.value))
                  }
                  className="darkroom-range mt-3 w-full"
                  style={{
                    '--range-progress': `${
                      ((timeScale - TIME_SCALE_MIN) /
                        (TIME_SCALE_MAX - TIME_SCALE_MIN)) *
                      100
                    }%`,
                  } as CSSProperties}
                />
              </label>
            </div>

            <div className="mt-5 border-y border-white/[0.065] py-3">
              <p className="font-mono text-[11px] text-[var(--text-secondary)]">
                {t.gallery.darkroom.governingEquation}
              </p>
              <p className="mt-2 break-words font-mono text-[12px] leading-5 text-[var(--text-primary)]">
                {activeExhibit.formula}
              </p>
            </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="border border-white/[0.08] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]">
                {exhibitCopy.opticalTag}
              </span>
              <span className="border border-white/[0.08] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]">
                {exhibitCopy.algorithmTag}
              </span>
                <span className="border border-[var(--vfx-secondary)]/16 bg-[var(--vfx-secondary)]/[0.035] px-2 py-1 font-mono text-[11px] text-[var(--vfx-secondary)]">
                  {t.gallery.darkroom.sharedWebgl}
                </span>
              </div>
              {activeExhibit.id === 'orbital-lens' ? (
                <AudioStageLightPads />
              ) : null}
            </div>

            <div
              data-spectral-wavelength-bar
              data-laser-wavelength={laserWavelength.toFixed(0)}
              data-laser-color={laserColor}
              className="shrink-0 border-t border-white/[0.09] bg-[#03070a]/96 px-4 py-3 sm:px-5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-mono text-[11px] text-[var(--text-secondary)]">
                  <span
                    aria-hidden="true"
                    className="size-2 border border-white/35"
                    style={{
                      backgroundColor: laserColor,
                      boxShadow: `0 0 10px ${laserColor}`,
                    }}
                  />
                  {t.gallery.darkroom.visibleSpectrum}
                </span>
                <output
                  htmlFor="darkroom-spectrum"
                  data-laser-wavelength-label
                  className="font-mono text-[12px]"
                  style={{ color: laserColor }}
                >
                  {laserWavelength.toFixed(0)}{' '}
                  {t.common.units.nanometers}
                </output>
              </div>
              <input
                id="darkroom-spectrum"
                type="range"
                data-darkroom-wavelength
                aria-label={t.gallery.darkroom.wavelengthAria}
                aria-valuetext={formatTranslation(
                  t.gallery.darkroom.nanometerValue,
                  { value: laserWavelength.toFixed(0) },
                )}
                min={SPECTRUM_RANGE.min}
                max={SPECTRUM_RANGE.max}
                step={1}
                value={laserWavelength}
                onChange={(event) =>
                  setLaserWavelength(Number(event.target.value))
                }
                className="spectral-range mt-2.5 w-full"
                style={
                  {
                    '--spectrum-gradient': SPECTRAL_GRADIENT,
                    '--spectrum-color': laserColor,
                    '--spectrum-position': `${
                      ((laserWavelength - SPECTRUM_RANGE.min) /
                        (SPECTRUM_RANGE.max - SPECTRUM_RANGE.min)) *
                      100
                    }%`,
                  } as CSSProperties
                }
              />
              <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-[var(--text-secondary)]">
                <span>{t.gallery.darkroom.spectrumUltraviolet}</span>
                <span>532</span>
                <span>{t.gallery.darkroom.spectrumInfrared}</span>
              </div>
            </div>
            </aside>
          ) : null}
        </div>
      </motion.div>
    )
  }, [
    activeExhibit,
    activePresetId,
    applyExhibitPreset,
    cinemaCleanView,
    close,
    exhibitIndex,
    inView,
    isTourActive,
    laserColor,
    laserWavelength,
    navigateExhibit,
    opticalTourPaused,
    playSound,
    reducedMotion,
    resetParameters,
    resetView,
    setCinemaCleanView,
    setActiveExhibitId,
    setLaserWavelength,
    setTimeScale,
    startOpticalTour,
    stepActiveExhibit,
    stopOpticalTour,
    t,
    timeScale,
    totalExhibits,
    toggleCinemaCleanView,
    toggleOpticalTourPaused,
    triggerHologramGlitch,
    updateExhibitParam,
  ])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>{open ? modal : null}</AnimatePresence>,
    document.body,
  )
}
