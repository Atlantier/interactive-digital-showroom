import { useFrame } from '@react-three/fiber'
import {
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react'
import * as THREE from 'three'
import {
  NEURAL_ATTENTION_HEADS,
  NEURAL_HEAD_COLORS,
  NEURAL_HIDDEN_COUNT,
  NEURAL_INPUT_COUNT,
  NEURAL_OUTPUT_COUNT,
  NEURAL_PHOTON_COUNT,
  getNeuralWinner,
} from '../../../data/neuralNetwork'
import { getVfxPreset } from '../../../data/vfxPresets'
import { useAppStore } from '../../../store/useAppStore'
import {
  useGalleryStore,
  type ExhibitMeta,
} from '../../../store/useGalleryStore'
import type { GalleryPointerState } from '../OpticalExhibitScene'

const TAU = Math.PI * 2
const INPUT_OFFSET = 0
const ATTENTION_OFFSET = NEURAL_INPUT_COUNT
const HIDDEN_A_OFFSET =
  ATTENTION_OFFSET + NEURAL_ATTENTION_HEADS
const HIDDEN_B_OFFSET = HIDDEN_A_OFFSET + NEURAL_HIDDEN_COUNT
const OUTPUT_OFFSET = HIDDEN_B_OFFSET + NEURAL_HIDDEN_COUNT
const NETWORK_NODE_COUNT = OUTPUT_OFFSET + NEURAL_OUTPUT_COUNT
const ATTENTION_CLUSTER_SIZE = 5
const LAYER_Z = [-1.45, -0.72, 0.02, 0.72, 1.42] as const
const BACKPROP_FORWARD_SECONDS = 2.15
const GRADIENT_DURATION_SECONDS = 3.05
const GRADIENT_SEGMENTS_PER_PATH = 6
const ISOLATION_PATH_SEGMENTS = 18
const MAX_ISOLATION_PATHS = 12
const INPUT_COLOR = new THREE.Color('#8cf9ff')
const HIDDEN_A_COLOR = new THREE.Color('#5dffcf')
const HIDDEN_B_COLOR = new THREE.Color('#8da8ff')
const HIDDEN_A_PEAK_COLOR = new THREE.Color('#c5ffed')
const HIDDEN_B_PEAK_COLOR = new THREE.Color('#d5dcff')
const OUTPUT_COLOR = new THREE.Color('#e7ffff')
const WINNER_COLOR = new THREE.Color('#ffe28a')
const GRADIENT_PURPLE = new THREE.Color('#9d55ff')
const GRADIENT_GOLD = new THREE.Color('#ffb64a')
const GRADIENT_EMBER = new THREE.Color('#ff655f')
const ZERO_Y = new THREE.Vector3(0, 1, 0)
const BASE_LOGITS = [
  0.28,
  0.42,
  0.36,
  0.61,
  0.47,
  0.56,
  0.31,
  0.44,
] as const

interface NeuralLayout {
  nodePositions: THREE.Vector3[]
  inputPositions: THREE.Vector3[]
  attentionPositions: THREE.Vector3[]
  hiddenAPositions: THREE.Vector3[]
  hiddenBPositions: THREE.Vector3[]
  outputPositions: THREE.Vector3[]
  clusterPositions: Float32Array[]
  layerRailGeometry: THREE.BufferGeometry
}

interface AttentionBeamGeometry {
  geometry: THREE.TubeGeometry
  pathIndex: number
  sourceToken: number
  headIndex: number
  weight: number
}

interface SynapticPath {
  curve: THREE.CubicBezierCurve3
  stage: number
  sourceNode: number
  targetNode: number
  headIndex: number
  weight: number
}

interface NeuralNetwork {
  pathList: SynapticPath[]
  pathsByStage: number[][]
  outgoingPathsByNode: number[][]
  incomingPathsByNode: number[][]
  fiberGeometry: THREE.BufferGeometry
  attentionBeams: AttentionBeamGeometry[]
  gradientFibers: GradientFiberState
}

interface PhotonState {
  pathIndices: Int32Array
  progress: Float32Array
  speeds: Float32Array
  stages: Uint8Array
  seeds: Float32Array
  directions: Uint8Array
}

interface GradientFiberState {
  count: number
  centers: Float32Array
  quaternions: Float32Array
  lengths: Float32Array
  pathIndices: Uint16Array
  coordinates: Float32Array
}

interface IsolationHighlightGeometry {
  geometry: THREE.BufferGeometry
  positionValues: Float32Array
  colorValues: Float32Array
  positionAttribute: THREE.BufferAttribute
  colorAttribute: THREE.BufferAttribute
}

interface NeuralInspectorPanel {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = clamp01(
    (value - edge0) / Math.max(0.0001, edge1 - edge0),
  )
  return normalized * normalized * (3 - 2 * normalized)
}

function deterministic(index: number) {
  return (
    Math.abs(
      (Math.sin(index * 12.9898 + 78.233) * 43_758.5453) %
        1,
    ) || 0.37
  )
}

function createCubicCurve(
  start: THREE.Vector3,
  end: THREE.Vector3,
  bend: number,
  lift: number,
) {
  const direction = new THREE.Vector3().subVectors(end, start)
  const perpendicular = new THREE.Vector3(
    -direction.z,
    0,
    direction.x,
  )
  if (perpendicular.lengthSq() < 0.0001) {
    perpendicular.set(1, 0, 0)
  }
  perpendicular.normalize().multiplyScalar(bend)
  const firstControl = start
    .clone()
    .addScaledVector(direction, 0.32)
    .add(perpendicular)
  firstControl.y += lift
  const secondControl = start
    .clone()
    .addScaledVector(direction, 0.68)
    .addScaledVector(perpendicular, -0.62)
  secondControl.y += lift * 0.68
  return new THREE.CubicBezierCurve3(
    start.clone(),
    firstControl,
    secondControl,
    end.clone(),
  )
}

function createLayerRailGeometry() {
  const positions: number[] = []
  const colors: number[] = []
  const layerColors = [
    new THREE.Color('#5ef2ff'),
    new THREE.Color('#b982ff'),
    new THREE.Color('#62ffd0'),
    new THREE.Color('#8da8ff'),
    new THREE.Color('#ffd36a'),
  ]
  const halfWidth = 1.08
  const bottom = -0.48
  const top = 0.78

  for (let layer = 0; layer < LAYER_Z.length; layer += 1) {
    const z = LAYER_Z[layer] ?? 0
    const color = layerColors[layer] ?? OUTPUT_COLOR
    const corners = [
      [-halfWidth, bottom, z],
      [halfWidth, bottom, z],
      [halfWidth, top, z],
      [-halfWidth, top, z],
    ] as const
    for (let corner = 0; corner < corners.length; corner += 1) {
      const start = corners[corner]
      const end = corners[(corner + 1) % corners.length]
      positions.push(...start, ...end)
      colors.push(
        color.r,
        color.g,
        color.b,
        color.r,
        color.g,
        color.b,
      )
    }
  }

  for (let layer = 0; layer < LAYER_Z.length - 1; layer += 1) {
    const startZ = LAYER_Z[layer] ?? 0
    const endZ = LAYER_Z[layer + 1] ?? 0
    for (const x of [-halfWidth, halfWidth]) {
      positions.push(x, bottom, startZ, x, bottom, endZ)
      positions.push(x, top, startZ, x, top, endZ)
      colors.push(
        layerColors[layer]?.r ?? 0,
        layerColors[layer]?.g ?? 0,
        layerColors[layer]?.b ?? 0,
        layerColors[layer + 1]?.r ?? 0,
        layerColors[layer + 1]?.g ?? 0,
        layerColors[layer + 1]?.b ?? 0,
        layerColors[layer]?.r ?? 0,
        layerColors[layer]?.g ?? 0,
        layerColors[layer]?.b ?? 0,
        layerColors[layer + 1]?.r ?? 0,
        layerColors[layer + 1]?.g ?? 0,
        layerColors[layer + 1]?.b ?? 0,
      )
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(colors, 3),
  )
  return geometry
}

function createNeuralLayout(): NeuralLayout {
  const nodePositions: THREE.Vector3[] = []
  const inputPositions: THREE.Vector3[] = []
  const attentionPositions: THREE.Vector3[] = []
  const hiddenAPositions: THREE.Vector3[] = []
  const hiddenBPositions: THREE.Vector3[] = []
  const outputPositions: THREE.Vector3[] = []

  for (let index = 0; index < NEURAL_INPUT_COUNT; index += 1) {
    const column = index % 4
    const row = Math.floor(index / 4)
    const position = new THREE.Vector3(
      (column - 1.5) * 0.46,
      row === 0 ? 0.16 : -0.2,
      LAYER_Z[0] + (column % 2) * 0.045,
    )
    inputPositions.push(position)
    nodePositions.push(position)
  }

  for (
    let head = 0;
    head < NEURAL_ATTENTION_HEADS;
    head += 1
  ) {
    const position = new THREE.Vector3(
      (head - 1.5) * 0.55,
      0.24 + Math.sin(head * 1.7) * 0.055,
      LAYER_Z[1] + Math.cos(head * 1.3) * 0.045,
    )
    attentionPositions.push(position)
    nodePositions.push(position)
  }

  const createHiddenLayer = (
    z: number,
    target: THREE.Vector3[],
  ) => {
    for (let index = 0; index < NEURAL_HIDDEN_COUNT; index += 1) {
      const column = index % 4
      const row = Math.floor(index / 4)
      const position = new THREE.Vector3(
        (column - 1.5) * 0.43,
        0.2 + (row - 1.5) * 0.27,
        z + ((row + column) % 2) * 0.085,
      )
      target.push(position)
      nodePositions.push(position)
    }
  }
  createHiddenLayer(LAYER_Z[2], hiddenAPositions)
  createHiddenLayer(LAYER_Z[3], hiddenBPositions)

  for (let index = 0; index < NEURAL_OUTPUT_COUNT; index += 1) {
    const position = new THREE.Vector3(
      (index - (NEURAL_OUTPUT_COUNT - 1) / 2) * 0.29,
      0.32,
      LAYER_Z[4],
    )
    outputPositions.push(position)
    nodePositions.push(position)
  }

  const clusterPositions: Float32Array[] = []
  for (
    let head = 0;
    head < NEURAL_ATTENTION_HEADS;
    head += 1
  ) {
    const center = attentionPositions[head]
    if (!center) continue
    const positions = new Float32Array(
      ATTENTION_CLUSTER_SIZE * 3,
    )
    positions[0] = center.x
    positions[1] = center.y
    positions[2] = center.z
    for (
      let satellite = 0;
      satellite < ATTENTION_CLUSTER_SIZE - 1;
      satellite += 1
    ) {
      const angle =
        (satellite / (ATTENTION_CLUSTER_SIZE - 1)) * TAU +
        head * 0.48
      const offset = (satellite + 1) * 3
      positions[offset] =
        center.x + Math.cos(angle) * 0.16
      positions[offset + 1] =
        center.y + Math.sin(angle) * 0.16
      positions[offset + 2] =
        center.z + Math.sin(angle * 2.1) * 0.06
    }
    clusterPositions.push(positions)
  }

  return {
    nodePositions,
    inputPositions,
    attentionPositions,
    hiddenAPositions,
    hiddenBPositions,
    outputPositions,
    clusterPositions,
    layerRailGeometry: createLayerRailGeometry(),
  }
}

function attentionWeight(token: number, head: number) {
  const raw =
    Math.abs(
      Math.sin(
        (token + 1) * (head + 2) * 1.618 +
          token * 0.73 +
          head * 1.17,
      ),
    ) *
      0.82 +
    deterministic(token * 11 + head * 17) * 0.18
  return Math.min(1, 0.18 + raw * 0.82)
}

function appendCurveToFiber(
  curve: THREE.CubicBezierCurve3,
  startColor: THREE.Color,
  endColor: THREE.Color,
  positions: number[],
  colors: number[],
  segments = 12,
) {
  const start = new THREE.Vector3()
  const end = new THREE.Vector3()
  const color = new THREE.Color()
  for (let segment = 0; segment < segments; segment += 1) {
    const t0 = segment / segments
    const t1 = (segment + 1) / segments
    curve.getPoint(t0, start)
    curve.getPoint(t1, end)
    positions.push(start.x, start.y, start.z, end.x, end.y, end.z)
    color.lerpColors(startColor, endColor, t0)
    colors.push(color.r, color.g, color.b)
    color.lerpColors(startColor, endColor, t1)
    colors.push(color.r, color.g, color.b)
  }
}

function createGradientFiberState(
  pathList: SynapticPath[],
): GradientFiberState {
  const count = pathList.length * GRADIENT_SEGMENTS_PER_PATH
  const centers = new Float32Array(count * 3)
  const quaternions = new Float32Array(count * 4)
  const lengths = new Float32Array(count)
  const pathIndices = new Uint16Array(count)
  const coordinates = new Float32Array(count)
  const start = new THREE.Vector3()
  const end = new THREE.Vector3()
  const center = new THREE.Vector3()
  const direction = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  let cursor = 0

  for (
    let pathIndex = 0;
    pathIndex < pathList.length;
    pathIndex += 1
  ) {
    const path = pathList[pathIndex]
    if (!path) continue
    for (
      let segment = 0;
      segment < GRADIENT_SEGMENTS_PER_PATH;
      segment += 1
    ) {
      const t0 = segment / GRADIENT_SEGMENTS_PER_PATH
      const t1 = (segment + 1) / GRADIENT_SEGMENTS_PER_PATH
      path.curve.getPoint(t0, start)
      path.curve.getPoint(t1, end)
      center.copy(start).add(end).multiplyScalar(0.5)
      direction.subVectors(end, start)
      const length = Math.max(0.0001, direction.length())
      direction.normalize()
      quaternion.setFromUnitVectors(ZERO_Y, direction)
      centers[cursor * 3] = center.x
      centers[cursor * 3 + 1] = center.y
      centers[cursor * 3 + 2] = center.z
      quaternions[cursor * 4] = quaternion.x
      quaternions[cursor * 4 + 1] = quaternion.y
      quaternions[cursor * 4 + 2] = quaternion.z
      quaternions[cursor * 4 + 3] = quaternion.w
      lengths[cursor] = length
      pathIndices[cursor] = pathIndex
      coordinates[cursor] =
        path.stage +
        (segment + 0.5) / GRADIENT_SEGMENTS_PER_PATH
      cursor += 1
    }
  }

  return {
    count,
    centers,
    quaternions,
    lengths,
    pathIndices,
    coordinates,
  }
}

function createSynapticNetwork(layout: NeuralLayout): NeuralNetwork {
  const pathList: SynapticPath[] = []
  const fiberPositions: number[] = []
  const fiberColors: number[] = []
  const allInputColor = INPUT_COLOR
  const hiddenAColor = HIDDEN_A_COLOR
  const hiddenBColor = HIDDEN_B_COLOR
  const outputColor = OUTPUT_COLOR
  const headColors = NEURAL_HEAD_COLORS.map(
    (color) => new THREE.Color(color),
  )

  const pushPath = (
    sourceNode: number,
    targetNode: number,
    stage: number,
    headIndex: number,
    weight: number,
    bend: number,
    lift: number,
    sourceColor: THREE.Color,
    targetColor: THREE.Color,
  ) => {
    const source = layout.nodePositions[sourceNode]
    const target = layout.nodePositions[targetNode]
    if (!source || !target) return
    const curve = createCubicCurve(source, target, bend, lift)
    pathList.push({
      curve,
      stage,
      sourceNode,
      targetNode,
      headIndex,
      weight,
    })
    appendCurveToFiber(
      curve,
      sourceColor,
      targetColor,
      fiberPositions,
      fiberColors,
    )
  }

  for (let token = 0; token < NEURAL_INPUT_COUNT; token += 1) {
    for (
      let head = 0;
      head < NEURAL_ATTENTION_HEADS;
      head += 1
    ) {
      const weight = attentionWeight(token, head)
      pushPath(
        INPUT_OFFSET + token,
        ATTENTION_OFFSET + head,
        0,
        head,
        weight,
        (deterministic(token * 7 + head) - 0.5) * 0.34,
        0.16 + weight * 0.18,
        allInputColor,
        headColors[head] ?? INPUT_COLOR,
      )
    }
  }

  for (
    let head = 0;
    head < NEURAL_ATTENTION_HEADS;
    head += 1
  ) {
    for (let hidden = 0; hidden < NEURAL_HIDDEN_COUNT; hidden += 1) {
      const weight =
        0.24 +
        deterministic(head * 29 + hidden * 13) * 0.72
      pushPath(
        ATTENTION_OFFSET + head,
        HIDDEN_A_OFFSET + hidden,
        1,
        head,
        weight,
        (deterministic(head + hidden * 3) - 0.5) * 0.3,
        0.12 + weight * 0.17,
        headColors[head] ?? INPUT_COLOR,
        hiddenAColor,
      )
    }
  }

  for (
    let source = 0;
    source < NEURAL_HIDDEN_COUNT;
    source += 1
  ) {
    for (let branch = 0; branch < 4; branch += 1) {
      const target =
        (source * 5 + branch * 7 + 3) % NEURAL_HIDDEN_COUNT
      pushPath(
        HIDDEN_A_OFFSET + source,
        HIDDEN_B_OFFSET + target,
        2,
        source % NEURAL_ATTENTION_HEADS,
        0.35 + deterministic(source * 19 + branch) * 0.6,
        (deterministic(source * 5 + branch) - 0.5) * 0.2,
        0.08 + deterministic(source + branch) * 0.16,
        hiddenAColor,
        hiddenBColor,
      )
    }
  }

  for (
    let source = 0;
    source < NEURAL_HIDDEN_COUNT;
    source += 1
  ) {
    for (let branch = 0; branch < 4; branch += 1) {
      const target =
        (source * 3 + branch * 5 + 1) % NEURAL_OUTPUT_COUNT
      pushPath(
        HIDDEN_B_OFFSET + source,
        OUTPUT_OFFSET + target,
        3,
        source % NEURAL_ATTENTION_HEADS,
        0.28 + deterministic(source * 23 + branch) * 0.7,
        (deterministic(source * 11 + branch) - 0.5) * 0.22,
        0.08 + deterministic(source * 3 + branch) * 0.14,
        hiddenBColor,
        outputColor,
      )
    }
  }

  for (
    let head = 0;
    head < NEURAL_ATTENTION_HEADS;
    head += 1
  ) {
    const source = layout.attentionPositions[head]
    if (!source) continue
    for (let other = head + 1; other < NEURAL_ATTENTION_HEADS; other += 1) {
      const target = layout.attentionPositions[other]
      if (!target) continue
      const curve = createCubicCurve(
        source,
        target,
        0.16 + (other - head) * 0.035,
        0.18,
      )
      appendCurveToFiber(
        curve,
        headColors[head] ?? INPUT_COLOR,
        headColors[other] ?? OUTPUT_COLOR,
        fiberPositions,
        fiberColors,
        16,
      )
    }
  }

  for (
    let head = 0;
    head < NEURAL_ATTENTION_HEADS;
    head += 1
  ) {
    const hub = layout.attentionPositions[head]
    const cluster = layout.clusterPositions[head]
    if (!hub || !cluster) continue
    for (
      let satellite = 1;
      satellite < ATTENTION_CLUSTER_SIZE;
      satellite += 1
    ) {
      const target = new THREE.Vector3(
        cluster[satellite * 3] ?? hub.x,
        cluster[satellite * 3 + 1] ?? hub.y,
        cluster[satellite * 3 + 2] ?? hub.z,
      )
      const curve = createCubicCurve(
        hub,
        target,
        (satellite - 2) * 0.055,
        0.05,
      )
      appendCurveToFiber(
        curve,
        headColors[head] ?? INPUT_COLOR,
        headColors[head] ?? INPUT_COLOR,
        fiberPositions,
        fiberColors,
        8,
      )
    }
  }

  const pathsByStage = [[], [], [], []] as number[][]
  const outgoingPathsByNode: number[][] = Array.from(
    { length: NETWORK_NODE_COUNT },
    () => [],
  )
  const incomingPathsByNode: number[][] = Array.from(
    { length: NETWORK_NODE_COUNT },
    () => [],
  )
  pathList.forEach((path, pathIndex) => {
    pathsByStage[path.stage]?.push(pathIndex)
    outgoingPathsByNode[path.sourceNode]?.push(pathIndex)
    incomingPathsByNode[path.targetNode]?.push(pathIndex)
  })

  const attentionBeams: AttentionBeamGeometry[] = []
  for (let pathIndex = 0; pathIndex < pathList.length; pathIndex += 1) {
    const path = pathList[pathIndex]
    if (!path || path.stage !== 0) continue
    const radius = 0.003 + path.weight * 0.0145
    attentionBeams.push({
      geometry: new THREE.TubeGeometry(
        path.curve,
        22,
        radius,
        5,
        false,
      ),
      pathIndex,
      sourceToken: path.sourceNode - INPUT_OFFSET,
      headIndex: path.headIndex,
      weight: path.weight,
    })
  }

  const fiberGeometry = new THREE.BufferGeometry()
  fiberGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(fiberPositions, 3),
  )
  fiberGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(fiberColors, 3),
  )
  return {
    pathList,
    pathsByStage,
    outgoingPathsByNode,
    incomingPathsByNode,
    fiberGeometry,
    attentionBeams,
    gradientFibers: createGradientFiberState(pathList),
  }
}

