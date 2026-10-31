import {
  useEffect,
  useState,
  type RefObject,
} from 'react'

interface Point {
  x: number
  y: number
}

interface CardRect {
  index: number
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

interface NeighborCandidate {
  sourceIndex: number
  targetIndex: number
  start: Point
  end: Point
  gap: number
  overlap: number
}

interface PulseGeometry {
  id: number
  path: string
  start: Point
  end: Point
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function collectNeighborCandidates(
  grid: HTMLElement,
  cards: HTMLElement[],
) {
  const gridBounds = grid.getBoundingClientRect()
  const rects: CardRect[] = cards.map((card, index) => {
    const bounds = card.getBoundingClientRect()
    return {
      index,
      left: bounds.left - gridBounds.left,
      top: bounds.top - gridBounds.top,
      right: bounds.right - gridBounds.left,
      bottom: bounds.bottom - gridBounds.top,
      width: bounds.width,
      height: bounds.height,
    }
  })
  const candidates: NeighborCandidate[] = []

  for (let firstIndex = 0; firstIndex < rects.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < rects.length;
      secondIndex += 1
    ) {
      const first = rects[firstIndex]
      const second = rects[secondIndex]
      const horizontalOverlap =
        Math.min(first.right, second.right) -
        Math.max(first.left, second.left)
      const verticalOverlap =
        Math.min(first.bottom, second.bottom) -
        Math.max(first.top, second.top)

      if (
        verticalOverlap >
          Math.min(first.height, second.height) * 0.2 &&
        horizontalOverlap <= 0
      ) {
        const leftCard =
          first.right <= second.left ? first : second
        const rightCard =
          leftCard === first ? second : first
        const gap = rightCard.left - leftCard.right

        if (gap >= -3 && gap <= 64) {
          const y =
            (Math.max(first.top, second.top) +
              Math.min(first.bottom, second.bottom)) /
            2
          candidates.push({
            sourceIndex: leftCard.index,
            targetIndex: rightCard.index,
            start: { x: leftCard.right, y },
            end: { x: rightCard.left, y },
            gap: Math.max(1, gap),
            overlap: verticalOverlap,
          })
        }
      }

      if (
        horizontalOverlap >
          Math.min(first.width, second.width) * 0.2 &&
        verticalOverlap <= 0
      ) {
        const topCard =
          first.bottom <= second.top ? first : second
        const bottomCard =
          topCard === first ? second : first
        const gap = bottomCard.top - topCard.bottom

        if (gap >= -3 && gap <= 64) {
          const x =
            (Math.max(first.left, second.left) +
              Math.min(first.right, second.right)) /
            2
          candidates.push({
            sourceIndex: topCard.index,
            targetIndex: bottomCard.index,
            start: { x, y: topCard.bottom },
            end: { x, y: bottomCard.top },
            gap: Math.max(1, gap),
            overlap: horizontalOverlap,
          })
        }
      }
    }
  }

  return candidates.sort((first, second) => {
    const firstScore = first.gap - first.overlap * 0.01
    const secondScore = second.gap - second.overlap * 0.01
    return firstScore - secondScore
  })
}

function midpointDisplacement(
  start: Point,
  end: Point,
  pulseId: number,
  gap: number,
  overlap: number,
) {
  let points = [start, end]
  const random = createSeededRandom(
    pulseId * 2654435761 + start.x * 31 + end.y * 17,
  )
  const horizontal =
    Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
  const normalX = horizontal ? 0 : 1
  const normalY = horizontal ? 1 : 0
  let displacement = Math.min(
    76,
    Math.max(18, gap * 1.7 + overlap * 0.1),
  )

  for (let depth = 0; depth < 5; depth += 1) {
    const next: Point[] = [points[0]]

    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index]
      const to = points[index + 1]
      const offset = (random() * 2 - 1) * displacement
      const midpoint = {
        x:
          (from.x + to.x) / 2 +
          normalX * offset,
        y:
          (from.y + to.y) / 2 +
          normalY * offset,
      }

      next.push(midpoint, to)
    }

