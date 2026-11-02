export const MAX_RAY_DEPTH = 10
export const MAX_SEGMENTS = 220
export const MAX_FLARES = 72

const TABLE_MIN_X = -1.72
const TABLE_MAX_X = 1.72
const TABLE_MIN_Y = -0.95
const TABLE_MAX_Y = 0.95
const RAY_EPSILON = 0.005
const PROPAGATION_ATTENUATION = 0.018
const TARGET_CORE_RADIUS = 0.045
const SPECTRAL_BRANCHES = [
  {
    offset: 1,
    red: 1,
    green: 0.17,
    blue: 0.06,
  },
  {
    offset: 0,
    red: 0.16,
    green: 1,
    blue: 0.55,
  },
  {
    offset: -1,
    red: 0.08,
    green: 0.38,
    blue: 1,
  },
] as const

export type RayMazeElementType =
  | 'emitter'
  | 'mirror'
  | 'splitter'
  | 'prism'

export type RayMazeElementId =
  | 'emitter'
  | 'mirror-a'
  | 'mirror-b'
  | 'splitter'
  | 'prism'

export interface RayMazeElement {
  id: RayMazeElementId
  type: RayMazeElementType
  x: number
  y: number
  angle: number
  ringRadius: number
  length: number
  hitRadius: number
}

export interface RayMazeTarget {
  id: 'target-a' | 'target-b' | 'target-c'
  x: number
  y: number
  radius: number
}

export interface RayMazeSolverConfig {
  gain: number
  dispersion: number
  sourceR: number
  sourceG: number
  sourceB: number
}

