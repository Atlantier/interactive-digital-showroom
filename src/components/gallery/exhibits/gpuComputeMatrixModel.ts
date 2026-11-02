import * as THREE from 'three'
import {
  NV_LINK_PARTICLE_COUNT,
  TENSOR_GRID_SIZE,
  TENSOR_VOXEL_COUNT,
} from '../../../data/gpuCompute'

export const TENSOR_CENTER_Y = 0.5
export const TENSOR_EXTENT = 0.68
export const TENSOR_SCAN_PLANE_SIZE = 1.7
const TENSOR_STEP = (TENSOR_EXTENT * 2) / (TENSOR_GRID_SIZE - 1)
const BVH_BLUE = new THREE.Color('#315cff')
export const BVH_GREEN = new THREE.Color('#6cff82')
export interface TensorGrid {
  positions: Float32Array
  activation: Float32Array
  seeds: Float32Array
}

export interface BusParticles {
  offsets: Float32Array
  speeds: Float32Array
  seeds: Float32Array
}

export interface WarpBeamDefinition {
  offset: THREE.Vector3
  direction: THREE.Vector3
  delay: number
  length: number
}

export interface WarpState {
  active: boolean
  elapsed: number
  origin: THREE.Vector3
  progress: number
  voxelIndex: number
}

export interface BvhNode {
  center: THREE.Vector3
  size: THREE.Vector3
  depth: number
  parent: number
  bounds: THREE.Box3
  edgesGeometry: THREE.EdgesGeometry
  color: THREE.Color
}

export function createWarpBeams(): WarpBeamDefinition[] {
  const beams: WarpBeamDefinition[] = []
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const x = (column - 3.5) * 0.05
      const z = (row - 1.5) * 0.048
      beams.push({
        offset: new THREE.Vector3(x, 0, z),
        direction: new THREE.Vector3(
          x * 1.7,
          1,
          z * 1.7,
        ).normalize(),
        delay: column * 0.018 + row * 0.035,
        length: 0.76 + row * 0.045 + column * 0.006,
      })
    }
  }
  return beams
}

export function deterministic(index: number) {
  return (
    Math.abs(
      (Math.sin(index * 17.173 + 31.417) * 43_758.5453) %
        1,
    ) || 0.27
  )
}

export function createTensorGrid(): TensorGrid {
  const positions = new Float32Array(TENSOR_VOXEL_COUNT * 3)
  const activation = new Float32Array(TENSOR_VOXEL_COUNT)
  const seeds = new Float32Array(TENSOR_VOXEL_COUNT)
  let index = 0
  for (let y = 0; y < TENSOR_GRID_SIZE; y += 1) {
    for (let z = 0; z < TENSOR_GRID_SIZE; z += 1) {
      for (let x = 0; x < TENSOR_GRID_SIZE; x += 1) {
        positions[index * 3] =
          (x - (TENSOR_GRID_SIZE - 1) / 2) * TENSOR_STEP
        positions[index * 3 + 1] =
          TENSOR_CENTER_Y +
          (y - (TENSOR_GRID_SIZE - 1) / 2) * TENSOR_STEP
        positions[index * 3 + 2] =
          (z - (TENSOR_GRID_SIZE - 1) / 2) * TENSOR_STEP
        seeds[index] = deterministic(index + 7)
        index += 1
      }
    }
  }
  return { positions, activation, seeds }
}

export function createBusParticles(): BusParticles {
  const offsets = new Float32Array(NV_LINK_PARTICLE_COUNT)
  const speeds = new Float32Array(NV_LINK_PARTICLE_COUNT)
  const seeds = new Float32Array(NV_LINK_PARTICLE_COUNT)
  for (let index = 0; index < NV_LINK_PARTICLE_COUNT; index += 1) {
    offsets[index] = deterministic(index * 3 + 1)
    speeds[index] = 0.055 + deterministic(index * 7 + 4) * 0.13
    seeds[index] = deterministic(index * 11 + 5)
  }
  return { offsets, speeds, seeds }
}

export function sampleBusRoute(
  groupIndex: number,
  progress: number,
  target: THREE.Vector3,
) {
  const inner = groupIndex === 1
  const width = inner ? 1.08 : groupIndex === 2 ? 0.86 : 1.32
  const depth = inner ? 0.78 : groupIndex === 2 ? 0.42 : 0.94
  const y = -0.275 + groupIndex * 0.012
  const perimeter = (width + depth) * 4
  let distance = ((progress % 1) + 1) % 1 * perimeter
  if (distance < width * 2) {
    target.set(-width + distance, y, -depth)
    return
  }
  distance -= width * 2
  if (distance < depth * 2) {
    target.set(width, y, -depth + distance)
    return
  }
  distance -= depth * 2
  if (distance < width * 2) {
    target.set(width - distance, y, depth)
    return
  }
  distance -= width * 2
  target.set(-width, y, depth - distance)
}

