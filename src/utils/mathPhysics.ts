export interface VerletPoint {
  x: number
  y: number
  previousX: number
  previousY: number
  pinned: boolean
}

export interface VerletConstraint {
  a: number
  b: number
  restLength: number
  stiffness?: number
}

export interface AABB {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface OBB {
  centerX: number
  centerY: number
  halfWidth: number
  halfHeight: number
  angle: number
}

export interface OBBContact {
  normalX: number
  normalY: number
  penetration: number
  contactX: number
  contactY: number
}

export interface IKPoint {
  x: number
  y: number
}

export interface FABRIKOptions {
  maxIterations?: number
  maxBendAngle?: number
  bendBias?: number
}

export interface FABRIKResult {
  iterations: number
  error: number
  reachable: boolean
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const damp = (
  current: number,
  target: number,
  smoothing: number,
  delta: number,
) => current + (target - current) * (1 - Math.exp(-smoothing * delta))

export const normalizeAngle = (angle: number) =>
  Math.atan2(Math.sin(angle), Math.cos(angle))

function rotateIKChain(
  joints: IKPoint[],
  jointIndex: number,
  angle: number,
) {
  if (Math.abs(angle) < 0.000001) return
  const pivot = joints[jointIndex]
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)

  for (let index = jointIndex + 1; index < joints.length; index += 1) {
    const point = joints[index]
    const offsetX = point.x - pivot.x
    const offsetY = point.y - pivot.y
    point.x = pivot.x + offsetX * cosine - offsetY * sine
    point.y = pivot.y + offsetX * sine + offsetY * cosine
  }
}

function applyFabrikBendLimits(
  joints: IKPoint[],
  maxBendAngle: number,
  bendBias: number,
) {
  for (let index = 1; index < joints.length - 1; index += 1) {
    const previous = joints[index - 1]
    const joint = joints[index]
    const next = joints[index + 1]
    const incomingAngle = Math.atan2(
      joint.y - previous.y,
      joint.x - previous.x,
    )
    const outgoingAngle = Math.atan2(
      next.y - joint.y,
      next.x - joint.x,
    )
    let bend = normalizeAngle(outgoingAngle - incomingAngle)

    if (bendBias !== 0 && Math.abs(bend) < 0.08) {
      bend = bendBias * Math.min(0.16, maxBendAngle)
    }

    const constrainedBend = clamp(
      bend,
      -maxBendAngle,
      maxBendAngle,
    )
    rotateIKChain(
      joints,
      index,
      constrainedBend - bend,
    )
  }
}

/**
 * Generic FABRIK chain solver with local angle-cone constraints.
 * Joint positions are mutated in place for allocation-free realtime use.
 */
export function solveFABRIK(
  joints: IKPoint[],
  target: IKPoint,
  lengths: number[],
  tolerance: number,
  options: FABRIKOptions = {},
): FABRIKResult {
  const maxIterations = options.maxIterations ?? 10
  const maxBendAngle = options.maxBendAngle ?? Math.PI * 0.68
  const bendBias = options.bendBias ?? 0
  const rootX = joints[0].x
  const rootY = joints[0].y
  let totalLength = 0
  let longestLength = 0
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]
    totalLength += length
    longestLength = Math.max(longestLength, length)
  }
  const minimumReach = Math.max(0, longestLength * 2 - totalLength)
  const targetDeltaX = target.x - rootX
  const targetDeltaY = target.y - rootY
  const targetDistance = Math.hypot(targetDeltaX, targetDeltaY)
  const inverseTargetDistance =
    targetDistance > 0.0001 ? 1 / targetDistance : 0
  const directionX = targetDeltaX * inverseTargetDistance
  const directionY = targetDeltaY * inverseTargetDistance
  const clampedDistance = clamp(
    targetDistance,
    minimumReach,
    totalLength,
  )
  const effectiveTargetX = rootX + directionX * clampedDistance
  const effectiveTargetY = rootY + directionY * clampedDistance
  const reachable = targetDistance <= totalLength + tolerance

  if (targetDistance >= totalLength - tolerance) {
    joints[0].x = rootX
    joints[0].y = rootY
    for (let index = 0; index < lengths.length; index += 1) {
      const previous = joints[index]
      const next = joints[index + 1]
      next.x = previous.x + directionX * lengths[index]
      next.y = previous.y + directionY * lengths[index]
    }
    return {
      iterations: 1,
      error: Math.max(
        0,
        targetDistance - totalLength,
      ),
      reachable,
    }
  }

  let maximumInitialBend = 0
  for (let index = 1; index < joints.length - 1; index += 1) {
    const incomingAngle = Math.atan2(
      joints[index].y - joints[index - 1].y,
      joints[index].x - joints[index - 1].x,
    )
    const outgoingAngle = Math.atan2(
      joints[index + 1].y - joints[index].y,
      joints[index + 1].x - joints[index].x,
    )
    maximumInitialBend = Math.max(
      maximumInitialBend,
      Math.abs(normalizeAngle(outgoingAngle - incomingAngle)),
    )
  }
  if (maximumInitialBend < 0.0001) {
    rotateIKChain(
      joints,
      1,
      (bendBias === 0 ? 1 : Math.sign(bendBias)) * 0.1,
    )
  }

  let iterations = 0
  let error = Math.hypot(
    joints[joints.length - 1].x - effectiveTargetX,
    joints[joints.length - 1].y - effectiveTargetY,
  )

  while (iterations < maxIterations && error > tolerance) {
    const end = joints[joints.length - 1]
    end.x = effectiveTargetX
    end.y = effectiveTargetY

    for (let index = joints.length - 2; index >= 0; index -= 1) {
      const next = joints[index + 1]
      const current = joints[index]
      const deltaX = current.x - next.x
      const deltaY = current.y - next.y
      const distance = Math.hypot(deltaX, deltaY)
      const ratio =
        distance > 0.0001 ? lengths[index] / distance : 0
      current.x = next.x + deltaX * ratio
      current.y = next.y + deltaY * ratio
    }

    joints[0].x = rootX
    joints[0].y = rootY

    for (let index = 0; index < joints.length - 1; index += 1) {
      const current = joints[index]
      const next = joints[index + 1]
      const deltaX = next.x - current.x
      const deltaY = next.y - current.y
      const distance = Math.hypot(deltaX, deltaY)
      const ratio =
        distance > 0.0001 ? lengths[index] / distance : 0
      next.x = current.x + deltaX * ratio
      next.y = current.y + deltaY * ratio
    }

    applyFabrikBendLimits(joints, maxBendAngle, bendBias)
    const endpoint = joints[joints.length - 1]
    error = Math.hypot(
      endpoint.x - effectiveTargetX,
      endpoint.y - effectiveTargetY,
    )
    iterations += 1
  }

  return { iterations, error, reachable }
}

