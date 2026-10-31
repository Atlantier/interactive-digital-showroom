import { useReducedMotion } from 'framer-motion'
import {
  Box,
  Cloud,
  Cpu,
  Gauge,
  Link2Off,
  Network,
  RefreshCw,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useInViewAnimation } from '../../hooks/useInViewAnimation'
import { getGravityMode } from '../../data/preferences'
import { recordPhysicsSolveTime } from '../../store/performanceTelemetry'
import { useAppStore } from '../../store/useAppStore'
import { soundEngine } from '../../utils/soundEngine'
import { useSmoothScroll } from '../layout/SmoothScroll'
import {
  aabbOverlaps,
  clamp,
  computeAABB,
  constrainVerletPoints,
  damp,
  elasticImpulse,
  getOBBHorizontalExtent,
  getOBBVerticalExtent,
  integrateVerlet,
  measureMaxConstraintStrain,
  normalizeAngle,
  relaxConstraints,
  testOBBCollision,
  windForce,
  type AABB,
  type OBB,
  type OBBContact,
  type VerletConstraint,
  type VerletPoint,
} from '../../utils/mathPhysics'

const SOLVER_ITERATIONS = 12
const POINT_COUNT = 16
const SEGMENT_LENGTH = 13.2
const RUPTURE_STRAIN = 2.5
const OVERLOAD_GRACE = 0.42
const WIND_AMPLITUDE = 31
let activeTouchMoveGuard: ((event: TouchEvent) => void) | null = null

interface BadgeSpec {
  id: string
  eyebrow: string
  title: string
  subtitle: string
  accent: string
  icon: LucideIcon
}

const BADGE_SPECS: readonly BadgeSpec[] = [
  {
    id: 'ai-architecture',
    eyebrow: 'SYSTEMS / 01',
    title: 'AI Architecture',
    subtitle: 'Inference topology',
    accent: '#72e6ff',
    icon: Network,
  },
  {
    id: 'rust-systems',
    eyebrow: 'SYSTEMS / 02',
    title: 'Rust & Systems',
    subtitle: 'Zero-cost runtime',
    accent: '#f2b35e',
    icon: Cpu,
  },
  {
    id: 'webgl-shaders',
    eyebrow: 'SYSTEMS / 03',
    title: 'WebGL Shaders',
    subtitle: 'Realtime graphics',
    accent: '#a78bfa',
    icon: Box,
  },
  {
    id: 'distributed-cloud',
    eyebrow: 'SYSTEMS / 04',
    title: 'Distributed Cloud',
    subtitle: 'Elastic fabric',
    accent: '#10b981',
    icon: Cloud,
  },
] as const

interface LanyardState {
  points: VerletPoint[]
  constraints: VerletConstraint[]
  broken: boolean
  tension: number
  overloadTime: number
}

interface BadgeState extends OBB {
  angle: number
  angularVelocity: number
  attached: boolean
  velocityX: number
  velocityY: number
  contactUntil: number
}

interface SandboxWorld {
  width: number
  height: number
  floorY: number
  time: number
  lastFrame: number
  strain: number
  peakStrain: number
  collisionCount: number
  lanyards: LanyardState[]
  badges: BadgeState[]
}

interface ActiveDrag {
  badgeIndex: number
  pointerId: number
  offsetX: number
  offsetY: number
  freeBody: boolean
}

function createSandboxWorld(
  width: number,
  height: number,
): SandboxWorld {
  const floorY = height - 28
  const sidePadding = 12
  const spacing = (width - sidePadding * 2) / BADGE_SPECS.length
  const badgeWidth = clamp(spacing * 0.54, 72, 150)
  const badgeHeight = clamp(badgeWidth * 0.68, 76, 102)
  const lanyards: LanyardState[] = []
  const badges: BadgeState[] = []

  for (let index = 0; index < BADGE_SPECS.length; index += 1) {
    const rootX = sidePadding + spacing * (index + 0.5)
    const rootY = 78
    const points: VerletPoint[] = []
    const restLength = SEGMENT_LENGTH + (index % 2) * 0.24

    for (let pointIndex = 0; pointIndex < POINT_COUNT; pointIndex += 1) {
      const bend =
        Math.sin(pointIndex * 0.48 + index * 1.7) * 2.4 +
        (index - 1.5) * 0.55
      const x = rootX + bend * (pointIndex / (POINT_COUNT - 1))
      const y = rootY + pointIndex * restLength
      points.push({
        x,
        y,
        previousX: x,
        previousY: y,
        pinned: pointIndex === 0,
      })
    }

    const constraints: VerletConstraint[] = []
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
      constraints.push({
        a: pointIndex,
        b: pointIndex + 1,
        restLength,
        stiffness: 0.985,
      })
    }
    lanyards.push({
      points,
      constraints,
      broken: false,
      tension: 0,
      overloadTime: 0,
    })

    const endpoint = points[points.length - 1]
    const previousPoint = points[points.length - 2]
    const tangentX = endpoint.x - previousPoint.x
    const tangentY = endpoint.y - previousPoint.y
    const angle = Math.atan2(tangentY, tangentX) - Math.PI / 2
    const downX = -Math.sin(angle)
    const downY = Math.cos(angle)
    const centerX = endpoint.x + downX * (badgeHeight / 2 + 3)
    const centerY = endpoint.y + downY * (badgeHeight / 2 + 3)

    badges.push({
      centerX,
      centerY,
      halfWidth: badgeWidth / 2,
      halfHeight: badgeHeight / 2,
      angle,
      angularVelocity: (index % 2 === 0 ? 1 : -1) * 0.04,
      attached: true,
      velocityX: 0,
      velocityY: 0,
      contactUntil: 0,
    })
  }

  return {
    width,
    height,
    floorY,
    time: 0,
    lastFrame: performance.now(),
    strain: 0,
    peakStrain: 0,
    collisionCount: 0,
    lanyards,
    badges,
  }
}

function smoothstepRange(start: number, end: number, value: number) {
  const normalized = clamp((value - start) / (end - start), 0, 1)
  return normalized * normalized * (3 - 2 * normalized)
}

