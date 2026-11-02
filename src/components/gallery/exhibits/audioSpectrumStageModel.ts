import * as THREE from 'three'

export const TAU = Math.PI * 2
export const GRID_SIZE = 16
export const PILLAR_COUNT = GRID_SIZE * GRID_SIZE
export const SPOTLIGHT_COUNT = 4
export const SUNBURST_RINGS = 3
export const SUNBURST_SEGMENTS = 64
export const SUNBURST_COUNT = SUNBURST_RINGS * SUNBURST_SEGMENTS
export const SUNBURST_RADII = [0.48, 0.86, 1.23] as const
export const TERRAIN_COLUMNS = 64
export const TERRAIN_ROWS = 24
export const TERRAIN_WIDTH = 2.46
export const TERRAIN_DEPTH = 2.56
export const TERRAIN_FRONT_Z = 1.28
export const TERRAIN_INTERVAL = 0.058
export const SHOCKWAVE_DURATION = 1.18
export const ZERO_Y = new THREE.Vector3(0, 1, 0)
export const SPOTLIGHT_SOURCES = [
  [-1.35, 2.05, 0.82],
  [1.35, 2.05, 0.82],
  [-1.16, 2.38, -0.78],
  [1.16, 2.38, -0.78],
] as const
export const SPOTLIGHT_COLORS = [
  '#ff3ec9',
  '#4effc9',
  '#8bdfff',
  '#ffe6a6',
] as const
export const SUB_BASE = new THREE.Color('#7431d2')
export const SUB_PEAK = new THREE.Color('#ff65e2')
export const MID_BASE = new THREE.Color('#11b991')
export const MID_PEAK = new THREE.Color('#68ffd5')
export const HIGH_BASE = new THREE.Color('#2b8fce')
export const HIGH_PEAK = new THREE.Color('#86e7ff')
export const HIGH_GOLD = new THREE.Color('#ffd47a')

export interface WaveformGeometry {
  ribbonGeometry: THREE.BufferGeometry
  lineGeometry: THREE.BufferGeometry
  ribbonPositions: Float32Array
  linePositions: Float32Array
  segments: number
}

export interface SunburstGrid {
  positions: Float32Array
  angles: Float32Array
  radii: Float32Array
  groups: number[][]
}

export interface SpectrogramTerrain {
  geometry: THREE.BufferGeometry
  lineGeometry: THREE.BufferGeometry
  positionValues: Float32Array
  colorValues: Float32Array
  linePositionValues: Float32Array
  positionAttribute: THREE.BufferAttribute
  colorAttribute: THREE.BufferAttribute
  linePositionAttribute: THREE.BufferAttribute
  history: Float32Array
  columns: number
  rows: number
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function createWaveformGeometry(segments: number): WaveformGeometry {
  const ribbonGeometry = new THREE.BufferGeometry()
  const lineGeometry = new THREE.BufferGeometry()
  const ribbonPositions = new Float32Array(segments * 2 * 3)
  const linePositions = new Float32Array(segments * 3)
  const indices = new Uint16Array(segments * 6)

  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments
    const offset = index * 6
    indices[offset] = index * 2
    indices[offset + 1] = index * 2 + 1
    indices[offset + 2] = next * 2
    indices[offset + 3] = index * 2 + 1
    indices[offset + 4] = next * 2 + 1
    indices[offset + 5] = next * 2
  }

  ribbonGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(ribbonPositions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  )
  ribbonGeometry.setIndex(new THREE.BufferAttribute(indices, 1))
  lineGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(linePositions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  )
  return {
    ribbonGeometry,
    lineGeometry,
    ribbonPositions,
    linePositions,
    segments,
  }
}

export function createPillarGrid() {
  const positions = new Float32Array(PILLAR_COUNT * 2)
  const radii = new Float32Array(PILLAR_COUNT)
  const seeds = new Float32Array(PILLAR_COUNT)
  const groups: number[][] = [[], [], []]
  const spacing = 0.152
  const maxRadius = (GRID_SIZE * spacing * Math.SQRT1_2) * 0.72
  let index = 0
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const x = (column - (GRID_SIZE - 1) / 2) * spacing
      const z = (row - (GRID_SIZE - 1) / 2) * spacing
      positions[index * 2] = x
      positions[index * 2 + 1] = z
      radii[index] = Math.min(
        1,
        Math.hypot(x, z) / maxRadius,
      )
      seeds[index] =
        (Math.sin(index * 12.9898 + 4.1414) * 43_758.5453) %
        1
      const groupIndex =
        radii[index] < 0.33
          ? 0
          : radii[index] > 0.69
            ? 2
            : 1
      groups[groupIndex].push(index)
      index += 1
    }
  }
  return { positions, radii, seeds, spacing, groups }
}

export function createStageGridGeometry() {
  const geometry = new THREE.BufferGeometry()
  const lineCount = (GRID_SIZE + 1) * 2
  const positions = new Float32Array(lineCount * 2 * 3)
  const halfExtent = (GRID_SIZE * 0.152) / 2
  let cursor = 0

  for (let index = 0; index <= GRID_SIZE; index += 1) {
    const coordinate =
      -halfExtent + (index / GRID_SIZE) * halfExtent * 2
    positions[cursor] = coordinate
    positions[cursor + 1] = 0
    positions[cursor + 2] = -halfExtent
    positions[cursor + 3] = coordinate
    positions[cursor + 4] = 0
    positions[cursor + 5] = halfExtent
    cursor += 6

    positions[cursor] = -halfExtent
    positions[cursor + 1] = 0
    positions[cursor + 2] = coordinate
    positions[cursor + 3] = halfExtent
    positions[cursor + 4] = 0
    positions[cursor + 5] = coordinate
    cursor += 6
  }

  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3),
  )
  return geometry
}

