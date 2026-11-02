import { useReducedMotion } from 'framer-motion'
import {
  Box,
  Cpu,
  Crosshair,
  Gauge,
  MousePointer2,
  RefreshCw,
  Zap,
} from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { getVfxPreset } from '../../data/vfxPresets'
import { useInViewAnimation } from '../../hooks/useInViewAnimation'
import {
  formatTranslation,
  useI18n,
  type TranslationDictionary,
} from '../../i18n/useI18n'
import {
  recordPhysicsSolveTime,
  setParticleSourceCount,
} from '../../store/performanceTelemetry'
import { useAppStore } from '../../store/useAppStore'
import { soundEngine } from '../../utils/soundEngine'
import {
  createVfxIllumination,
  VfxParticlePool,
  type VfxIllumination,
} from '../../utils/vfxParticleEngine'
import {
  clamp,
  damp,
  normalizeAngle,
  solveFABRIK,
  type FABRIKOptions,
  type FABRIKResult,
  type IKPoint,
} from '../../utils/mathPhysics'

type IKMode = 'arm' | 'quadruped'
type GaitPhase = 'idle' | 'stepping' | 'locked'
type VfxPalette = Pick<
  ReturnType<typeof getVfxPreset>,
  'primary' | 'secondary' | 'tertiary'
>
type FabrikDrawCopy =
  TranslationDictionary['sandbox']['fabrik']['draw']

interface LaserState {
  startX: number
  startY: number
  endX: number
  endY: number
  length: number
  life: number
}

interface ScorchMark {
  active: boolean
  x: number
  y: number
  age: number
  duration: number
  startedAt: number
  angle: number
  seed: number
}

interface ArmScene {
  kind: 'arm'
  base: IKPoint
  joints: IKPoint[]
  lengths: number[]
  target: IKPoint
  pointer: IKPoint
  result: FABRIKResult
  recoil: number
  laser: LaserState
  centroid: IKPoint
  nextCentroid: IKPoint
  velocity: IKPoint
  totalLength: number
  solveTarget: IKPoint
  scorches: ScorchMark[]
  scorchCursor: number
  scorchCount: number
}

interface LegState {
  id: string
  side: -1 | 1
  spineIndex: number
  group: 0 | 1
  front: boolean
  foot: IKPoint
  stepStart: IKPoint
  stepTarget: IKPoint
  stepElapsed: number
  stepDuration: number
  stepping: boolean
  joints: IKPoint[]
  lengths: [number, number]
  fabrikOptions: FABRIKOptions
  result: FABRIKResult
}

interface GroundRipple {
  x: number
  y: number
  life: number
  duration: number
  active: boolean
  seed: number
  emitted: boolean
}

interface QuadrupedScene {
  kind: 'quadruped'
  width: number
  height: number
  position: IKPoint
  velocity: IKPoint
  heading: number
  pointer: IKPoint
  spine: IKPoint[]
  spineSpacing: number
  bodyRadius: number
  legs: LegState[]
  gaitGroup: 0 | 1
  gaitPhase: GaitPhase
  gaitLockTimer: number
  ripples: GroundRipple[]
  rippleCursor: number
  rippleCount: number
  centroid: IKPoint
  maxLegError: number
  maxLegIterations: number
}

type SceneState = ArmScene | QuadrupedScene

interface CanvasSize {
  width: number
  height: number
}

const ARM_SEGMENT_RATIOS = [0.22, 0.2, 0.17, 0.15, 0.14, 0.12] as const
const ARM_MAX_BEND = Math.PI * 0.62
const LEG_MAX_BEND = Math.PI * 0.74
const SPINE_NODE_COUNT = 12
const GAIT_LOCK_DURATION = 0.22
const TAU = Math.PI * 2
const ORIGIN_POINT: IKPoint = { x: 0, y: 0 }
const ARM_FABRIK_OPTIONS: FABRIKOptions = {
  maxIterations: 12,
  maxBendAngle: ARM_MAX_BEND,
}

const emptyResult = (): FABRIKResult => ({
  iterations: 0,
  error: 0,
  reachable: true,
})

function createPoint(x = 0, y = 0): IKPoint {
  return { x, y }
}

function smoothstep(value: number) {
  const normalized = clamp(value, 0, 1)
  return normalized * normalized * (3 - 2 * normalized)
}

function colorAlpha(hex: string, alpha: number) {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function colorChannels(hex: string) {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  }
}