function mixHexColor(from: string, to: string, amount: number) {
  const weight = clamp(amount, 0, 1)
  const fromValue = Number.parseInt(from.slice(1), 16)
  const toValue = Number.parseInt(to.slice(1), 16)
  const fromRed = (fromValue >> 16) & 255
  const fromGreen = (fromValue >> 8) & 255
  const fromBlue = fromValue & 255
  const toRed = (toValue >> 16) & 255
  const toGreen = (toValue >> 8) & 255
  const toBlue = toValue & 255

  return `rgb(${Math.round(fromRed + (toRed - fromRed) * weight)} ${Math.round(fromGreen + (toGreen - fromGreen) * weight)} ${Math.round(fromBlue + (toBlue - fromBlue) * weight)})`
}

function getDisplayPointX(
  points: VerletPoint[],
  index: number,
  time: number,
  jitter: number,
  phase: number,
) {
  if (jitter === 0 || index === 0) return points[index].x
  const envelope = index / (points.length - 1)
  return (
    points[index].x +
    Math.sin(time * 171 + index * 19.7 + phase) *
      jitter *
      envelope
  )
}

function getDisplayPointY(
  points: VerletPoint[],
  index: number,
  time: number,
  jitter: number,
  phase: number,
) {
  if (jitter === 0 || index === 0) return points[index].y
  const envelope = index / (points.length - 1)
  return (
    points[index].y +
    Math.cos(time * 137 + index * 13.1 + phase) *
      jitter *
      0.46 *
      envelope
  )
}

/**
 * Catmull-Rom to cubic Bezier conversion. Each particle pair becomes one
 * cubic segment with tangent-aware controls, so the rope never shows joins.
 */
function getRopePath(
  points: VerletPoint[],
  time: number,
  jitter: number,
  phase: number,
) {
  const lastIndex = points.length - 1
  const pointX = (index: number) =>
    getDisplayPointX(points, index, time, jitter, phase)
  const pointY = (index: number) =>
    getDisplayPointY(points, index, time, jitter, phase)

  let path =
    `M${pointX(0).toFixed(2)} ${pointY(0).toFixed(2)}`

  for (let index = 0; index < lastIndex; index += 1) {
    const previousIndex = Math.max(0, index - 1)
    const currentIndex = index
    const nextIndex = index + 1
    const followingIndex = Math.min(lastIndex, index + 2)
    const previousX = pointX(previousIndex)
    const previousY = pointY(previousIndex)
    const currentX = pointX(currentIndex)
    const currentY = pointY(currentIndex)
    const nextX = pointX(nextIndex)
    const nextY = pointY(nextIndex)
    const followingX = pointX(followingIndex)
    const followingY = pointY(followingIndex)
    const controlOneX = currentX + (nextX - previousX) / 6
    const controlOneY = currentY + (nextY - previousY) / 6
    const controlTwoX = nextX - (followingX - currentX) / 6
    const controlTwoY = nextY - (followingY - currentY) / 6

    path +=
      ` C${controlOneX.toFixed(2)} ${controlOneY.toFixed(2)}` +
      ` ${controlTwoX.toFixed(2)} ${controlTwoY.toFixed(2)}` +
      ` ${nextX.toFixed(2)} ${nextY.toFixed(2)}`
  }

  return path
}

function updateAttachedBadge(
  badge: BadgeState,
  lanyard: LanyardState,
  delta: number,
) {
  const endpoint = lanyard.points[lanyard.points.length - 1]
  const previousPoint = lanyard.points[lanyard.points.length - 2]
  const tangentX = endpoint.x - previousPoint.x
  const tangentY = endpoint.y - previousPoint.y
  const targetAngle = Math.atan2(tangentY, tangentX) - Math.PI / 2
  const angleError = normalizeAngle(targetAngle - badge.angle)

  badge.angularVelocity += angleError * 118 * delta
  badge.angularVelocity *= Math.exp(-5.4 * delta)
  badge.angle = normalizeAngle(
    badge.angle + badge.angularVelocity * delta,
  )

  const downX = -Math.sin(badge.angle)
  const downY = Math.cos(badge.angle)
  const centerOffset = badge.halfHeight + 3
  badge.centerX = endpoint.x + downX * centerOffset
  badge.centerY = endpoint.y + downY * centerOffset
}

function integrateFreeBadge(
  badge: BadgeState,
  delta: number,
  time: number,
  windAmplitude: number,
  gravity: number,
) {
  const breeze = windForce(time * 0.8, badge.centerY * 0.006, windAmplitude)
  badge.velocityY += gravity * delta
  badge.velocityX += breeze * delta
  badge.centerX += badge.velocityX * delta
  badge.centerY += badge.velocityY * delta
  badge.angle += badge.angularVelocity * delta
  badge.angularVelocity *= Math.exp(-0.7 * delta)
}

function setSandboxDragLock(stage: HTMLDivElement, active: boolean) {
  stage.dataset.dragging = active ? 'true' : 'false'
  stage.style.touchAction = active ? 'none' : ''
  if (active) {
    document.documentElement.dataset.sandboxDragging = 'true'
    if (!activeTouchMoveGuard) {
      activeTouchMoveGuard = (event) => {
        if (event.cancelable) event.preventDefault()
      }
      document.addEventListener('touchmove', activeTouchMoveGuard, {
        passive: false,
      })
    }
  } else {
    delete document.documentElement.dataset.sandboxDragging
    if (activeTouchMoveGuard) {
      document.removeEventListener('touchmove', activeTouchMoveGuard)
      activeTouchMoveGuard = null
    }
  }
}

