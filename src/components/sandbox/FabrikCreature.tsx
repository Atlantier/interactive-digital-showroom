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
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useInViewAnimation } from '../../hooks/useInViewAnimation'
import { recordPhysicsSolveTime } from '../../store/performanceTelemetry'
import { useAppStore } from '../../store/useAppStore'
import { soundEngine } from '../../utils/soundEngine'
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

interface LaserState {
  startX: number
  startY: number
  endX: number
  endY: number
  life: number
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
      life: 0,
    },
    centroid: createPoint(joints[3].x, joints[3].y),
    nextCentroid: createPoint(joints[3].x, joints[3].y),
    velocity: createPoint(),
    totalLength: lengths.reduce((total, length) => total + length, 0),
    solveTarget: createPoint(),
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

function drawAngleCones(
  context: CanvasRenderingContext2D,
  joints: IKPoint[],
  maxAngle: number,
  radius: number,
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
    context.fillStyle = 'rgba(114, 230, 255, 0.035)'
    context.fill()
    context.strokeStyle = 'rgba(114, 230, 255, 0.24)'
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
) {
  const { base, joints } = scene

  context.save()
  context.strokeStyle = 'rgba(114, 230, 255, 0.1)'
  context.lineWidth = 1
  context.beginPath()
  context.ellipse(base.x, base.y + 16, 76, 20, 0, 0, TAU)
  context.stroke()
  context.fillStyle = 'rgba(114, 230, 255, 0.025)'
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
    context.strokeStyle = index % 2 === 0 ? '#72e6ff88' : '#f2b35e77'
    context.lineWidth = 1
    context.beginPath()
    context.arc(joint.x, joint.y, radius, 0, TAU)
    context.fill()
    context.stroke()
    context.fillStyle = index % 2 === 0 ? '#72e6ff' : '#f2b35e'
    context.beginPath()
    context.arc(joint.x, joint.y, 1.6, 0, TAU)
    context.fill()
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
  context.strokeStyle = 'rgba(114, 230, 255, 0.5)'
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
    context.strokeStyle = `rgba(114, 230, 255, ${alpha * 0.32})`
    context.lineWidth = 12
    context.shadowBlur = 28 * alpha
    context.shadowColor = '#72e6ff'
    context.beginPath()
    context.moveTo(scene.laser.startX, scene.laser.startY)
    context.lineTo(scene.laser.endX, scene.laser.endY)
    context.stroke()
    context.strokeStyle = `rgba(239, 253, 255, ${alpha})`
    context.lineWidth = 1.8
    context.shadowBlur = 10 * alpha
    context.stroke()
    context.restore()
  }

  if (debug) {
    drawAngleCones(context, joints, ARM_MAX_BEND, 28)
    drawCrosshair(context, scene.target, '#f2b35e', 11)
    drawArrow(
      context,
      scene.centroid,
      scene.velocity.x,
      scene.velocity.y,
      '#72e6ff',
    )

    for (let index = 0; index < joints.length; index += 1) {
      const joint = joints[index]
      context.fillStyle = 'rgba(230, 245, 247, 0.5)'
      context.font = '8px "JetBrains Mono Variable", monospace'
      context.fillText(`J${index}`, joint.x + 13, joint.y - 9)
    }

    context.fillStyle = '#72e6ff'
    context.font = '9px "JetBrains Mono Variable", monospace'
    context.fillText(
      `FABRIK ERROR ${scene.result.error.toFixed(2)} PX`,
      22,
      118,
    )
    context.fillStyle = 'rgba(230, 245, 247, 0.42)'
    context.fillText(
      `${scene.result.iterations} / 12 ITERATIONS`,
      22,
      133,
    )
  }

  context.fillStyle = 'rgba(230, 245, 247, 0.36)'
  context.font = '8px "JetBrains Mono Variable", monospace'
  context.fillText(
    `ARM-06  ${Math.sin(time * 1.4) > 0 ? 'TRACKING' : 'LOCKED'}`,
    base.x - 34,
    base.y + 48,
  )
  context.restore()
}