export function createSunburstGrid(): SunburstGrid {
  const positions = new Float32Array(SUNBURST_COUNT * 2)
  const angles = new Float32Array(SUNBURST_COUNT)
  const radii = new Float32Array(SUNBURST_COUNT)
  const groups: number[][] = [[], [], []]
  let index = 0

  for (let ring = 0; ring < SUNBURST_RINGS; ring += 1) {
    const radius = SUNBURST_RADII[ring] ?? 0.48
    for (
      let segment = 0;
      segment < SUNBURST_SEGMENTS;
      segment += 1
    ) {
      const angle =
        (segment / SUNBURST_SEGMENTS) * TAU + ring * 0.085
      positions[index * 2] = Math.cos(angle) * radius
      positions[index * 2 + 1] = Math.sin(angle) * radius
      angles[index] = angle
      radii[index] = radius
      groups[ring].push(index)
      index += 1
    }
  }
  return { positions, angles, radii, groups }
}

export function createSpectrogramTerrain(
  columns: number,
  rows: number,
): SpectrogramTerrain {
  const vertexCount = columns * rows
  const positionValues = new Float32Array(vertexCount * 3)
  const colorValues = new Float32Array(vertexCount * 3)
  const linePositionValues = new Float32Array(columns * 3)
  const indices = new Uint16Array(
    (columns - 1) * (rows - 1) * 6,
  )
  let cursor = 0

  for (let row = 0; row < rows; row += 1) {
    const z =
      TERRAIN_FRONT_Z - (row / Math.max(1, rows - 1)) * TERRAIN_DEPTH
    for (let column = 0; column < columns; column += 1) {
      const x =
        -TERRAIN_WIDTH / 2 +
        (column / Math.max(1, columns - 1)) * TERRAIN_WIDTH
      const vertexIndex = row * columns + column
      positionValues[vertexIndex * 3] = x
      positionValues[vertexIndex * 3 + 1] = 0.025
      positionValues[vertexIndex * 3 + 2] = z
    }
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column
      const b = a + 1
      const c = a + columns
      const d = c + 1
      indices[cursor] = a
      indices[cursor + 1] = c
      indices[cursor + 2] = b
      indices[cursor + 3] = b
      indices[cursor + 4] = c
      indices[cursor + 5] = d
      cursor += 6
    }
  }

  for (let column = 0; column < columns; column += 1) {
    linePositionValues[column * 3] =
      -TERRAIN_WIDTH / 2 +
      (column / Math.max(1, columns - 1)) * TERRAIN_WIDTH
    linePositionValues[column * 3 + 1] = 0.05
    linePositionValues[column * 3 + 2] = TERRAIN_FRONT_Z
  }

  const positionAttribute = new THREE.BufferAttribute(
    positionValues,
    3,
  ).setUsage(THREE.DynamicDrawUsage)
  const colorAttribute = new THREE.BufferAttribute(
    colorValues,
    3,
  ).setUsage(THREE.DynamicDrawUsage)
  const linePositionAttribute = new THREE.BufferAttribute(
    linePositionValues,
    3,
  ).setUsage(THREE.DynamicDrawUsage)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', positionAttribute)
  geometry.setAttribute('color', colorAttribute)
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  const lineGeometry = new THREE.BufferGeometry()
  lineGeometry.setAttribute(
    'position',
    linePositionAttribute,
  )

  return {
    geometry,
    lineGeometry,
    positionValues,
    colorValues,
    linePositionValues,
    positionAttribute,
    colorAttribute,
    linePositionAttribute,
    history: new Float32Array(vertexCount),
    columns,
    rows,
  }
}

export function simulateSpectrum(
  frequencyData: Uint8Array<ArrayBuffer>,
  waveformData: Uint8Array<ArrayBuffer>,
  time: number,
  tempo: number,
  drive: number,
) {
  const beatRate = tempo / 60
  const halfBeat = (time * beatRate) % 1
  const bassPulse = Math.exp(-halfBeat * 8.5)
  const breath = 0.5 + 0.5 * Math.sin(time * 0.72)
  const frequencyCount = frequencyData.length
  for (let index = 0; index < frequencyCount; index += 1) {
    const normalized = index / Math.max(1, frequencyCount - 1)
    const low =
      Math.exp(-index / 14) *
      (0.2 + bassPulse * 0.8) *
      (0.72 + breath * 0.28)
    const middle =
      Math.exp(
        -((normalized - 0.34 - 0.06 * Math.sin(time * 0.41)) ** 2) /
          0.028,
      ) *
      (0.46 + 0.3 * Math.sin(time * 2.2 + index * 0.13))
    const high =
      Math.exp(
        -((normalized - 0.76) ** 2) / 0.08,
      ) *
      (0.2 + 0.22 * Math.sin(time * 4.8 + index * 0.51))
    const value =
      (low + Math.max(0, middle) + Math.max(0, high)) *
      drive *
      205
    frequencyData[index] = Math.max(
      0,
      Math.min(255, Math.round(value)),
    )
  }
  const waveformCount = waveformData.length
  for (let index = 0; index < waveformCount; index += 1) {
    const phase = (index / waveformCount) * TAU
    const sample =
      Math.sin(phase * 2.0 + time * 4.2) * 0.44 +
      Math.sin(phase * 5.0 - time * 2.7) * 0.21 +
      Math.sin(phase * 9.0 + time * 1.8) * 0.1
    waveformData[index] = Math.round(
      128 + sample * (36 + bassPulse * 34) * drive,
    )
  }
}