function createPhotonState(network: NeuralNetwork): PhotonState {
  const pathIndices = new Int32Array(NEURAL_PHOTON_COUNT)
  const progress = new Float32Array(NEURAL_PHOTON_COUNT)
  const speeds = new Float32Array(NEURAL_PHOTON_COUNT)
  const stages = new Uint8Array(NEURAL_PHOTON_COUNT)
  const seeds = new Float32Array(NEURAL_PHOTON_COUNT)
  const directions = new Uint8Array(NEURAL_PHOTON_COUNT)

  for (let index = 0; index < NEURAL_PHOTON_COUNT; index += 1) {
    const seed = deterministic(index + 1)
    const stage = index % 4
    const paths = network.pathsByStage[stage] ?? []
    const pathIndex =
      paths[index % Math.max(1, paths.length)] ??
      network.pathsByStage[0]?.[0] ??
      0
    pathIndices[index] = pathIndex
    progress[index] = deterministic(index * 3 + 2)
    speeds[index] = 0.56 + seed * 0.92
    stages[index] = stage
    seeds[index] = seed
    directions[index] = 0
  }
  return {
    pathIndices,
    progress,
    speeds,
    stages,
    seeds,
    directions,
  }
}

function createIsolationHighlightGeometry(): IsolationHighlightGeometry {
  const vertexCount =
    MAX_ISOLATION_PATHS * ISOLATION_PATH_SEGMENTS * 2
  const positionValues = new Float32Array(vertexCount * 3)
  const colorValues = new Float32Array(vertexCount * 3)
  const positionAttribute = new THREE.BufferAttribute(
    positionValues,
    3,
  ).setUsage(THREE.DynamicDrawUsage)
  const colorAttribute = new THREE.BufferAttribute(
    colorValues,
    3,
  ).setUsage(THREE.DynamicDrawUsage)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', positionAttribute)
  geometry.setAttribute('color', colorAttribute)
  geometry.setDrawRange(0, 0)
  return {
    geometry,
    positionValues,
    colorValues,
    positionAttribute,
    colorAttribute,
  }
}

