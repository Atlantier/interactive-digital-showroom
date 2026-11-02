import * as THREE from 'three'
import {
  NEURAL_ATTENTION_HEADS,
  NEURAL_HEAD_COLORS,
  NEURAL_HIDDEN_COUNT,
  NEURAL_INPUT_COUNT,
  NEURAL_OUTPUT_COUNT,
  NEURAL_PHOTON_COUNT,
} from '../../../data/neuralNetwork'
export const TAU = Math.PI * 2
export const INPUT_OFFSET = 0
export const ATTENTION_OFFSET = NEURAL_INPUT_COUNT
export const HIDDEN_A_OFFSET =
  ATTENTION_OFFSET + NEURAL_ATTENTION_HEADS
export const HIDDEN_B_OFFSET = HIDDEN_A_OFFSET + NEURAL_HIDDEN_COUNT
export const OUTPUT_OFFSET = HIDDEN_B_OFFSET + NEURAL_HIDDEN_COUNT
export const NETWORK_NODE_COUNT = OUTPUT_OFFSET + NEURAL_OUTPUT_COUNT
export const ATTENTION_CLUSTER_SIZE = 5
export const LAYER_Z = [-1.45, -0.72, 0.02, 0.72, 1.42] as const
export const BACKPROP_FORWARD_SECONDS = 2.15
export const GRADIENT_DURATION_SECONDS = 3.05
export const GRADIENT_SEGMENTS_PER_PATH = 6
export const ISOLATION_PATH_SEGMENTS = 18
export const MAX_ISOLATION_PATHS = 12
export const INPUT_COLOR = new THREE.Color('#8cf9ff')
export const HIDDEN_A_COLOR = new THREE.Color('#5dffcf')
export const HIDDEN_B_COLOR = new THREE.Color('#8da8ff')
export const HIDDEN_A_PEAK_COLOR = new THREE.Color('#c5ffed')
export const HIDDEN_B_PEAK_COLOR = new THREE.Color('#d5dcff')
export const OUTPUT_COLOR = new THREE.Color('#e7ffff')
export const WINNER_COLOR = new THREE.Color('#ffe28a')
export const GRADIENT_PURPLE = new THREE.Color('#9d55ff')
export const GRADIENT_GOLD = new THREE.Color('#ffb64a')
export const GRADIENT_EMBER = new THREE.Color('#ff655f')
export const ZERO_Y = new THREE.Vector3(0, 1, 0)
export const BASE_LOGITS = [
  0.28,
  0.42,
  0.36,
  0.61,
  0.47,
  0.56,
  0.31,
  0.44,
] as const

export interface NeuralLayout {
  nodePositions: THREE.Vector3[]
  inputPositions: THREE.Vector3[]
  attentionPositions: THREE.Vector3[]
  hiddenAPositions: THREE.Vector3[]
  hiddenBPositions: THREE.Vector3[]
  outputPositions: THREE.Vector3[]
  clusterPositions: Float32Array[]
  layerRailGeometry: THREE.BufferGeometry
}

export interface AttentionBeamGeometry {
  geometry: THREE.TubeGeometry
  pathIndex: number
  sourceToken: number
  headIndex: number
  weight: number
}

export interface SynapticPath {
  curve: THREE.CubicBezierCurve3
  stage: number
  sourceNode: number
  targetNode: number
  headIndex: number
  weight: number
}

export interface NeuralNetwork {
  pathList: SynapticPath[]
  pathsByStage: number[][]
  outgoingPathsByNode: number[][]
  incomingPathsByNode: number[][]
  fiberGeometry: THREE.BufferGeometry
  attentionBeams: AttentionBeamGeometry[]
  gradientFibers: GradientFiberState
}

export interface PhotonState {
  pathIndices: Int32Array
  progress: Float32Array
  speeds: Float32Array
  stages: Uint8Array
  seeds: Float32Array
  directions: Uint8Array
}

export interface GradientFiberState {
  count: number
  centers: Float32Array
  quaternions: Float32Array
  lengths: Float32Array
  pathIndices: Uint16Array
  coordinates: Float32Array
}

export interface IsolationHighlightGeometry {
  geometry: THREE.BufferGeometry
  positionValues: Float32Array
  colorValues: Float32Array
  positionAttribute: THREE.BufferAttribute
  colorAttribute: THREE.BufferAttribute
}

export interface NeuralInspectorPanel {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = clamp01(
    (value - edge0) / Math.max(0.0001, edge1 - edge0),
  )
  return normalized * normalized * (3 - 2 * normalized)
}

export function deterministic(index: number) {
  return (
    Math.abs(
      (Math.sin(index * 12.9898 + 78.233) * 43_758.5453) %
        1,
    ) || 0.37
  )
}

export function createCubicCurve(
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

export function createLayerRailGeometry() {
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

export function createNeuralLayout(): NeuralLayout {
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

export function attentionWeight(token: number, head: number) {
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

export function appendCurveToFiber(
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

export function createGradientFiberState(
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

export function createSynapticNetwork(layout: NeuralLayout): NeuralNetwork {
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

export function createPhotonState(network: NeuralNetwork): PhotonState {
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

export function createIsolationHighlightGeometry(): IsolationHighlightGeometry {
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

export function createNeuralInspectorPanel(): NeuralInspectorPanel | null {
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

export function drawNeuralInspectorPanel(
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