    points = next
    displacement *= 0.57
  }

  return points
}

function pointsToBezierPath(points: Point[]) {
  if (points.length < 2) return ''

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const next = points[index + 1]
    const after =
      points[Math.min(points.length - 1, index + 2)]
    const controlOneX =
      current.x + (next.x - previous.x) / 6
    const controlOneY =
      current.y + (next.y - previous.y) / 6
    const controlTwoX =
      next.x - (after.x - current.x) / 6
    const controlTwoY =
      next.y - (after.y - current.y) / 6

    path +=
      ` C ${controlOneX.toFixed(2)} ${controlOneY.toFixed(2)}` +
      ` ${controlTwoX.toFixed(2)} ${controlTwoY.toFixed(2)}` +
      ` ${next.x.toFixed(2)} ${next.y.toFixed(2)}`
  }

  return path
}

export function BentoDataPulse({
  gridRef,
  pulseId,
  sourceIndex,
}: {
  gridRef: RefObject<HTMLDivElement | null>
  pulseId: number
  sourceIndex: number
}) {
  const [geometry, setGeometry] =
    useState<PulseGeometry | null>(null)

  useEffect(() => {
    if (pulseId <= 0) return

    const grid = gridRef.current
    if (!grid) return
    const cards = Array.from(
      grid.querySelectorAll<HTMLElement>('[data-spotlight-card]'),
    )
    if (cards.length < 2) return

    const candidates = collectNeighborCandidates(grid, cards)
    const sourceCandidates =
      sourceIndex >= 0
        ? candidates.filter(
            (candidate) =>
              candidate.sourceIndex === sourceIndex ||
              candidate.targetIndex === sourceIndex,
          )
        : []
    const candidate =
      sourceCandidates[0] ??
      candidates[pulseId % Math.max(1, candidates.length)]

    if (!candidate) {
      setGeometry(null)
      return
    }

    const points = midpointDisplacement(
      candidate.start,
      candidate.end,
      pulseId,
      candidate.gap,
      candidate.overlap,
    )

    setGeometry({
      id: pulseId,
      path: pointsToBezierPath(points),
      start: candidate.start,
      end: candidate.end,
    })
  }, [gridRef, pulseId, sourceIndex])

  return (
    <svg
      aria-hidden="true"
      data-bento-data-pulse
      data-pulse-id={pulseId}
      className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible"
    >
      <defs>
        <filter
          id="bento-data-pulse-glow"
          x="-60%"
          y="-60%"
          width="220%"
          height="220%"
        >
          <feGaussianBlur
            stdDeviation="3.5"
            result="blurred-pulse"
          />
          <feMerge>
            <feMergeNode in="blurred-pulse" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient
          id="bento-data-pulse-gradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
        >
          <stop
            offset="0%"
            stopColor="var(--vfx-primary)"
            stopOpacity="0.15"
          />
          <stop offset="48%" stopColor="var(--vfx-secondary)" />
          <stop offset="100%" stopColor="var(--vfx-tertiary)" />
        </linearGradient>
      </defs>

      {geometry ? (
        <g key={geometry.id}>
          <path
            d={geometry.path}
            pathLength={1}
            fill="none"
            className="bento-data-pulse-ghost"
          />
          <path
            d={geometry.path}
            pathLength={1}
            fill="none"
            className="bento-data-pulse-halo"
            filter="url(#bento-data-pulse-glow)"
          />
          <path
            d={geometry.path}
            pathLength={1}
            fill="none"
            className="bento-data-pulse-beam"
          />
          <circle
            cx={geometry.start.x}
            cy={geometry.start.y}
            r={2.5}
            className="bento-data-pulse-node"
          />
          <circle
            cx={geometry.end.x}
            cy={geometry.end.y}
            r={2.5}
            className="bento-data-pulse-node"
          />
        </g>
      ) : null}
    </svg>
  )
}