function drawSpine(
  context: CanvasRenderingContext2D,
  spine: IKPoint[],
  bodyRadius: number,
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
  context.restore()
}

function drawLeg(
  context: CanvasRenderingContext2D,
  leg: LegState,
  time: number,
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
  }

  for (let index = 0; index < joints.length; index += 1) {
    const joint = joints[index]
    context.fillStyle = '#091116'
    context.strokeStyle =
      index === 1 ? `rgba(114, 230, 255, ${0.45 + Math.sin(time * 3) * 0.12})` : '#87989d'
    context.lineWidth = 1
    context.beginPath()
    context.arc(joint.x, joint.y, index === 0 ? 5 : 3.5, 0, TAU)
    context.fill()
    context.stroke()
  }

  const foot = joints[joints.length - 1]
  context.fillStyle = leg.stepping ? '#72e6ff' : '#9eacb0'
  context.shadowBlur = leg.stepping ? 9 : 0
  context.shadowColor = '#72e6ff'
  context.beginPath()
  context.ellipse(foot.x, foot.y, 5.2, 2.4, 0, 0, TAU)
  context.fill()
  context.restore()
}

function drawGroundRipples(
  context: CanvasRenderingContext2D,
  scene: QuadrupedScene,
) {
  context.save()
  context.globalCompositeOperation = 'screen'

  for (let index = 0; index < scene.ripples.length; index += 1) {
    const ripple = scene.ripples[index]
    if (!ripple.active) continue
    const progress = 1 - ripple.life
    const radius = 5 + progress * 34
    const alpha = Math.pow(ripple.life, 1.35)

    context.beginPath()
    context.ellipse(
      ripple.x,
      ripple.y,
      radius,
      radius * 0.52,
      0,
      0,
      TAU,
    )
    context.strokeStyle = `rgba(114, 230, 255, ${alpha * 0.82})`
    context.lineWidth = 1.4 + ripple.life * 1.2
    context.shadowBlur = 14 * alpha
    context.shadowColor = '#72e6ff'
    context.stroke()

    context.beginPath()
    context.ellipse(
      ripple.x,
      ripple.y,
      Math.max(0.1, radius * 0.34),
      Math.max(0.1, radius * 0.18),
      0,
      0,
      TAU,
    )
    context.strokeStyle = `rgba(114, 230, 255, ${alpha * 0.22})`
    context.lineWidth = 0.7
    context.shadowBlur = 0
    context.stroke()
  }

  context.restore()
}

function drawQuadruped(
  context: CanvasRenderingContext2D,
  scene: QuadrupedScene,
  time: number,
  debug: boolean,
) {
  drawGroundRipples(context, scene)
  drawSpine(context, scene.spine, scene.bodyRadius)

  for (let index = 0; index < scene.legs.length; index += 1) {
    drawLeg(context, scene.legs[index], time + index)
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
    context.strokeStyle = index % 3 === 0 ? '#72e6ff55' : '#f2b35e44'
    context.lineWidth = 0.8
    context.beginPath()
    context.roundRect(-5, -scene.bodyRadius * 0.7, 10, scene.bodyRadius * 1.4, 3)
    context.fill()
    context.stroke()
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
  context.fillStyle = `rgba(114, 230, 255, ${eyeGlow})`
  context.shadowBlur = 10
  context.shadowColor = '#72e6ff'
  context.beginPath()
  context.arc(8, 0, 2.4, 0, TAU)
  context.fill()
  context.restore()

  const tail = scene.spine[scene.spine.length - 1]
  context.save()
  context.strokeStyle = 'rgba(114, 230, 255, 0.52)'
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
      drawAngleCones(context, leg.joints, LEG_MAX_BEND, 18)
      drawCrosshair(context, rest, '#f2b35e', 8)
      context.save()
      context.strokeStyle = leg.stepping
        ? 'rgba(114, 230, 255, 0.58)'
        : 'rgba(114, 230, 255, 0.2)'
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
      '#72e6ff',
    )
    drawCrosshair(context, scene.pointer, '#72e6ff', 7)

    context.fillStyle = '#72e6ff'
    context.font = '9px "JetBrains Mono Variable", monospace'
    context.fillText(
      `2-BONE IK ERROR ${scene.maxLegError.toFixed(2)} PX`,
      22,
      118,
    )
    context.fillStyle = 'rgba(230, 245, 247, 0.42)'
    context.fillText(
      `${scene.maxLegIterations} / 9 ITERATIONS`,
      22,
      133,
    )
    context.fillStyle = 'rgba(230, 245, 247, 0.34)'
    context.fillText(
      `SPINE ${SPINE_NODE_COUNT}  TROT ${scene.gaitGroup === 0 ? 'A' : 'B'}  ${scene.gaitPhase.toUpperCase()}`,
      22,
      148,
    )
  }
}