/**
 * Composite breeze:
 * Fwind(t) = A * sin(w1 * t) * cos(w2 * t).
 */
export function windForce(
  time: number,
  phase = 0,
  amplitude = 28,
) {
  return (
    amplitude *
    Math.sin(time * 1.17 + phase) *
    Math.cos(time * 0.43 + phase * 0.71)
  )
}

export function integrateVerlet(
  points: VerletPoint[],
  delta: number,
  gravity: number,
  time: number,
  windAmplitude: number,
) {
  const deltaSquared = delta * delta

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (point.pinned) {
      point.previousX = point.x
      point.previousY = point.y
      continue
    }

    const velocityX = (point.x - point.previousX) * 0.994
    const velocityY = (point.y - point.previousY) * 0.997
    const phase =
      index * 0.28 + point.x * 0.008 + point.y * 0.0045
    const horizontalWind = windForce(time, phase, windAmplitude)
    const verticalWind = windForce(
      time * 0.71,
      phase + 1.43,
      windAmplitude * 0.13,
    )

    point.previousX = point.x
    point.previousY = point.y
    point.x += velocityX + horizontalWind * deltaSquared
    point.y +=
      velocityY + (gravity + verticalWind) * deltaSquared
  }
}

export function relaxConstraints(
  points: VerletPoint[],
  constraints: VerletConstraint[],
  iterations: number,
) {
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let index = 0; index < constraints.length; index += 1) {
      const constraint = constraints[index]
      const pointA = points[constraint.a]
      const pointB = points[constraint.b]
      const deltaX = pointB.x - pointA.x
      const deltaY = pointB.y - pointA.y
      const distance = Math.hypot(deltaX, deltaY)

      if (distance < 0.0001) continue

      const inverseMassA = pointA.pinned ? 0 : 1
      const inverseMassB = pointB.pinned ? 0 : 1
      const inverseMassTotal = inverseMassA + inverseMassB
      if (inverseMassTotal === 0) continue

      const correction =
        ((distance - constraint.restLength) / distance) *
        (constraint.stiffness ?? 1)
      const correctionX = deltaX * correction
      const correctionY = deltaY * correction

      pointA.x +=
        correctionX * (inverseMassA / inverseMassTotal)
      pointA.y +=
        correctionY * (inverseMassA / inverseMassTotal)
      pointB.x -=
        correctionX * (inverseMassB / inverseMassTotal)
      pointB.y -=
        correctionY * (inverseMassB / inverseMassTotal)
    }
  }
}

export function measureMaxConstraintStrain(
  points: VerletPoint[],
  constraints: VerletConstraint[],
) {
  let maximum = 0

  for (let index = 0; index < constraints.length; index += 1) {
    const constraint = constraints[index]
    const pointA = points[constraint.a]
    const pointB = points[constraint.b]
    const distance = Math.hypot(
      pointB.x - pointA.x,
      pointB.y - pointA.y,
    )
    const strain =
      (distance - constraint.restLength) / constraint.restLength
    if (strain > maximum) maximum = strain
  }

  return maximum
}