export function VerletLanyard() {
  const soundEnabled = useAppStore((state) => state.soundEnabled)
  const gravityMode = useAppStore((state) => state.gravityMode)
  const gravitySetting = getGravityMode(gravityMode)
  const lenis = useSmoothScroll()
  const stageRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<SandboxWorld | null>(null)
  const badgeRefs = useRef<Array<HTMLButtonElement | null>>([])
  const anchorRefs = useRef<Array<SVGCircleElement | null>>([])
  const ropeRefs = useRef<Array<SVGPathElement | null>>([])
  const ropeGlowRefs = useRef<Array<SVGPathElement | null>>([])
  const ropeShadowRefs = useRef<Array<SVGPathElement | null>>([])
  const ropeTextureRefs = useRef<Array<SVGPathElement | null>>([])
  const ropeHighlightRefs = useRef<Array<SVGPathElement | null>>([])
  const ropeGradientStartRefs = useRef<Array<SVGStopElement | null>>([])
  const ropeGradientMiddleRefs = useRef<Array<SVGStopElement | null>>([])
  const ropeGradientEndRefs = useRef<Array<SVGStopElement | null>>([])
  const clipRefs = useRef<Array<SVGGElement | null>>([])
  const statusRef = useRef<HTMLSpanElement>(null)
  const strainRef = useRef<HTMLSpanElement>(null)
  const contactRef = useRef<HTMLSpanElement>(null)
  const ruptureFlashRef = useRef<HTMLSpanElement>(null)
  const activeDragRef = useRef<ActiveDrag | null>(null)
  const soundEnabledRef = useRef(soundEnabled)
  const rebuildRef = useRef<() => void>(() => undefined)
  const resumeAnimationRef = useRef<() => void>(() => undefined)
  const gravityRef = useRef(gravitySetting.gravity)
  const lenisRef = useRef(lenis)
  const reducedMotion = Boolean(useReducedMotion())
  const windAmplitude = reducedMotion ? 8 : WIND_AMPLITUDE
  const inView = useInViewAnimation(stageRef)
  const inViewRef = useRef(inView)
  soundEnabledRef.current = soundEnabled
  gravityRef.current = gravitySetting.gravity
  lenisRef.current = lenis

  useEffect(() => {
    inViewRef.current = inView
    if (inView) resumeAnimationRef.current()
  }, [inView])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    let world: SandboxWorld | null = null
    let animationFrame = 0
    let telemetryElapsed = 0
    let resizeFrame = 0
    let disposed = false
    let lastWidth = 0
    let lastHeight = 0
    const velocityBuffer = new Float32Array(BADGE_SPECS.length * 2)
    const inverseMassBuffer = new Float32Array(BADGE_SPECS.length)
    const boundsA: AABB = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    const boundsB: AABB = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    const contact: OBBContact = {
      normalX: 0,
      normalY: 0,
      penetration: 0,
      contactX: 0,
      contactY: 0,
    }

    const setStatus = (label: string) => {
      if (statusRef.current) statusRef.current.textContent = label
    }

    const triggerRuptureFlash = (x: number, y: number) => {
      const flash = ruptureFlashRef.current
      if (!flash) return
      flash.style.left = `${clamp(x, 0, world?.width ?? 1)}px`
      flash.style.top = `${clamp(y, 0, world?.height ?? 1)}px`
      flash.classList.remove('sandbox-rupture-active')
      void flash.offsetWidth
      flash.classList.add('sandbox-rupture-active')
    }

    const renderWorld = (nextWorld: SandboxWorld) => {
      for (let index = 0; index < nextWorld.lanyards.length; index += 1) {
        const lanyard = nextWorld.lanyards[index]
        const warning = smoothstepRange(0.52, 0.96, lanyard.tension)
        const jitter = lanyard.broken
          ? 0
          : warning * warning * (reducedMotion ? 0.35 : 2.2)
        const phase = index * 2.37
        const ropePath = lanyard.broken
          ? ''
          : getRopePath(lanyard.points, nextWorld.time, jitter, phase)
        const root = lanyard.points[0]
        const endpointIndex = lanyard.points.length - 1
        const badge = nextWorld.badges[index]
        const endpointX = badge.attached
          ? getDisplayPointX(
              lanyard.points,
              endpointIndex,
              nextWorld.time,
              jitter,
              phase,
            )
          : badge.centerX + Math.sin(badge.angle) * (badge.halfHeight + 3)
        const endpointY = badge.attached
          ? getDisplayPointY(
              lanyard.points,
              endpointIndex,
              nextWorld.time,
              jitter,
              phase,
            )
          : badge.centerY - Math.cos(badge.angle) * (badge.halfHeight + 3)

        anchorRefs.current[index]?.setAttribute('cx', String(root.x))
        anchorRefs.current[index]?.setAttribute('cy', String(root.y))
        ropeShadowRefs.current[index]?.setAttribute('d', ropePath)
        ropeRefs.current[index]?.setAttribute('d', ropePath)
        ropeGlowRefs.current[index]?.setAttribute('d', ropePath)
        ropeTextureRefs.current[index]?.setAttribute('d', ropePath)
        ropeHighlightRefs.current[index]?.setAttribute('d', ropePath)
        ropeRefs.current[index]?.setAttribute(
          'data-tension',
          lanyard.tension.toFixed(3),
        )
        ropeTextureRefs.current[index]?.setAttribute(
          'stroke-dashoffset',
          String(-nextWorld.time * 18),
        )

        ropeGradientStartRefs.current[index]?.setAttribute(
          'stop-color',
          mixHexColor('#4f5a60', '#ff223a', warning),
        )
        ropeGradientMiddleRefs.current[index]?.setAttribute(
          'stop-color',
          mixHexColor('#edf4f5', '#ffb09b', warning),
        )
        ropeGradientEndRefs.current[index]?.setAttribute(
          'stop-color',
          mixHexColor('#849198', '#ff4c60', warning),
        )
        ropeGlowRefs.current[index]?.setAttribute(
          'stroke',
          mixHexColor(BADGE_SPECS[index].accent, '#ff2038', warning),
        )
        ropeGlowRefs.current[index]?.setAttribute(
          'stroke-opacity',
          String(0.14 + warning * 0.3),
        )
        ropeTextureRefs.current[index]?.setAttribute(
          'stroke',
          mixHexColor('#f4f9fa', '#ffc0b2', warning),
        )
        ropeHighlightRefs.current[index]?.setAttribute(
          'stroke',
          mixHexColor('#f7fbfc', '#ffd4ca', warning),
        )
        clipRefs.current[index]?.setAttribute(
          'transform',
          `translate(${endpointX.toFixed(2)} ${endpointY.toFixed(2)}) rotate(${(
            badge.angle *
            (180 / Math.PI)
          ).toFixed(2)})`,
        )

        const element = badgeRefs.current[index]
        if (!element) continue

        const width = badge.halfWidth * 2
        const height = badge.halfHeight * 2
        const left = badge.centerX - badge.halfWidth
        const top = badge.centerY - badge.halfHeight
        element.style.width = `${width.toFixed(2)}px`
        element.style.height = `${height.toFixed(2)}px`
        element.style.transform =
          `translate3d(${left.toFixed(2)}px, ${top.toFixed(2)}px, 0) ` +
          `rotate(${badge.angle.toFixed(4)}rad)`
        element.dataset.contact =
          badge.contactUntil > nextWorld.time ? 'true' : 'false'
        element.dataset.detached = badge.attached ? 'false' : 'true'
        element.style.zIndex = badge.attached
          ? `${20 + index}`
          : `${30 + index}`
      }
    }

    const updateTelemetry = (nextWorld: SandboxWorld) => {
      let detachedCount = 0
      let maximumTension = 0
      for (let index = 0; index < nextWorld.badges.length; index += 1) {
        if (!nextWorld.badges[index].attached) detachedCount += 1
      }
      for (let index = 0; index < nextWorld.lanyards.length; index += 1) {
        maximumTension = Math.max(
          maximumTension,
          nextWorld.lanyards[index].tension,
        )
      }
      const strain = nextWorld.strain.toFixed(2)
      stage.dataset.maxStrain = nextWorld.peakStrain.toFixed(2)
      stage.dataset.tension = maximumTension.toFixed(3)
      stage.dataset.overloaded =
        maximumTension > 0.62 && detachedCount === 0 ? 'true' : 'false'
      stage.dataset.collisionCount = String(nextWorld.collisionCount)
      stage.dataset.detachedCount = String(detachedCount)
      stage.dataset.solverIterations = String(SOLVER_ITERATIONS)
      stage.dataset.ruptured = detachedCount > 0 ? 'true' : 'false'

      if (strainRef.current) {
        strainRef.current.textContent = `${strain}x`
      }
      if (contactRef.current) {
        contactRef.current.textContent = String(nextWorld.collisionCount)
      }

      if (detachedCount > 0) {
        setStatus('RUPTURE DETECTED')
      } else if (maximumTension > 0.62) {
        setStatus('TENSION OVERLOAD')
      } else if (activeDragRef.current) {
        setStatus('TENSION APPLIED')
      } else {
        setStatus('SYSTEM NOMINAL')
      }
    }

    const rebuildWorld = () => {
      const bounds = stage.getBoundingClientRect()
      if (bounds.width < 20 || bounds.height < 20) return
      lastWidth = bounds.width
      lastHeight = bounds.height
      world = createSandboxWorld(
        bounds.width,
        bounds.height,
      )
      worldRef.current = world
      activeDragRef.current = null
      setSandboxDragLock(stage, false)
      lenisRef.current?.start()
      for (let index = 0; index < badgeRefs.current.length; index += 1) {
        const element = badgeRefs.current[index]
        if (element) element.dataset.dragging = 'false'
      }
      renderWorld(world)
      updateTelemetry(world)
    }

    const ruptureLanyard = (
      nextWorld: SandboxWorld,
      badgeIndex: number,
    ) => {
      const lanyard = nextWorld.lanyards[badgeIndex]
      if (lanyard.broken) return

      const badge = nextWorld.badges[badgeIndex]
      const endpoint = lanyard.points[lanyard.points.length - 1]
      const drag = activeDragRef.current
      const clampedX = clamp(
        badge.centerX,
        badge.halfWidth + 8,
        nextWorld.width - badge.halfWidth - 8,
      )
      const clampedY = clamp(
        badge.centerY,
        badge.halfHeight + 82,
        nextWorld.height * 0.62,
      )

      badge.centerX = clampedX
      badge.centerY = clampedY
      badge.velocityX = clamp(
        (endpoint.x - endpoint.previousX) * 2.4,
        -190,
        190,
      )
      badge.velocityY = clamp(
        (endpoint.y - endpoint.previousY) * 0.45,
        -20,
        120,
      )
      badge.angularVelocity +=
        (badgeIndex % 2 === 0 ? 1 : -1) * 3.2
      badge.attached = false
      lanyard.broken = true
      lanyard.tension = 1
      endpoint.pinned = false
      nextWorld.strain = RUPTURE_STRAIN

      triggerRuptureFlash(endpoint.x, endpoint.y)
      setSandboxDragLock(stage, false)
      if (drag && stage.hasPointerCapture(drag.pointerId)) {
        stage.releasePointerCapture(drag.pointerId)
      }
      activeDragRef.current = null
      badgeRefs.current[badgeIndex]?.setAttribute(
        'data-dragging',
        'false',
      )
      setStatus('RUPTURE DETECTED')
      if (soundEnabledRef.current) {
        soundEngine.playRopeSnap()
      }
    }

    const applyBadgeFloorCollision = (
      nextWorld: SandboxWorld,
      badgeIndex: number,
      delta: number,
    ) => {
      const badge = nextWorld.badges[badgeIndex]
      const horizontalExtent = getOBBHorizontalExtent(
        badge.halfWidth,
        badge.halfHeight,
        badge.angle,
      )
      const verticalExtent = getOBBVerticalExtent(
        badge.halfWidth,
        badge.halfHeight,
        badge.angle,
      )

      if (badge.centerX - horizontalExtent < 0) {
        badge.centerX = horizontalExtent
        if (badge.velocityX < 0) badge.velocityX *= -0.36
      } else if (
        badge.centerX + horizontalExtent > nextWorld.width
      ) {
        badge.centerX = nextWorld.width - horizontalExtent
        if (badge.velocityX > 0) badge.velocityX *= -0.36
      }

      if (badge.centerY + verticalExtent > nextWorld.floorY) {
        badge.centerY = nextWorld.floorY - verticalExtent
        if (badge.velocityY > 0) {
          const impactSpeed = badge.velocityY
          badge.velocityY =
            impactSpeed < 42 ? 0 : -impactSpeed * 0.46
          badge.velocityX *= 0.86
          badge.angularVelocity += badge.velocityX * 0.0012
          if (impactSpeed > 72) {
            nextWorld.collisionCount += 1
            if (soundEnabledRef.current) {
              soundEngine.playPhysicsCollision(impactSpeed)
            }
          }
        }
      }

      if (badge.attached) {
        const lanyard = nextWorld.lanyards[badgeIndex]
        const endpoint = lanyard.points[lanyard.points.length - 1]
        const centerOffset = badge.halfHeight + 3
        const targetX =
          badge.centerX + Math.sin(badge.angle) * centerOffset
        const targetY =
          badge.centerY - Math.cos(badge.angle) * centerOffset
        endpoint.previousX = endpoint.x - (targetX - endpoint.x) * delta * 12
        endpoint.previousY = endpoint.y - (targetY - endpoint.y) * delta * 12
        endpoint.x = targetX
        endpoint.y = targetY
      }
    }

    const resolveBadgeCollisions = (
      nextWorld: SandboxWorld,
      delta: number,
    ) => {
      for (let pass = 0; pass < 2; pass += 1) {
        for (let index = 0; index < nextWorld.badges.length; index += 1) {
          const badgeA = nextWorld.badges[index]
          inverseMassBuffer[index] = badgeA.attached ? 1.15 : 1
          if (badgeA.attached) {
            const points = nextWorld.lanyards[index].points
            const endpoint = points[points.length - 1]
            velocityBuffer[index * 2] = clamp(
              (endpoint.x - endpoint.previousX) / delta,
              -1_800,
              1_800,
            )
            velocityBuffer[index * 2 + 1] = clamp(
              (endpoint.y - endpoint.previousY) / delta,
              -1_800,
              1_800,
            )
          } else {
            velocityBuffer[index * 2] = badgeA.velocityX
            velocityBuffer[index * 2 + 1] = badgeA.velocityY
          }
        }

        for (let indexA = 0; indexA < nextWorld.badges.length; indexA += 1) {
          const badgeA = nextWorld.badges[indexA]
          computeAABB(badgeA, boundsA)

          for (
            let indexB = indexA + 1;
            indexB < nextWorld.badges.length;
            indexB += 1
          ) {
            const badgeB = nextWorld.badges[indexB]
            computeAABB(badgeB, boundsB)
            if (!aabbOverlaps(boundsA, boundsB)) continue
            if (!testOBBCollision(badgeA, badgeB, contact)) continue

            const inverseMassA = inverseMassBuffer[indexA]
            const inverseMassB = inverseMassBuffer[indexB]
            const inverseMassTotal = inverseMassA + inverseMassB
            const separation =
              contact.penetration * 0.54 / inverseMassTotal

            badgeA.centerX -= contact.normalX * separation * inverseMassA
            badgeA.centerY -= contact.normalY * separation * inverseMassA
            badgeB.centerX += contact.normalX * separation * inverseMassB
            badgeB.centerY += contact.normalY * separation * inverseMassB

            const velocityAx = velocityBuffer[indexA * 2]
            const velocityAy = velocityBuffer[indexA * 2 + 1]
            const velocityBx = velocityBuffer[indexB * 2]
            const velocityBy = velocityBuffer[indexB * 2 + 1]
            const relativeImpactSpeed = Math.hypot(
              velocityBx - velocityAx,
              velocityBy - velocityAy,
            )
            const impulse = elasticImpulse(
              velocityBx - velocityAx,
              velocityBy - velocityAy,
              contact.normalX,
              contact.normalY,
              inverseMassA,
              inverseMassB,
            )
            const isNewContact =
              badgeA.contactUntil <= nextWorld.time &&
              badgeB.contactUntil <= nextWorld.time

            if (impulse > 0) {
              const velocityAxNext =
                velocityAx - impulse * inverseMassA * contact.normalX
              const velocityAyNext =
                velocityAy - impulse * inverseMassA * contact.normalY
              const velocityBxNext =
                velocityBx + impulse * inverseMassB * contact.normalX
              const velocityByNext =
                velocityBy + impulse * inverseMassB * contact.normalY
              velocityBuffer[indexA * 2] = velocityAxNext
              velocityBuffer[indexA * 2 + 1] = velocityAyNext
              velocityBuffer[indexB * 2] = velocityBxNext
              velocityBuffer[indexB * 2 + 1] = velocityByNext

              const tangentVelocity =
                (velocityBx - velocityAx) * -contact.normalY +
                (velocityBy - velocityAy) * contact.normalX
              badgeA.angularVelocity -= tangentVelocity * 0.0012
              badgeB.angularVelocity += tangentVelocity * 0.0012
              badgeA.contactUntil = nextWorld.time + 0.12
              badgeB.contactUntil = nextWorld.time + 0.12
              if (isNewContact) {
                nextWorld.collisionCount += 1
                if (soundEnabledRef.current) {
                  soundEngine.playPhysicsCollision(
                    relativeImpactSpeed,
                  )
                }
              }
            }

            if (badgeA.attached) {
              const endpointA =
                nextWorld.lanyards[indexA].points[
                  nextWorld.lanyards[indexA].points.length - 1
                ]
              endpointA.x -= contact.normalX * contact.penetration * 0.34
              endpointA.y -= contact.normalY * contact.penetration * 0.34
              endpointA.previousX =
                endpointA.x - velocityBuffer[indexA * 2] * delta
              endpointA.previousY =
                endpointA.y - velocityBuffer[indexA * 2 + 1] * delta
            }
            if (badgeB.attached) {
              const endpointB =
                nextWorld.lanyards[indexB].points[
                  nextWorld.lanyards[indexB].points.length - 1
                ]
              endpointB.x += contact.normalX * contact.penetration * 0.34
              endpointB.y += contact.normalY * contact.penetration * 0.34
              endpointB.previousX =
                endpointB.x - velocityBuffer[indexB * 2] * delta
              endpointB.previousY =
                endpointB.y - velocityBuffer[indexB * 2 + 1] * delta
            } else {
              badgeB.velocityX = velocityBuffer[indexB * 2] * 0.92
              badgeB.velocityY = velocityBuffer[indexB * 2 + 1] * 0.92
            }

            if (badgeA.attached) {
              badgeA.velocityX = velocityBuffer[indexA * 2]
              badgeA.velocityY = velocityBuffer[indexA * 2 + 1]
            } else {
              badgeA.velocityX = velocityBuffer[indexA * 2] * 0.92
              badgeA.velocityY = velocityBuffer[indexA * 2 + 1] * 0.92
            }
          }
        }
      }
    }

    const tick = (timestamp: number) => {
      if (disposed || !world) return
      const delta = clamp(
        (timestamp - world.lastFrame) / 1_000,
        1 / 240,
        1 / 32,
      )
      world.lastFrame = timestamp
      world.time += delta
      let frameStrain = 0
      let solverElapsed = 0

      for (let index = 0; index < world.lanyards.length; index += 1) {
        const lanyard = world.lanyards[index]
        if (lanyard.broken) continue

        integrateVerlet(
          lanyard.points,
          delta,
          gravityRef.current,
          world.time,
          windAmplitude,
        )

        const drag = activeDragRef.current
        const solverStartedAt = performance.now()
        const rawStrain = measureMaxConstraintStrain(
          lanyard.points,
          lanyard.constraints,
        )
        relaxConstraints(
          lanyard.points,
          lanyard.constraints,
          SOLVER_ITERATIONS,
        )
        constrainVerletPoints(
          lanyard.points,
          world.width,
          world.floorY,
        )
        const relaxedStrain = measureMaxConstraintStrain(
          lanyard.points,
          lanyard.constraints,
        )
        solverElapsed += performance.now() - solverStartedAt
        const targetTension = clamp(
          relaxedStrain / RUPTURE_STRAIN,
          0,
          1,
        )
        lanyard.tension = damp(
          lanyard.tension,
          targetTension,
          15,
          delta,
        )
        frameStrain = Math.max(frameStrain, rawStrain, relaxedStrain)
        const isDraggingLanyard =
          drag?.badgeIndex === index &&
          !drag.freeBody

        if (
          isDraggingLanyard &&
          relaxedStrain > RUPTURE_STRAIN
        ) {
          lanyard.overloadTime += delta
          lanyard.tension = Math.max(
            lanyard.tension,
            clamp(0.7 + (lanyard.overloadTime / OVERLOAD_GRACE) * 0.3, 0, 1),
          )
          if (lanyard.overloadTime >= OVERLOAD_GRACE) {
            ruptureLanyard(world, index)
            continue
          }
        } else {
          lanyard.overloadTime = Math.max(
            0,
            lanyard.overloadTime - delta * 4,
          )
        }
      }

      for (let index = 0; index < world.badges.length; index += 1) {
        const badge = world.badges[index]
        if (badge.attached) {
          updateAttachedBadge(badge, world.lanyards[index], delta)
        } else {
          integrateFreeBadge(
            badge,
            delta,
            world.time,
            windAmplitude,
            gravityRef.current,
          )
        }
      }

      resolveBadgeCollisions(world, delta)

      for (let index = 0; index < world.badges.length; index += 1) {
        applyBadgeFloorCollision(world, index, delta)
      }
      recordPhysicsSolveTime(solverElapsed)

      world.strain = Math.max(
        frameStrain,
        Math.max(0, world.strain - delta * 2.8),
      )
      world.peakStrain = Math.max(
        world.peakStrain,
        frameStrain,
        world.strain,
      )
      renderWorld(world)

      telemetryElapsed += delta
      if (telemetryElapsed >= 0.08) {
        updateTelemetry(world)
        telemetryElapsed = 0
      }

      if (inViewRef.current) {
        animationFrame = window.requestAnimationFrame(tick)
      } else {
        animationFrame = 0
      }
    }

    rebuildRef.current = rebuildWorld
    rebuildWorld()

    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => {
        const bounds = stage.getBoundingClientRect()
        if (
          Math.abs(bounds.width - lastWidth) > 1 ||
          Math.abs(bounds.height - lastHeight) > 1
        ) {
          rebuildWorld()
        }
      })
    })
    resizeObserver.observe(stage)

    const handleNativeTouchGuard = (event: TouchEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-verlet-badge]')
      ) {
        event.preventDefault()
      }
    }
    stage.addEventListener('touchstart', handleNativeTouchGuard, {
      passive: false,
    })
    stage.addEventListener('touchmove', handleNativeTouchGuard, {
      passive: false,
    })

    const resumeAnimation = () => {
      if (
        disposed ||
        !world ||
        !inViewRef.current ||
        animationFrame
      ) {
        return
      }
      world.lastFrame = performance.now()
      animationFrame = window.requestAnimationFrame(tick)
    }
    resumeAnimationRef.current = resumeAnimation
    resumeAnimation()

    return () => {
      disposed = true
      window.cancelAnimationFrame(animationFrame)
      window.cancelAnimationFrame(resizeFrame)
      resizeObserver.disconnect()
      stage.removeEventListener('touchstart', handleNativeTouchGuard)
      stage.removeEventListener('touchmove', handleNativeTouchGuard)
      delete document.documentElement.dataset.sandboxDragging
      if (activeTouchMoveGuard) {
        document.removeEventListener('touchmove', activeTouchMoveGuard)
        activeTouchMoveGuard = null
      }
      lenisRef.current?.start()
      worldRef.current = null
      rebuildRef.current = () => undefined
      resumeAnimationRef.current = () => undefined
    }
  }, [reducedMotion, windAmplitude])

  const pointerPosition = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    const bounds = stageRef.current?.getBoundingClientRect()
    if (!bounds) return { x: 0, y: 0 }
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    }
  }

  const handleBadgePointerDown = (
    badgeIndex: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const world = worldRef.current
    const stage = stageRef.current
    if (!world || !stage) return

    event.preventDefault()
    if (soundEnabled) {
      void soundEngine.unlock()
      soundEngine.playCardActivate()
    }
    const pointer = pointerPosition(event)
    const badge = world.badges[badgeIndex]
    activeDragRef.current = {
      badgeIndex,
      pointerId: event.pointerId,
      offsetX: pointer.x - badge.centerX,
      offsetY: pointer.y - badge.centerY,
      freeBody: !badge.attached,
    }
    stage.setPointerCapture(event.pointerId)
    setSandboxDragLock(stage, true)
    lenisRef.current?.stop()
    badgeRefs.current[badgeIndex]?.setAttribute('data-dragging', 'true')

    if (badge.attached) {
      const endpoint =
        world.lanyards[badgeIndex].points[
          world.lanyards[badgeIndex].points.length - 1
        ]
      endpoint.pinned = true
    }
    if (statusRef.current) statusRef.current.textContent = 'TENSION APPLIED'
  }

  const handlePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const drag = activeDragRef.current
    const world = worldRef.current
    if (!drag || !world || drag.pointerId !== event.pointerId) return

    event.preventDefault()
    const pointer = pointerPosition(event)
    const badge = world.badges[drag.badgeIndex]
    const targetCenterX = pointer.x - drag.offsetX
    const targetCenterY = pointer.y - drag.offsetY

    if (badge.attached) {
      const endpoint =
        world.lanyards[drag.badgeIndex].points[
          world.lanyards[drag.badgeIndex].points.length - 1
        ]
      const centerOffset = badge.halfHeight + 3
      const targetAnchorX =
        targetCenterX + Math.sin(badge.angle) * centerOffset
      const targetAnchorY =
        targetCenterY - Math.cos(badge.angle) * centerOffset
      endpoint.previousX = endpoint.x
      endpoint.previousY = endpoint.y
      endpoint.x = targetAnchorX
      endpoint.y = targetAnchorY
      endpoint.pinned = true
    } else {
      const velocityX = (targetCenterX - badge.centerX) / (1 / 60)
      const velocityY = (targetCenterY - badge.centerY) / (1 / 60)
      badge.centerX = targetCenterX
      badge.centerY = targetCenterY
      badge.velocityX = clamp(velocityX, -1_600, 1_600)
      badge.velocityY = clamp(velocityY, -1_600, 1_600)
      badge.angularVelocity += velocityX * 0.00042
    }
  }

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = activeDragRef.current
    const world = worldRef.current
    if (!drag || !world || drag.pointerId !== event.pointerId) return

      activeDragRef.current = null
    const badge = world.badges[drag.badgeIndex]
    if (badge.attached) {
      const endpoint =
        world.lanyards[drag.badgeIndex].points[
          world.lanyards[drag.badgeIndex].points.length - 1
        ]
      endpoint.pinned = false
    }

    const stage = stageRef.current
    if (stage?.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId)
    }
    badgeRefs.current[drag.badgeIndex]?.setAttribute(
      'data-dragging',
      'false',
    )
    if (stage) setSandboxDragLock(stage, false)
    lenisRef.current?.start()
  }

  return (
    <section
      id="sandbox"
      data-verlet-sandbox
      aria-labelledby="sandbox-title"
      className="relative z-10 overflow-hidden border-t border-white/[0.07] bg-[#04070a]/92 backdrop-blur-[2px]"
    >
      <div className="mx-auto max-w-[1600px] px-5 py-20 sm:px-8 sm:py-24 md:px-12 lg:py-28">
        <div className="grid gap-8 border-b border-white/[0.08] pb-10 md:grid-cols-[1.15fr_0.85fr] md:items-end md:pb-12">
          <div>
            <p className="mb-5 font-mono text-[10px] tracking-[0.16em] text-signal">
              交互物理沙盒 / 04
            </p>
            <h2
              id="sandbox-title"
              className="max-w-4xl text-4xl font-medium leading-[1.02] text-frost sm:text-5xl md:text-6xl xl:text-7xl"
            >
              把身份，
              <br />
              交给约束求解。
            </h2>
          </div>
          <div className="max-w-xl md:justify-self-end">
            <p className="text-sm leading-6 text-mist sm:text-base sm:leading-7">
              四组工牌共享同一套 Verlet 绳链、角动量与 OBB
              碰撞场。每一次拉伸都会累积真实张力，直到结构失效。
            </p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[9px] text-mist/45">
              <span>12 SOLVER PASSES</span>
              <span>FRAME-LOCKED PHYSICS</span>
              <span>OBB CONTACT</span>
            </div>
          </div>
        </div>

        <div
          ref={stageRef}
          data-verlet-stage
          data-solver-iterations="12"
          data-max-strain="0"
          data-tension="0"
          data-overloaded="false"
          data-collision-count="0"
          data-detached-count="0"
          data-gravity-mode={gravityMode}
          className="sandbox-stage relative mt-8 h-[610px] touch-pan-y select-none overflow-hidden rounded-md border border-white/[0.1] bg-[#05080c]/90 shadow-[0_34px_120px_rgba(0,0,0,0.38)] sm:mt-10 sm:h-[670px]"
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={finishDrag}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_26%,rgba(16,185,129,0.025))]"
          />
          <div
            aria-hidden="true"
            className="sandbox-grid pointer-events-none absolute inset-0 opacity-55"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-5 top-[77px] h-px bg-white/[0.07] sm:inset-x-8"
          />

          <div className="pointer-events-none absolute inset-x-3 top-3 z-40 flex items-start justify-between gap-3 sm:inset-x-5 sm:top-4">
            <div className="flex min-w-0 items-center gap-2 rounded border border-white/[0.08] bg-black/20 px-2.5 py-2 font-mono text-[8px] text-mist/55 backdrop-blur-md">
              <Wind
                size={12}
                strokeWidth={1.5}
                className="shrink-0 text-signal/75"
              />
              <span
                ref={statusRef}
                data-sandbox-status
                className="truncate text-frost/80"
              >
                SYSTEM NOMINAL
              </span>
              <span className="h-3 w-px bg-white/10" />
              <span className="hidden text-signal/65 md:inline">
                {gravitySetting.subtitle}
              </span>
              <span
                data-sandbox-status-dot
                className="hidden size-1 shrink-0 bg-signal sm:block"
              />
            </div>
            <button
              type="button"
              data-reforge-lanyards
              aria-label="一键重连恢复（Re-forge Lanyards）"
              title="一键重连恢复（Re-forge Lanyards）"
              onClick={() => {
                if (soundEnabled) {
                  void soundEngine.unlock()
                  soundEngine.playCardActivate()
                }
                rebuildRef.current()
              }}
              className="pointer-events-auto inline-flex h-9 shrink-0 items-center gap-2 rounded border border-signal/30 bg-signal/[0.07] px-3 font-mono text-[9px] text-frost transition-colors hover:border-signal/55 hover:bg-signal/[0.12]"
            >
              <RefreshCw size={12} strokeWidth={1.7} />
              <span className="hidden sm:inline">Re-forge Lanyards</span>
              <span className="sm:hidden">Re-forge</span>
            </button>
          </div>

          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 size-full overflow-visible"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient
                id="lanyard-clip-metal"
                x1="8%"
                y1="0%"
                x2="92%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#f5fbfc" />
                <stop offset="18%" stopColor="#637178" />
                <stop offset="38%" stopColor="#dbe6e8" />
                <stop offset="63%" stopColor="#3c484e" />
                <stop offset="82%" stopColor="#b8c5c9" />
                <stop offset="100%" stopColor="#5e6b71" />
              </linearGradient>
              <linearGradient
                id="lanyard-clip-metal-dark"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#aebbc0" />
                <stop offset="42%" stopColor="#37434a" />
                <stop offset="100%" stopColor="#d2dde0" />
              </linearGradient>
              {BADGE_SPECS.map((_, index) => (
                <linearGradient
                  key={`rope-gradient-${index}`}
                  id={`lanyard-rope-gradient-${index}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop
                    ref={(element) => {
                      ropeGradientStartRefs.current[index] = element
                    }}
                    offset="0%"
                    stopColor="#4f5a60"
                  />
                  <stop
                    ref={(element) => {
                      ropeGradientMiddleRefs.current[index] = element
                    }}
                    offset="48%"
                    stopColor="#edf4f5"
                  />
                  <stop
                    ref={(element) => {
                      ropeGradientEndRefs.current[index] = element
                    }}
                    offset="100%"
                    stopColor="#849198"
                  />
                </linearGradient>
              ))}
            </defs>
            {BADGE_SPECS.map((spec, index) => (
              <g key={spec.id}>
                <circle
                  ref={(element) => {
                    anchorRefs.current[index] = element
                  }}
                  cx="0"
                  cy={78}
                  r="2.5"
                  fill="#dbe6e8"
                  stroke="#f5fbfc"
                  strokeOpacity="0.7"
                  strokeWidth="0.7"
                />
                <path
                  ref={(element) => {
                    ropeGlowRefs.current[index] = element
                  }}
                  data-lanyard-glow
                  fill="none"
                  stroke={spec.accent}
                  strokeOpacity="0.18"
                  strokeWidth="4"
                  vectorEffect="non-scaling-stroke"
                  className="blur-[3px]"
                />
                <path
                  ref={(element) => {
                    ropeShadowRefs.current[index] = element
                  }}
                  data-lanyard-shadow
                  fill="none"
                  stroke="#010304"
                  strokeOpacity="0.92"
                  strokeWidth="3.8"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  ref={(element) => {
                    ropeRefs.current[index] = element
                  }}
                  data-lanyard-path
                  fill="none"
                  stroke={`url(#lanyard-rope-gradient-${index})`}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  ref={(element) => {
                    ropeTextureRefs.current[index] = element
                  }}
                  data-lanyard-texture
                  fill="none"
                  stroke="#f4f9fa"
                  strokeOpacity="0.28"
                  strokeWidth="1.9"
                  strokeDasharray="1 2.5"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  ref={(element) => {
                    ropeHighlightRefs.current[index] = element
                  }}
                  data-lanyard-highlight
                  fill="none"
                  stroke="#f7fbfc"
                  strokeOpacity="0.72"
                  strokeWidth="0.65"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                <g
                  ref={(element) => {
                    clipRefs.current[index] = element
                  }}
                  data-lanyard-clip
                  className="drop-shadow-[0_3px_4px_rgba(0,0,0,0.55)]"
                >
                  <rect
                    x="-5.2"
                    y="-5"
                    width="10.4"
                    height="15.5"
                    rx="4.2"
                    fill="url(#lanyard-clip-metal)"
                    stroke="#f4fbfc"
                    strokeOpacity="0.58"
                    strokeWidth="0.7"
                  />
                  <rect
                    x="-2.8"
                    y="-1.8"
                    width="5.6"
                    height="9.5"
                    rx="2.2"
                    fill="#06090c"
                    fillOpacity="0.72"
                    stroke="#202b31"
                    strokeWidth="0.8"
                  />
                  <rect
                    x="-3.6"
                    y="-7"
                    width="7.2"
                    height="4.2"
                    rx="1.8"
                    fill="url(#lanyard-clip-metal-dark)"
                    stroke="#e8f1f3"
                    strokeOpacity="0.42"
                    strokeWidth="0.55"
                  />
                  <circle
                    cy="-6.9"
                    r="0.8"
                    fill="#f8fdff"
                    fillOpacity="0.9"
                  />
                </g>
              </g>
            ))}
          </svg>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-[27px] z-20 h-px bg-gradient-to-r from-transparent via-signal/30 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[28px] bg-[linear-gradient(180deg,rgba(114,230,255,0.045),rgba(3,5,7,0.82))]"
          />

          {BADGE_SPECS.map((spec, index) => {
            const Icon = spec.icon
            return (
              <button
                key={spec.id}
                ref={(element) => {
                  badgeRefs.current[index] = element
                }}
                type="button"
                data-verlet-badge={spec.id}
                data-dragging="false"
                data-detached="false"
                aria-label={`拖拽 ${spec.title} 工牌`}
                title={`拖拽 ${spec.title} 工牌`}
                onPointerDown={(event) =>
                  handleBadgePointerDown(index, event)
                }
                onDragStart={(event) => event.preventDefault()}
                style={
                  {
                    '--badge-accent': spec.accent,
                  } as CSSProperties
                }
                className="sandbox-badge absolute left-0 top-0 z-20 m-0 flex touch-none flex-col overflow-hidden rounded-[5px] border border-white/15 p-2 text-left outline-none sm:p-3"
              >
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-[5px] size-2 -translate-x-1/2 rounded-full border border-white/20 bg-void/85 shadow-[0_0_0_2px_rgba(0,0,0,0.22)]"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ backgroundColor: spec.accent }}
                />

                <span className="mt-2 flex min-w-0 items-center justify-between gap-1">
                  <span
                    className="grid size-5 shrink-0 place-items-center rounded-[3px] border border-white/10 bg-black/25 sm:size-6"
                    style={{ color: spec.accent }}
                  >
                    <Icon
                      className="size-3 sm:size-3.5"
                      strokeWidth={1.4}
                    />
                  </span>
                  <span className="font-mono text-[5px] text-mist/35 sm:text-[7px]">
                    {spec.eyebrow}
                  </span>
                </span>

                <span className="mt-auto min-w-0">
                  <span className="block text-[9px] font-medium leading-[1.05] text-frost sm:text-[13px]">
                    {spec.title}
                  </span>
                  <span className="mt-1 hidden font-mono text-[6px] text-mist/45 sm:block">
                    {spec.subtitle}
                  </span>
                </span>

                <span
                  aria-hidden="true"
                  className="absolute bottom-1.5 right-1.5 size-1 rotate-45"
                  style={{ backgroundColor: spec.accent }}
                />
              </button>
            )
          })}

          <span
            ref={ruptureFlashRef}
            aria-hidden="true"
            className="sandbox-rupture-flash pointer-events-none absolute z-50 size-0"
          />

          <div className="pointer-events-none absolute bottom-2 left-3 z-40 flex items-center gap-4 font-mono text-[8px] text-mist/38 sm:left-5">
            <span className="flex items-center gap-1.5">
              <Gauge size={10} strokeWidth={1.5} />
              STRAIN
              <span ref={strainRef} data-sandbox-strain className="text-frost/65">
                0.00x
              </span>
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <Link2Off size={10} strokeWidth={1.5} />
              CONTACTS
              <span ref={contactRef} className="text-frost/65">
                0
              </span>
            </span>
          </div>
          <span className="pointer-events-none absolute bottom-2 right-3 z-40 font-mono text-[8px] text-mist/30 sm:right-5">
            VERLET / 12×
          </span>
        </div>
      </div>
    </section>
  )
}