export function FabrikCreature() {
  const [mode, setMode] = useState<IKMode>('arm')
  const [showDebug, setShowDebug] = useState(false)
  const soundEnabled = useAppStore((state) => state.soundEnabled)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const debugRef = useRef(showDebug)
  const soundEnabledRef = useRef(soundEnabled)
  const rebuildRef = useRef<() => void>(() => undefined)
  const resumeAnimationRef = useRef<() => void>(() => undefined)
  const reducedMotion = Boolean(useReducedMotion())
  const inView = useInViewAnimation(stageRef)
  const inViewRef = useRef(inView)
  debugRef.current = showDebug
  soundEnabledRef.current = soundEnabled

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
    const pointer = createPoint(width * 0.68, height * 0.42)
    const reducedMotionScale = reducedMotion ? 0.35 : 1

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
    }

    const fireLaser = () => {
      if (scene.kind !== 'arm') return
      const endpoint = scene.joints[scene.joints.length - 1]
      scene.laser.startX = endpoint.x
      scene.laser.startY = endpoint.y
      scene.laser.endX = pointer.x
      scene.laser.endY = pointer.y
      scene.laser.life = 1
      scene.recoil = 1
      stage.dataset.laserState = 'active'
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
      const delta = clamp(
        (timestamp - lastFrame) / 1_000,
        1 / 240,
        1 / 30,
      )
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
        recordPhysicsSolveTime(performance.now() - solverStartedAt)
        drawArm(context, scene, time, debugRef.current)
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
        recordPhysicsSolveTime(performance.now() - solverStartedAt)
        drawQuadruped(context, scene, time, debugRef.current)
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
        drawArm(context, scene, performance.now() / 1_000, debugRef.current)
      } else {
        drawQuadruped(
          context,
          scene,
          performance.now() / 1_000,
          debugRef.current,
        )
      }
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
        <div className="grid gap-8 border-b border-white/[0.08] pb-10 md:grid-cols-[1.1fr_0.9fr] md:items-end md:pb-12">
          <div>
            <p className="mb-5 font-mono text-[10px] tracking-[0.16em] text-signal">
              程序化运动实验室 / 05
            </p>
            <h2
              id="fabrik-title"
              className="max-w-4xl text-4xl font-medium leading-[1.02] text-frost sm:text-5xl md:text-6xl xl:text-7xl"
            >
              骨架不是形状，
              <br />
              是一组求解结果。
            </h2>
          </div>
          <div className="max-w-xl md:justify-self-end">
            <p className="text-sm leading-6 text-mist sm:text-base sm:leading-7">
              FABRIK 将目标反推为骨骼姿态，角度锥限制非自然折叠。四足形态在此之上叠加转向、落脚阈值与交替步态。
            </p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[9px] text-mist/45">
              <span>FABRIK / 12 ITERATIONS</span>
              <span>ANGLE CONES</span>
              <span>2-BONE GAIT</span>
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
          data-laser-state={mode === 'arm' ? 'idle' : 'unavailable'}
          className="fabrik-stage relative mt-8 h-[620px] overflow-hidden rounded-md border border-white/[0.1] bg-[#05080c]/90 shadow-[0_34px_120px_rgba(0,0,0,0.38)] sm:mt-10 sm:h-[680px]"
        >
          <div
            aria-hidden="true"
            className="fabrik-grid pointer-events-none absolute inset-0 opacity-65"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[64px] h-px bg-white/[0.07]"
          />

          <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex flex-wrap items-start justify-between gap-3 sm:inset-x-5 sm:top-4">
            <div className="flex items-center gap-2 rounded border border-white/[0.08] bg-black/25 px-2.5 py-2 font-mono text-[8px] text-mist/55 backdrop-blur-md">
              {mode === 'arm' ? (
                <Cpu size={12} strokeWidth={1.5} className="text-signal" />
              ) : (
                <Box size={12} strokeWidth={1.5} className="text-amber" />
              )}
              <span className="text-frost/80">
                {mode === 'arm' ? 'SIX-AXIS KINEMATICS' : 'QUADRUPED GAIT'}
              </span>
              <span className="hidden size-1 bg-signal sm:block" />
            </div>

            <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
              <div
                role="group"
                aria-label="IK 形态切换"
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
                  className={`inline-flex h-7 items-center gap-1.5 rounded-[3px] px-2.5 font-mono text-[8px] transition-colors ${
                    mode === 'arm'
                      ? 'bg-signal/12 text-signal'
                      : 'text-mist/55 hover:text-frost'
                  }`}
                >
                  <Cpu size={11} strokeWidth={1.6} />
                  6-AXIS
                </button>
                <button
                  type="button"
                  data-ik-mode-option="quadruped"
                  aria-pressed={mode === 'quadruped'}
                  onClick={() => {
                    playActivate()
                    setMode('quadruped')
                  }}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-[3px] px-2.5 font-mono text-[8px] transition-colors ${
                    mode === 'quadruped'
                      ? 'bg-amber/12 text-amber'
                      : 'text-mist/55 hover:text-frost'
                  }`}
                >
                  <Box size={11} strokeWidth={1.6} />
                  4-LEG
                </button>
              </div>

              <label className="flex h-9 cursor-pointer items-center gap-2 rounded border border-white/10 bg-black/30 px-2.5 font-mono text-[8px] text-mist/65 backdrop-blur-md transition-colors hover:text-frost">
                <input
                  type="checkbox"
                  checked={showDebug}
                  onChange={(event) => {
                    playActivate()
                    setShowDebug(event.target.checked)
                  }}
                  aria-label="Show IK Vectors"
                  className="size-3 accent-[#72e6ff]"
                />
                <Crosshair size={11} strokeWidth={1.6} />
                <span className="hidden sm:inline">Show IK Vectors</span>
                <span className="sm:hidden">Vectors</span>
              </label>

              <button
                type="button"
                aria-label="重置 IK 场景"
                title="重置 IK 场景"
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
            aria-label={
              mode === 'arm'
                ? '六轴机械臂 FABRIK 互动画布，点击发射激光'
                : '程序化步态四足 FABRIK 互动画布'
            }
            className="absolute inset-0 size-full cursor-crosshair"
          />

          <div className="pointer-events-none absolute bottom-3 left-4 z-30 flex items-center gap-4 font-mono text-[8px] text-mist/38 sm:bottom-4 sm:left-5">
            <span className="flex items-center gap-1.5">
              <Gauge size={10} strokeWidth={1.5} />
              FABRIK
              <span className="text-frost/65">12×</span>
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              {mode === 'arm' ? (
                <Zap size={10} strokeWidth={1.5} />
              ) : (
                <MousePointer2 size={10} strokeWidth={1.5} />
              )}
              {mode === 'arm' ? 'CLICK TO PULSE' : 'STEERING ACTIVE'}
            </span>
          </div>
          <span className="pointer-events-none absolute bottom-3 right-4 z-30 font-mono text-[8px] text-mist/30 sm:bottom-4 sm:right-5">
            KINETIC CORE / 05
          </span>
        </div>
      </div>
    </section>
  )
}
