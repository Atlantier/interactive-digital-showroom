import { describe, expect, it } from 'vitest'
import {
  MAX_RAY_DEPTH,
  RecursiveRaySolver,
  type RayMazeElement,
  type RayMazeSolverConfig,
  type RayMazeTarget,
} from '../../src/utils/rayMazeSolver'

const CONFIG: RayMazeSolverConfig = {
  gain: 1,
  dispersion: 0.12,
  sourceR: 0.15,
  sourceG: 1,
  sourceB: 0.55,
}

const EMITTER: RayMazeElement = {
  id: 'emitter',
  type: 'emitter',
  x: -1.2,
  y: 0,
  angle: 0,
  ringRadius: 0.22,
  length: 0.3,
  hitRadius: 0.1,
}

function target(
  id: RayMazeTarget['id'],
  x: number,
  y: number,
): RayMazeTarget {
  return { id, x, y, radius: 0.1 }
}

describe('RecursiveRaySolver', () => {
  it('locks a directly illuminated target with propagation loss', () => {
    const solver = new RecursiveRaySolver()
    const receptor = target('target-a', 0.6, 0)

    solver.run([EMITTER], [receptor], CONFIG)

    expect(solver.segmentCount).toBe(1)
    expect(solver.targetHitCount).toBe(1)
    expect(solver.targetLocked[0]).toBe(1)
    expect(solver.flareCount).toBe(1)
    expect(solver.flareKind[0]).toBe(4)

    const distance = 1.538
    expect(solver.targetEnergy[0]).toBeCloseTo(
      Math.exp(-distance * 0.018),
      4,
    )
  })

  it('reflects a horizontal ray into a perpendicular target', () => {
    const solver = new RecursiveRaySolver()
    const mirror: RayMazeElement = {
      id: 'mirror-a',
      type: 'mirror',
      x: 0,
      y: 0,
      angle: Math.PI / 4,
      ringRadius: 0.28,
      length: 0.4,
      hitRadius: 0.075,
    }

    solver.run(
      [EMITTER, mirror],
      [target('target-a', 0, 0.7)],
      CONFIG,
    )

    expect(solver.segmentCount).toBe(2)
    expect(solver.elementHitCounts[1]).toBe(1)
    expect(solver.targetLocked[0]).toBe(1)
    expect(solver.branchCount).toBe(2)
    expect(solver.maxDepthSeen).toBe(1)
  })

  it('splits one beam into transmitted and reflected branches', () => {
    const solver = new RecursiveRaySolver()
    const splitter: RayMazeElement = {
      id: 'splitter',
      type: 'splitter',
      x: 0,
      y: 0,
      angle: Math.PI / 4,
      ringRadius: 0.27,
      length: 0.23,
      hitRadius: 0.12,
    }

    solver.run(
      [EMITTER, splitter],
      [
        target('target-c', 0.6, 0),
        target('target-a', -0.17, 0.6),
      ],
      CONFIG,
    )

    expect(solver.segmentCount).toBe(3)
    expect(solver.targetHitCount).toBe(2)
    expect(Array.from(solver.targetLocked)).toEqual([1, 1, 0])
    expect(solver.targetEnergy[0]).toBeGreaterThan(0.45)
    expect(solver.targetEnergy[1]).toBeGreaterThan(0.45)
    expect(solver.flareKind[0]).toBe(2)
  })

  it('emits three spectral branches from a prism without looping forever', () => {
    const solver = new RecursiveRaySolver()
    const prism: RayMazeElement = {
      id: 'prism',
      type: 'prism',
      x: 0,
      y: 0,
      angle: 0,
      ringRadius: 0.25,
      length: 0.34,
      hitRadius: 0.18,
    }

    solver.run([EMITTER, prism], [], CONFIG)

    expect(solver.segmentCount).toBe(4)
    expect(solver.flareCount).toBe(1)
    expect(solver.flareKind[0]).toBe(3)
    expect(solver.maxDepthSeen).toBe(1)
    expect(solver.maxDepthSeen).toBeLessThan(MAX_RAY_DEPTH)
    expect(solver.segmentR[1]).not.toBe(solver.segmentR[3])
    expect(solver.segmentB[1]).not.toBe(solver.segmentB[3])
  })
})