function createNeuralInspectorPanel(): NeuralInspectorPanel | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 320
  const context = canvas.getContext('2d')
  if (!context) return null
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return { canvas, context, texture }
}

function drawNeuralInspectorPanel(
  panel: NeuralInspectorPanel,
  nodeIndex: number,
  layer: 'a' | 'b',
  activation: number,
  gradientMode: boolean,
) {
  const { context } = panel
  const width = panel.canvas.width
  const height = panel.canvas.height
  const accent = gradientMode
    ? '#ffb65a'
    : layer === 'a'
      ? '#62ffd0'
      : '#9ab4ff'
  const functionName = layer === 'a' ? 'GeLU' : 'Swish'
  context.clearRect(0, 0, width, height)
  const background = context.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, 'rgba(3, 10, 14, 0.96)')
  background.addColorStop(1, 'rgba(7, 4, 16, 0.9)')
  context.fillStyle = background
  context.fillRect(0, 0, width, height)
  context.strokeStyle = accent
  context.globalAlpha = 0.62
  context.lineWidth = 3
  context.strokeRect(4, 4, width - 8, height - 8)
  context.globalAlpha = 1
  context.fillStyle = accent
  context.fillRect(18, 18, 5, height - 36)
  context.font = '600 18px monospace'
  context.fillStyle = '#eafffb'
  context.fillText(
    `HIDDEN ${layer.toUpperCase()} / NODE ${String(nodeIndex + 1).padStart(2, '0')}`,
    40,
    48,
  )
  context.font = '14px monospace'
  context.fillStyle = 'rgba(227, 255, 251, 0.52)'
  context.fillText(`ACTIVATION FUNCTION / ${functionName}`, 40, 78)
  context.font = '600 30px monospace'
  context.fillStyle = accent
  context.fillText(`ACT ${activation.toFixed(3)}`, 40, 122)

  const chartX = 42
  const chartY = 155
  const chartWidth = width - 84
  const chartHeight = 125
  context.strokeStyle = 'rgba(255, 255, 255, 0.14)'
  context.lineWidth = 1
  for (let line = 0; line <= 4; line += 1) {
    const y = chartY + (line / 4) * chartHeight
    context.beginPath()
    context.moveTo(chartX, y)
    context.lineTo(chartX + chartWidth, y)
    context.stroke()
  }
  context.strokeStyle = accent
  context.lineWidth = 3
  context.beginPath()
  for (let point = 0; point <= 80; point += 1) {
    const x = -4 + (point / 80) * 8
    const value =
      layer === 'a'
        ? 0.5 *
          x *
          (1 +
            Math.tanh(
              Math.sqrt(2 / Math.PI) *
                (x + 0.044715 * x * x * x),
            ))
        : x / (1 + Math.exp(-x))
    const px = chartX + (point / 80) * chartWidth
    const py =
      chartY +
      chartHeight -
      ((Math.max(-0.4, Math.min(4, value)) + 0.4) / 4.4) *
        chartHeight
    if (point === 0) {
      context.moveTo(px, py)
    } else {
      context.lineTo(px, py)
    }
  }
  context.stroke()

  const barWidth = Math.max(0, Math.min(1, activation)) * chartWidth
  context.fillStyle = `${accent}cc`
  context.fillRect(
    chartX,
    chartY + chartHeight + 8,
    barWidth,
    5,
  )
  context.font = '12px monospace'
  context.fillStyle = 'rgba(227, 255, 251, 0.4)'
  context.fillText(
    gradientMode ? 'Δw = -η∇L' : 'FORWARD ACTIVATION',
    42,
    308,
  )
  panel.texture.needsUpdate = true
}

