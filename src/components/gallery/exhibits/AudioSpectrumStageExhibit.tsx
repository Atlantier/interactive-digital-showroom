import { useFrame } from '@react-three/fiber'
import {
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react'
import * as THREE from 'three'
import {
  AUDIO_STAGE_MODES,
  AUDIO_STAGE_PAD_COLORS,
} from '../../../data/audioStage'
import { getVfxPreset } from '../../../data/vfxPresets'
import { useAppStore } from '../../../store/useAppStore'
import {
  useGalleryStore,
  type ExhibitMeta,
} from '../../../store/useGalleryStore'
import { getEffectiveGalleryTimeScale } from '../../../utils/motionPreferences'
import { soundEngine } from '../../../utils/soundEngine'
import type { GalleryPointerState } from '../OpticalExhibitScene'

const TAU = Math.PI * 2
const GRID_SIZE = 16
const PILLAR_COUNT = GRID_SIZE * GRID_SIZE
const SPOTLIGHT_COUNT = 4
const SUNBURST_RINGS = 3
const SUNBURST_SEGMENTS = 64
const SUNBURST_COUNT = SUNBURST_RINGS * SUNBURST_SEGMENTS
const SUNBURST_RADII = [0.48, 0.86, 1.23] as const
const TERRAIN_COLUMNS = 64
const TERRAIN_ROWS = 24
const TERRAIN_WIDTH = 2.46
const TERRAIN_DEPTH = 2.56
const TERRAIN_FRONT_Z = 1.28
const TERRAIN_INTERVAL = 0.058
const SHOCKWAVE_DURATION = 1.18
const ZERO_Y = new THREE.Vector3(0, 1, 0)
const SPOTLIGHT_SOURCES = [
  [-1.35, 2.05, 0.82],
  [1.35, 2.05, 0.82],
  [-1.16, 2.38, -0.78],
  [1.16, 2.38, -0.78],
] as const
let mountedAudioStageInstances = 0
const SPOTLIGHT_COLORS = [
  '#ff3ec9',
  '#4effc9',
  '#8bdfff',
  '#ffe6a6',
] as const
const SUB_BASE = new THREE.Color('#7431d2')
const SUB_PEAK = new THREE.Color('#ff65e2')
const MID_BASE = new THREE.Color('#11b991')
const MID_PEAK = new THREE.Color('#68ffd5')
const HIGH_BASE = new THREE.Color('#2b8fce')
const HIGH_PEAK = new THREE.Color('#86e7ff')
const HIGH_GOLD = new THREE.Color('#ffd47a')

interface WaveformGeometry {
  ribbonGeometry: THREE.BufferGeometry
  lineGeometry: THREE.BufferGeometry
  ribbonPositions: Float32Array
  linePositions: Float32Array
  segments: number
}

interface SunburstGrid {
  positions: Float32Array
  angles: Float32Array
  radii: Float32Array
  groups: number[][]
}

interface SpectrogramTerrain {
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

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function createWaveformGeometry(segments: number): WaveformGeometry {
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

function createPillarGrid() {
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

function createStageGridGeometry() {
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

function createSunburstGrid(): SunburstGrid {
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

function createSpectrogramTerrain(
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

function simulateSpectrum(
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

export function AudioSpectrumStageExhibit({
  exhibit,
  pointerRef,
  mode = 'pedestal',
}: {
  exhibit: ExhibitMeta
  pointerRef: RefObject<GalleryPointerState>
  mode?: 'pedestal' | 'darkroom'
}) {
  const performanceTier = useAppStore(
    (state) => state.performanceTier,
  )
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const activeExhibitId = useGalleryStore(
    (state) => state.activeExhibitId,
  )
  const playing = useGalleryStore(
    (state) => state.audioStagePlaying,
  )
  const setPlaying = useGalleryStore(
    (state) => state.setAudioStagePlaying,
  )
  const palette = useMemo(() => getVfxPreset(vfxPreset), [vfxPreset])
  const highDetail = performanceTier === 'high'
  const active =
    mode === 'darkroom'
      ? activeExhibitId === 'orbital-lens'
      : activeExhibitId === null
  const tempo = exhibit.params.tempo ?? 104
  const drive = exhibit.params.drive ?? 1.05
  const spectrumBias = exhibit.params.spectrumBias ?? 0.55
  const waveDensity = exhibit.params.waveDensity ?? 1
  const frequencyData = useMemo(
    () => new Uint8Array(256),
    [],
  )
  const waveformData = useMemo(
    () => new Uint8Array(512),
    [],
  )
  const smoothedFrequency = useMemo(
    () => new Float32Array(256),
    [],
  )
  const pillarHeights = useMemo(
    () => new Float32Array(PILLAR_COUNT),
    [],
  )
  const orbHeights = useMemo(
    () => new Float32Array(PILLAR_COUNT),
    [],
  )
  const orbVelocities = useMemo(
    () => new Float32Array(PILLAR_COUNT),
    [],
  )
  const sunburstHeights = useMemo(
    () => new Float32Array(SUNBURST_COUNT),
    [],
  )
  const pillarGrid = useMemo(createPillarGrid, [])
  const sunburstGrid = useMemo(createSunburstGrid, [])
  const terrain = useMemo(
    () => createSpectrogramTerrain(TERRAIN_COLUMNS, TERRAIN_ROWS),
    [],
  )
  const modeWeights = useMemo(() => {
    const weights = new Float32Array(AUDIO_STAGE_MODES.length)
    weights[0] = 1
    return weights
  }, [])
  const stageGridGeometry = useMemo(
    createStageGridGeometry,
    [],
  )
  const waveform = useMemo(
    () =>
      createWaveformGeometry(
        highDetail ? 192 : 128,
      ),
    [highDetail],
  )
  const stageGroupRef = useRef<THREE.Group>(null)
  const matrixGroupRef = useRef<THREE.Group>(null)
  const sunburstGroupRef = useRef<THREE.Group>(null)
  const terrainGroupRef = useRef<THREE.Group>(null)
  const stageGridMaterialRef = useRef<THREE.LineBasicMaterial>(
    null,
  )
  const pillarRefs = useRef<
    Array<THREE.InstancedMesh | null>
  >([null, null, null])
  const orbRefs = useRef<
    Array<THREE.InstancedMesh | null>
  >([null, null, null])
  const sunburstRefs = useRef<
    Array<THREE.InstancedMesh | null>
  >([null, null, null])
  const sunburstRingMaterialRefs = useRef<
    Array<THREE.MeshBasicMaterial | null>
  >([null, null, null])
  const terrainSurfaceMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const terrainWireMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const terrainLineMaterialRef =
    useRef<THREE.LineBasicMaterial>(null)
  const shockwaveRefs = useRef<Array<THREE.Mesh | null>>([])
  const shockwaveMaterialRefs = useRef<
    Array<THREE.MeshBasicMaterial | null>
  >([])
  const waveformRibbonRef = useRef<THREE.Mesh>(null)
  const waveformLineRef = useRef<THREE.LineLoop>(null)
  const spotlightBeamRefs = useRef<
    Array<THREE.Mesh | null>
  >([])
  const spotlightTargets = useMemo(
    () =>
      Array.from(
        { length: SPOTLIGHT_COUNT },
        () => new THREE.Object3D(),
      ),
    [],
  )
  const spotlightLights = useRef<
    Array<THREE.SpotLight | null>
  >([])
  const temporary = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      identityQuaternion: new THREE.Quaternion(),
      radialQuaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
      color: new THREE.Color(),
      beamEnd: new THREE.Vector3(),
      beamDirection: new THREE.Vector3(),
      beamPosition: new THREE.Vector3(),
      beamQuaternion: new THREE.Quaternion(),
      beamScale: new THREE.Vector3(),
    }),
    [],
  )
  const bandEnergyRef = useRef({
    bass: 0,
    middle: 0,
    treble: 0,
  })
  const sourceRef = useRef<'idle' | 'analyser' | 'simulation'>(
    'idle',
  )
  const hostRef = useRef<HTMLElement | null>(null)
  const dataTimerRef = useRef(0)
  const groupCursorRef = useRef([0, 0, 0])
  const terrainAccumulatorRef = useRef(0)
  const terrainSliceRef = useRef(0)

  useEffect(() => {
    if (!active) return
    const canvas = document.querySelector<HTMLElement>(
      '[data-gallery-shared-canvas]',
    )
    if (!canvas) return
    hostRef.current = canvas
    canvas.dataset.audioSpectrumStage = 'instanced-256'
    canvas.dataset.audioSpectrumFft = '512'
    canvas.dataset.audioSpectrumPillars = String(PILLAR_COUNT)
    canvas.dataset.audioSpectrumOrbs = String(PILLAR_COUNT)
    canvas.dataset.audioSpectrumGrid = '16x16'
    canvas.dataset.audioSpectrumPillarGeometry = 'hex-prism'
    canvas.dataset.audioSpectrumModes = AUDIO_STAGE_MODES.join(',')
    canvas.dataset.audioSpectrumMode =
      useGalleryStore.getState().audioStageMode
    canvas.dataset.audioSpectrumSunburstBars = String(
      SUNBURST_COUNT,
    )
    canvas.dataset.audioSpectrumTerrainGrid =
      `${TERRAIN_COLUMNS}x${TERRAIN_ROWS}`
    canvas.dataset.audioSpectrumTerrainSlice = '0'
    canvas.dataset.audioSpectrumLightPads = String(
      AUDIO_STAGE_PAD_COLORS.length,
    )
    canvas.dataset.audioSpectrumSpotlights = String(
      SPOTLIGHT_COUNT,
    )
    canvas.dataset.audioSpectrumWaveform = 'closed-ribbon'
    return () => {
      delete canvas.dataset.audioSpectrumStage
      delete canvas.dataset.audioSpectrumFft
      delete canvas.dataset.audioSpectrumPillars
      delete canvas.dataset.audioSpectrumOrbs
      delete canvas.dataset.audioSpectrumGrid
      delete canvas.dataset.audioSpectrumPillarGeometry
      delete canvas.dataset.audioSpectrumModes
      delete canvas.dataset.audioSpectrumMode
      delete canvas.dataset.audioSpectrumSunburstBars
      delete canvas.dataset.audioSpectrumTerrainGrid
      delete canvas.dataset.audioSpectrumTerrainSlice
      delete canvas.dataset.audioSpectrumLightPads
      delete canvas.dataset.audioSpectrumSpotlights
      delete canvas.dataset.audioSpectrumWaveform
      delete canvas.dataset.audioSpectrumPlaying
      delete canvas.dataset.audioSpectrumSource
      delete canvas.dataset.audioSpectrumBass
      delete canvas.dataset.audioSpectrumMiddle
      delete canvas.dataset.audioSpectrumTreble
      delete canvas.dataset.audioSpectrumMaxHeight
      delete canvas.dataset.audioSpectrumPeakRise
      delete canvas.dataset.audioSpectrumLastPad
      delete canvas.dataset.audioSpectrumPadHits
      delete canvas.dataset.audioSpectrumActivePulses
      if (hostRef.current === canvas) hostRef.current = null
    }
  }, [active])

  useEffect(() => {
    soundEngine.setArpeggiatorTempo(tempo)
  }, [tempo])

  useEffect(() => {
    mountedAudioStageInstances += 1
    return () => {
      mountedAudioStageInstances = Math.max(
        0,
        mountedAudioStageInstances - 1,
      )
      if (mountedAudioStageInstances === 0) {
        soundEngine.stopArpeggiator()
      }
    }
  }, [])

  useEffect(() => {
    if (
      playing &&
      activeExhibitId !== null &&
      activeExhibitId !== 'orbital-lens'
    ) {
      soundEngine.stopArpeggiator()
      setPlaying(false)
    }
  }, [activeExhibitId, playing, setPlaying])

  useEffect(
    () => () => {
      waveform.ribbonGeometry.dispose()
      waveform.lineGeometry.dispose()
      stageGridGeometry.dispose()
      terrain.geometry.dispose()
      terrain.lineGeometry.dispose()
      pillarRefs.current.forEach((mesh) => mesh?.dispose())
      orbRefs.current.forEach((mesh) => mesh?.dispose())
      sunburstRefs.current.forEach((mesh) => mesh?.dispose())
    },
    [stageGridGeometry, terrain, waveform],
  )

  useFrame((state, delta) => {
    if (!active) return
    const safeDelta = Math.min(delta, 0.05)
    const timeScale = getEffectiveGalleryTimeScale(
      useGalleryStore.getState().timeScale,
    )
    const time = state.clock.elapsedTime * timeScale
    const pointer = pointerRef.current
    const stageGroup = stageGroupRef.current
    if (!stageGroup) return
    stageGroup.rotation.y = pointer.u * 0.075
    stageGroup.rotation.z = Math.sin(time * 0.17) * 0.012
    const galleryState = useGalleryStore.getState()
    const activeModeIndex = Math.max(
      0,
      AUDIO_STAGE_MODES.indexOf(galleryState.audioStageMode),
    )
    const modeBlend = 1 - Math.exp(-safeDelta * 8.5)
    for (
      let index = 0;
      index < AUDIO_STAGE_MODES.length;
      index += 1
    ) {
      const target = index === activeModeIndex ? 1 : 0
      modeWeights[index] +=
        (target - modeWeights[index]) * modeBlend
    }
    const matrixWeight = modeWeights[0]
    const sunburstWeight = modeWeights[1]
    const terrainWeight = modeWeights[2]
    if (matrixGroupRef.current) {
      matrixGroupRef.current.visible = matrixWeight > 0.006
      matrixGroupRef.current.scale.setScalar(
        0.84 + matrixWeight * 0.16,
      )
      matrixGroupRef.current.position.y =
        (1 - matrixWeight) * -0.09
      matrixGroupRef.current.rotation.y =
        Math.sin(time * 0.27) * 0.025
    }
    if (sunburstGroupRef.current) {
      sunburstGroupRef.current.visible = sunburstWeight > 0.006
      sunburstGroupRef.current.scale.setScalar(
        0.8 + sunburstWeight * 0.2,
      )
      sunburstGroupRef.current.position.y =
        (1 - sunburstWeight) * -0.08
      sunburstGroupRef.current.rotation.y = time * 0.12
    }
    if (terrainGroupRef.current) {
      terrainGroupRef.current.visible = terrainWeight > 0.006
      terrainGroupRef.current.scale.setScalar(
        0.84 + terrainWeight * 0.16,
      )
      terrainGroupRef.current.position.y =
        0.025 + (1 - terrainWeight) * -0.1
      terrainGroupRef.current.rotation.z =
        Math.sin(time * 0.23) * 0.008
    }
    if (stageGridMaterialRef.current) {
      stageGridMaterialRef.current.opacity =
        0.13 * matrixWeight
    }

    let analyserReady = false
    if (playing) {
      analyserReady = soundEngine.readStageSpectrum(
        frequencyData,
        waveformData,
      )
    } else {
      frequencyData.fill(0)
      waveformData.fill(128)
    }

    let frequencySum = 0
    for (let index = 0; index < frequencyData.length; index += 1) {
      frequencySum += frequencyData[index]
    }
    const needsSimulation =
      playing && (!analyserReady || frequencySum < 16)
    if (needsSimulation) {
      simulateSpectrum(
        frequencyData,
        waveformData,
        time,
        tempo,
        drive,
      )
      sourceRef.current = 'simulation'
    } else if (playing) {
      sourceRef.current = 'analyser'
    } else {
      sourceRef.current = 'idle'
    }

    let bassSum = 0
    let middleSum = 0
    let trebleSum = 0
    const smoothed = smoothedFrequency
    for (let index = 0; index < frequencyData.length; index += 1) {
      const raw = frequencyData[index] / 255
      const current = smoothed[index]
      smoothed[index] =
        current + (raw - current) * (raw > current ? 0.42 : 0.16)
      if (index < 14) bassSum += smoothed[index]
      else if (index < 104) middleSum += smoothed[index]
      else trebleSum += smoothed[index]
    }
    const bands = bandEnergyRef.current
    bands.bass +=
      (bassSum / 14 - bands.bass) *
      (safeDelta * 18)
    bands.middle +=
      (middleSum / 90 - bands.middle) *
      (safeDelta * 13)
    bands.treble +=
      (trebleSum / 152 - bands.treble) *
      (safeDelta * 10)

    const bassBeat = Math.max(
      0,
      Math.sin(
        time * TAU * (tempo / 60) * 0.5,
      ),
    )
    let maximumHeight = 0
    let maximumPeakRise = 0
    const pillarMeshes = pillarRefs.current
    const orbMeshes = orbRefs.current
    const groupCursor = groupCursorRef.current
    groupCursor[0] = 0
    groupCursor[1] = 0
    groupCursor[2] = 0
    if (matrixWeight > 0.006) {
      for (let index = 0; index < PILLAR_COUNT; index += 1) {
      const x = pillarGrid.positions[index * 2]
      const z = pillarGrid.positions[index * 2 + 1]
      const radius = pillarGrid.radii[index]
      const groupIndex =
        radius < 0.33 ? 0 : radius > 0.69 ? 2 : 1
      const localIndex = groupCursor[groupIndex]
      groupCursor[groupIndex] += 1
      const pillar = pillarMeshes[groupIndex]
      const orb = orbMeshes[groupIndex]
      const mappedBin = Math.min(
        frequencyData.length - 2,
        1 +
          Math.floor(
            Math.pow(
              radius,
              0.78 + spectrumBias * 1.25,
            ) *
              (frequencyData.length - 3),
          ),
      )
      const sample =
        (smoothed[mappedBin] * 0.52 +
          smoothed[mappedBin + 1] * 0.3 +
          smoothed[Math.max(1, mappedBin - 1)] * 0.18) *
        drive
      const innerWeight = Math.max(0, 1 - radius / 0.34)
      const middleWeight =
        Math.max(0, 1 - Math.abs(radius - 0.52) / 0.3)
      const outerWeight = Math.max(0, (radius - 0.64) / 0.36)
      const seed = pillarGrid.seeds[index]
      const filamentPulse =
        0.5 +
        0.5 *
          Math.sin(
            time * (1.8 + seed * 1.6) +
              index * 0.73 +
              radius * 9.4,
          )
      const visualSample = playing
        ? Math.max(
            sample,
            0.08 +
              bands.bass * innerWeight * 0.28 +
              bands.middle * middleWeight * 0.2 +
              bands.treble * outerWeight * 0.16,
          )
        : sample
      const idleHeight =
        0.035 +
        Math.max(0, Math.sin(time * 1.1 + index * 0.39)) *
          0.018
      const spectralLift =
        Math.pow(Math.min(1, visualSample), 0.58) * 1.45
      const targetHeight = playing
        ? Math.max(
            idleHeight,
            0.05 +
              spectralLift * 0.72 +
              bands.bass * innerWeight * 0.34 +
              bands.middle * middleWeight * 0.22 +
              bands.treble * outerWeight * 0.13 +
              bassBeat * innerWeight * 0.16 +
              filamentPulse *
                (0.018 + bands.middle * 0.055),
          )
        : idleHeight
      const oldHeight = pillarHeights[index]
      const nextHeight =
        oldHeight +
        (targetHeight - oldHeight) *
          (targetHeight > oldHeight ? 0.34 : 0.12)
      const rise = Math.max(0, nextHeight - oldHeight)
      pillarHeights[index] = nextHeight
      maximumHeight = Math.max(maximumHeight, nextHeight)

      const intensity = Math.min(
        1,
        (playing ? 0.28 : 0.04) +
          visualSample * 1.9 +
          (radius < 0.33 ? bands.bass * 0.62 : 0) +
          0.08,
      )
      if (pillar) {
        temporary.position.set(x, nextHeight * 0.5, z)
        temporary.scale.set(
          0.74 + intensity * 0.32,
          Math.max(0.04, nextHeight),
          0.74 + intensity * 0.32,
        )
        temporary.matrix.compose(
          temporary.position,
          temporary.identityQuaternion,
          temporary.scale,
        )
        pillar.setMatrixAt(localIndex, temporary.matrix)
      }

      const top = nextHeight + 0.03
      if (nextHeight > oldHeight + 0.008) {
        orbVelocities[index] = Math.max(
          orbVelocities[index],
          Math.min(
            0.38,
            rise * 3.8 +
              bassBeat * 0.025 +
              (radius < 0.33 ? 0.035 : 0),
          ),
        )
      }
      orbVelocities[index] -= safeDelta * 1.12
      orbHeights[index] += orbVelocities[index] * safeDelta
      if (orbHeights[index] < top) {
        orbHeights[index] = top
        orbVelocities[index] = Math.max(
          0,
          orbVelocities[index],
        )
      }
      orbHeights[index] = Math.min(
        1.45,
        Math.max(top, orbHeights[index]),
      )
      maximumPeakRise = Math.max(
        maximumPeakRise,
        orbHeights[index] - top,
      )
      if (orb) {
        temporary.position.set(
          x,
          orbHeights[index] + 0.012,
          z,
        )
        temporary.scale.setScalar(
          0.0075 + intensity * 0.008,
        )
        temporary.matrix.compose(
          temporary.position,
          temporary.identityQuaternion,
          temporary.scale,
        )
        orb.setMatrixAt(localIndex, temporary.matrix)
      }
      }
    }

    const innerIntensity = clamp01(
      0.24 + bands.bass * 1.28 + bassBeat * 0.18,
    )
    const middleIntensity = clamp01(
      0.22 + bands.middle * 1.24,
    )
    const outerIntensity = clamp01(
      0.18 +
        bands.treble * 1.16 +
        (Math.sin(time * 8.5) > 0.34 ? 0.1 : 0),
    )
    for (let groupIndex = 0; groupIndex < 3; groupIndex += 1) {
      const pillar = pillarMeshes[groupIndex]
      const orb = orbMeshes[groupIndex]
      const intensity =
        groupIndex === 0
          ? innerIntensity
          : groupIndex === 1
            ? middleIntensity
            : outerIntensity
      const base =
        groupIndex === 0
          ? SUB_BASE
          : groupIndex === 1
            ? MID_BASE
            : HIGH_BASE
      const peak =
        groupIndex === 0
          ? SUB_PEAK
          : groupIndex === 1
            ? MID_PEAK
            : groupIndex === 2 &&
                Math.sin(time * 13) > 0.3
              ? HIGH_GOLD
              : HIGH_PEAK
      temporary.color.lerpColors(base, peak, intensity)
      if (
        pillar &&
        pillar.material instanceof THREE.MeshBasicMaterial
      ) {
        pillar.material.color.copy(temporary.color)
        pillar.material.opacity = 0.68 * matrixWeight
      }
      if (pillar) {
        pillar.instanceMatrix.needsUpdate = true
      }
      if (
        orb &&
        orb.material instanceof THREE.MeshBasicMaterial
      ) {
        orb.material.color.copy(peak)
        orb.material.opacity = 0.68 * matrixWeight
      }
      if (orb) {
        orb.instanceMatrix.needsUpdate = true
      }
    }

    const sunburstMeshes = sunburstRefs.current
    for (
      let groupIndex = 0;
      groupIndex < SUNBURST_RINGS;
      groupIndex += 1
    ) {
      const mesh = sunburstMeshes[groupIndex]
      const group = sunburstGrid.groups[groupIndex]
      const intensity = clamp01(
        (groupIndex === 0
          ? bands.bass
          : groupIndex === 1
            ? bands.middle
            : bands.treble) *
          1.2 +
          0.2 +
          bassBeat * (groupIndex === 0 ? 0.18 : 0.05),
      )
      const base =
        groupIndex === 0
          ? SUB_BASE
          : groupIndex === 1
            ? MID_BASE
            : HIGH_BASE
      const peak =
        groupIndex === 0
          ? SUB_PEAK
          : groupIndex === 1
            ? MID_PEAK
            : Math.sin(time * 10.5) > 0.42
              ? HIGH_GOLD
              : HIGH_PEAK
      temporary.color.lerpColors(base, peak, intensity)
      if (
        mesh &&
        mesh.material instanceof THREE.MeshBasicMaterial
      ) {
        mesh.material.color.copy(temporary.color)
        mesh.material.opacity = 0.66 * sunburstWeight
      }
      if (!mesh || sunburstWeight <= 0.006) continue

      if (!group) continue
      for (
        let localIndex = 0;
        localIndex < group.length;
        localIndex += 1
      ) {
        const index = group[localIndex] ?? 0
        const x = sunburstGrid.positions[index * 2]
        const z = sunburstGrid.positions[index * 2 + 1]
        const angle = sunburstGrid.angles[index]
        const angleRatio =
          (angle % TAU) / TAU
        const frequencyRatio = clamp01(
          0.035 +
            groupIndex * 0.3 +
            angleRatio * 0.42,
        )
        const mappedBin = Math.min(
          smoothed.length - 2,
          1 +
            Math.floor(
              frequencyRatio * (smoothed.length - 3),
            ),
        )
        const sample =
          (smoothed[mappedBin] * 0.58 +
            smoothed[mappedBin + 1] * 0.3 +
            smoothed[Math.max(1, mappedBin - 1)] * 0.12) *
          drive
        const targetHeight =
          0.055 +
          Math.pow(clamp01(sample), 0.62) *
            (0.7 + groupIndex * 0.08) +
          bands.bass * (groupIndex === 0 ? 0.13 : 0.04)
        const oldHeight = sunburstHeights[index]
        const nextHeight =
          oldHeight +
          (targetHeight - oldHeight) *
            (targetHeight > oldHeight ? 0.32 : 0.14)
        sunburstHeights[index] = nextHeight
        maximumHeight = Math.max(
          maximumHeight,
          nextHeight,
        )
        const barIntensity = clamp01(
          0.2 + sample * 1.45 + intensity * 0.42,
        )
        temporary.position.set(
          x,
          nextHeight * 0.5,
          z,
        )
        temporary.radialQuaternion.setFromAxisAngle(
          ZERO_Y,
          Math.PI / 2 - angle,
        )
        temporary.scale.set(
          0.72 + barIntensity * 0.28,
          Math.max(0.04, nextHeight),
          0.72 + barIntensity * 0.34,
        )
        temporary.matrix.compose(
          temporary.position,
          temporary.radialQuaternion,
          temporary.scale,
        )
        mesh.setMatrixAt(localIndex, temporary.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
    for (
      let index = 0;
      index < sunburstRingMaterialRefs.current.length;
      index += 1
    ) {
      const material = sunburstRingMaterialRefs.current[index]
      if (material) {
        material.opacity = 0.3 * sunburstWeight
      }
    }

    terrainAccumulatorRef.current += safeDelta * timeScale
    if (terrainAccumulatorRef.current >= TERRAIN_INTERVAL) {
      terrainAccumulatorRef.current %= TERRAIN_INTERVAL
      terrainSliceRef.current += 1
      terrain.history.copyWithin(
        terrain.columns,
        0,
        terrain.history.length - terrain.columns,
      )
      for (
        let column = 0;
        column < terrain.columns;
        column += 1
      ) {
        const normalized =
          column / Math.max(1, terrain.columns - 1)
        const mappedBin = Math.min(
          smoothed.length - 1,
          1 +
            Math.floor(
              Math.pow(normalized, 1.34) *
                (smoothed.length - 2),
            ),
        )
        terrain.history[column] =
          smoothed[mappedBin] * drive
      }

      for (let row = 0; row < terrain.rows; row += 1) {
        const rowFade =
          1 - (row / Math.max(1, terrain.rows - 1)) * 0.4
        for (
          let column = 0;
          column < terrain.columns;
          column += 1
        ) {
          const vertexIndex = row * terrain.columns + column
          const normalized =
            column / Math.max(1, terrain.columns - 1)
          const value =
            terrain.history[vertexIndex] ?? 0
          const base =
            normalized < 0.34
              ? SUB_BASE
              : normalized < 0.72
                ? MID_BASE
                : HIGH_BASE
          const peak =
            normalized < 0.34
              ? SUB_PEAK
              : normalized < 0.72
                ? MID_PEAK
                : normalized > 0.9 && value > 0.46
                  ? HIGH_GOLD
                  : HIGH_PEAK
          temporary.color.lerpColors(
            base,
            peak,
            clamp01(0.18 + value * 1.2),
          )
          terrain.colorValues[vertexIndex * 3] =
            temporary.color.r * rowFade
          terrain.colorValues[vertexIndex * 3 + 1] =
            temporary.color.g * rowFade
          terrain.colorValues[vertexIndex * 3 + 2] =
            temporary.color.b * rowFade
        }
      }
      terrain.colorAttribute.needsUpdate = true
    }

    if (terrainWeight > 0.006) {
      for (let row = 0; row < terrain.rows; row += 1) {
        const rowFade =
          1 - (row / Math.max(1, terrain.rows - 1)) * 0.32
        for (
          let column = 0;
          column < terrain.columns;
          column += 1
        ) {
          const vertexIndex = row * terrain.columns + column
          const value = terrain.history[vertexIndex] ?? 0
          const ripple =
            Math.sin(
              time * 3.2 - row * 0.42 + column * 0.12,
            ) *
            0.004 *
            terrainWeight
          terrain.positionValues[vertexIndex * 3 + 1] =
            0.025 +
            Math.pow(clamp01(value), 0.72) *
              0.82 *
              rowFade +
            ripple
        }
      }
      terrain.positionAttribute.needsUpdate = true
      for (
        let column = 0;
        column < terrain.columns;
        column += 1
      ) {
        const value = terrain.history[column] ?? 0
        terrain.linePositionValues[column * 3 + 1] =
          0.035 +
          Math.pow(clamp01(value), 0.72) * 0.86
      }
      terrain.linePositionAttribute.needsUpdate = true
      maximumHeight = Math.max(
        maximumHeight,
        0.035 + bands.treble * 0.7,
      )
    }
    if (terrainSurfaceMaterialRef.current) {
      terrainSurfaceMaterialRef.current.opacity =
        0.52 * terrainWeight
    }
    if (terrainWireMaterialRef.current) {
      terrainWireMaterialRef.current.opacity =
        0.22 * terrainWeight
    }
    if (terrainLineMaterialRef.current) {
      terrainLineMaterialRef.current.opacity =
        0.92 * terrainWeight
    }

    let activePulseCount = 0
    const now = performance.now()
    for (
      let index = 0;
      index < AUDIO_STAGE_PAD_COLORS.length;
      index += 1
    ) {
      const mesh = shockwaveRefs.current[index]
      const material = shockwaveMaterialRefs.current[index]
      const triggeredAt =
        galleryState.audioStagePulseTimes[index] ?? 0
      const elapsed = (now - triggeredAt) / 1_000
      if (
        !mesh ||
        !material ||
        triggeredAt <= 0 ||
        elapsed < 0 ||
        elapsed >= SHOCKWAVE_DURATION
      ) {
        if (mesh) mesh.visible = false
        if (material) material.opacity = 0
        continue
      }
      const progress = elapsed / SHOCKWAVE_DURATION
      const eased = 1 - (1 - progress) ** 3
      activePulseCount += 1
      mesh.visible = true
      mesh.position.y =
        0.07 + Math.sin(progress * Math.PI) * 0.035
      mesh.scale.setScalar(0.08 + eased * 1.72)
      material.opacity =
        Math.pow(1 - progress, 1.65) * 0.82
    }

    const ribbonPosition = waveform.ribbonGeometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute
    const linePosition = waveform.lineGeometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute
    const waveformRadius = 1.68
    for (
      let index = 0;
      index < waveform.segments;
      index += 1
    ) {
      const ratio = index / waveform.segments
      const angle = ratio * TAU
      const waveformIndex = Math.min(
        waveformData.length - 1,
        Math.floor(
          ratio *
            waveformData.length *
            waveDensity,
        ) % waveformData.length,
      )
      const sample =
        (waveformData[waveformIndex] - 128) / 128
      const waveHeight =
        0.54 +
        sample * 0.2 * (playing ? 1 : 0.22)
      const x = Math.cos(angle) * waveformRadius
      const z = Math.sin(angle) * waveformRadius
      const ribbonOffset = index * 6
      const lineOffset = index * 3
      ribbonPosition.array[ribbonOffset] = x
      ribbonPosition.array[ribbonOffset + 1] =
        waveHeight - 0.026
      ribbonPosition.array[ribbonOffset + 2] = z
      ribbonPosition.array[ribbonOffset + 3] = x
      ribbonPosition.array[ribbonOffset + 4] =
        waveHeight + 0.026
      ribbonPosition.array[ribbonOffset + 5] = z
      linePosition.array[lineOffset] = x
      linePosition.array[lineOffset + 1] = waveHeight
      linePosition.array[lineOffset + 2] = z
    }
    ribbonPosition.needsUpdate = true
    linePosition.needsUpdate = true
    if (waveformRibbonRef.current) {
      waveformRibbonRef.current.rotation.y = time * 0.045
    }
    if (waveformLineRef.current) {
      waveformLineRef.current.rotation.y = time * 0.045
    }

    for (
      let index = 0;
      index < SPOTLIGHT_COUNT;
      index += 1
    ) {
      const source = SPOTLIGHT_SOURCES[index]
      const target = spotlightTargets[index]
      const beam = spotlightBeamRefs.current[index]
      const sweep =
        time * (0.22 + index * 0.035) +
        index * (TAU / SPOTLIGHT_COUNT)
      target.position.set(
        Math.cos(sweep) * (0.72 + bands.bass * 0.48),
        0.02,
        Math.sin(sweep * 1.17) * (0.5 + bands.middle * 0.34),
      )
      target.updateMatrixWorld()
      const light = spotlightLights.current[index]
      if (light) {
        light.target = target
        light.intensity =
          8 +
          (index % 2 === 0 ? bands.bass : bands.middle) *
            28 +
          bassBeat * 5
      }
      if (!beam) continue
      temporary.beamEnd.copy(target.position)
      temporary.beamDirection
        .set(source[0], source[1], source[2])
        .sub(temporary.beamEnd)
      const beamLength = Math.max(
        0.1,
        temporary.beamDirection.length(),
      )
      temporary.beamDirection.normalize()
      temporary.beamPosition
        .copy(temporary.beamEnd)
        .addScaledVector(
          temporary.beamDirection,
          beamLength * 0.5,
        )
      temporary.beamQuaternion.setFromUnitVectors(
        ZERO_Y,
        temporary.beamDirection,
      )
      temporary.beamScale.set(
        beamLength * 0.13,
        beamLength,
        beamLength * 0.13,
      )
      beam.position.copy(temporary.beamPosition)
      beam.quaternion.copy(temporary.beamQuaternion)
      beam.scale.copy(temporary.beamScale)
    }

    dataTimerRef.current += safeDelta
    const host = hostRef.current
    if (host && dataTimerRef.current >= 0.1) {
      dataTimerRef.current = 0
      host.dataset.audioSpectrumPlaying =
        playing ? 'true' : 'false'
      host.dataset.audioSpectrumSource = sourceRef.current
      host.dataset.audioSpectrumMode =
        galleryState.audioStageMode
      host.dataset.audioSpectrumLastPad =
        galleryState.audioStageLastPad === null
          ? 'none'
          : String(galleryState.audioStageLastPad)
      host.dataset.audioSpectrumPadHits = String(
        galleryState.audioStagePadHits,
      )
      host.dataset.audioSpectrumActivePulses = String(
        activePulseCount,
      )
      host.dataset.audioSpectrumTerrainSlice = String(
        terrainSliceRef.current,
      )
      host.dataset.audioSpectrumBass =
        bands.bass.toFixed(3)
      host.dataset.audioSpectrumMiddle =
        bands.middle.toFixed(3)
      host.dataset.audioSpectrumTreble =
        bands.treble.toFixed(3)
      host.dataset.audioSpectrumMaxHeight =
        maximumHeight.toFixed(3)
      host.dataset.audioSpectrumPeakRise =
        maximumPeakRise.toFixed(3)
    }
  })

  return (
    <group
      ref={stageGroupRef}
      position={[0, -0.22, 0]}
      rotation={[0.38, 0, 0]}
      scale={mode === 'darkroom' ? 1.03 : 0.9}
    >
      <mesh position={[0, -0.065, 0]}>
        <cylinderGeometry args={[1.74, 1.84, 0.11, 96]} />
        <meshStandardMaterial
          color="#050b10"
          metalness={0.82}
          roughness={0.27}
        />
      </mesh>
      <mesh
        position={[0, -0.002, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[1.58, 1.72, 128]} />
        <meshBasicMaterial
          color={palette.secondary}
          transparent
          opacity={0.22}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh
        position={[0, -0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[1.56, 96]} />
        <meshStandardMaterial
          color="#061216"
          emissive={palette.primary}
          emissiveIntensity={0.055}
          metalness={0.5}
          roughness={0.42}
        />
      </mesh>
      <group ref={matrixGroupRef}>
        <lineSegments
          geometry={stageGridGeometry}
          position={[0, 0.006, 0]}
          renderOrder={3}
        >
          <lineBasicMaterial
            ref={stageGridMaterialRef}
            color={palette.secondary}
            transparent
            opacity={0.13}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </lineSegments>

        {pillarGrid.groups.map((group, groupIndex) => (
        <instancedMesh
          key={`pillar-group-${groupIndex}`}
          ref={(mesh) => {
            pillarRefs.current[groupIndex] = mesh
          }}
          args={[undefined, undefined, group.length]}
          frustumCulled={false}
          renderOrder={4}
        >
          <cylinderGeometry args={[0.019, 0.027, 1, 6, 1, false]} />
          <meshBasicMaterial
            color={
              groupIndex === 0
                ? '#7431d2'
                : groupIndex === 1
                  ? '#11b991'
                  : '#2b8fce'
            }
            transparent
            opacity={0.68}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
        ))}
        {pillarGrid.groups.map((group, groupIndex) => (
        <instancedMesh
          key={`orb-group-${groupIndex}`}
          ref={(mesh) => {
            orbRefs.current[groupIndex] = mesh
          }}
          args={[undefined, undefined, group.length]}
          frustumCulled={false}
          renderOrder={7}
        >
          <icosahedronGeometry args={[1, highDetail ? 2 : 1]} />
          <meshBasicMaterial
            color={
              groupIndex === 0
                ? '#ff65e2'
                : groupIndex === 1
                  ? '#68ffd5'
                  : '#dffcff'
            }
            transparent
            opacity={0.68}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
        ))}
      </group>

      <group ref={sunburstGroupRef}>
        {SUNBURST_RADII.map((radius, index) => (
          <mesh
            key={`sunburst-ring-${radius}`}
            position={[0, 0.026 + index * 0.002, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={3}
          >
            <ringGeometry
              args={[
                Math.max(0.01, radius - 0.008),
                radius + 0.008,
                160,
              ]}
            />
            <meshBasicMaterial
              ref={(material) => {
                sunburstRingMaterialRefs.current[index] =
                  material
              }}
              color={
                index === 0
                  ? SUB_PEAK
                  : index === 1
                    ? MID_PEAK
                    : HIGH_PEAK
              }
              transparent
              opacity={0}
              depthWrite={false}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        ))}
        {sunburstGrid.groups.map((group, groupIndex) => (
          <instancedMesh
            key={`sunburst-group-${groupIndex}`}
            ref={(mesh) => {
              sunburstRefs.current[groupIndex] = mesh
            }}
            args={[undefined, undefined, group.length]}
            frustumCulled={false}
            renderOrder={4}
          >
            <boxGeometry args={[0.055, 1, 0.12]} />
            <meshBasicMaterial
              color={
                groupIndex === 0
                  ? '#7431d2'
                  : groupIndex === 1
                    ? '#11b991'
                    : '#2b8fce'
              }
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </instancedMesh>
        ))}
        <mesh
          position={[0, 0.03, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={5}
        >
          <ringGeometry args={[0.11, 0.22, 64]} />
          <meshBasicMaterial
            color={palette.secondary}
            transparent
            opacity={0.34}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>

      <group ref={terrainGroupRef}>
        <mesh
          geometry={terrain.geometry}
          frustumCulled={false}
          renderOrder={4}
        >
          <meshBasicMaterial
            ref={terrainSurfaceMaterialRef}
            vertexColors
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh
          geometry={terrain.geometry}
          frustumCulled={false}
          renderOrder={5}
        >
          <meshBasicMaterial
            ref={terrainWireMaterialRef}
            vertexColors
            wireframe
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <lineLoop
          geometry={terrain.lineGeometry}
          frustumCulled={false}
          renderOrder={6}
        >
          <lineBasicMaterial
            ref={terrainLineMaterialRef}
            color="#d8fff8"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </lineLoop>
      </group>

      {AUDIO_STAGE_PAD_COLORS.map((color, index) => (
        <mesh
          key={`audio-shockwave-${index}`}
          ref={(mesh) => {
            shockwaveRefs.current[index] = mesh
          }}
          position={[0, 0.07, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
          frustumCulled={false}
          renderOrder={6}
        >
          <ringGeometry args={[0.83, 1, 128]} />
          <meshBasicMaterial
            ref={(material) => {
              shockwaveMaterialRefs.current[index] = material
            }}
            color={color}
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}

      <mesh
        ref={waveformRibbonRef}
        geometry={waveform.ribbonGeometry}
        frustumCulled={false}
        renderOrder={8}
      >
        <meshBasicMaterial
          color={palette.secondary}
          transparent
          opacity={0.28}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <lineLoop
        ref={waveformLineRef}
        geometry={waveform.lineGeometry}
        frustumCulled={false}
        renderOrder={9}
      >
        <lineBasicMaterial
          color={palette.secondary}
          transparent
          opacity={0.78}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineLoop>

      {SPOTLIGHT_COLORS.map((color, index) => (
        <mesh
          key={`audio-beam-${index}`}
          ref={(mesh) => {
            spotlightBeamRefs.current[index] = mesh
          }}
          frustumCulled={false}
          renderOrder={2}
        >
          <coneGeometry
            args={[
              1,
              1,
              highDetail ? 20 : 12,
              1,
              true,
            ]}
          />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.052}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}

      {spotlightTargets.map((target, index) => (
        <primitive
          key={`audio-target-${index}`}
          object={target}
        />
      ))}
      {SPOTLIGHT_SOURCES.map((position, index) => (
        <spotLight
          key={`audio-spot-${index}`}
          ref={(light) => {
            spotlightLights.current[index] = light
          }}
          position={[
            position[0],
            position[1],
            position[2],
          ]}
          target={spotlightTargets[index]}
          color={SPOTLIGHT_COLORS[index]}
          intensity={18}
          angle={0.3}
          penumbra={0.82}
          distance={5}
          decay={2}
          castShadow={false}
        />
      ))}

      <pointLight
        position={[0, 0.42, 0.15]}
        color={palette.secondary}
        intensity={2.2}
        distance={2.8}
        decay={2}
      />
      <ambientLight intensity={0.16} color={palette.tertiary} />
    </group>
  )
}