export function createCircuitTraceGeometry() {
  const positions: number[] = []
  const width = 2.78
  const depth = 2.04
  const y = -0.292
  for (let line = 0; line <= 18; line += 1) {
    const x = -width / 2 + (line / 18) * width
    positions.push(x, y, -depth / 2, x, y, depth / 2)
  }
  for (let line = 0; line <= 12; line += 1) {
    const z = -depth / 2 + (line / 12) * depth
    positions.push(-width / 2, y, z, width / 2, y, z)
  }
  for (let branch = 0; branch < 24; branch += 1) {
    const x = -1.2 + deterministic(branch * 5) * 2.4
    const z = -0.82 + deterministic(branch * 9 + 2) * 1.64
    const length = 0.1 + deterministic(branch * 13 + 4) * 0.35
    if (branch % 2 === 0) {
      positions.push(x - length, y - 0.002, z, x + length, y - 0.002, z)
    } else {
      positions.push(x, y - 0.002, z - length, x, y - 0.002, z + length)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  return geometry
}

export function createScanGridGeometry() {
  const positions: number[] = []
  const half = TENSOR_SCAN_PLANE_SIZE / 2
  for (let line = 0; line <= TENSOR_GRID_SIZE; line += 1) {
    const offset =
      -half + (line / TENSOR_GRID_SIZE) * TENSOR_SCAN_PLANE_SIZE
    positions.push(
      -half,
      offset,
      0,
      half,
      offset,
      0,
      offset,
      -half,
      0,
      offset,
      half,
      0,
    )
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  return geometry
}

export function createBvhNodes(): BvhNode[] {
  const definitions: Array<{
    center: readonly [number, number, number]
    size: readonly [number, number, number]
    depth: number
    parent: number
  }> = [
    { center: [0, 0.56, 0], size: [2.3, 1.5, 1.72], depth: 0, parent: -1 },
    { center: [-0.56, 0.56, 0], size: [1.05, 1.42, 1.62], depth: 1, parent: 0 },
    { center: [0.56, 0.56, 0], size: [1.05, 1.42, 1.62], depth: 1, parent: 0 },
    { center: [-0.88, 0.56, 0], size: [0.44, 1.3, 1.5], depth: 2, parent: 1 },
    { center: [-0.31, 0.56, 0], size: [0.44, 1.3, 1.5], depth: 2, parent: 1 },
    { center: [0.31, 0.56, 0], size: [0.44, 1.3, 1.5], depth: 2, parent: 2 },
    { center: [0.88, 0.56, 0], size: [0.44, 1.3, 1.5], depth: 2, parent: 2 },
    { center: [-1.03, 0.82, -0.34], size: [0.24, 0.5, 0.52], depth: 3, parent: 3 },
    { center: [-0.73, 0.3, 0.32], size: [0.24, 0.5, 0.52], depth: 3, parent: 3 },
    { center: [-0.43, 0.8, -0.34], size: [0.24, 0.5, 0.52], depth: 3, parent: 4 },
    { center: [-0.16, 0.28, 0.34], size: [0.24, 0.5, 0.52], depth: 3, parent: 4 },
    { center: [0.16, 0.8, -0.34], size: [0.24, 0.5, 0.52], depth: 3, parent: 5 },
    { center: [0.43, 0.28, 0.34], size: [0.24, 0.5, 0.52], depth: 3, parent: 5 },
    { center: [0.73, 0.82, -0.34], size: [0.24, 0.5, 0.52], depth: 3, parent: 6 },
    { center: [1.03, 0.3, 0.32], size: [0.24, 0.5, 0.52], depth: 3, parent: 6 },
  ]
  return definitions.map((definition) => {
    const center = new THREE.Vector3(...definition.center)
    const size = new THREE.Vector3(...definition.size)
    const halfSize = size.clone().multiplyScalar(0.5)
    const bounds = new THREE.Box3(
      center.clone().sub(halfSize),
      center.clone().add(halfSize),
    )
    const boxGeometry = new THREE.BoxGeometry(
      size.x,
      size.y,
      size.z,
    )
    const edgesGeometry = new THREE.EdgesGeometry(boxGeometry)
    boxGeometry.dispose()
    const color = BVH_BLUE.clone().lerp(
      BVH_GREEN,
      definition.depth * 0.12,
    )
    return {
      center,
      size,
      depth: definition.depth,
      parent: definition.parent,
      bounds,
      edgesGeometry,
      color,
    }
  })
}