type RayHitKind =
  | 'boundary'
  | 'mirror'
  | 'splitter'
  | 'prism'
  | 'target'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export class RecursiveRaySolver {
  readonly segmentStartX = new Float32Array(MAX_SEGMENTS)
  readonly segmentStartY = new Float32Array(MAX_SEGMENTS)
  readonly segmentEndX = new Float32Array(MAX_SEGMENTS)
  readonly segmentEndY = new Float32Array(MAX_SEGMENTS)
  readonly segmentEnergy = new Float32Array(MAX_SEGMENTS)
  readonly segmentR = new Float32Array(MAX_SEGMENTS)
  readonly segmentG = new Float32Array(MAX_SEGMENTS)
  readonly segmentB = new Float32Array(MAX_SEGMENTS)
  readonly flareX = new Float32Array(MAX_FLARES)
  readonly flareY = new Float32Array(MAX_FLARES)
  readonly flareEnergy = new Float32Array(MAX_FLARES)
  readonly flareR = new Float32Array(MAX_FLARES)
  readonly flareG = new Float32Array(MAX_FLARES)
  readonly flareB = new Float32Array(MAX_FLARES)
  readonly flareKind = new Uint8Array(MAX_FLARES)
  readonly targetEnergy = new Float32Array(3)
  readonly targetLocked = new Uint8Array(3)
  readonly elementHitCounts = new Uint16Array(5)
  segmentCount = 0
  flareCount = 0
  maxDepthSeen = 0
  branchCount = 0
  targetHitCount = 0

  private nearestT = Number.POSITIVE_INFINITY
  private nearestKind: RayHitKind = 'boundary'
  private nearestElementIndex = -1
  private nearestTargetIndex = -1

  run(
    elements: RayMazeElement[],
    targets: RayMazeTarget[],
    config: RayMazeSolverConfig,
  ) {
    this.segmentCount = 0
    this.flareCount = 0
    this.maxDepthSeen = 0
    this.branchCount = 0
    this.targetHitCount = 0
    this.targetEnergy.fill(0)
    this.targetLocked.fill(0)
    this.elementHitCounts.fill(0)

    const source = elements[0]
    if (!source) return

    const startX =
      source.x +
      Math.cos(source.angle) * (source.length * 0.54)
    const startY =
      source.y +
      Math.sin(source.angle) * (source.length * 0.54)
    const energy = Math.max(0.08, config.gain)

    this.traceRay(
      startX,
      startY,
      Math.cos(source.angle),
      Math.sin(source.angle),
      energy,
      config.sourceR,
      config.sourceG,
      config.sourceB,
      0,
      -1,
      elements,
      targets,
      config,
    )
  }

  private traceRay(
    originX: number,
    originY: number,
    directionX: number,
    directionY: number,
    energy: number,
    red: number,
    green: number,
    blue: number,
    depth: number,
    ignoredElementIndex: number,
    elements: RayMazeElement[],
    targets: RayMazeTarget[],
    config: RayMazeSolverConfig,
  ) {
    if (
      depth >= MAX_RAY_DEPTH ||
      energy <= 0.018 ||
      this.segmentCount >= MAX_SEGMENTS
    ) {
      return
    }
    this.maxDepthSeen = Math.max(this.maxDepthSeen, depth)
    this.nearestT = Number.POSITIVE_INFINITY
    this.nearestKind = 'boundary'
    this.nearestElementIndex = -1
    this.nearestTargetIndex = -1

    for (let index = 0; index < elements.length; index += 1) {
      if (index === ignoredElementIndex) continue
      const element = elements[index]
      if (element.type === 'mirror') {
        const hit = this.intersectMirror(
          originX,
          originY,
          directionX,
          directionY,
          element,
        )
        this.considerElementHit(hit, index, 'mirror')
      } else if (element.type === 'splitter') {
        const hit = this.intersectRotatedBox(
          originX,
          originY,
          directionX,
          directionY,
          element.x,
          element.y,
          element.hitRadius,
          element.angle,
        )
        this.considerElementHit(hit, index, 'splitter')
      } else if (element.type === 'prism') {
        const hit = this.intersectCircle(
          originX,
          originY,
          directionX,
          directionY,
          element.x,
          element.y,
          element.hitRadius,
        )
        this.considerElementHit(hit, index, 'prism')
      }
    }

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index]
      const hit = this.intersectCircle(
        originX,
        originY,
        directionX,
        directionY,
        target.x,
        target.y,
        target.radius,
      )
      if (hit > RAY_EPSILON && hit < this.nearestT) {
        this.nearestT = hit
        this.nearestKind = 'target'
        this.nearestElementIndex = -1
        this.nearestTargetIndex = index
      }
    }

    const boundaryT = this.distanceToTableBoundary(
      originX,
      originY,
      directionX,
      directionY,
    )
    if (
      boundaryT > RAY_EPSILON &&
      boundaryT < this.nearestT
    ) {
      this.nearestT = boundaryT
      this.nearestKind = 'boundary'
      this.nearestElementIndex = -1
      this.nearestTargetIndex = -1
    }

    if (!Number.isFinite(this.nearestT)) return
    const hitX = originX + directionX * this.nearestT
    const hitY = originY + directionY * this.nearestT
    const propagatedEnergy =
      energy *
      Math.exp(-this.nearestT * PROPAGATION_ATTENUATION)
    this.recordSegment(
      originX,
      originY,
      hitX,
      hitY,
      propagatedEnergy,
      red,
      green,
      blue,
    )

    if (this.nearestKind === 'boundary') return

    this.recordFlare(
      hitX,
      hitY,
      propagatedEnergy,
      red,
      green,
      blue,
      this.nearestKind,
    )
    this.branchCount += 1

    if (this.nearestKind === 'target') {
      if (this.nearestTargetIndex >= 0) {
        const target = targets[this.nearestTargetIndex]
        const perpendicularDistance = Math.abs(
          (target.x - originX) * directionY -
            (target.y - originY) * directionX,
        )
        this.targetEnergy[this.nearestTargetIndex] +=
          propagatedEnergy
        if (perpendicularDistance <= TARGET_CORE_RADIUS) {
          this.targetLocked[this.nearestTargetIndex] = 1
        }
        this.targetHitCount += 1
      }
      return
    }

    const elementIndex = this.nearestElementIndex
    const element = elements[elementIndex]
    if (!element) return
    this.elementHitCounts[elementIndex] += 1

    if (element.type === 'mirror') {
      const incomingAngle = Math.atan2(
        directionY,
        directionX,
      )
      const outgoingAngle =
        2 * element.angle - incomingAngle
      const nextX = Math.cos(outgoingAngle)
      const nextY = Math.sin(outgoingAngle)
      this.traceRay(
        hitX + nextX * RAY_EPSILON,
        hitY + nextY * RAY_EPSILON,
        nextX,
        nextY,
        propagatedEnergy * 0.96,
        red,
        green,
        blue,
        depth + 1,
        elementIndex,
        elements,
        targets,
        config,
      )
      return
    }

    if (element.type === 'splitter') {
      const incomingAngle = Math.atan2(
        directionY,
        directionX,
      )
      const reflectedAngle =
        2 * element.angle - incomingAngle
      this.traceRay(
        hitX + directionX * RAY_EPSILON,
        hitY + directionY * RAY_EPSILON,
        directionX,
        directionY,
        propagatedEnergy * 0.5,
        red,
        green,
        blue,
        depth + 1,
        elementIndex,
        elements,
        targets,
        config,
      )
      this.traceRay(
        hitX + Math.cos(reflectedAngle) * RAY_EPSILON,
        hitY + Math.sin(reflectedAngle) * RAY_EPSILON,
        Math.cos(reflectedAngle),
        Math.sin(reflectedAngle),
        propagatedEnergy * 0.5,
        red,
        green,
        blue,
        depth + 1,
        elementIndex,
        elements,
        targets,
        config,
      )
      return
    }

    if (element.type === 'prism') {
      const incomingAngle = Math.atan2(
        directionY,
        directionX,
      )
      const dispersion = clamp(
        config.dispersion,
        0.035,
        0.32,
      )
      for (
        let branchIndex = 0;
        branchIndex < SPECTRAL_BRANCHES.length;
        branchIndex += 1
      ) {
        const branch = SPECTRAL_BRANCHES[branchIndex]
        const branchAngle =
          incomingAngle + branch.offset * dispersion
        const branchX = Math.cos(branchAngle)
        const branchY = Math.sin(branchAngle)
        this.traceRay(
          hitX + branchX * RAY_EPSILON,
          hitY + branchY * RAY_EPSILON,
          branchX,
          branchY,
          propagatedEnergy * 0.34,
          branch.red,
          branch.green,
          branch.blue,
          depth + 1,
          elementIndex,
          elements,
          targets,
          config,
        )
      }
    }
  }

  private recordSegment(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    energy: number,
    red: number,
    green: number,
    blue: number,
  ) {
    if (this.segmentCount >= MAX_SEGMENTS) return
    const index = this.segmentCount
    this.segmentStartX[index] = startX
    this.segmentStartY[index] = startY
    this.segmentEndX[index] = endX
    this.segmentEndY[index] = endY
    this.segmentEnergy[index] = energy
    this.segmentR[index] = red
    this.segmentG[index] = green
    this.segmentB[index] = blue
    this.segmentCount += 1
  }

  private recordFlare(
    x: number,
    y: number,
    energy: number,
    red: number,
    green: number,
    blue: number,
    kind: RayHitKind,
  ) {
    if (this.flareCount >= MAX_FLARES) return
    const index = this.flareCount
    this.flareX[index] = x
    this.flareY[index] = y
    this.flareEnergy[index] = energy
    this.flareR[index] = red
    this.flareG[index] = green
    this.flareB[index] = blue
    this.flareKind[index] =
      kind === 'mirror'
        ? 1
        : kind === 'splitter'
          ? 2
          : kind === 'prism'
            ? 3
            : 4
    this.flareCount += 1
  }

  private considerElementHit(
    hit: number,
    elementIndex: number,
    kind: RayHitKind,
  ) {
    if (hit <= RAY_EPSILON || hit >= this.nearestT) return
    this.nearestT = hit
    this.nearestKind = kind
    this.nearestElementIndex = elementIndex
    this.nearestTargetIndex = -1
  }

  private intersectMirror(
    originX: number,
    originY: number,
    directionX: number,
    directionY: number,
    mirror: RayMazeElement,
  ) {
    const tangentX = Math.cos(mirror.angle)
    const tangentY = Math.sin(mirror.angle)
    const halfLength = mirror.length * 0.5
    const startX = mirror.x - tangentX * halfLength
    const startY = mirror.y - tangentY * halfLength
    const segmentX = tangentX * mirror.length
    const segmentY = tangentY * mirror.length
    const denominator =
      directionX * segmentY - directionY * segmentX
    if (Math.abs(denominator) < 0.00001) {
      return Number.POSITIVE_INFINITY
    }
    const deltaX = startX - originX
    const deltaY = startY - originY
    const rayDistance =
      (deltaX * segmentY - deltaY * segmentX) / denominator
    const mirrorRatio =
      (deltaX * directionY - deltaY * directionX) / denominator
    return mirrorRatio >= 0 && mirrorRatio <= 1
      ? rayDistance
      : Number.POSITIVE_INFINITY
  }

  private intersectRotatedBox(
    originX: number,
    originY: number,
    directionX: number,
    directionY: number,
    centerX: number,
    centerY: number,
    halfSize: number,
    angle: number,
  ) {
    const cosine = Math.cos(-angle)
    const sine = Math.sin(-angle)
    const localOriginX =
      (originX - centerX) * cosine -
      (originY - centerY) * sine
    const localOriginY =
      (originX - centerX) * sine +
      (originY - centerY) * cosine
    const localDirectionX =
      directionX * cosine - directionY * sine
    const localDirectionY =
      directionX * sine + directionY * cosine
    let enter = Number.NEGATIVE_INFINITY
    let exit = Number.POSITIVE_INFINITY

    if (Math.abs(localDirectionX) < 0.00001) {
      if (
        localOriginX < -halfSize ||
        localOriginX > halfSize
      ) {
        return Number.POSITIVE_INFINITY
      }
    } else {
      const first = (-halfSize - localOriginX) / localDirectionX
      const second = (halfSize - localOriginX) / localDirectionX
      enter = Math.max(enter, Math.min(first, second))
      exit = Math.min(exit, Math.max(first, second))
    }

    if (Math.abs(localDirectionY) < 0.00001) {
      if (
        localOriginY < -halfSize ||
        localOriginY > halfSize
      ) {
        return Number.POSITIVE_INFINITY
      }
    } else {
      const first = (-halfSize - localOriginY) / localDirectionY
      const second = (halfSize - localOriginY) / localDirectionY
      enter = Math.max(enter, Math.min(first, second))
      exit = Math.min(exit, Math.max(first, second))
    }

    if (exit < 0 || enter > exit) {
      return Number.POSITIVE_INFINITY
    }
    return enter > RAY_EPSILON ? enter : exit
  }

  private intersectCircle(
    originX: number,
    originY: number,
    directionX: number,
    directionY: number,
    centerX: number,
    centerY: number,
    radius: number,
  ) {
    const offsetX = originX - centerX
    const offsetY = originY - centerY
    const projection =
      offsetX * directionX + offsetY * directionY
    const constant =
      offsetX * offsetX + offsetY * offsetY - radius * radius
    const discriminant = projection * projection - constant
    if (discriminant < 0) return Number.POSITIVE_INFINITY
    const root = Math.sqrt(discriminant)
    const near = -projection - root
    const far = -projection + root
    if (near > RAY_EPSILON) return near
    return far > RAY_EPSILON ? far : Number.POSITIVE_INFINITY
  }

  private distanceToTableBoundary(
    originX: number,
    originY: number,
    directionX: number,
    directionY: number,
  ) {
    let distance = Number.POSITIVE_INFINITY
    if (directionX > 0.00001) {
      distance = Math.min(
        distance,
        (TABLE_MAX_X - originX) / directionX,
      )
    } else if (directionX < -0.00001) {
      distance = Math.min(
        distance,
        (TABLE_MIN_X - originX) / directionX,
      )
    }
    if (directionY > 0.00001) {
      distance = Math.min(
        distance,
        (TABLE_MAX_Y - originY) / directionY,
      )
    } else if (directionY < -0.00001) {
      distance = Math.min(
        distance,
        (TABLE_MIN_Y - originY) / directionY,
      )
    }
    return distance
  }
}
