import { describe, expect, it } from 'vitest'
import {
  clamp,
  normalizeAngle,
  solveFABRIK,
  testOBBCollision,
  type IKPoint,
  type OBB,
  type OBBContact,
} from '../../src/utils/mathPhysics'

describe('mathPhysics', () => {
  it('clamps and normalizes input values', () => {
    expect(clamp(4, 1, 3)).toBe(3)
    expect(clamp(-2, 1, 3)).toBe(1)
    expect(normalizeAngle(Math.PI * 1.5)).toBeCloseTo(
      -Math.PI / 2,
      6,
    )
  })

  it('solves a reachable two-bone target', () => {
    const joints: IKPoint[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ]
    const result = solveFABRIK(
      joints,
      { x: 70, y: 30 },
      [50, 50],
      0.01,
      { maxIterations: 20, maxBendAngle: 1.5 },
    )

    expect(result.reachable).toBe(true)
    expect(result.error).toBeLessThan(0.05)
    expect(joints[0]).toEqual({ x: 0, y: 0 })
  })

  it('reports an unreachable target while preserving segment length', () => {
    const joints: IKPoint[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 0 },
    ]
    const result = solveFABRIK(
      joints,
      { x: 200, y: 0 },
      [20, 20],
      0.01,
    )

    expect(result.reachable).toBe(false)
    expect(result.error).toBeCloseTo(160, 5)
    expect(joints[1].x).toBeCloseTo(20, 5)
    expect(joints[2].x).toBeCloseTo(40, 5)
  })

  it('detects overlapping and separated oriented boxes', () => {
    const result: OBBContact = {
      normalX: 0,
      normalY: 0,
      penetration: 0,
      contactX: 0,
      contactY: 0,
    }
    const left: OBB = {
      centerX: 0,
      centerY: 0,
      halfWidth: 20,
      halfHeight: 10,
      angle: 0.2,
    }
    const overlapping: OBB = {
      centerX: 28,
      centerY: 3,
      halfWidth: 18,
      halfHeight: 8,
      angle: -0.15,
    }
    const separated: OBB = {
      centerX: 100,
      centerY: 0,
      halfWidth: 12,
      halfHeight: 8,
      angle: 0,
    }

    expect(testOBBCollision(left, overlapping, result)).toBe(true)
    expect(result.penetration).toBeGreaterThan(0)
    expect(testOBBCollision(left, separated, result)).toBe(false)
  })
})