function distanceBetween(a: IKPoint, b: IKPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function angleLerp(current: number, target: number, amount: number) {
  return current + normalizeAngle(target - current) * amount
}

function createArmScene(size: CanvasSize, pointer: IKPoint): ArmScene {
  const totalReach = clamp(
    Math.min(size.width * 0.64, size.height * 0.82),
    250,
    560,
  )
  const lengths = ARM_SEGMENT_RATIOS.map(
    (ratio) => totalReach * ratio,
  )
  const base = createPoint(size.width * 0.44, size.height * 0.77)
  const laserLength = clamp(
    Math.min(size.width * 0.18, size.height * 0.28),
    150,
    240,
  )
  const joints = [createPoint(base.x, base.y)]
  let direction = -Math.PI / 2

  for (let index = 0; index < lengths.length; index += 1) {
    direction += index === 1 ? -0.24 : index === 2 ? 0.19 : -0.02
    const previous = joints[index]
    joints.push(
      createPoint(
        previous.x + Math.cos(direction) * lengths[index],
        previous.y + Math.sin(direction) * lengths[index],
      ),
    )
  }

  return {
    kind: 'arm',
    base,
    joints,
    lengths,
    target: createPoint(pointer.x, pointer.y),
    pointer: createPoint(pointer.x, pointer.y),
    result: emptyResult(),
    recoil: 0,
    laser: {
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      length: laserLength,
      life: 0,
    },
    centroid: createPoint(joints[3].x, joints[3].y),
    nextCentroid: createPoint(joints[3].x, joints[3].y),
    velocity: createPoint(),
    totalLength: lengths.reduce((total, length) => total + length, 0),
    solveTarget: createPoint(),
    scorches: Array.from({ length: 12 }, () => ({
      active: false,
      x: 0,
      y: 0,
      age: 0,
      duration: 3,
      startedAt: 0,
      angle: 0,
      seed: 0,
    })),
    scorchCursor: 0,
    scorchCount: 0,
  }
}

function createLeg(
  id: string,
  side: -1 | 1,
  spineIndex: number,
  group: 0 | 1,
  front: boolean,
  hip: IKPoint,
  heading: number,
  legLength: number,
): LegState {
  const perpendicularX = -Math.sin(heading)
  const perpendicularY = Math.cos(heading)
  const foot = createPoint(
    hip.x + perpendicularX * side * legLength * 0.9,
    hip.y + perpendicularY * side * legLength * 0.9,
  )
  const midpointX = (hip.x + foot.x) * 0.5
  const midpointY = (hip.y + foot.y) * 0.5
  const knee = createPoint(
    midpointX + Math.cos(heading) * side * legLength * 0.2,
    midpointY + Math.sin(heading) * side * legLength * 0.2,
  )

  return {
    id,
    side,
    spineIndex,
    group,
    front,
    foot,
    stepStart: createPoint(foot.x, foot.y),
    stepTarget: createPoint(foot.x, foot.y),
    stepElapsed: 0,
    stepDuration: 0.26,
    stepping: false,
    joints: [
      createPoint(hip.x, hip.y),
      knee,
      createPoint(foot.x, foot.y),
    ],
    lengths: [legLength, legLength],
    fabrikOptions: {
      maxIterations: 9,
      maxBendAngle: LEG_MAX_BEND,
      bendBias: side,
    },
    result: emptyResult(),
  }
}

function createQuadrupedScene(
  size: CanvasSize,
  pointer: IKPoint,
): QuadrupedScene {
  const scale = clamp(size.width / 760, 0.72, 1.55)
  const position = createPoint(size.width * 0.5, size.height * 0.54)
  const heading = 0
  const spacing = 11.5 * scale
  const bodyRadius = 20 * scale
  const spine: IKPoint[] = []

  for (let index = 0; index < SPINE_NODE_COUNT; index += 1) {
    spine.push(
      createPoint(
        position.x - Math.cos(heading) * spacing * index,
        position.y - Math.sin(heading) * spacing * index,
      ),
    )
  }

  const legLength = 42 * scale
  const legLengthHalf = legLength * 0.5
  const hipRadius = bodyRadius * 0.62
  // Diagonal trot pairs: FL + RR are group 0, FR + RL are group 1.
  const legConfigs = [
    {
      id: 'front-left',
      side: -1 as const,
      spineIndex: 2,
      group: 0 as const,
      front: true,
    },
    {
      id: 'front-right',
      side: 1 as const,
      spineIndex: 2,
      group: 1 as const,
      front: true,
    },
    {
      id: 'rear-left',
      side: -1 as const,
      spineIndex: 7,
      group: 1 as const,
      front: false,
    },
    {
      id: 'rear-right',
      side: 1 as const,
      spineIndex: 7,
      group: 0 as const,
      front: false,
    },
  ]
  const legs = legConfigs.map((leg) => {
    const node = spine[leg.spineIndex]
    const hip = createPoint(
      node.x - Math.sin(heading) * leg.side * hipRadius,
      node.y + Math.cos(heading) * leg.side * hipRadius,
    )
    return createLeg(
      leg.id,
      leg.side,
      leg.spineIndex,
      leg.group,
      leg.front,
      hip,
      heading,
      legLengthHalf,
    )
  })
  const ripples: GroundRipple[] = Array.from(
    { length: 12 },
    () => ({
      x: 0,
      y: 0,
      life: 0,
      duration: 0.72,
      active: false,
      seed: 0,
      emitted: false,
    }),
  )

  return {
    kind: 'quadruped',
    width: size.width,
    height: size.height,
    position,
    velocity: createPoint(),
    heading,
    pointer: createPoint(pointer.x, pointer.y),
    spine,
    spineSpacing: spacing,
    bodyRadius,
    legs,
    gaitGroup: 0,
    gaitPhase: 'idle',
    gaitLockTimer: 0,
    ripples,
    rippleCursor: 0,
    rippleCount: 0,
    centroid: createPoint(position.x, position.y),
    maxLegError: 0,
    maxLegIterations: 0,
  }
}

function createScene(
  mode: IKMode,
  size: CanvasSize,
  pointer: IKPoint,
): SceneState {
  return mode === 'arm'
    ? createArmScene(size, pointer)
    : createQuadrupedScene(size, pointer)
}

function getArmCentroid(scene: ArmScene, result: IKPoint) {
  let x = 0
  let y = 0
  for (let index = 0; index < scene.joints.length; index += 1) {
    x += scene.joints[index].x
    y += scene.joints[index].y
  }
  result.x = x / scene.joints.length
  result.y = y / scene.joints.length
}

function updateArm(
  scene: ArmScene,
  pointer: IKPoint,
  delta: number,
  time: number,
) {
  scene.pointer.x = pointer.x
  scene.pointer.y = pointer.y
  scene.target.x = damp(scene.target.x, pointer.x, 8.5, delta)
  scene.target.y = damp(scene.target.y, pointer.y, 8.5, delta)

  const maxReach = scene.totalLength * 0.94
  const deltaX = scene.target.x - scene.base.x
  const deltaY = scene.target.y - scene.base.y
  const targetDistance = Math.hypot(deltaX, deltaY)
  const directionX =
    targetDistance > 0.001 ? deltaX / targetDistance : 0
  const directionY =
    targetDistance > 0.001 ? deltaY / targetDistance : -1
  const solveDistance = Math.min(maxReach, targetDistance)
  scene.target.x = scene.base.x + directionX * solveDistance
  scene.target.y = scene.base.y + directionY * solveDistance
  const tip = scene.joints[scene.joints.length - 1]
  const preTip = scene.joints[scene.joints.length - 2]
  const tipAngle = Math.atan2(tip.y - preTip.y, tip.x - preTip.x)
  const recoilShake =
    Math.sin(time * 112) * scene.recoil * 3.4 +
    Math.sin(time * 47) * scene.recoil * 1.8
  scene.solveTarget.x =
    scene.target.x -
    Math.cos(tipAngle) * scene.recoil * 18 +
    Math.sin(tipAngle) * recoilShake
  scene.solveTarget.y =
    scene.target.y -
    Math.sin(tipAngle) * scene.recoil * 18 -
    Math.cos(tipAngle) * recoilShake

  scene.result = solveFABRIK(
    scene.joints,
    scene.solveTarget,
    scene.lengths,
    0.28,
    ARM_FABRIK_OPTIONS,
  )
  scene.recoil *= Math.exp(-8.5 * delta)
  scene.laser.life = Math.max(0, scene.laser.life - delta * 2.5)

  getArmCentroid(scene, scene.nextCentroid)
  scene.velocity.x =
    (scene.nextCentroid.x - scene.centroid.x) / delta
  scene.velocity.y =
    (scene.nextCentroid.y - scene.centroid.y) / delta
  scene.centroid.x = scene.nextCentroid.x
  scene.centroid.y = scene.nextCentroid.y
}

function updateScorches(scene: ArmScene, time: number) {
  for (let index = 0; index < scene.scorches.length; index += 1) {
    const scorch = scene.scorches[index]
    if (!scorch.active) continue
    scorch.age = Math.max(0, time - scorch.startedAt)
    if (scorch.age >= scorch.duration) {
      scorch.active = false
      scorch.age = scorch.duration
    }
  }
}

function getSpineAnchor(scene: QuadrupedScene, leg: LegState) {
  const node = scene.spine[leg.spineIndex]
  const perpendicularX = -Math.sin(scene.heading)
  const perpendicularY = Math.cos(scene.heading)
  return {
    x: node.x + perpendicularX * leg.side * scene.bodyRadius,
    y: node.y + perpendicularY * leg.side * scene.bodyRadius,
  }
}

function getRestFoot(scene: QuadrupedScene, leg: LegState) {
  const anchor = getSpineAnchor(scene, leg)
  const forwardX = Math.cos(scene.heading)
  const forwardY = Math.sin(scene.heading)
  const perpendicularX = -Math.sin(scene.heading)
  const perpendicularY = Math.cos(scene.heading)
  const stride = leg.front ? 8 : -7
  const sideReach = scene.bodyRadius * 1.15

  return {
    x:
      anchor.x +
      perpendicularX * leg.side * sideReach +
      forwardX * stride,
    y:
      anchor.y +
      perpendicularY * leg.side * sideReach +
      forwardY * stride,
  }
}

function startLegStep(
  scene: QuadrupedScene,
  leg: LegState,
  target: IKPoint,
  speedRatio: number,
) {
  leg.stepStart.x = leg.foot.x
  leg.stepStart.y = leg.foot.y
  leg.stepTarget.x = target.x + scene.velocity.x * 0.12
  leg.stepTarget.y = target.y + scene.velocity.y * 0.12
  leg.stepElapsed = 0
  leg.stepDuration = 0.34 - speedRatio * 0.11
  leg.stepping = true
}

function spawnGroundRipple(
  scene: QuadrupedScene,
  x: number,
  y: number,
) {
  const ripple = scene.ripples[scene.rippleCursor]
  ripple.x = x
  ripple.y = y
  ripple.life = 1
  ripple.duration = 0.72
  ripple.active = true
  ripple.seed = Math.random() * TAU
  ripple.emitted = false
  scene.rippleCursor =
    (scene.rippleCursor + 1) % scene.ripples.length
  scene.rippleCount += 1
}

function updateQuadruped(
  scene: QuadrupedScene,
  pointer: IKPoint,
  delta: number,
  time: number,
) {
  scene.pointer.x = pointer.x
  scene.pointer.y = pointer.y

  const steeringX = pointer.x - scene.position.x
  const steeringY = pointer.y - scene.position.y
  const steeringDistance = Math.hypot(steeringX, steeringY)
  const arrival = smoothstep(clamp(steeringDistance / 170, 0, 1))
  const maxSpeed = 78
  const desiredSpeed =
    steeringDistance < 22 ? 0 : maxSpeed * (0.2 + arrival * 0.8)
  const inverseDistance =
    steeringDistance > 0.001 ? 1 / steeringDistance : 0
  const desiredVelocityX = steeringX * inverseDistance * desiredSpeed
  const desiredVelocityY = steeringY * inverseDistance * desiredSpeed

  scene.velocity.x = damp(
    scene.velocity.x,
    desiredVelocityX,
    steeringDistance < 24 ? 8 : 4.2,
    delta,
  )
  scene.velocity.y = damp(
    scene.velocity.y,
    desiredVelocityY,
    steeringDistance < 24 ? 8 : 4.2,
    delta,
  )
  scene.position.x = clamp(
    scene.position.x + scene.velocity.x * delta,
    88,
    Math.max(88, scene.width - 88),
  )
  scene.position.y = clamp(
    scene.position.y + scene.velocity.y * delta,
    96,
    Math.max(96, scene.height - 72),
  )

  const speed = Math.hypot(scene.velocity.x, scene.velocity.y)
  if (speed > 4) {
    const targetHeading = Math.atan2(scene.velocity.y, scene.velocity.x)
    scene.heading = angleLerp(
      scene.heading,
      targetHeading,
      1 - Math.exp(-7 * delta),
    )
  }

  scene.spine[0].x = scene.position.x
  scene.spine[0].y = scene.position.y

  for (let index = 1; index < scene.spine.length; index += 1) {
    const previous = scene.spine[index - 1]
    const node = scene.spine[index]
    const flex =
      Math.sin(time * 2.8 - index * 0.47) *
      (2.2 + Math.min(5, speed * 0.065))
    const perpendicularX = -Math.sin(scene.heading)
    const perpendicularY = Math.cos(scene.heading)
    const targetX =
      previous.x -
      Math.cos(scene.heading) * scene.spineSpacing +
      perpendicularX * flex
    const targetY =
      previous.y -
      Math.sin(scene.heading) * scene.spineSpacing +
      perpendicularY * flex
    const follow = 1 - Math.exp(-13 * delta)
    node.x += (targetX - node.x) * follow
    node.y += (targetY - node.y) * follow

    const offsetX = node.x - previous.x
    const offsetY = node.y - previous.y
    const segmentDistance = Math.hypot(offsetX, offsetY)
    if (segmentDistance > 0.001) {
      const ratio = scene.spineSpacing / segmentDistance
      node.x = previous.x + offsetX * ratio
      node.y = previous.y + offsetY * ratio
    }
  }

  const speedRatio = clamp(speed / maxSpeed, 0, 1)

  for (let index = 0; index < scene.ripples.length; index += 1) {
    const ripple = scene.ripples[index]
    if (!ripple.active) continue
    ripple.life -= delta / ripple.duration
    if (ripple.life <= 0) {
      ripple.life = 0
      ripple.active = false
    }
  }

  for (let index = 0; index < scene.legs.length; index += 1) {
    const leg = scene.legs[index]

    if (leg.stepping) {
      leg.stepElapsed += delta
      const progress = clamp(leg.stepElapsed / leg.stepDuration, 0, 1)
      const eased = smoothstep(progress)
      const lift = Math.sin(progress * Math.PI) * (12 + speedRatio * 8)
      leg.foot.x =
        leg.stepStart.x + (leg.stepTarget.x - leg.stepStart.x) * eased
      leg.foot.y =
        leg.stepStart.y +
        (leg.stepTarget.y - leg.stepStart.y) * eased -
        lift

      if (progress >= 1) {
        leg.foot.x = leg.stepTarget.x
        leg.foot.y = leg.stepTarget.y
        leg.stepping = false
        spawnGroundRipple(scene, leg.foot.x, leg.foot.y)
      }
    }
  }

  let activeGroupStepping = false
  let maximumGroupDisplacement = 0
  for (let index = 0; index < scene.legs.length; index += 1) {
    const leg = scene.legs[index]
    if (leg.group !== scene.gaitGroup) continue
    if (leg.stepping) activeGroupStepping = true
    maximumGroupDisplacement = Math.max(
      maximumGroupDisplacement,
      distanceBetween(leg.foot, getRestFoot(scene, leg)),
    )
  }

  if (scene.gaitPhase === 'stepping' && !activeGroupStepping) {
    scene.gaitPhase = 'locked'
    scene.gaitLockTimer = GAIT_LOCK_DURATION
  }

  if (scene.gaitPhase === 'locked') {
    scene.gaitLockTimer = Math.max(
      0,
      scene.gaitLockTimer - delta,
    )
    if (scene.gaitLockTimer <= 0) {
      scene.gaitGroup = (1 - scene.gaitGroup) as 0 | 1
      scene.gaitPhase = 'idle'
    }
  }

  if (scene.gaitPhase === 'idle') {
    const stepThreshold = 9 + speedRatio * 13
    if (maximumGroupDisplacement > stepThreshold) {
      for (let index = 0; index < scene.legs.length; index += 1) {
        const leg = scene.legs[index]
        if (leg.group !== scene.gaitGroup || leg.stepping) continue
        startLegStep(
          scene,
          leg,
          getRestFoot(scene, leg),
          speedRatio,
        )
      }
      scene.gaitPhase = 'stepping'
    }
  }

  let maximumError = 0
  let maximumIterations = 0
  for (let index = 0; index < scene.legs.length; index += 1) {
    const leg = scene.legs[index]
    const hip = getSpineAnchor(scene, leg)
    leg.joints[0].x = hip.x
    leg.joints[0].y = hip.y
    leg.joints[2].x = leg.foot.x
    leg.joints[2].y = leg.foot.y
    const legLength =
      Math.hypot(
        leg.joints[1].x - leg.joints[0].x,
        leg.joints[1].y - leg.joints[0].y,
      ) +
      Math.hypot(
        leg.joints[2].x - leg.joints[1].x,
        leg.joints[2].y - leg.joints[1].y,
      )
    const halfLength = legLength * 0.5
    leg.lengths[0] = halfLength
    leg.lengths[1] = halfLength
    leg.result = solveFABRIK(
      leg.joints,
      leg.foot,
      leg.lengths,
      0.24,
      leg.fabrikOptions,
    )
    maximumError = Math.max(maximumError, leg.result.error)
    maximumIterations = Math.max(
      maximumIterations,
      leg.result.iterations,
    )
  }

  scene.maxLegError = maximumError
  scene.maxLegIterations = maximumIterations
  scene.centroid.x = 0
  scene.centroid.y = 0
  for (let index = 0; index < scene.spine.length; index += 1) {
    scene.centroid.x += scene.spine[index].x
    scene.centroid.y += scene.spine[index].y
  }
  scene.centroid.x /= scene.spine.length
  scene.centroid.y /= scene.spine.length
}

function drawCrosshair(
  context: CanvasRenderingContext2D,
  point: IKPoint,
  color: string,
  radius = 10,
) {
  context.save()
  context.translate(point.x, point.y)
  context.strokeStyle = color
  context.lineWidth = 1
  context.globalAlpha = 0.8
  context.beginPath()
  context.arc(0, 0, radius, 0, TAU)
  context.moveTo(-radius - 5, 0)
  context.lineTo(radius + 5, 0)
  context.moveTo(0, -radius - 5)
  context.lineTo(0, radius + 5)
  context.stroke()
  context.fillStyle = color
  context.beginPath()
  context.arc(0, 0, 1.8, 0, TAU)
  context.fill()
  context.restore()
}

function drawArrow(
  context: CanvasRenderingContext2D,
  point: IKPoint,
  velocityX: number,
  velocityY: number,
  color: string,
) {
  const speed = Math.hypot(velocityX, velocityY)
  if (speed < 0.5) return
  const scale = Math.min(72, speed * 0.42)
  const directionX = velocityX / speed
  const directionY = velocityY / speed
  const endX = point.x + directionX * scale
  const endY = point.y + directionY * scale

  context.save()
  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = 1.2
  context.beginPath()
  context.moveTo(point.x, point.y)
  context.lineTo(endX, endY)
  context.stroke()
  context.translate(endX, endY)
  context.rotate(Math.atan2(directionY, directionX))
  context.beginPath()
  context.moveTo(0, 0)
  context.lineTo(-8, -3.5)
  context.lineTo(-8, 3.5)
  context.closePath()
  context.fill()
  context.restore()
}

function drawEnergyConduit(
  context: CanvasRenderingContext2D,
  start: IKPoint,
  end: IKPoint,
  time: number,
  phase: number,
  palette: VfxPalette,
) {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const length = Math.hypot(deltaX, deltaY)
  if (length < 0.001) return
  const perpendicularX = -deltaY / length
  const perpendicularY = deltaX / length
  const samples = 10

  context.save()
  context.globalCompositeOperation = 'lighter'
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(start.x, start.y)
  for (let sample = 1; sample <= samples; sample += 1) {
    const progress = sample / samples
    const envelope = Math.sin(progress * Math.PI)
    const wave =
      Math.sin(progress * Math.PI * 2.4 - time * 8.5 + phase) *
      1.45 *
      envelope
    context.lineTo(
      start.x + deltaX * progress + perpendicularX * wave,
      start.y + deltaY * progress + perpendicularY * wave,
    )
  }

  context.globalAlpha = 0.24
  context.strokeStyle = palette.primary
  context.lineWidth = 5
  context.stroke()

  context.globalAlpha = 0.94
  context.strokeStyle = palette.tertiary
  context.lineWidth = 1.35
  context.setLineDash([6, 8])
  context.lineDashOffset = -time * 86 - phase * 7
  context.stroke()

  context.globalAlpha = 0.5
  context.strokeStyle = palette.secondary
  context.lineWidth = 2.2
  context.setLineDash([2, 13])
  context.lineDashOffset = time * 42 + phase * 4
  context.stroke()
  context.restore()
}

function drawHolographicJointRings(
  context: CanvasRenderingContext2D,
  joint: IKPoint,
  radius: number,
  time: number,
  phase: number,
  palette: VfxPalette,
) {
  context.save()
  context.translate(joint.x, joint.y)
  context.globalCompositeOperation = 'lighter'

  for (let ring = 0; ring < 3; ring += 1) {
    const ringRadius = radius + 4 + ring * 3.4
    const spin = time * (ring % 2 === 0 ? 1.35 : -1.05) + phase
    const tilt =
      0.22 +
      ring * 0.11 +
      Math.sin(time * 1.7 + phase + ring) * 0.08
    context.save()
    context.rotate(spin + ring * 0.62)
    context.scale(1, tilt)
    context.beginPath()
    context.arc(0, 0, ringRadius, 0, TAU)
    context.globalAlpha =
      (ring === 0 ? 0.58 : 0.34) + 0.09 * Math.sin(time * 4 + ring)
    context.strokeStyle =
      ring % 2 === 0 ? palette.primary : palette.secondary
    context.lineWidth = ring === 0 ? 1.2 : 0.75
    context.setLineDash(ring === 0 ? [7, 5] : [2, 7])
    context.lineDashOffset = -time * (21 + ring * 13)
    context.stroke()
    context.restore()
  }

  context.globalAlpha = 0.1
  context.fillStyle = palette.primary
  context.beginPath()
  context.arc(0, 0, radius + 9, 0, TAU)
  context.fill()
  context.globalAlpha = 0.24
  context.beginPath()
  context.arc(0, 0, Math.max(0.5, radius * 0.34), 0, TAU)
  context.fill()
  context.restore()
}

function drawScorchMarks(
  context: CanvasRenderingContext2D,
  scorches: ScorchMark[],
  time: number,
) {
  context.save()
  for (let index = 0; index < scorches.length; index += 1) {
    const scorch = scorches[index]
    if (!scorch.active) continue
    const lifeRatio = clamp(
      1 - scorch.age / scorch.duration,
      0,
      1,
    )
    const heat = lifeRatio * lifeRatio
    const radius = 18 + (1 - lifeRatio) * 12
    const red = Math.round(72 + heat * 183)
    const green = Math.round(8 + heat * 76)
    const blue = Math.round(4 + heat * 20)

    context.save()
    context.translate(scorch.x, scorch.y)
    context.rotate(scorch.angle)
    context.globalCompositeOperation = 'lighter'
    const glow = context.createRadialGradient(0, 0, 0, 0, 0, radius)
    glow.addColorStop(
      0,
      `rgba(${red}, ${green}, ${blue}, ${0.8 * lifeRatio})`,
    )
    glow.addColorStop(
      0.24,
      `rgba(${red}, ${Math.round(green * 0.74)}, ${blue}, ${0.42 * lifeRatio})`,
    )
    glow.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`)
    context.fillStyle = glow
    context.beginPath()
    context.arc(0, 0, radius, 0, TAU)
    context.fill()

    context.globalAlpha = lifeRatio * 0.62
    context.strokeStyle = `rgb(${red} ${green} ${blue})`
    context.lineCap = 'round'
    context.lineWidth = 1.1 + heat * 2.2
    context.beginPath()
    for (let segment = 0; segment <= 7; segment += 1) {
      const progress = segment / 7
      const trailX = -progress * (22 + heat * 18)
      const trailY =
        Math.sin(
          scorch.seed + progress * 19 + time * 1.2,
        ) *
        (2.4 + progress * 4)
      if (segment === 0) context.moveTo(trailX, trailY)
      else context.lineTo(trailX, trailY)
    }
    context.stroke()

    context.globalCompositeOperation = 'source-over'
    context.globalAlpha = 0.4 * lifeRatio
    context.fillStyle = '#100705'
    context.beginPath()
    context.ellipse(
      0,
      0,
      5 + heat * 4,
      3.5 + heat * 3,
      time * 0.05,
      0,
      TAU,
    )
    context.fill()
    context.restore()
  }
  context.restore()
}

function drawAngleCones(
  context: CanvasRenderingContext2D,
  joints: IKPoint[],
  maxAngle: number,
  radius: number,
  palette: VfxPalette,
) {
  context.save()
  for (let index = 1; index < joints.length - 1; index += 1) {
    const previous = joints[index - 1]
    const joint = joints[index]
    const incoming = Math.atan2(
      joint.y - previous.y,
      joint.x - previous.x,
    )
    context.beginPath()
    context.moveTo(joint.x, joint.y)
    context.arc(
      joint.x,
      joint.y,
      radius,
      incoming - maxAngle,
      incoming + maxAngle,
    )
    context.closePath()
    context.fillStyle = colorAlpha(palette.primary, 0.04)
    context.fill()
    context.strokeStyle = colorAlpha(palette.primary, 0.26)
    context.lineWidth = 0.7
    context.stroke()
  }
  context.restore()
}

function drawArm(
  context: CanvasRenderingContext2D,
  scene: ArmScene,
  time: number,
  debug: boolean,
  palette: VfxPalette,
  copy: FabrikDrawCopy,
) {
  const { base, joints } = scene
  drawScorchMarks(context, scene.scorches, time)

  context.save()
  context.strokeStyle = colorAlpha(palette.primary, 0.11)
  context.lineWidth = 1
  context.beginPath()
  context.ellipse(base.x, base.y + 16, 76, 20, 0, 0, TAU)
  context.stroke()
  context.fillStyle = colorAlpha(palette.primary, 0.028)
  context.fill()

  context.fillStyle = '#071016'
  context.strokeStyle = '#25353c'
  context.lineWidth = 1
  context.beginPath()
  context.roundRect(base.x - 35, base.y - 13, 70, 42, 8)
  context.fill()
  context.stroke()
  context.fillStyle = '#101920'
  context.beginPath()
  context.roundRect(base.x - 25, base.y - 24, 50, 27, 6)
  context.fill()
  context.stroke()

  for (let index = 0; index < joints.length - 1; index += 1) {
    const start = joints[index]
    const end = joints[index + 1]
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(start.x, start.y)
    context.lineTo(end.x, end.y)
    context.strokeStyle = 'rgba(0, 0, 0, 0.8)'
    context.lineWidth = 16
    context.stroke()

    context.beginPath()
    context.moveTo(start.x, start.y)
    context.lineTo(end.x, end.y)
    context.strokeStyle = index < 2 ? '#788a91' : '#4c5c63'
    context.lineWidth = 10
    context.stroke()

    context.beginPath()
    context.moveTo(start.x, start.y)
    context.lineTo(end.x, end.y)
    context.strokeStyle = '#c5d4d8'
    context.lineWidth = 5.5
    context.stroke()

    context.beginPath()
    context.moveTo(start.x - 0.8, start.y - 1.2)
    context.lineTo(end.x - 0.8, end.y - 1.2)
    context.strokeStyle = 'rgba(245, 252, 255, 0.72)'
    context.lineWidth = 1.2
    context.stroke()
    drawEnergyConduit(
      context,
      start,
      end,
      time,
      index * 1.37,
      palette,
    )
  }

  for (let index = 0; index < joints.length; index += 1) {
    const joint = joints[index]
    const radius = index === 0 ? 13 : index === joints.length - 1 ? 8 : 10
    const gradient = context.createRadialGradient(
      joint.x - radius * 0.35,
      joint.y - radius * 0.45,
      1,
      joint.x,
      joint.y,
      radius,
    )
    gradient.addColorStop(0, '#ecf8fa')
    gradient.addColorStop(0.22, '#798a91')
    gradient.addColorStop(0.62, '#1b272d')
    gradient.addColorStop(1, '#070b0e')
    context.fillStyle = gradient
    context.strokeStyle = colorAlpha(
      index % 2 === 0 ? palette.primary : palette.secondary,
      0.52,
    )
    context.lineWidth = 1
    context.beginPath()
    context.arc(joint.x, joint.y, radius, 0, TAU)
    context.fill()
    context.stroke()
    context.fillStyle =
      index % 2 === 0 ? palette.primary : palette.secondary
    context.beginPath()
    context.arc(joint.x, joint.y, 1.6, 0, TAU)
    context.fill()
    drawHolographicJointRings(
      context,
      joint,
      radius,
      time,
      index * 0.83,
      palette,
    )
  }

  const endpoint = joints[joints.length - 1]
  const previousPoint = joints[joints.length - 2]
  const tipAngle = Math.atan2(
    endpoint.y - previousPoint.y,
    endpoint.x - previousPoint.x,
  )
  context.save()
  context.translate(endpoint.x, endpoint.y)
  context.rotate(tipAngle)
  context.strokeStyle = '#c9d9dc'
  context.lineCap = 'round'
  context.lineWidth = 3
  context.beginPath()
  context.moveTo(1, 0)
  context.lineTo(16, -8)
  context.lineTo(23, -4)
  context.moveTo(1, 0)
  context.lineTo(16, 8)
  context.lineTo(23, 4)
  context.stroke()
  context.strokeStyle = colorAlpha(palette.primary, 0.52)
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(17, -5)
  context.lineTo(20, 0)
  context.lineTo(17, 5)
  context.stroke()
  context.restore()

  if (scene.laser.life > 0) {
    const alpha = smoothstep(scene.laser.life)
    context.save()
    context.globalCompositeOperation = 'screen'
    context.lineCap = 'round'
    context.strokeStyle = colorAlpha(palette.secondary, alpha * 0.3)
    context.lineWidth = 18
    context.shadowBlur = 34 * alpha
    context.shadowColor = palette.secondary
    context.beginPath()
    context.moveTo(scene.laser.startX, scene.laser.startY)
    context.lineTo(scene.laser.endX, scene.laser.endY)
    context.stroke()

    const beamX = scene.laser.endX - scene.laser.startX
    const beamY = scene.laser.endY - scene.laser.startY
    const beamLength = Math.max(1, Math.hypot(beamX, beamY))
    const beamNormalX = -beamY / beamLength
    const beamNormalY = beamX / beamLength
    for (let filament = 0; filament < 2; filament += 1) {
      context.beginPath()
      for (let segment = 0; segment <= 15; segment += 1) {
        const progress = segment / 15
        const envelope = Math.sin(progress * Math.PI)
        const offset =
          Math.sin(
            progress * 43 +
              time * (28 + filament * 11) +
              filament * 4.7,
          ) *
          (1.8 + filament * 1.2) *
          envelope
        const pointX =
          scene.laser.startX +
          beamX * progress +
          beamNormalX * offset
        const pointY =
          scene.laser.startY +
          beamY * progress +
          beamNormalY * offset
        if (segment === 0) context.moveTo(pointX, pointY)
        else context.lineTo(pointX, pointY)
      }
      context.strokeStyle =
        filament === 0
          ? colorAlpha(palette.primary, alpha * 0.7)
          : colorAlpha(palette.secondary, alpha * 0.62)
      context.lineWidth = 0.75 + filament * 0.45
      context.shadowBlur = 8 * alpha
      context.stroke()
    }

    context.beginPath()
    context.moveTo(scene.laser.startX, scene.laser.startY)
    context.lineTo(scene.laser.endX, scene.laser.endY)
    context.strokeStyle = colorAlpha(palette.secondary, alpha * 0.62)
    context.lineWidth = 7
    context.shadowBlur = 22 * alpha
    context.shadowColor = palette.primary
    context.stroke()

    context.strokeStyle = colorAlpha(palette.tertiary, alpha * 0.42)
    context.lineWidth = 3.8
    context.shadowBlur = 10 * alpha
    context.stroke()

    context.strokeStyle = `rgba(255, 255, 255, ${alpha})`
    context.lineWidth = 1.8
    context.shadowBlur = 10 * alpha
    context.stroke()

    context.globalAlpha = alpha * 0.62
    context.strokeStyle = '#ffffff'
    context.lineWidth = 0.65
    context.shadowBlur = 0
    context.stroke()
    context.restore()

    drawCrosshair(
      context,
      {
        x: scene.laser.endX,
        y: scene.laser.endY,
      },
      palette.tertiary,
      8 + alpha * 5,
    )
  }

  if (debug) {
    drawAngleCones(context, joints, ARM_MAX_BEND, 28, palette)
    drawCrosshair(context, scene.target, palette.secondary, 11)
    drawArrow(
      context,
      scene.centroid,
      scene.velocity.x,
      scene.velocity.y,
      palette.primary,
    )

    for (let index = 0; index < joints.length; index += 1) {
      const joint = joints[index]
      context.fillStyle = 'rgba(230, 245, 247, 0.5)'
      context.font = '8px "JetBrains Mono Variable", monospace'
      context.fillText(
        formatTranslation(copy.joint, { index }),
        joint.x + 13,
        joint.y - 9,
      )
    }

    context.fillStyle = palette.primary
    context.font = '9px "JetBrains Mono Variable", monospace'
    context.fillText(
      formatTranslation(copy.error, {
        error: scene.result.error.toFixed(2),
      }),
      22,
      118,
    )
    context.fillStyle = 'rgba(230, 245, 247, 0.42)'
    context.fillText(
      formatTranslation(copy.iterations, {
        current: scene.result.iterations,
        max: 12,
      }),
      22,
      133,
    )
  }

  context.fillStyle = 'rgba(230, 245, 247, 0.36)'
  context.font = '8px "JetBrains Mono Variable", monospace'
  context.fillText(
    formatTranslation(copy.armState, {
      state:
        Math.sin(time * 1.4) > 0
          ? copy.tracking
          : copy.locked,
    }),
    base.x - 34,
    base.y + 48,
  )
  context.restore()
}

function drawSpine(
  context: CanvasRenderingContext2D,
  spine: IKPoint[],
  bodyRadius: number,
  time: number,
  palette: VfxPalette,
) {
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  context.moveTo(spine[0].x, spine[0].y)

  for (let index = 1; index < spine.length - 1; index += 1) {
    const point = spine[index]
    const next = spine[index + 1]
    context.quadraticCurveTo(
      point.x,
      point.y,
      (point.x + next.x) * 0.5,
      (point.y + next.y) * 0.5,
    )
  }

  const tail = spine[spine.length - 1]
  context.lineTo(tail.x, tail.y)
  context.strokeStyle = 'rgba(0, 0, 0, 0.9)'
  context.lineWidth = bodyRadius * 2 + 9
  context.stroke()
  context.strokeStyle = '#586970'
  context.lineWidth = bodyRadius * 2 + 2
  context.stroke()
  context.strokeStyle = '#111a1f'
  context.lineWidth = bodyRadius * 1.55
  context.stroke()

  context.globalCompositeOperation = 'lighter'
  context.globalAlpha = 0.64
  context.strokeStyle = palette.primary
  context.lineWidth = 1.2
  context.setLineDash([7, 12])
  context.lineDashOffset = -time * 78
  context.stroke()
  context.globalAlpha = 0.28
  context.strokeStyle = palette.secondary
  context.lineWidth = 3.5
  context.setLineDash([2, 18])
  context.lineDashOffset = time * 42
  context.stroke()
  context.restore()
}

function drawLeg(
  context: CanvasRenderingContext2D,
  leg: LegState,
  time: number,
  palette: VfxPalette,
) {
  const joints = leg.joints
  context.save()
  context.lineCap = 'round'

  for (let index = 0; index < joints.length - 1; index += 1) {
    const start = joints[index]
    const end = joints[index + 1]
    context.beginPath()
    context.moveTo(start.x, start.y)
    context.lineTo(end.x, end.y)
    context.strokeStyle = '#020405'
    context.lineWidth = 8
    context.stroke()
    context.strokeStyle = index === 0 ? '#7a8b90' : '#53646a'
    context.lineWidth = 4.5
    context.stroke()
    context.strokeStyle = 'rgba(221, 238, 240, 0.72)'
    context.lineWidth = 1
    context.stroke()
    drawEnergyConduit(
      context,
      start,
      end,
      time,
      index * 1.9,
      palette,
    )
  }

  for (let index = 0; index < joints.length; index += 1) {
    const joint = joints[index]
    context.fillStyle = '#091116'
    context.strokeStyle =
      index === 1
        ? colorAlpha(
            palette.primary,
            0.45 + Math.sin(time * 3) * 0.12,
          )
        : '#87989d'
    context.lineWidth = 1
    context.beginPath()
    context.arc(joint.x, joint.y, index === 0 ? 5 : 3.5, 0, TAU)
    context.fill()
    context.stroke()
    drawHolographicJointRings(
      context,
      joint,
      index === 0 ? 6 : 4.5,
      time + leg.group * 0.4,
      index * 0.73,
      palette,
    )
  }

  const foot = joints[joints.length - 1]
  context.fillStyle = leg.stepping ? palette.primary : '#9eacb0'
  context.shadowBlur = leg.stepping ? 9 : 0
  context.shadowColor = palette.primary
  context.beginPath()
  context.ellipse(foot.x, foot.y, 5.2, 2.4, 0, 0, TAU)
  context.fill()
  context.restore()
}

function traceHexagon(
  context: CanvasRenderingContext2D,
  radius: number,
) {
  context.beginPath()
  for (let side = 0; side < 6; side += 1) {
    const angle = -Math.PI / 2 + (side / 6) * TAU
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (side === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.closePath()
}

function drawGroundRipples(
  context: CanvasRenderingContext2D,
  scene: QuadrupedScene,
  palette: VfxPalette,
) {
  context.save()
  context.globalCompositeOperation = 'lighter'

  for (let index = 0; index < scene.ripples.length; index += 1) {
    const ripple = scene.ripples[index]
    if (!ripple.active) continue
    const progress = 1 - ripple.life
    const alpha = Math.pow(ripple.life, 1.3)

    context.save()
    context.translate(ripple.x, ripple.y + 2)
    context.scale(1, 0.55)
    context.rotate(
      ripple.seed * 0.07 +
        progress * (0.12 + (ripple.seed % 1) * 0.08),
    )

    for (let ring = 0; ring < 2; ring += 1) {
      const ringProgress = clamp(
        progress * 1.22 - ring * 0.16,
        0,
        1,
      )
      if (ringProgress <= 0) continue
      const radius = 10 + ringProgress * 64 - ring * 7
      const ringAlpha =
        Math.pow(1 - ringProgress, 1.45) *
        alpha *
        (ring === 0 ? 1 : 0.72)

      traceHexagon(context, radius)
      context.fillStyle =
        ring === 0
          ? colorAlpha(palette.primary, ringAlpha * 0.08)
          : colorAlpha(palette.secondary, ringAlpha * 0.06)
      context.fill()
      context.strokeStyle =
        ring === 0
          ? colorAlpha(palette.tertiary, ringAlpha)
          : colorAlpha(palette.secondary, ringAlpha * 0.86)
      context.lineWidth = (ring === 0 ? 2.1 : 1.25) + alpha * 1.1
      context.shadowBlur = 18 * ringAlpha
      context.shadowColor =
        ring === 0 ? palette.primary : palette.secondary
      context.stroke()
    }

    const gridRadius = 10 + progress * 64
    context.shadowBlur = 11 * alpha
    context.shadowColor = palette.primary
    context.strokeStyle = colorAlpha(palette.primary, alpha * 0.34)
    context.lineWidth = 0.72
    context.beginPath()
    for (let spoke = 0; spoke < 6; spoke += 1) {
      const angle = -Math.PI / 2 + (spoke / 6) * TAU
      context.moveTo(
        Math.cos(angle) * gridRadius * 0.22,
        Math.sin(angle) * gridRadius * 0.22,
      )
      context.lineTo(
        Math.cos(angle) * gridRadius,
        Math.sin(angle) * gridRadius,
      )
    }
    context.stroke()

    const innerRadius = Math.max(2, gridRadius * 0.57)
    traceHexagon(context, innerRadius)
    context.setLineDash([4, 5])
    context.lineDashOffset = -progress * 34
    context.strokeStyle = colorAlpha(palette.tertiary, alpha * 0.55)
    context.stroke()
    context.setLineDash([])

    context.fillStyle = colorAlpha(palette.tertiary, alpha * 0.78)
    for (let node = 0; node < 6; node += 1) {
      const angle = -Math.PI / 2 + (node / 6) * TAU
      context.beginPath()
      context.arc(
        Math.cos(angle) * gridRadius,
        Math.sin(angle) * gridRadius,
        1.35 + alpha * 1.2,
        0,
        TAU,
      )
      context.fill()
    }
    context.restore()
  }

  context.restore()
}

function drawQuadruped(
  context: CanvasRenderingContext2D,
  scene: QuadrupedScene,
  time: number,
  debug: boolean,
  palette: VfxPalette,
  copy: FabrikDrawCopy,
) {
  drawGroundRipples(context, scene, palette)
  drawSpine(context, scene.spine, scene.bodyRadius, time, palette)

  for (let index = 0; index < scene.legs.length; index += 1) {
    drawLeg(context, scene.legs[index], time + index, palette)
  }

  context.save()
  for (let index = 1; index < scene.spine.length - 1; index += 2) {
    const point = scene.spine[index]
    const previous = scene.spine[index - 1]
    const angle = Math.atan2(point.y - previous.y, point.x - previous.x)
    context.save()
    context.translate(point.x, point.y)
    context.rotate(angle)
    context.fillStyle = '#0a1116'
    context.strokeStyle = colorAlpha(
      index % 3 === 0 ? palette.primary : palette.secondary,
      0.3,
    )
    context.lineWidth = 0.8
    context.beginPath()
    context.roundRect(-5, -scene.bodyRadius * 0.7, 10, scene.bodyRadius * 1.4, 3)
    context.fill()
    context.stroke()
    drawHolographicJointRings(
      context,
      ORIGIN_POINT,
      scene.bodyRadius * 0.44,
      time,
      index * 0.51,
      palette,
    )
    context.restore()
  }

  const head = scene.spine[0]
  const headScale = clamp(scene.bodyRadius / 20, 0.72, 1.55)
  context.save()
  context.translate(head.x, head.y)
  context.rotate(scene.heading)
  context.scale(headScale, headScale)
  context.fillStyle = '#0a1217'
  context.strokeStyle = '#99abb0'
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(20, 0)
  context.lineTo(8, -13)
  context.lineTo(-8, -10)
  context.lineTo(-9, 10)
  context.lineTo(8, 13)
  context.closePath()
  context.fill()
  context.stroke()
  const eyeGlow = 0.58 + Math.sin(time * 3.2) * 0.16
  context.fillStyle = colorAlpha(palette.primary, eyeGlow)
  context.shadowBlur = 10
  context.shadowColor = palette.primary
  context.beginPath()
  context.arc(8, 0, 2.4, 0, TAU)
  context.fill()
  context.restore()

  const tail = scene.spine[scene.spine.length - 1]
  context.save()
  context.strokeStyle = colorAlpha(palette.primary, 0.52)
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(tail.x, tail.y)
  context.lineTo(
    tail.x - Math.cos(scene.heading) * 18,
    tail.y -
      Math.sin(scene.heading) * 18 +
      Math.sin(time * 2.1) * 5,
  )
  context.stroke()
  context.restore()

  if (debug) {
    for (let index = 0; index < scene.legs.length; index += 1) {
      const leg = scene.legs[index]
      const rest = getRestFoot(scene, leg)
      drawAngleCones(context, leg.joints, LEG_MAX_BEND, 18, palette)
      drawCrosshair(context, rest, palette.secondary, 8)
      context.save()
      context.strokeStyle = leg.stepping
        ? colorAlpha(palette.primary, 0.58)
        : colorAlpha(palette.primary, 0.2)
      context.setLineDash([3, 4])
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(leg.joints[0].x, leg.joints[0].y)
      context.lineTo(rest.x, rest.y)
      context.stroke()
      context.restore()
    }

    drawArrow(
      context,
      scene.centroid,
      scene.velocity.x,
      scene.velocity.y,
      palette.primary,
    )
    drawCrosshair(context, scene.pointer, palette.primary, 7)

    context.fillStyle = palette.primary
    context.font = '9px "JetBrains Mono Variable", monospace'
    context.fillText(
      formatTranslation(copy.legError, {
        error: scene.maxLegError.toFixed(2),
      }),
      22,
      118,
    )
    context.fillStyle = 'rgba(230, 245, 247, 0.42)'
    context.fillText(
      formatTranslation(copy.legIterations, {
        current: scene.maxLegIterations,
        max: 9,
      }),
      22,
      133,
    )
    context.fillStyle = 'rgba(230, 245, 247, 0.34)'
    context.fillText(
      formatTranslation(copy.gait, {
        spine: SPINE_NODE_COUNT,
        group: scene.gaitGroup === 0 ? 'A' : 'B',
        phase: copy.gaitStates[scene.gaitPhase],
      }),
      22,
      148,
    )
  }
}

export function FabrikCreature() {
  const { t } = useI18n()
  const [mode, setMode] = useState<IKMode>('arm')
  const [showDebug, setShowDebug] = useState(false)
  const soundEnabled = useAppStore((state) => state.soundEnabled)
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const vfxPalette = useMemo(
    () => getVfxPreset(vfxPreset),
    [vfxPreset],
  )
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const debugRef = useRef(showDebug)
  const soundEnabledRef = useRef(soundEnabled)
  const vfxPaletteRef = useRef<VfxPalette>(vfxPalette)
  const fabrikCopyRef = useRef(t.sandbox.fabrik)
  const rebuildRef = useRef<() => void>(() => undefined)
  const resumeAnimationRef = useRef<() => void>(() => undefined)
  const reducedMotion = Boolean(useReducedMotion())
  const inView = useInViewAnimation(stageRef)
  const inViewRef = useRef(inView)
  debugRef.current = showDebug
  soundEnabledRef.current = soundEnabled
  vfxPaletteRef.current = vfxPalette
  fabrikCopyRef.current = t.sandbox.fabrik

  useEffect(() => {
    inViewRef.current = inView
    if (inView) resumeAnimationRef.current()
  }, [inView])

  useLayoutEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!stage || !canvas || !context) return

    let scene: SceneState
    let width = 1
    let height = 1
    let animationFrame = 0
    let lastFrame = performance.now()
    let disposed = false
    let laserSpawnAccumulator = 0
    const pointer = createPoint(width * 0.68, height * 0.42)
    const reducedMotionScale = reducedMotion ? 0.35 : 1
    const particlePool = new VfxParticlePool({
      capacity: 2_200,
      space: '2d',
      bounds: {
        left: 0,
        right: width,
        top: 0,
        floorY: height,
      },
    })
    const particleLight: VfxIllumination = createVfxIllumination()
    const initialPalette = vfxPaletteRef.current
    const initialLightChannels = colorChannels(
      initialPalette.secondary,
    )
    let lightEnvelope = 0
    let lightRed = initialLightChannels.red
    let lightGreen = initialLightChannels.green
    let lightBlue = initialLightChannels.blue

    const updateDynamicLight = (
      activeScene: SceneState,
      delta = 1 / 60,
    ) => {
      particlePool.getIllumination(particleLight)
      let totalEnergy = particleLight.energy
      let weightedX = particleLight.x * totalEnergy
      let weightedY = particleLight.y * totalEnergy
      let weightedRed = particleLight.r * totalEnergy
      let weightedGreen = particleLight.g * totalEnergy
      let weightedBlue = particleLight.b * totalEnergy

      if (activeScene.kind === 'arm' && activeScene.laser.life > 0) {
        const palette = vfxPaletteRef.current
        const laserColor = colorChannels(palette.secondary)
        const beamEnergy = activeScene.laser.life * 38
        const beamX =
          activeScene.laser.startX * 0.32 +
          activeScene.laser.endX * 0.68
        const beamY =
          activeScene.laser.startY * 0.32 +
          activeScene.laser.endY * 0.68
        totalEnergy += beamEnergy
        weightedX += beamX * beamEnergy
        weightedY += beamY * beamEnergy
        weightedRed += laserColor.red * beamEnergy
        weightedGreen += laserColor.green * beamEnergy
        weightedBlue += laserColor.blue * beamEnergy
      }

      let targetIntensity = 0
      if (totalEnergy > 0.001) {
        const lightX = weightedX / totalEnergy
        const lightY = weightedY / totalEnergy
        targetIntensity = clamp(totalEnergy / 86, 0, 1)
        lightRed = Math.round(weightedRed / totalEnergy)
        lightGreen = Math.round(weightedGreen / totalEnergy)
        lightBlue = Math.round(weightedBlue / totalEnergy)

        stage.style.setProperty(
          '--vfx-light-x',
          `${clamp(lightX, 0, width).toFixed(1)}px`,
        )
        stage.style.setProperty(
          '--vfx-light-y',
          `${clamp(lightY, 0, height).toFixed(1)}px`,
        )
        stage.style.setProperty('--vfx-light-r', String(lightRed))
        stage.style.setProperty('--vfx-light-g', String(lightGreen))
        stage.style.setProperty('--vfx-light-b', String(lightBlue))
        stage.style.setProperty(
          '--vfx-light-spread',
          `${(20 + targetIntensity * 24).toFixed(1)}%`,
        )
        stage.dataset.vfxLightColor =
          `${lightRed},${lightGreen},${lightBlue}`
        stage.dataset.vfxLightX = lightX.toFixed(1)
        stage.dataset.vfxLightY = lightY.toFixed(1)
      }

      const targetOpacity = targetIntensity * 0.5
      lightEnvelope =
        targetOpacity >= lightEnvelope
          ? targetOpacity
          : Math.max(
              targetOpacity,
              lightEnvelope * Math.exp(-8.5 * delta),
            )
      if (lightEnvelope < 0.002) {
        lightEnvelope = 0
        stage.style.setProperty('--vfx-light-opacity', '0')
        stage.dataset.vfxLightIntensity = '0'
        return
      }

      stage.style.setProperty(
        '--vfx-light-opacity',
        lightEnvelope.toFixed(3),
      )
      stage.dataset.vfxLightIntensity = Math.max(
        targetIntensity,
        lightEnvelope / 0.5,
      ).toFixed(3)
    }

    const emitLaserIons = (armScene: ArmScene, intensity: number) => {
      const palette = vfxPaletteRef.current
      const deltaX = armScene.laser.endX - armScene.laser.startX
      const deltaY = armScene.laser.endY - armScene.laser.startY
      const length = Math.max(1, Math.hypot(deltaX, deltaY))
      const perpendicularX = -deltaY / length
      const perpendicularY = deltaX / length
      const sample = 0.08 + Math.random() * 0.9
      const originX = armScene.laser.startX + deltaX * sample
      const originY = armScene.laser.startY + deltaY * sample
      const side = Math.random() < 0.5 ? -1 : 1

      particlePool.emit({
        origin: {
          x: originX + perpendicularX * (Math.random() * 2 - 1) * 2.5,
          y: originY + perpendicularY * (Math.random() * 2 - 1) * 2.5,
        },
        count: intensity > 1 ? 3 : 1,
        direction: {
          x: perpendicularX * side,
          y: perpendicularY * side,
        },
        spread: 0.72,
        speed: [32, 145] as const,
        life: [0.2, 0.58] as const,
        size: [0.35, 1.05] as const,
        color: [palette.tertiary, palette.primary] as const,
        alpha: [0.95, 0] as const,
        gravity: { x: 0, y: 70, z: 0 },
        drag: 1.8,
        turbulence: 210,
        turbulenceFrequency: 42,
        renderMode: intensity > 1 ? 'plasma' : 'dot',
        glow: 1.7,
        fadeIn: 0.08,
      })

      particlePool.emit({
        origin: {
          x: armScene.laser.endX + (Math.random() * 2 - 1) * 2,
          y: armScene.laser.endY + (Math.random() * 2 - 1) * 2,
        },
        count: intensity > 1 ? 16 : 2,
        direction: { x: 0, y: -0.35 },
        spread: Math.PI * 1.82,
        speed: [55, 270] as const,
        life: [0.18, 0.62] as const,
        size: [0.55, 1.55] as const,
        color: ['#fff7d0', palette.secondary] as const,
        alpha: [1, 0] as const,
        gravity: { x: 0, y: 620, z: 0 },
        drag: 0.35,
        turbulence: 150,
        turbulenceFrequency: 31,
        bounce: 0.5,
        splitChance: 0.4,
        maxSplitDepth: 1,
        renderMode: 'streak',
        stretch: 0.026,
        glow: 1.5,
        fadeIn: 0.02,
        floorCollision: true,
      })
    }

    const emitGroundRippleParticles = (
      quadrupedScene: QuadrupedScene,
    ) => {
      const palette = vfxPaletteRef.current
      for (let index = 0; index < quadrupedScene.ripples.length; index += 1) {
        const ripple = quadrupedScene.ripples[index]
        if (!ripple.active || ripple.emitted) continue
        ripple.emitted = true
        particlePool.emit({
          origin: {
            x: ripple.x,
            y: ripple.y - 2,
          },
          count: reducedMotion ? 6 : 16,
          originJitter: { x: 10, y: 4 },
          direction: { x: 0, y: -1 },
          spread: 0.62,
          speed: [32, 96],
          life: [0.42, 0.95],
          size: [0.45, 1.15],
          color: [palette.tertiary, palette.secondary],
          alpha: [0.88, 0],
          gravity: { x: 0, y: -14, z: 0 },
          drag: 0.72,
          turbulence: 46,
          turbulenceFrequency: 17,
          renderMode: 'dot',
          glow: 1.7,
          fadeIn: 0.08,
        })
        stage.dataset.hexRippleCount = String(
          Number(stage.dataset.hexRippleCount ?? '0') + 1,
        )
      }
    }

    const sizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (
        pointer.x < 4 ||
        pointer.y < 4 ||
        pointer.x > width ||
        pointer.y > height
      ) {
        pointer.x = width * 0.68
        pointer.y = height * 0.42
      }
      scene = createScene(mode, { width, height }, pointer)
      particlePool.clear()
      particlePool.setBounds({
        left: 0,
        right: width,
        top: 0,
        floorY: height,
      })
      particlePool.setProjection(width * 0.5, height * 0.5, 1_400)
      laserSpawnAccumulator = 0
      stage.dataset.ikMode = mode
      stage.dataset.fabrikError = '0.00'
      stage.dataset.fabrikIterations = '0'
      stage.dataset.gaitStepped = 'false'
      stage.dataset.gaitGroup = '0'
      stage.dataset.gaitPhase = 'idle'
      stage.dataset.liftingLegs = ''
      stage.dataset.rippleCount = '0'
      stage.dataset.activeRipples = '0'
      stage.dataset.laserState =
        mode === 'arm' ? 'idle' : 'unavailable'
      stage.dataset.laserLength =
        scene.kind === 'arm' ? scene.laser.length.toFixed(1) : '0'
      stage.dataset.laserStartX = '0'
      stage.dataset.laserStartY = '0'
      stage.dataset.laserEndX = '0'
      stage.dataset.laserEndY = '0'
      stage.dataset.vfxActiveParticles = '0'
      stage.dataset.laserVfx = '0'
      stage.dataset.scorchCount = '0'
      stage.dataset.scorchActive = '0'
      stage.dataset.hexRippleCount = '0'
      stage.dataset.vfxLightIntensity = '0'
      stage.dataset.vfxLightColor = '0,0,0'
      lightEnvelope = 0
      stage.style.setProperty('--vfx-light-opacity', '0')
    }

    const fireLaser = () => {
      if (scene.kind !== 'arm') return
      const endpoint = scene.joints[scene.joints.length - 1]
      const previous =
        scene.joints[scene.joints.length - 2] ?? endpoint
      const beamAngle = Math.atan2(
        endpoint.y - previous.y,
        endpoint.x - previous.x,
      )
      scene.laser.startX = endpoint.x
      scene.laser.startY = endpoint.y
      scene.laser.endX =
        endpoint.x + Math.cos(beamAngle) * scene.laser.length
      scene.laser.endY =
        endpoint.y + Math.sin(beamAngle) * scene.laser.length
      scene.laser.life = 1
      scene.recoil = 1
      stage.dataset.laserState = 'active'
      stage.dataset.laserLength = scene.laser.length.toFixed(1)
      stage.dataset.laserStartX = scene.laser.startX.toFixed(1)
      stage.dataset.laserStartY = scene.laser.startY.toFixed(1)
      stage.dataset.laserEndX = scene.laser.endX.toFixed(1)
      stage.dataset.laserEndY = scene.laser.endY.toFixed(1)
      const scorch =
        scene.scorches[scene.scorchCursor]
      scorch.active = true
      scorch.x = scene.laser.endX
      scorch.y = scene.laser.endY
      scorch.age = 0
      scorch.duration = 3
      scorch.startedAt = performance.now() / 1_000
      scorch.angle = beamAngle
      scorch.seed = Math.random() * 1_000
      scene.scorchCursor =
        (scene.scorchCursor + 1) % scene.scorches.length
      scene.scorchCount += 1
      stage.dataset.scorchCount = String(scene.scorchCount)
      laserSpawnAccumulator = 0.04
      emitLaserIons(scene, 1.3)
      if (soundEnabledRef.current) {
        soundEngine.playLaserPulse()
      }
    }

    const updatePointer = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect()
      pointer.x = clamp(event.clientX - bounds.left, 12, width - 12)
      pointer.y = clamp(event.clientY - bounds.top, 70, height - 16)
    }

    const handlePointerMove = (event: PointerEvent) => {
      updatePointer(event)
    }

    const handlePointerDown = (event: PointerEvent) => {
      updatePointer(event)
      fireLaser()
    }

    const draw = (timestamp: number) => {
      if (disposed) return
      const frameDelta = clamp(
        (timestamp - lastFrame) / 1_000,
        1 / 240,
        0.12,
      )
      const delta = Math.min(frameDelta, 1 / 30)
      lastFrame = timestamp
      const time = timestamp / 1_000
      context.clearRect(0, 0, width, height)
      const solverStartedAt = performance.now()

      if (scene.kind === 'arm') {
        updateArm(
          scene,
          pointer,
          delta * reducedMotionScale,
          time,
        )
        updateScorches(scene, time)
        if (scene.laser.life > 0) {
          laserSpawnAccumulator += frameDelta
          while (laserSpawnAccumulator >= 0.028) {
            emitLaserIons(scene, 0.72)
            laserSpawnAccumulator -= 0.028
          }
        } else {
          laserSpawnAccumulator = 0
        }
        recordPhysicsSolveTime(performance.now() - solverStartedAt)
        drawArm(
          context,
          scene,
          time,
          debugRef.current,
          vfxPaletteRef.current,
          fabrikCopyRef.current.draw,
        )
        stage.dataset.fabrikError = scene.result.error.toFixed(2)
        stage.dataset.fabrikIterations = String(scene.result.iterations)
        stage.dataset.fabrikSpeed = Math.hypot(
          scene.velocity.x,
          scene.velocity.y,
        ).toFixed(1)
        stage.dataset.spineNodes = '0'
        stage.dataset.legs = '0'
        stage.dataset.laserState = scene.laser.life > 0 ? 'active' : 'idle'
      } else {
        updateQuadruped(
          scene,
          pointer,
          delta * reducedMotionScale,
          time,
        )
        emitGroundRippleParticles(scene)
        recordPhysicsSolveTime(performance.now() - solverStartedAt)
        drawQuadruped(
          context,
          scene,
          time,
          debugRef.current,
          vfxPaletteRef.current,
          fabrikCopyRef.current.draw,
        )
        stage.dataset.fabrikError = scene.maxLegError.toFixed(2)
        stage.dataset.fabrikIterations = String(
          scene.maxLegIterations,
        )
        stage.dataset.fabrikSpeed = Math.hypot(
          scene.velocity.x,
          scene.velocity.y,
        ).toFixed(1)
        stage.dataset.spineNodes = String(SPINE_NODE_COUNT)
        stage.dataset.legs = String(scene.legs.length)
        stage.dataset.laserState = 'unavailable'
        let liftingLegs = ''
        let hasSteppingLeg = false
        for (let index = 0; index < scene.legs.length; index += 1) {
          const leg = scene.legs[index]
          if (!leg.stepping) continue
          hasSteppingLeg = true
          liftingLegs += `${liftingLegs ? '|' : ''}${leg.id}`
        }
        let activeRipples = 0
        for (let index = 0; index < scene.ripples.length; index += 1) {
          if (scene.ripples[index].active) activeRipples += 1
        }
        stage.dataset.gaitGroup = String(scene.gaitGroup)
        stage.dataset.gaitPhase = scene.gaitPhase
        stage.dataset.liftingLegs = liftingLegs
        stage.dataset.rippleCount = String(scene.rippleCount)
        stage.dataset.activeRipples = String(activeRipples)
        if (hasSteppingLeg) {
          stage.dataset.gaitStepped = 'true'
        }
      }

      particlePool.update(frameDelta, time)
      updateDynamicLight(scene, frameDelta)
      particlePool.render(context)
      const particleStats = particlePool.getStats()
      let activeScorches = 0
      if (scene.kind === 'arm') {
        for (let index = 0; index < scene.scorches.length; index += 1) {
          if (scene.scorches[index].active) activeScorches += 1
        }
      }
      stage.dataset.vfxActiveParticles = String(particleStats.active)
      setParticleSourceCount('fabrik-vfx-particles', particleStats.active)
      stage.dataset.laserVfx = String(
        scene.kind === 'arm' ? particleStats.emitted : 0,
      )
      stage.dataset.scorchActive = String(activeScorches)
      stage.dataset.debugActive = debugRef.current ? 'true' : 'false'
      if (inViewRef.current) {
        animationFrame = window.requestAnimationFrame(draw)
      } else {
        animationFrame = 0
      }
    }

    const rebuild = () => {
      sizeCanvas()
      context.clearRect(0, 0, width, height)
      if (scene.kind === 'arm') {
        drawArm(
          context,
          scene,
          performance.now() / 1_000,
          debugRef.current,
          vfxPaletteRef.current,
          fabrikCopyRef.current.draw,
        )
      } else {
        drawQuadruped(
          context,
          scene,
          performance.now() / 1_000,
          debugRef.current,
          vfxPaletteRef.current,
          fabrikCopyRef.current.draw,
        )
      }
      particlePool.clear()
      setParticleSourceCount('fabrik-vfx-particles', 0)
      stage.style.setProperty('--vfx-light-opacity', '0')
      stage.dataset.vfxLightIntensity = '0'
    }

    rebuildRef.current = rebuild
    sizeCanvas()
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerdown', handlePointerDown)

    const resizeObserver = new ResizeObserver(() => {
      rebuild()
    })
    resizeObserver.observe(canvas)

    const resumeAnimation = () => {
      if (disposed || !inViewRef.current || animationFrame) return
      lastFrame = performance.now()
      animationFrame = window.requestAnimationFrame(draw)
    }
    resumeAnimationRef.current = resumeAnimation
    resumeAnimation()

    return () => {
      disposed = true
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      particlePool.clear()
      setParticleSourceCount('fabrik-vfx-particles', 0)
      context.clearRect(0, 0, width, height)
      canvas.width = 0
      canvas.height = 0
      stage.style.setProperty('--vfx-light-opacity', '0')
      rebuildRef.current = () => undefined
      resumeAnimationRef.current = () => undefined
    }
  }, [mode, reducedMotion])

  const playActivate = () => {
    if (!soundEnabled) return
    void soundEngine.unlock()
    soundEngine.playCardActivate()
  }

  return (
    <section
      id="kinetics"
      data-fabrik-creature
      aria-labelledby="fabrik-title"
      className="relative z-10 overflow-hidden border-t border-white/[0.07] bg-[#04070a]/93 backdrop-blur-[2px]"
    >
      <div className="mx-auto max-w-[1600px] px-5 py-20 sm:px-8 sm:py-24 md:px-12 lg:py-28">
        <div className="grid h-[386px] gap-8 border-b border-white/[0.08] pb-10 max-[359px]:h-[469px] sm:h-[423px] md:h-[453px] md:grid-cols-[1.1fr_0.9fr] md:items-end md:pb-12 lg:h-[391px] xl:h-[453px] min-[1360px]:h-[379px]">
          <div>
            <p className="mb-5 font-mono text-[10px] tracking-[0.16em] text-signal">
              {t.sandbox.fabrik.eyebrow}
            </p>
            <h2
              id="fabrik-title"
              className="max-w-4xl text-4xl font-medium leading-[1.02] text-frost sm:text-5xl md:text-6xl xl:text-7xl"
            >
              {t.sandbox.fabrik.titleLineOne}
              <br />
              {t.sandbox.fabrik.titleLineTwo}
            </h2>
          </div>
          <div className="max-w-xl md:justify-self-end">
            <p className="text-sm leading-6 text-mist sm:text-base sm:leading-7">
              {t.sandbox.fabrik.description}
            </p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[9px] text-mist/45">
              {t.sandbox.fabrik.techTags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
        </div>

        <div
          ref={stageRef}
          data-fabrik-stage
          data-ik-mode={mode}
          data-fabrik-error="0"
          data-fabrik-iterations="0"
          data-fabrik-speed="0"
          data-spine-nodes="0"
          data-legs="0"
          data-gait-stepped="false"
          data-gait-group="0"
          data-gait-phase="idle"
          data-lifting-legs=""
          data-ripple-count="0"
          data-active-ripples="0"
          data-vfx-active-particles="0"
          data-laser-vfx="0"
          data-scorch-count="0"
          data-scorch-active="0"
          data-hex-ripple-count="0"
          data-vfx-light-intensity="0"
          data-vfx-light-color="0,0,0"
          data-vfx-preset={vfxPreset}
          data-laser-state={mode === 'arm' ? 'idle' : 'unavailable'}
          className="fabrik-stage relative mt-8 h-[620px] overflow-hidden rounded-md border border-white/[0.1] bg-[#05080c]/90 shadow-[0_34px_120px_rgba(0,0,0,0.38)] sm:mt-10 sm:h-[680px]"
        >
          <div
            aria-hidden="true"
            className="fabrik-grid pointer-events-none absolute inset-0 opacity-65"
          />
          <div
            aria-hidden="true"
            data-fabrik-grid-light
            className="vfx-grid-light fabrik-vfx-grid-light"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[64px] h-px bg-white/[0.07]"
          />

          <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex flex-wrap items-start justify-between gap-3 sm:inset-x-5 sm:top-4">
            <div className="flex min-w-[180px] items-center gap-2 rounded border border-white/[0.08] bg-black/25 px-2.5 py-2 font-mono text-[8px] text-mist/55 backdrop-blur-md sm:min-w-[220px]">
              {mode === 'arm' ? (
                <Cpu size={12} strokeWidth={1.5} className="text-signal" />
              ) : (
                <Box size={12} strokeWidth={1.5} className="text-amber" />
              )}
              <span data-localized-motion className="text-frost/80">
                {t.sandbox.fabrik.state[mode]}
              </span>
              <span className="hidden size-1 bg-signal sm:block" />
            </div>

            <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
              <div
                role="group"
                aria-label={t.sandbox.fabrik.modeGroupAria}
                className="flex rounded border border-white/10 bg-black/30 p-1 backdrop-blur-md"
              >
                <button
                  type="button"
                  data-ik-mode-option="arm"
                  aria-pressed={mode === 'arm'}
                  onClick={() => {
                    playActivate()
                    setMode('arm')
                  }}
                  className={`inline-flex h-7 min-w-[64px] items-center justify-center gap-1.5 rounded-[3px] px-2.5 font-mono text-[8px] transition-colors ${
                    mode === 'arm'
                      ? 'bg-signal/12 text-signal'
                      : 'text-mist/55 hover:text-frost'
                  }`}
                >
                  <Cpu size={11} strokeWidth={1.6} />
                  {t.sandbox.fabrik.modes.arm}
                </button>
                <button
                  type="button"
                  data-ik-mode-option="quadruped"
                  aria-pressed={mode === 'quadruped'}
                  onClick={() => {
                    playActivate()
                    setMode('quadruped')
                  }}
                  className={`inline-flex h-7 min-w-[64px] items-center justify-center gap-1.5 rounded-[3px] px-2.5 font-mono text-[8px] transition-colors ${
                    mode === 'quadruped'
                      ? 'bg-amber/12 text-amber'
                      : 'text-mist/55 hover:text-frost'
                  }`}
                >
                  <Box size={11} strokeWidth={1.6} />
                  {t.sandbox.fabrik.modes.quadruped}
                </button>
              </div>

              <label className="flex h-9 min-w-[96px] cursor-pointer items-center justify-center gap-2 rounded border border-white/10 bg-black/30 px-2.5 font-mono text-[8px] text-mist/65 backdrop-blur-md transition-colors hover:text-frost sm:min-w-[128px]">
                <input
                  type="checkbox"
                  checked={showDebug}
                  onChange={(event) => {
                    playActivate()
                    setShowDebug(event.target.checked)
                  }}
                  aria-label={t.sandbox.fabrik.debug.aria}
                  className="size-3"
                  style={{ accentColor: vfxPalette.secondary }}
                />
                <Crosshair size={11} strokeWidth={1.6} />
                <span className="hidden sm:inline">
                  {t.sandbox.fabrik.debug.long}
                </span>
                <span className="sm:hidden">
                  {t.sandbox.fabrik.debug.short}
                </span>
              </label>

              <button
                type="button"
                aria-label={t.sandbox.fabrik.reset.aria}
                title={t.sandbox.fabrik.reset.title}
                onClick={() => {
                  playActivate()
                  rebuildRef.current()
                }}
                className="grid size-9 place-items-center rounded border border-white/10 bg-black/30 text-mist/60 backdrop-blur-md transition-colors hover:border-white/25 hover:text-frost"
              >
                <RefreshCw size={13} strokeWidth={1.6} />
              </button>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            data-fabrik-canvas
            data-locale-canvas
            aria-label={
              mode === 'arm'
                ? t.sandbox.fabrik.canvasAria.arm
                : t.sandbox.fabrik.canvasAria.quadruped
            }
            className="absolute inset-0 size-full cursor-crosshair"
          />
          <div
            aria-hidden="true"
            data-fabrik-lightfield
            className="vfx-environment-light fabrik-vfx-light"
          />

          <div className="pointer-events-none absolute bottom-3 left-4 z-30 flex items-center gap-4 font-mono text-[8px] text-mist/38 sm:bottom-4 sm:left-5">
            <span className="flex items-center gap-1.5">
              <Gauge size={10} strokeWidth={1.5} />
              {t.sandbox.fabrik.telemetry.solver}
              <span className="text-frost/65">
                {t.sandbox.fabrik.telemetry.solverPasses}
              </span>
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              {mode === 'arm' ? (
                <Zap size={10} strokeWidth={1.5} />
              ) : (
                <MousePointer2 size={10} strokeWidth={1.5} />
              )}
              {t.sandbox.fabrik.action[mode]}
            </span>
          </div>
          <span className="pointer-events-none absolute bottom-3 right-4 z-30 font-mono text-[8px] text-mist/30 sm:bottom-4 sm:right-5">
            {t.sandbox.fabrik.action.core}
          </span>
        </div>
      </div>
    </section>
  )
}
