import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import {
  formatTranslation,
  useI18n,
} from '../../i18n/useI18n'
import { useExhibitParamsStore } from '../../store/gallery/hooks'
import type { ExhibitMeta } from '../../store/useGalleryStore'
import { cn } from '../../lib/cn'
import type { GalleryPointerState } from './OpticalExhibitScene'

type DragMode = 'emitter' | 'crystal'

const INCIDENCE_MIN = 10
const INCIDENCE_MAX = 74

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function PrismInteractionSurface({
  exhibit,
  pointerRef,
  compact = false,
}: {
  exhibit: ExhibitMeta
  pointerRef: RefObject<GalleryPointerState>
  compact?: boolean
}) {
  const { t } = useI18n()
  const updateExhibitParam = useExhibitParamsStore(
    (state) => state.updateExhibitParam,
  )
  const incidence = exhibit.params.incidence ?? 18
  const refractiveIndex = exhibit.params.ior ?? 2.4
  const criticalAngle =
    (Math.asin(clamp(1 / refractiveIndex, 0, 1)) * 180) /
    Math.PI
  const totalInternalReflection = incidence > criticalAngle
  const [dragging, setDragging] = useState<DragMode | null>(null)
  const [pose, setPose] = useState({
    x: pointerRef.current.u,
    y: pointerRef.current.v,
  })
  const dragRef = useRef({
    pointerId: -1,
    mode: null as DragMode | null,
    startX: 0,
    startY: 0,
    startIncidence: incidence,
    startU: pointerRef.current.u,
    startV: pointerRef.current.v,
  })

  useEffect(
    () => () => {
      pointerRef.current.dragging = false
      pointerRef.current.active = false
    },
    [pointerRef],
  )

  const setIncidence = (value: number) => {
    updateExhibitParam(
      exhibit.id,
      'incidence',
      clamp(value, INCIDENCE_MIN, INCIDENCE_MAX),
    )
  }

  const beginDrag = (
    mode: DragMode,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startIncidence: incidence,
      startU: pointerRef.current.u,
      startV: pointerRef.current.v,
    }
    setDragging(mode)

    if (mode === 'crystal') {
      pointerRef.current.active = true
      pointerRef.current.dragging = true
    }
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (
      drag.mode === null ||
      drag.pointerId !== event.pointerId
    ) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const bounds = event.currentTarget.getBoundingClientRect()
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY

    if (drag.mode === 'emitter') {
      setIncidence(
        drag.startIncidence -
          (deltaY / Math.max(1, bounds.height)) * 64,
      )
      return
    }

    const nextU = clamp(
      drag.startU +
        (deltaX / Math.max(1, bounds.width)) * 2.4,
      -1,
      1,
    )
    const nextV = clamp(
      drag.startV -
        (deltaY / Math.max(1, bounds.height)) * 2.4,
      -1,
      1,
    )
    pointerRef.current.u = nextU
    pointerRef.current.v = nextV
    pointerRef.current.active = true
    setPose({ x: nextU, y: nextV })
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      dragRef.current.mode === null ||
      dragRef.current.pointerId !== event.pointerId
    ) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current.mode = null
    dragRef.current.pointerId = -1
    pointerRef.current.dragging = false
    setDragging(null)
  }

  const handleEmitterKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    const step = event.shiftKey ? 8 : 2
    let nextIncidence = incidence

    if (event.key === 'ArrowUp') {
      nextIncidence += step
    } else if (event.key === 'ArrowDown') {
      nextIncidence -= step
    } else if (event.key === 'PageUp') {
      nextIncidence += 10
    } else if (event.key === 'PageDown') {
      nextIncidence -= 10
    } else if (event.key === 'Home') {
      nextIncidence = INCIDENCE_MIN
    } else if (event.key === 'End') {
      nextIncidence = INCIDENCE_MAX
    } else {
      return
    }

    event.preventDefault()
    setIncidence(nextIncidence)
  }

  const handleCrystalKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    const step = event.shiftKey ? 0.16 : 0.07
    let nextU = pose.x
    let nextV = pose.y

    if (event.key === 'ArrowLeft') {
      nextU -= step
    } else if (event.key === 'ArrowRight') {
      nextU += step
    } else if (event.key === 'ArrowUp') {
      nextV += step
    } else if (event.key === 'ArrowDown') {
      nextV -= step
    } else {
      return
    }

    event.preventDefault()
    nextU = clamp(nextU, -1, 1)
    nextV = clamp(nextV, -1, 1)
    pointerRef.current.u = nextU
    pointerRef.current.v = nextV
    pointerRef.current.active = true
    setPose({ x: nextU, y: nextV })
  }

  return (
    <div
      data-prism-interaction-surface
      data-prism-tir={totalInternalReflection ? 'true' : 'false'}
      data-prism-critical-angle={criticalAngle.toFixed(1)}
      className="pointer-events-none absolute inset-0 z-10 touch-none select-none"
    >
      <div
        role="slider"
        tabIndex={0}
        data-prism-emitter-drag
        aria-label={t.gallery.prismInteraction.emitterAria}
        aria-valuemin={INCIDENCE_MIN}
        aria-valuemax={INCIDENCE_MAX}
        aria-valuenow={Number(incidence.toFixed(1))}
        aria-valuetext={formatTranslation(
          t.gallery.prismInteraction.incidenceReadout,
          { value: incidence.toFixed(1) },
        )}
        onPointerDown={(event) => beginDrag('emitter', event)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleEmitterKeyDown}
        className={cn(
          'group pointer-events-auto absolute left-[1%] top-[20%] h-[58%] w-[36%] cursor-ns-resize touch-none outline-none',
          dragging === 'emitter' && 'cursor-grabbing',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute left-[20%] top-[35%] h-[30%] border-l border-dashed border-[var(--vfx-tertiary)]/52 transition-opacity duration-150',
            dragging === 'emitter'
              ? 'opacity-95'
              : 'opacity-0 group-hover:opacity-75 group-focus-visible:opacity-100',
          )}
        >
          <span className="absolute left-0 top-0 h-px w-2 bg-[var(--vfx-tertiary)]/70" />
          <span className="absolute bottom-0 left-0 h-px w-2 bg-[var(--vfx-tertiary)]/70" />
        </span>
        <span
          data-localized-motion
          className={cn(
            'pointer-events-none absolute left-[8%] top-[23%] whitespace-nowrap border border-[var(--vfx-secondary)]/24 bg-black/52 px-1.5 py-1 font-mono text-[11px] text-[var(--vfx-secondary)] backdrop-blur-sm transition-opacity duration-150',
            compact
              ? 'opacity-0 group-focus-visible:opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
        >
          {formatTranslation(
            t.gallery.prismInteraction.incidenceReadout,
            { value: incidence.toFixed(1) },
          )}
        </span>
      </div>

      <div
        role="application"
        tabIndex={0}
        data-prism-crystal-drag
        data-prism-pose-x={pose.x.toFixed(2)}
        data-prism-pose-y={pose.y.toFixed(2)}
        aria-label={t.gallery.prismInteraction.crystalAria}
        onPointerDown={(event) => beginDrag('crystal', event)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleCrystalKeyDown}
        className={cn(
          'group pointer-events-auto absolute left-[37%] top-[14%] h-[66%] w-[35%] touch-none rounded-full outline-none',
          dragging === 'crystal'
            ? 'cursor-grabbing'
            : 'cursor-grab',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-[12%] rounded-full border border-dashed border-[var(--vfx-secondary)]/34 transition-opacity duration-150',
            dragging === 'crystal'
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-64 group-focus-visible:opacity-100',
          )}
        />
        <span
          data-localized-motion
          className={cn(
            'pointer-events-none absolute bottom-[4%] left-1/2 -translate-x-1/2 whitespace-nowrap border border-white/10 bg-black/52 px-1.5 py-1 font-mono text-[11px] text-[var(--text-secondary)] backdrop-blur-sm transition-opacity duration-150',
            compact
              ? 'opacity-0 group-focus-visible:opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
        >
          {t.gallery.prismInteraction.crystalHint}
        </span>
      </div>

      <div
        data-prism-tir-indicator
        className={cn(
          'pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap border px-2 py-1 font-mono text-[11px] transition-colors duration-150',
          compact ? 'top-2' : 'bottom-10',
          totalInternalReflection
            ? 'border-amber/52 bg-amber/[0.09] text-amber shadow-[0_0_18px_rgba(255,196,92,0.18)]'
            : 'border-white/[0.08] bg-black/34 text-[var(--text-secondary)]',
        )}
      >
        {totalInternalReflection
          ? t.gallery.prismInteraction.totalInternalReflection
          : formatTranslation(
              t.gallery.prismInteraction.criticalAngle,
              { value: criticalAngle.toFixed(1) },
            )}
      </div>
    </div>
  )
}