export function NeuralPulseSandboxExhibit({
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
  const selectedToken = useGalleryStore(
    (state) => state.neuralSelectedToken,
  )
  const palette = useMemo(() => getVfxPreset(vfxPreset), [vfxPreset])
  const highDetail = performanceTier === 'high'
  const active =
    mode === 'darkroom'
      ? activeExhibitId === 'quantum-lattice'
      : activeExhibitId === null
  const attentionSharpness = exhibit.params.attention ?? 0.82
  const coupling = exhibit.params.coupling ?? 0.68
  const pulseRate = exhibit.params.pulseRate ?? 1.15
  const networkDepth = exhibit.params.depth ?? 0.72
  const winner = getNeuralWinner(selectedToken)
  const layout = useMemo(createNeuralLayout, [])
  const network = useMemo(
    () => createSynapticNetwork(layout),
    [layout],
  )
  const photons = useMemo(
    () => createPhotonState(network),
    [network],
  )
  const isolationGeometry = useMemo(
    createIsolationHighlightGeometry,
    [],
  )
  const inspectorPanel = useMemo(
    createNeuralInspectorPanel,
    [],
  )
  const nodeActivation = useMemo(
    () => new Float32Array(NETWORK_NODE_COUNT),
    [],
  )
  const outputHeights = useMemo(
    () => new Float32Array(NEURAL_OUTPUT_COUNT),
    [],
  )
  const outputProbabilities = useMemo(
    () => new Float32Array(NEURAL_OUTPUT_COUNT),
    [],
  )
  const sceneGroupRef = useRef<THREE.Group>(null)
  const networkGroupRef = useRef<THREE.Group>(null)
  const inputLayerRef = useRef<THREE.Group>(null)
  const inputNodeRefs = useRef<Array<THREE.Mesh | null>>([])
  const attentionClusterRefs = useRef<
    Array<THREE.InstancedMesh | null>
  >([])
  const attentionRingRefs = useRef<Array<THREE.Mesh | null>>([])
  const hiddenAMeshRef = useRef<THREE.InstancedMesh>(null)
  const hiddenBMeshRef = useRef<THREE.InstancedMesh>(null)
  const photonMeshRef = useRef<THREE.InstancedMesh>(null)
  const photonGlowMeshRef = useRef<THREE.InstancedMesh>(null)
  const photonCoreMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const photonGlowMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const fiberMaterialRef =
    useRef<THREE.LineBasicMaterial>(null)
  const layerRailMaterialRef =
    useRef<THREE.LineBasicMaterial>(null)
  const gradientFiberMeshRef =
    useRef<THREE.InstancedMesh>(null)
  const gradientBurstRef = useRef<THREE.Mesh>(null)
  const gradientBurstMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const isolationLineRef = useRef<THREE.LineSegments>(null)
  const inspectorSpriteRef = useRef<THREE.Sprite>(null)
  const attentionBeamRefs = useRef<Array<THREE.Mesh | null>>([])
  const outputNodeRefs = useRef<Array<THREE.Mesh | null>>([])
  const outputColumnRefs = useRef<Array<THREE.Mesh | null>>([])
  const hostRef = useRef<HTMLElement | null>(null)
  const dataTimerRef = useRef(0)
  const lastPointerImpulseRef = useRef(pointerRef.current.impulse)
  const lastInferenceStartedAtRef = useRef<number | null>(null)
  const photonTransitionRef = useRef(0)
  const gradientStartedRef = useRef(false)
  const gradientEndedRef = useRef(false)
  const hoveredHiddenNodeRef = useRef<number | null>(null)
  const pinnedHiddenNodeRef = useRef<number | null>(null)
  const lastIsolatedNodeRef = useRef<number | null>(null)
  const inspectorDrawTimerRef = useRef(0)
  const inputNdcRef = useRef(
    Array.from(
      { length: NEURAL_INPUT_COUNT },
      () => '0,0',
    ),
  )
  const hiddenNdcRef = useRef(
    Array.from(
      { length: NEURAL_HIDDEN_COUNT * 2 },
      () => '0,0',
    ),
  )
  const temporary = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      scale: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      color: new THREE.Color(),
      peakColor: new THREE.Color(),
      pointer: new THREE.Vector2(),
      sampleStart: new THREE.Vector3(),
      sampleEnd: new THREE.Vector3(),
    }),
    [],
  )
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  useEffect(() => {
    if (!active) return
    const canvas = document.querySelector<HTMLElement>(
      '[data-gallery-shared-canvas]',
    )
    if (!canvas) return
    hostRef.current = canvas
    canvas.dataset.neuralPulseSandbox = 'five-layer-transformer'
    canvas.dataset.neuralLayers = '5'
    canvas.dataset.neuralInputNodes = String(NEURAL_INPUT_COUNT)
    canvas.dataset.neuralAttentionHeads = String(
      NEURAL_ATTENTION_HEADS,
    )
    canvas.dataset.neuralHiddenNodes = String(
      NEURAL_HIDDEN_COUNT * 2,
    )
    canvas.dataset.neuralOutputNodes = String(
      NEURAL_OUTPUT_COUNT,
    )
    canvas.dataset.neuralPhotons = String(NEURAL_PHOTON_COUNT)
    canvas.dataset.neuralSynapses = String(network.pathList.length)
    canvas.dataset.neuralAttentionBeams = String(
      network.attentionBeams.length,
    )
    canvas.dataset.neuralTrainingMode =
      useGalleryStore.getState().neuralTrainingMode
    canvas.dataset.neuralGradientActive = 'false'
    canvas.dataset.neuralIsolatedNode = 'none'
    canvas.dataset.neuralIsolationFunction = 'none'
    return () => {
      delete canvas.dataset.neuralPulseSandbox
      delete canvas.dataset.neuralLayers
      delete canvas.dataset.neuralInputNodes
      delete canvas.dataset.neuralAttentionHeads
      delete canvas.dataset.neuralHiddenNodes
      delete canvas.dataset.neuralOutputNodes
      delete canvas.dataset.neuralPhotons
      delete canvas.dataset.neuralSynapses
      delete canvas.dataset.neuralAttentionBeams
      delete canvas.dataset.neuralTrainingMode
      delete canvas.dataset.neuralGradientActive
      delete canvas.dataset.neuralGradientProgress
      delete canvas.dataset.neuralPhotonDirection
      delete canvas.dataset.neuralIsolatedNode
      delete canvas.dataset.neuralIsolationFunction
      delete canvas.dataset.neuralIsolationActivation
      delete canvas.dataset.neuralSelectedToken
      delete canvas.dataset.neuralWinner
      delete canvas.dataset.neuralInferencePhase
      delete canvas.dataset.neuralActiveFlashes
      delete canvas.dataset.neuralPhotonTransitions
      delete canvas.dataset.neuralMaxActivation
      delete canvas.dataset.neuralOutputProbability
      delete canvas.dataset.neuralInputNdc
      delete canvas.dataset.neuralHiddenNdc
      if (hostRef.current === canvas) hostRef.current = null
    }
  }, [active, network])

  useEffect(
    () => () => {
      layout.layerRailGeometry.dispose()
      network.fiberGeometry.dispose()
      isolationGeometry.geometry.dispose()
      inspectorPanel?.texture.dispose()
      network.attentionBeams.forEach((beam) =>
        beam.geometry.dispose(),
      )
      attentionClusterRefs.current.forEach((mesh) =>
        mesh?.dispose(),
      )
      hiddenAMeshRef.current?.dispose()
      hiddenBMeshRef.current?.dispose()
      photonMeshRef.current?.dispose()
      photonGlowMeshRef.current?.dispose()
      gradientFiberMeshRef.current?.dispose()
    },
    [inspectorPanel, isolationGeometry, layout, network],
  )

  useEffect(() => {
    const hiddenLayers = [
      {
        mesh: hiddenAMeshRef.current,
        color: HIDDEN_A_COLOR,
      },
      {
        mesh: hiddenBMeshRef.current,
        color: HIDDEN_B_COLOR,
      },
    ]
    for (const layer of hiddenLayers) {
      if (!layer.mesh) continue
      for (
        let index = 0;
        index < NEURAL_HIDDEN_COUNT;
        index += 1
      ) {
        layer.mesh.setColorAt(index, layer.color)
      }
      if (layer.mesh.instanceColor) {
        layer.mesh.instanceColor.needsUpdate = true
      }
    }
    const gradientMesh = gradientFiberMeshRef.current
    if (gradientMesh) {
      for (
        let index = 0;
        index < network.gradientFibers.count;
        index += 1
      ) {
        gradientMesh.setColorAt(index, GRADIENT_PURPLE)
      }
      if (gradientMesh.instanceColor) {
        gradientMesh.instanceColor.needsUpdate = true
      }
    }
    if (inspectorPanel) {
      drawNeuralInspectorPanel(
        inspectorPanel,
        0,
        'a',
        0,
        false,
      )
    }
  }, [])

  useFrame((state, delta) => {
    if (!active) return
    const safeDelta = Math.min(delta, 0.045)
    const timeScale = useGalleryStore.getState().timeScale
    const time = state.clock.elapsedTime * timeScale
    const pointer = pointerRef.current
    const galleryState = useGalleryStore.getState()
    const sceneGroup = sceneGroupRef.current
    const networkGroup = networkGroupRef.current
    if (!sceneGroup || !networkGroup) return

    sceneGroup.rotation.y = pointer.u * 0.12
    sceneGroup.rotation.z = Math.sin(time * 0.17) * 0.01
    networkGroup.rotation.y =
      Math.sin(time * 0.21) * 0.05 + pointer.u * 0.035
    networkGroup.rotation.x =
      0.18 + Math.sin(time * 0.29) * 0.018 + pointer.v * 0.025
    networkGroup.position.y =
      Math.sin(time * 0.72) * 0.018

    const inferenceStartedAt =
      galleryState.neuralInferenceStartedAt
    const inferenceAge =
      inferenceStartedAt === null
        ? Number.POSITIVE_INFINITY
        : (performance.now() - inferenceStartedAt) / 1_000
    const selected = galleryState.neuralSelectedToken
    const selectedWinner = getNeuralWinner(selected)
    const trainingMode = galleryState.neuralTrainingMode
    const gradientAge =
      trainingMode === 'backprop'
        ? inferenceAge - BACKPROP_FORWARD_SECONDS
        : Number.NEGATIVE_INFINITY
    const gradientProgress = clamp01(
      gradientAge / GRADIENT_DURATION_SECONDS,
    )
    const gradientActive =
      trainingMode === 'backprop' &&
      gradientAge >= 0 &&
      gradientAge < GRADIENT_DURATION_SECONDS

    networkGroup.updateWorldMatrix(true, true)
    let hoveredHiddenNode: number | null = null
    if (pointer.active) {
      let bestDistance = 0.072 * 0.072
      for (
        let index = 0;
        index < NEURAL_HIDDEN_COUNT;
        index += 1
      ) {
        const positionA = layout.hiddenAPositions[index]
        const positionB = layout.hiddenBPositions[index]
        if (positionA) {
          temporary.position
            .copy(positionA)
            .applyMatrix4(networkGroup.matrixWorld)
            .project(state.camera)
          if (
            temporary.position.z > -1 &&
            temporary.position.z < 1
          ) {
            const deltaX = temporary.position.x - pointer.u
            const deltaY = temporary.position.y - pointer.v
            const distance = deltaX * deltaX + deltaY * deltaY
            if (distance < bestDistance) {
              bestDistance = distance
              hoveredHiddenNode = HIDDEN_A_OFFSET + index
            }
          }
        }
        if (positionB) {
          temporary.position
            .copy(positionB)
            .applyMatrix4(networkGroup.matrixWorld)
            .project(state.camera)
          if (
            temporary.position.z > -1 &&
            temporary.position.z < 1
          ) {
            const deltaX = temporary.position.x - pointer.u
            const deltaY = temporary.position.y - pointer.v
            const distance = deltaX * deltaX + deltaY * deltaY
            if (distance < bestDistance) {
              bestDistance = distance
              hoveredHiddenNode = HIDDEN_B_OFFSET + index
            }
          }
        }
      }
    }
    hoveredHiddenNodeRef.current = hoveredHiddenNode
    const pointerClickTriggered =
      pointer.impulse !== lastPointerImpulseRef.current
    let pointerClickConsumed = false
    if (pointerClickTriggered) {
      lastPointerImpulseRef.current = pointer.impulse
      if (hoveredHiddenNode !== null) {
        pinnedHiddenNodeRef.current =
          pinnedHiddenNodeRef.current === hoveredHiddenNode
            ? null
            : hoveredHiddenNode
        pointerClickConsumed = true
      } else {
        pinnedHiddenNodeRef.current = null
      }
    }
    const isolatedNode =
      pinnedHiddenNodeRef.current ?? hoveredHiddenNode

    if (
      inferenceStartedAt !== null &&
      inferenceStartedAt !== lastInferenceStartedAtRef.current
    ) {
      lastInferenceStartedAtRef.current = inferenceStartedAt
      photonTransitionRef.current = 0
      gradientStartedRef.current = false
      gradientEndedRef.current = false
      const inputPaths = network.pathsByStage[0] ?? []
      for (let index = 0; index < NEURAL_PHOTON_COUNT; index += 1) {
        photons.pathIndices[index] =
          inputPaths[index % Math.max(1, inputPaths.length)] ?? 0
        photons.progress[index] =
          (index / NEURAL_PHOTON_COUNT) * 0.82 +
          photons.seeds[index] * 0.18
        photons.stages[index] = 0
        photons.directions[index] = 0
      }
    }

    if (
      trainingMode === 'backprop' &&
      gradientAge >= 0 &&
      !gradientStartedRef.current
    ) {
      gradientStartedRef.current = true
      gradientEndedRef.current = false
      const outputPaths = network.pathsByStage[3] ?? []
      for (let index = 0; index < NEURAL_PHOTON_COUNT; index += 1) {
        photons.pathIndices[index] =
          outputPaths[
            index % Math.max(1, outputPaths.length)
          ] ?? 0
        photons.progress[index] = Math.max(
          0.12,
          1 - (index / NEURAL_PHOTON_COUNT) * 0.84,
        )
        photons.stages[index] = 3
        photons.directions[index] = 1
      }
      nodeActivation[OUTPUT_OFFSET + selectedWinner] = 1
    }

    if (
      trainingMode === 'backprop' &&
      gradientAge >= GRADIENT_DURATION_SECONDS &&
      gradientStartedRef.current &&
      !gradientEndedRef.current
    ) {
      gradientEndedRef.current = true
      for (let index = 0; index < NEURAL_PHOTON_COUNT; index += 1) {
        const stage = index % 4
        const paths = network.pathsByStage[stage] ?? []
        photons.pathIndices[index] =
          paths[index % Math.max(1, paths.length)] ?? 0
        photons.progress[index] = photons.seeds[index] ?? 0.4
        photons.stages[index] = stage
        photons.directions[index] = 0
      }
    }

    const decay = Math.exp(
      -safeDelta * (2.7 + coupling * 2.1),
    )
    for (let index = 0; index < nodeActivation.length; index += 1) {
      nodeActivation[index] *= decay
    }
    nodeActivation[INPUT_OFFSET + selected] = Math.max(
      nodeActivation[INPUT_OFFSET + selected],
      0.38 + Math.sin(time * 3.2) * 0.08,
    )

    const outputGate =
      Number.isFinite(inferenceAge)
        ? smoothstep(0.9, 2.35, inferenceAge) *
          (1 - smoothstep(3.2, 4.6, inferenceAge) * 0.42)
        : 0
    let logitSum = 0
    const samplingTemperature =
      0.45 + (1 - attentionSharpness) * 1.15
    for (let index = 0; index < NEURAL_OUTPUT_COUNT; index += 1) {
      const baseLogit = BASE_LOGITS[index] ?? 0.3
      const winnerBoost =
        index === selectedWinner
          ? 0.8 + outputGate * 3.2
          : 0
      const score =
        (baseLogit + winnerBoost) / samplingTemperature
      const probability = Math.exp(score)
      outputProbabilities[index] = probability
      logitSum += probability
    }
    let maximumProbability = 0
    for (let index = 0; index < NEURAL_OUTPUT_COUNT; index += 1) {
      const probability =
        (outputProbabilities[index] ?? 0) /
        Math.max(0.0001, logitSum)
      const outputFlash =
        nodeActivation[OUTPUT_OFFSET + index]
      outputProbabilities[index] = probability
      maximumProbability = Math.max(
        maximumProbability,
        probability,
      )
      const targetHeight =
        0.16 +
        probability * (1.05 + networkDepth * 0.28) +
        (index === selectedWinner
          ? 0.12 + outputGate * 0.22
          : 0)
      outputHeights[index] +=
        (targetHeight - outputHeights[index]) *
        (1 - Math.exp(-safeDelta * 7.5))
      const column = outputColumnRefs.current[index]
      const node = outputNodeRefs.current[index]
      if (column) {
        const height = Math.max(0.12, outputHeights[index])
        column.position.y = height * 0.5
        column.scale.y = height
        if (column.material instanceof THREE.MeshBasicMaterial) {
          temporary.color
            .set(
              index === selectedWinner
                ? WINNER_COLOR
                : NEURAL_HEAD_COLORS[
                    index % NEURAL_ATTENTION_HEADS
                  ] ?? palette.secondary,
            )
            .multiplyScalar(
              0.44 +
                outputGate *
                  (index === selectedWinner ? 0.34 : 0.12),
            )
          column.material.color.copy(temporary.color)
          column.material.opacity =
            0.18 +
            probability * 0.3 +
            (index === selectedWinner ? outputGate * 0.08 : 0) +
            outputFlash * 0.08
        }
      }
      if (node) {
        node.position.y =
          Math.max(0.12, outputHeights[index]) + 0.055
        const nodeScale =
          0.025 +
          probability * 0.035 +
          (index === selectedWinner ? outputGate * 0.014 : 0) +
          outputFlash * 0.024
        node.scale.setScalar(nodeScale)
        if (node.material instanceof THREE.MeshBasicMaterial) {
          node.material.color.copy(
            index === selectedWinner
              ? WINNER_COLOR
              : OUTPUT_COLOR,
          )
          node.material.opacity =
            index === selectedWinner ? 1 : 0.72
        }
      }
    }

    const photonMesh = photonMeshRef.current
    const photonGlow = photonGlowMeshRef.current
    let activePhotonCount = 0
    if (photonCoreMaterialRef.current) {
      if (gradientActive) {
        temporary.color.lerpColors(
          GRADIENT_GOLD,
          GRADIENT_PURPLE,
          gradientProgress,
        )
        photonCoreMaterialRef.current.color
          .copy(temporary.color)
          .lerp(GRADIENT_EMBER, 0.2 + gradientProgress * 0.24)
      } else {
        photonCoreMaterialRef.current.color.set('#b9fff8')
      }
      photonCoreMaterialRef.current.opacity =
        isolatedNode === null ? 0.78 : 0.26
    }
    if (photonGlowMaterialRef.current) {
      if (gradientActive) {
        temporary.color.lerpColors(
          GRADIENT_GOLD,
          GRADIENT_PURPLE,
          gradientProgress,
        )
        photonGlowMaterialRef.current.color.copy(temporary.color)
      } else {
        photonGlowMaterialRef.current.color.copy(INPUT_COLOR)
      }
      photonGlowMaterialRef.current.opacity =
        isolatedNode === null
          ? gradientActive
            ? 0.085
            : 0.05
          : 0.02
    }
    if (photonMesh && photonGlow) {
      for (let index = 0; index < NEURAL_PHOTON_COUNT; index += 1) {
        const pathIndex = photons.pathIndices[index] ?? 0
        let path = network.pathList[pathIndex]
        if (!path) continue
        const pathDelta =
          safeDelta *
          timeScale *
          (photons.speeds[index] ?? 0.7) *
          pulseRate
        let nextProgress: number
        if ((photons.directions[index] ?? 0) === 1) {
          nextProgress = photons.progress[index] - pathDelta
          while (nextProgress <= 0) {
            nextProgress += 1
            nodeActivation[path.sourceNode] = 1
            photonTransitionRef.current += 1
            const incoming =
              network.incomingPathsByNode[path.sourceNode] ?? []
            const nextPathIndex =
              incoming.length > 0
                ? incoming[
                    (index + photonTransitionRef.current) %
                      incoming.length
                  ] ?? incoming[0] ?? 0
                : network.pathsByStage[3]?.[
                    index %
                      Math.max(
                        1,
                        network.pathsByStage[3]?.length ?? 1,
                      )
                  ] ?? 0
            photons.pathIndices[index] = nextPathIndex
            path = network.pathList[nextPathIndex] ?? path
            photons.stages[index] = path.stage
          }
        } else {
          nextProgress = photons.progress[index] + pathDelta
          while (nextProgress >= 1) {
            nextProgress -= 1
            nodeActivation[path.targetNode] = 1
            photonTransitionRef.current += 1
            const outgoing =
              network.outgoingPathsByNode[path.targetNode] ?? []
            const nextPathIndex =
              outgoing.length > 0
                ? outgoing[
                    (index + photonTransitionRef.current) %
                      outgoing.length
                  ] ?? outgoing[0] ?? 0
                : network.pathsByStage[0]?.[
                    index %
                      Math.max(
                        1,
                        network.pathsByStage[0]?.length ?? 1,
                      )
                  ] ?? 0
            photons.pathIndices[index] = nextPathIndex
            path = network.pathList[nextPathIndex] ?? path
            photons.stages[index] = path.stage
          }
        }
        photons.progress[index] = nextProgress
        path.curve.getPoint(nextProgress, temporary.position)
        const packetScale =
          0.005 +
          (path.stage === 3 ? 0.0025 : 0.0012) +
          (Number.isFinite(inferenceAge) && inferenceAge < 3.2
            ? 0.0012
            : 0) +
          (gradientActive ? 0.0018 : 0)
        temporary.scale.setScalar(packetScale)
        temporary.matrix.compose(
          temporary.position,
          temporary.quaternion.identity(),
          temporary.scale,
        )
        photonMesh.setMatrixAt(index, temporary.matrix)
        temporary.scale.multiplyScalar(2.5)
        temporary.matrix.compose(
          temporary.position,
          temporary.quaternion,
          temporary.scale,
        )
        photonGlow.setMatrixAt(index, temporary.matrix)
        activePhotonCount += 1
      }
      photonMesh.instanceMatrix.needsUpdate = true
      photonGlow.instanceMatrix.needsUpdate = true
    }

    if (inputLayerRef.current) {
      for (let index = 0; index < NEURAL_INPUT_COUNT; index += 1) {
        const mesh = inputNodeRefs.current[index]
        if (!mesh) continue
        const emission = nodeActivation[INPUT_OFFSET + index]
        const selected = index === galleryState.neuralSelectedToken
        mesh.scale.setScalar(
          0.04 +
            emission * 0.018 +
            (selected ? 0.018 : 0),
        )
        mesh.rotation.y = time * (0.44 + index * 0.035)
        mesh.rotation.x = Math.sin(time * 0.8 + index) * 0.22
        if (mesh.material instanceof THREE.MeshBasicMaterial) {
          temporary.color.copy(INPUT_COLOR)
          temporary.peakColor.copy(WINNER_COLOR)
          mesh.material.color.lerpColors(
            temporary.color,
            temporary.peakColor,
            clamp01(emission * 0.72 + (selected ? 0.38 : 0)),
          )
          mesh.material.opacity = selected ? 1 : 0.72
        }
      }
    }

    for (
      let head = 0;
      head < NEURAL_ATTENTION_HEADS;
      head += 1
    ) {
      const mesh = attentionClusterRefs.current[head]
      const positions = layout.clusterPositions[head]
      const hubActivation =
        nodeActivation[ATTENTION_OFFSET + head]
      const headColor =
        NEURAL_HEAD_COLORS[head] ?? palette.secondary
      if (mesh) {
        if (mesh.material instanceof THREE.MeshBasicMaterial) {
          mesh.material.color.set(headColor)
          mesh.material.opacity =
            0.55 + hubActivation * 0.25
        }
        if (positions) {
          for (
            let node = 0;
            node < ATTENTION_CLUSTER_SIZE;
            node += 1
          ) {
            const activation =
              node === 0
                ? hubActivation
                : hubActivation *
                  (0.52 +
                    deterministic(head * 7 + node) * 0.34)
            temporary.position.set(
              positions[node * 3] ?? 0,
              positions[node * 3 + 1] ?? 0,
              positions[node * 3 + 2] ?? 0,
            )
            const scale =
              (node === 0 ? 0.052 : 0.03) +
              activation * 0.022 +
              Math.sin(time * 2.4 + node + head) * 0.002
            temporary.scale.setScalar(Math.max(0.022, scale))
            temporary.matrix.compose(
              temporary.position,
              temporary.quaternion.identity(),
              temporary.scale,
            )
            mesh.setMatrixAt(node, temporary.matrix)
          }
          mesh.instanceMatrix.needsUpdate = true
        }
      }
      const ring = attentionRingRefs.current[head]
      if (ring) {
        ring.rotation.z =
          time * (0.24 + head * 0.045) * (head % 2 === 0 ? 1 : -1)
        ring.rotation.x = Math.PI / 2 + Math.sin(time * 0.6 + head) * 0.2
        ring.scale.setScalar(0.85 + hubActivation * 0.28)
      }
    }

    const updateHiddenLayer = (
      mesh: THREE.InstancedMesh | null,
      positions: THREE.Vector3[],
      offset: number,
      baseColor: THREE.Color,
      peakColor: THREE.Color,
      phase: number,
      isolated: number | null,
    ) => {
      if (!mesh) return
      for (let index = 0; index < positions.length; index += 1) {
        const position = positions[index]
        if (!position) continue
        const activation = nodeActivation[offset + index]
        const nodeIsolated = offset + index === isolated
        temporary.position.copy(position)
        const scale =
          0.038 +
          activation * 0.028 +
          Math.sin(time * 2.2 + index * 0.7 + phase) * 0.0025 +
          (nodeIsolated ? 0.024 : 0)
        temporary.scale.setScalar(Math.max(0.024, scale))
        temporary.matrix.compose(
          temporary.position,
          temporary.quaternion.identity(),
          temporary.scale,
        )
        mesh.setMatrixAt(index, temporary.matrix)
        temporary.color.copy(baseColor)
        temporary.peakColor.copy(peakColor)
        temporary.color.lerpColors(
          temporary.color,
          temporary.peakColor,
          clamp01(activation * 0.9 + (nodeIsolated ? 0.52 : 0)),
        )
        mesh.setColorAt(index, temporary.color)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    updateHiddenLayer(
      hiddenAMeshRef.current,
      layout.hiddenAPositions,
      HIDDEN_A_OFFSET,
      HIDDEN_A_COLOR,
      HIDDEN_A_PEAK_COLOR,
      0,
      isolatedNode,
    )
    updateHiddenLayer(
      hiddenBMeshRef.current,
      layout.hiddenBPositions,
      HIDDEN_B_OFFSET,
      HIDDEN_B_COLOR,
      HIDDEN_B_PEAK_COLOR,
      Math.PI,
      isolatedNode,
    )

    if (fiberMaterialRef.current) {
      fiberMaterialRef.current.opacity =
        isolatedNode === null ? 0.18 : 0.018
    }
    if (layerRailMaterialRef.current) {
      layerRailMaterialRef.current.opacity =
        isolatedNode === null ? 0.24 : 0.055
    }

    if (lastIsolatedNodeRef.current !== isolatedNode) {
      lastIsolatedNodeRef.current = isolatedNode
      inspectorDrawTimerRef.current = 0
      if (isolatedNode === null) {
        isolationGeometry.geometry.setDrawRange(0, 0)
        if (isolationLineRef.current) {
          isolationLineRef.current.visible = false
        }
      } else {
        let pathCount = 0
        let vertexCount = 0
        for (
          let pathIndex = 0;
          pathIndex < network.pathList.length &&
          pathCount < MAX_ISOLATION_PATHS;
          pathIndex += 1
        ) {
          const path = network.pathList[pathIndex]
          if (
            !path ||
            (path.sourceNode !== isolatedNode &&
              path.targetNode !== isolatedNode)
          ) {
            continue
          }
          temporary.color.set(
            NEURAL_HEAD_COLORS[path.headIndex] ??
              palette.secondary,
          )
          temporary.peakColor.copy(
            path.stage >= 3 ? WINNER_COLOR : OUTPUT_COLOR,
          )
          for (
            let segment = 0;
            segment < ISOLATION_PATH_SEGMENTS;
            segment += 1
          ) {
            const t0 = segment / ISOLATION_PATH_SEGMENTS
            const t1 =
              (segment + 1) / ISOLATION_PATH_SEGMENTS
            path.curve.getPoint(t0, temporary.sampleStart)
            path.curve.getPoint(t1, temporary.sampleEnd)
            const positionOffset = vertexCount * 3
            isolationGeometry.positionValues[
              positionOffset
            ] = temporary.sampleStart.x
            isolationGeometry.positionValues[
              positionOffset + 1
            ] = temporary.sampleStart.y
            isolationGeometry.positionValues[
              positionOffset + 2
            ] = temporary.sampleStart.z
            isolationGeometry.positionValues[
              positionOffset + 3
            ] = temporary.sampleEnd.x
            isolationGeometry.positionValues[
              positionOffset + 4
            ] = temporary.sampleEnd.y
            isolationGeometry.positionValues[
              positionOffset + 5
            ] = temporary.sampleEnd.z
            temporary.color.set(
              NEURAL_HEAD_COLORS[path.headIndex] ??
                palette.secondary,
            )
            temporary.color.lerp(
              temporary.peakColor,
              t0 * 0.55,
            )
            isolationGeometry.colorValues[
              positionOffset
            ] = temporary.color.r
            isolationGeometry.colorValues[
              positionOffset + 1
            ] = temporary.color.g
            isolationGeometry.colorValues[
              positionOffset + 2
            ] = temporary.color.b
            temporary.color.set(
              NEURAL_HEAD_COLORS[path.headIndex] ??
                palette.secondary,
            )
            temporary.color.lerp(
              temporary.peakColor,
              t1 * 0.55,
            )
            isolationGeometry.colorValues[
              positionOffset + 3
            ] = temporary.color.r
            isolationGeometry.colorValues[
              positionOffset + 4
            ] = temporary.color.g
            isolationGeometry.colorValues[
              positionOffset + 5
            ] = temporary.color.b
            vertexCount += 2
          }
          pathCount += 1
        }
        isolationGeometry.positionAttribute.needsUpdate = true
        isolationGeometry.colorAttribute.needsUpdate = true
        isolationGeometry.geometry.setDrawRange(
          0,
          vertexCount,
        )
        if (isolationLineRef.current) {
          isolationLineRef.current.visible = true
        }
      }
    }

    const isolatedLayer =
      isolatedNode === null
        ? null
        : isolatedNode >= HIDDEN_B_OFFSET
          ? 'b'
          : isolatedNode >= HIDDEN_A_OFFSET
            ? 'a'
            : null
    if (
      isolatedNode !== null &&
      isolatedLayer !== null &&
      inspectorSpriteRef.current
    ) {
      const nodeIndex =
        isolatedNode -
        (isolatedLayer === 'a'
          ? HIDDEN_A_OFFSET
          : HIDDEN_B_OFFSET)
      const nodePosition =
        (isolatedLayer === 'a'
          ? layout.hiddenAPositions[nodeIndex]
          : layout.hiddenBPositions[nodeIndex])
      if (nodePosition) {
        const sprite = inspectorSpriteRef.current
        sprite.visible = true
        sprite.position.copy(nodePosition)
        sprite.position.x += nodePosition.x > 0.42 ? -0.62 : 0.62
        sprite.position.y += 0.24
        sprite.position.z += 0.12
        inspectorDrawTimerRef.current += safeDelta
        if (
          inspectorPanel &&
          inspectorDrawTimerRef.current >= 0.1
        ) {
          inspectorDrawTimerRef.current = 0
          drawNeuralInspectorPanel(
            inspectorPanel,
            nodeIndex,
            isolatedLayer,
            nodeActivation[isolatedNode],
            trainingMode === 'backprop',
          )
        }
      }
    } else if (inspectorSpriteRef.current) {
      inspectorSpriteRef.current.visible = false
      inspectorDrawTimerRef.current = 0
    }

    const gradientMesh = gradientFiberMeshRef.current
    if (gradientMesh) {
      const showGradient =
        gradientActive && isolatedNode === null
      gradientMesh.visible = showGradient
      if (showGradient) {
        const head = 3.98 - gradientProgress * 4.3
        for (
          let index = 0;
          index < network.gradientFibers.count;
          index += 1
        ) {
          const coordinate =
            network.gradientFibers.coordinates[index] ?? 0
          const distance = coordinate - head
          const intensity = Math.exp(
            -(distance * distance) / 0.07,
          )
          temporary.position.set(
            network.gradientFibers.centers[index * 3] ?? 0,
            network.gradientFibers.centers[index * 3 + 1] ?? 0,
            network.gradientFibers.centers[index * 3 + 2] ?? 0,
          )
          const qx =
            network.gradientFibers.quaternions[index * 4] ?? 0
          const qy =
            network.gradientFibers.quaternions[
              index * 4 + 1
            ] ?? 0
          const qz =
            network.gradientFibers.quaternions[
              index * 4 + 2
            ] ?? 0
          const qw =
            network.gradientFibers.quaternions[
              index * 4 + 3
            ] ?? 1
          temporary.quaternion.set(qx, qy, qz, qw)
          const thickness = 0.0012 + intensity * 0.0105
          temporary.scale.set(
            thickness,
            network.gradientFibers.lengths[index] ?? 0.01,
            thickness,
          )
          temporary.matrix.compose(
            temporary.position,
            temporary.quaternion,
            temporary.scale,
          )
          gradientMesh.setMatrixAt(index, temporary.matrix)
          temporary.color.lerpColors(
            GRADIENT_PURPLE,
            GRADIENT_GOLD,
            clamp01(intensity * 1.25),
          )
          temporary.color.lerp(
            GRADIENT_EMBER,
            clamp01(intensity * 0.25),
          )
          gradientMesh.setColorAt(index, temporary.color)
        }
        gradientMesh.instanceMatrix.needsUpdate = true
        if (gradientMesh.instanceColor) {
          gradientMesh.instanceColor.needsUpdate = true
        }
      }
    }

    if (
      gradientBurstRef.current &&
      gradientBurstMaterialRef.current
    ) {
      const burstProgress = clamp01(gradientAge / 0.72)
      const burstVisible =
        gradientActive &&
        gradientAge >= 0 &&
        burstProgress < 1
      gradientBurstRef.current.visible = burstVisible
      if (burstVisible) {
        const burstScale = 0.45 + burstProgress * 2.6
        gradientBurstRef.current.scale.setScalar(burstScale)
        gradientBurstMaterialRef.current.opacity =
          (1 - burstProgress) * 0.82
        gradientBurstMaterialRef.current.color
          .copy(GRADIENT_GOLD)
          .lerp(GRADIENT_PURPLE, burstProgress * 0.68)
      }
    }

    const beamPulse =
      Number.isFinite(inferenceAge)
        ? Math.exp(-Math.max(0, inferenceAge - 0.25) * 0.9)
        : 0
    for (
      let index = 0;
      index < network.attentionBeams.length;
      index += 1
    ) {
      const beam = network.attentionBeams[index]
      const mesh = attentionBeamRefs.current[index]
      if (!beam || !mesh) continue
      const beamSelected = beam.sourceToken === selected
      mesh.visible = beamSelected && isolatedNode === null
      if (
        beamSelected &&
        mesh.material instanceof THREE.MeshBasicMaterial
      ) {
        mesh.material.color.set(
          NEURAL_HEAD_COLORS[beam.headIndex] ??
            palette.secondary,
        )
        mesh.material.opacity =
          0.1 +
          beam.weight * 0.4 +
          beamPulse * (0.06 + beam.weight * 0.16)
      }
    }

    if (
      pointerClickTriggered &&
      !pointerClickConsumed &&
      galleryState.activeExhibitId === 'quantum-lattice'
    ) {
      temporary.pointer.set(pointer.u, pointer.v)
      raycaster.setFromCamera(temporary.pointer, state.camera)
      const inputLayer = inputLayerRef.current
      if (inputLayer) {
        inputLayer.updateWorldMatrix(true, true)
        const hits = raycaster.intersectObject(inputLayer, true)
        const firstHit = hits[0]
        let object: THREE.Object3D | null = firstHit?.object ?? null
        while (object && typeof object.userData.tokenIndex !== 'number') {
          object = object.parent
        }
        const tokenIndex = object?.userData.tokenIndex
        if (typeof tokenIndex === 'number') {
          queueMicrotask(() => {
            useGalleryStore.getState().selectNeuralToken(tokenIndex)
          })
        }
      }
    } else if (pointer.impulse === lastPointerImpulseRef.current) {
      lastPointerImpulseRef.current = pointer.impulse
    }

    let activeFlashCount = 0
    let maximumActivation = 0
    for (let index = 0; index < nodeActivation.length; index += 1) {
      const activation = nodeActivation[index]
      maximumActivation = Math.max(maximumActivation, activation)
      if (activation > 0.16) activeFlashCount += 1
    }

    dataTimerRef.current += safeDelta
    const host = hostRef.current
    if (host && dataTimerRef.current >= 0.1) {
      dataTimerRef.current = 0
      const inferencePhase =
        trainingMode === 'backprop' && gradientActive
          ? 'backprop'
          : !Number.isFinite(inferenceAge)
          ? 'idle'
          : inferenceAge < 0.9
            ? 'input'
            : inferenceAge < 1.75
              ? 'attention'
              : inferenceAge < 2.7
                ? 'hidden'
                : inferenceAge < 3.7
                  ? 'logits'
                  : 'settled'
      host.dataset.neuralSelectedToken = String(selected)
      host.dataset.neuralWinner = String(selectedWinner)
      host.dataset.neuralTrainingMode = trainingMode
      host.dataset.neuralInferencePhase = inferencePhase
      host.dataset.neuralGradientActive = String(
        gradientActive,
      )
      host.dataset.neuralGradientProgress =
        gradientProgress.toFixed(3)
      host.dataset.neuralPhotonDirection = gradientActive
        ? 'reverse'
        : 'forward'
      host.dataset.neuralActiveFlashes = String(activeFlashCount)
      host.dataset.neuralPhotonTransitions = String(
        photonTransitionRef.current,
      )
      host.dataset.neuralMaxActivation =
        maximumActivation.toFixed(3)
      host.dataset.neuralOutputProbability =
        maximumProbability.toFixed(4)
      host.dataset.neuralActivePhotons = String(
        activePhotonCount,
      )
      for (let index = 0; index < NEURAL_INPUT_COUNT; index += 1) {
        const mesh = inputNodeRefs.current[index]
        if (!mesh) {
          inputNdcRef.current[index] = '0,0'
          continue
        }
        mesh.getWorldPosition(temporary.position)
        temporary.position.project(state.camera)
        inputNdcRef.current[index] =
          `${temporary.position.x.toFixed(4)},` +
          temporary.position.y.toFixed(4)
      }
      host.dataset.neuralInputNdc =
        inputNdcRef.current.join(';')
      for (
        let index = 0;
        index < NEURAL_HIDDEN_COUNT;
        index += 1
      ) {
        const positionA = layout.hiddenAPositions[index]
        const positionB = layout.hiddenBPositions[index]
        if (positionA) {
          temporary.position
            .copy(positionA)
            .applyMatrix4(networkGroup.matrixWorld)
            .project(state.camera)
          hiddenNdcRef.current[index] =
            `${temporary.position.x.toFixed(4)},` +
            temporary.position.y.toFixed(4)
        }
        if (positionB) {
          temporary.position
            .copy(positionB)
            .applyMatrix4(networkGroup.matrixWorld)
            .project(state.camera)
          hiddenNdcRef.current[
            NEURAL_HIDDEN_COUNT + index
          ] =
            `${temporary.position.x.toFixed(4)},` +
            temporary.position.y.toFixed(4)
        }
      }
      host.dataset.neuralHiddenNdc =
        hiddenNdcRef.current.join(';')
      if (isolatedNode === null || isolatedLayer === null) {
        host.dataset.neuralIsolatedNode = 'none'
        host.dataset.neuralIsolationFunction = 'none'
        host.dataset.neuralIsolationActivation = '0.000'
      } else {
        const nodeIndex =
          isolatedNode -
          (isolatedLayer === 'a'
            ? HIDDEN_A_OFFSET
            : HIDDEN_B_OFFSET)
        host.dataset.neuralIsolatedNode =
          `hidden-${isolatedLayer}-${nodeIndex}`
        host.dataset.neuralIsolationFunction =
          isolatedLayer === 'a' ? 'gelu' : 'swish'
        host.dataset.neuralIsolationActivation =
          nodeActivation[isolatedNode].toFixed(3)
      }
    }
  })

  return (
    <group
      ref={sceneGroupRef}
      position={[0, -0.16, 0]}
      rotation={[0.18, 0, 0]}
      scale={mode === 'darkroom' ? 1.02 : 0.9}
    >
      <mesh position={[0, -0.42, -0.02]}>
        <circleGeometry args={[1.58, 96]} />
        <meshStandardMaterial
          color="#03080c"
          emissive={palette.primary}
          emissiveIntensity={0.055}
          metalness={0.64}
          roughness={0.38}
          transparent
          opacity={0.9}
        />
      </mesh>
      <mesh
        position={[0, -0.416, -0.02]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[1.36, 1.52, 128]} />
        <meshBasicMaterial
          color={palette.secondary}
          transparent
          opacity={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <group ref={networkGroupRef}>
        <lineSegments
          geometry={layout.layerRailGeometry}
          renderOrder={1}
        >
          <lineBasicMaterial
            ref={layerRailMaterialRef}
            vertexColors
            transparent
            opacity={0.24}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </lineSegments>
        <lineSegments
          geometry={network.fiberGeometry}
          renderOrder={2}
        >
          <lineBasicMaterial
            ref={fiberMaterialRef}
            vertexColors
            transparent
            opacity={0.18}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </lineSegments>
        <lineSegments
          ref={isolationLineRef}
          geometry={isolationGeometry.geometry}
          visible={false}
          frustumCulled={false}
          renderOrder={8}
        >
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={0.9}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </lineSegments>

        <sprite
          ref={inspectorSpriteRef}
          visible={false}
          scale={[0.72, 0.45, 1]}
          renderOrder={20}
        >
          <spriteMaterial
            map={inspectorPanel?.texture}
            transparent
            opacity={0.96}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>

        <group ref={inputLayerRef}>
          {layout.inputPositions.map((position, index) => (
            <group
              key={`neural-input-${index}`}
              position={position}
              userData={{ tokenIndex: index }}
            >
              <mesh
                ref={(mesh) => {
                  inputNodeRefs.current[index] = mesh
                }}
                renderOrder={6}
              >
                <octahedronGeometry args={[1, 0]} />
                <meshBasicMaterial
                  color="#8cf9ff"
                  transparent
                  opacity={0.82}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </mesh>
              <mesh renderOrder={4}>
                <sphereGeometry args={[0.16, 10, 7]} />
                <meshBasicMaterial
                  transparent
                  opacity={0}
                  depthWrite={false}
                  colorWrite={false}
                />
              </mesh>
              <mesh scale={1.35} renderOrder={5}>
                <octahedronGeometry args={[0.068, 0]} />
                <meshBasicMaterial
                  color="#5ef2ff"
                  transparent
                  opacity={0.08}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </mesh>
            </group>
          ))}
        </group>

        {Array.from(
          { length: NEURAL_ATTENTION_HEADS },
          (_, head) => (
            <group key={`attention-head-${head}`}>
              <instancedMesh
                ref={(mesh) => {
                  attentionClusterRefs.current[head] = mesh
                }}
                args={[
                  undefined,
                  undefined,
                  ATTENTION_CLUSTER_SIZE,
                ]}
                frustumCulled={false}
                renderOrder={6}
              >
                <icosahedronGeometry args={[1, highDetail ? 1 : 0]} />
                <meshBasicMaterial
                  color={NEURAL_HEAD_COLORS[head]}
                  transparent
                  opacity={0.78}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </instancedMesh>
              <mesh
                ref={(mesh) => {
                  attentionRingRefs.current[head] = mesh
                }}
                position={layout.attentionPositions[head]}
                rotation={[Math.PI / 2, 0, 0]}
                renderOrder={5}
              >
                <torusGeometry
                  args={[0.22, 0.008, 6, highDetail ? 64 : 36]}
                />
                <meshBasicMaterial
                  color={NEURAL_HEAD_COLORS[head]}
                  transparent
                  opacity={0.36}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </mesh>
            </group>
          ),
        )}

        <instancedMesh
          ref={hiddenAMeshRef}
          args={[undefined, undefined, NEURAL_HIDDEN_COUNT]}
          frustumCulled={false}
          renderOrder={6}
        >
          <icosahedronGeometry args={[1, highDetail ? 1 : 0]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.88}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
        <instancedMesh
          ref={hiddenBMeshRef}
          args={[undefined, undefined, NEURAL_HIDDEN_COUNT]}
          frustumCulled={false}
          renderOrder={6}
        >
          <icosahedronGeometry args={[1, highDetail ? 1 : 0]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.88}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>

        {layout.outputPositions.map((position, index) => (
          <group
            key={`neural-output-${index}`}
            position={[position.x, -0.36, position.z]}
          >
            <mesh
              ref={(mesh) => {
                outputColumnRefs.current[index] = mesh
              }}
              renderOrder={4}
            >
              <cylinderGeometry args={[0.016, 0.025, 1, 8]} />
              <meshBasicMaterial
                color={
                  index === winner
                    ? '#ffe28a'
                    : NEURAL_HEAD_COLORS[
                        index % NEURAL_ATTENTION_HEADS
                      ]
                }
                transparent
                opacity={0.48}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
            <mesh
              ref={(mesh) => {
                outputNodeRefs.current[index] = mesh
              }}
              renderOrder={8}
            >
              <icosahedronGeometry args={[1, highDetail ? 1 : 0]} />
              <meshBasicMaterial
                color={index === winner ? '#ffe28a' : '#e7ffff'}
                transparent
                opacity={index === winner ? 1 : 0.72}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          </group>
        ))}

        {network.attentionBeams.map((beam, index) => (
          <mesh
            key={`neural-attention-beam-${index}`}
            ref={(mesh) => {
              attentionBeamRefs.current[index] = mesh
            }}
            geometry={beam.geometry}
            visible={beam.sourceToken === selectedToken}
            renderOrder={4}
          >
            <meshBasicMaterial
              color={NEURAL_HEAD_COLORS[beam.headIndex]}
              transparent
              opacity={0.16 + beam.weight * 0.55}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        ))}

        <instancedMesh
          ref={gradientFiberMeshRef}
          args={[
            undefined,
            undefined,
            network.gradientFibers.count,
          ]}
          visible={false}
          frustumCulled={false}
          renderOrder={7}
        >
          <cylinderGeometry args={[1, 1, 1, 4, 1]} />
          <meshBasicMaterial
            vertexColors
            transparent
            opacity={0.32}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>

        <mesh
          ref={gradientBurstRef}
          position={[0, 0.28, LAYER_Z[4]]}
          visible={false}
          frustumCulled={false}
          renderOrder={12}
        >
          <ringGeometry args={[0.72, 0.94, 96]} />
          <meshBasicMaterial
            ref={gradientBurstMaterialRef}
            color="#ffb64a"
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        <instancedMesh
          ref={photonGlowMeshRef}
          args={[undefined, undefined, NEURAL_PHOTON_COUNT]}
          frustumCulled={false}
          renderOrder={9}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            ref={photonGlowMaterialRef}
            color="#b7fff8"
            transparent
            opacity={0.05}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
        <instancedMesh
          ref={photonMeshRef}
          args={[undefined, undefined, NEURAL_PHOTON_COUNT]}
          frustumCulled={false}
          renderOrder={10}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            ref={photonCoreMaterialRef}
            color="#efffff"
            transparent
            opacity={0.78}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
      </group>

      <pointLight
        position={[0, 0.8, 0.2]}
        color={palette.secondary}
        intensity={0.95}
        distance={3.4}
        decay={2}
      />
      <pointLight
        position={[0, 0.15, 1.25]}
        color="#ffe28a"
        intensity={0.55}
        distance={2.2}
        decay={2}
      />
      <ambientLight intensity={0.14} color={palette.tertiary} />
    </group>
  )
}