export function constrainVerletPoints(
  points: VerletPoint[],
  width: number,
  floorY: number,
  restitution = 0.22,
) {
  const left = 6
  const right = width - 6

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (point.pinned) continue

    if (point.x < left) {
      const velocityX = point.x - point.previousX
      point.x = left
      point.previousX = point.x + velocityX * restitution
    } else if (point.x > right) {
      const velocityX = point.x - point.previousX
      point.x = right
      point.previousX = point.x + velocityX * restitution
    }

    if (point.y > floorY) {
      const velocityY = point.y - point.previousY
      point.y = floorY
      point.previousY = point.y + velocityY * restitution
      point.previousX = damp(point.previousX, point.x, 10, 1 / 60)
    }
  }
}

export function computeAABB(obb: OBB, result: AABB) {
  const cosine = Math.cos(obb.angle)
  const sine = Math.sin(obb.angle)
  const extentX =
    Math.abs(cosine) * obb.halfWidth +
    Math.abs(sine) * obb.halfHeight
  const extentY =
    Math.abs(sine) * obb.halfWidth +
    Math.abs(cosine) * obb.halfHeight

  result.minX = obb.centerX - extentX
  result.minY = obb.centerY - extentY
  result.maxX = obb.centerX + extentX
  result.maxY = obb.centerY + extentY
  return result
}

export function aabbOverlaps(a: AABB, b: AABB) {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  )
}

function projectedRadius(
  obb: OBB,
  cosine: number,
  sine: number,
  axisX: number,
  axisY: number,
) {
  const localX =
    Math.abs(cosine * axisX + sine * axisY) * obb.halfWidth
  const localY =
    Math.abs(-sine * axisX + cosine * axisY) * obb.halfHeight
  return localX + localY
}

function testSeparatingAxis(
  a: OBB,
  b: OBB,
  deltaX: number,
  deltaY: number,
  axisX: number,
  axisY: number,
  cosineA: number,
  sineA: number,
  cosineB: number,
  sineB: number,
) {
  const projectedDistance = Math.abs(deltaX * axisX + deltaY * axisY)
  const radiusA = projectedRadius(a, cosineA, sineA, axisX, axisY)
  const radiusB = projectedRadius(b, cosineB, sineB, axisX, axisY)
  return radiusA + radiusB - projectedDistance
}

export function testOBBCollision(
  a: OBB,
  b: OBB,
  result: OBBContact,
): boolean {
  const deltaX = b.centerX - a.centerX
  const deltaY = b.centerY - a.centerY
  const cosineA = Math.cos(a.angle)
  const sineA = Math.sin(a.angle)
  const cosineB = Math.cos(b.angle)
  const sineB = Math.sin(b.angle)
  let minimumOverlap = Number.POSITIVE_INFINITY
  let normalX = 1
  let normalY = 0

  for (let index = 0; index < 4; index += 1) {
    let axisX = cosineA
    let axisY = sineA

    if (index === 1) {
      axisX = -sineA
      axisY = cosineA
    } else if (index === 2) {
      axisX = cosineB
      axisY = sineB
    } else if (index === 3) {
      axisX = -sineB
      axisY = cosineB
    }

    const overlap = testSeparatingAxis(
      a,
      b,
      deltaX,
      deltaY,
      axisX,
      axisY,
      cosineA,
      sineA,
      cosineB,
      sineB,
    )

    if (overlap <= 0) return false
    if (overlap < minimumOverlap) {
      minimumOverlap = overlap
      normalX = axisX
      normalY = axisY
    }
  }

  if (deltaX * normalX + deltaY * normalY < 0) {
    normalX = -normalX
    normalY = -normalY
  }

  result.normalX = normalX
  result.normalY = normalY
  result.penetration = minimumOverlap
  result.contactX = a.centerX + deltaX * 0.5
  result.contactY = a.centerY + deltaY * 0.5
  return true
}

export function elasticImpulse(
  relativeVelocityX: number,
  relativeVelocityY: number,
  normalX: number,
  normalY: number,
  inverseMassA: number,
  inverseMassB: number,
  restitution = 0.52,
) {
  const normalVelocity =
    relativeVelocityX * normalX + relativeVelocityY * normalY
  const inverseMassTotal = inverseMassA + inverseMassB

  if (normalVelocity >= 0 || inverseMassTotal <= 0) return 0

  return (
    (-(1 + restitution) * normalVelocity) / inverseMassTotal
  )
}

export function getOBBVerticalExtent(
  halfWidth: number,
  halfHeight: number,
  angle: number,
) {
  return (
    Math.abs(Math.sin(angle)) * halfWidth +
    Math.abs(Math.cos(angle)) * halfHeight
  )
}

export function getOBBHorizontalExtent(
  halfWidth: number,
  halfHeight: number,
  angle: number,
) {
  return (
    Math.abs(Math.cos(angle)) * halfWidth +
    Math.abs(Math.sin(angle)) * halfHeight
  )
}
