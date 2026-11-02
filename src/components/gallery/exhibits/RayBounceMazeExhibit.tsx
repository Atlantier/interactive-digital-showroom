import { useFrame, useThree } from '@react-three/fiber'
import {
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react'
import * as THREE from 'three'
import { getVfxPreset } from '../../../data/vfxPresets'
import {
  formatTranslation,
  useI18n,
} from '../../../i18n/useI18n'
import { useAppStore } from '../../../store/useAppStore'
import {
  useGalleryStore,
  type ExhibitMeta,
} from '../../../store/useGalleryStore'
import { getEffectiveGalleryTimeScale } from '../../../utils/motionPreferences'
import { wavelengthToRgb } from '../../../utils/optics'
import type { GalleryPointerState } from '../OpticalExhibitScene'

const MAX_RAY_DEPTH = 10
const MAX_SEGMENTS = 220
const MAX_FLARES = 72
const SPARKS_PER_FLARE = 6
const FLARE_LINES = 4
const TARGET_PARTICLES_PER_TARGET = 20
const LAYOUT_TWEEN_DURATION = 0.9
const TABLE_MIN_X = -1.72
const TABLE_MAX_X = 1.72
const TABLE_MIN_Y = -0.95
const TABLE_MAX_Y = 0.95
const RAY_EPSILON = 0.005
const PROPAGATION_ATTENUATION = 0.018
const TARGET_CORE_RADIUS = 0.045
const ZERO_DIRECTION = new THREE.Vector3(0, 1, 0)
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

type OpticalElementType =
  | 'emitter'
  | 'mirror'
  | 'splitter'
  | 'prism'

type RayHitKind =
  | 'boundary'
  | 'mirror'
  | 'splitter'
  | 'prism'
  | 'target'

interface OpticalElement {
  id: 'emitter' | 'mirror-a' | 'mirror-b' | 'splitter' | 'prism'
  type: OpticalElementType
  x: number
  y: number
  angle: number
  ringRadius: number
  length: number
  hitRadius: number
}

interface PhotonTarget {
  id: 'target-a' | 'target-b' | 'target-c'
  x: number
  y: number
  radius: number
}

interface RaySolverConfig {
  gain: number
  dispersion: number
  sourceR: number
  sourceG: number
  sourceB: number
}

interface InteractionGrab {
  elementIndex: number
  mode: 'translate' | 'rotate'
  startX: number
  startY: number
  elementX: number
  elementY: number
  startAngle: number
  pointerAngle: number
}

interface LayoutPose {
  x: number
  y: number
  angle: number
}

interface PowerLabelTexture {
  context: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
  lastText: string
}

const RAY_MAZE_LAYOUTS: readonly (readonly LayoutPose[])[] = [
  [
    { x: -1.46, y: 0.04, angle: 0 },
    {
      x: 0.15,
      y: 0.235,
      angle: THREE.MathUtils.degToRad(51),
    },
    {
      x: 0.15,
      y: -0.135,
      angle: THREE.MathUtils.degToRad(-51),
    },
    {
      x: 0.55,
      y: 0.04,
      angle: THREE.MathUtils.degToRad(45),
    },
    { x: -0.72, y: 0.04, angle: 0 },
  ],
  [
    { x: -1.46, y: 0.04, angle: 0 },
    {
      x: 0.15,
      y: 0.235,
      angle: THREE.MathUtils.degToRad(135),
    },
    {
      x: 0.15,
      y: -0.135,
      angle: THREE.MathUtils.degToRad(-135),
    },
    {
      x: 0.55,
      y: 0.04,
      angle: THREE.MathUtils.degToRad(120),
    },
    { x: -0.72, y: 0.04, angle: 0 },
  ],
  [
    { x: -1.46, y: 0.04, angle: 0 },
    {
      x: -0.617,
      y: 0.58,
      angle: THREE.MathUtils.degToRad(45),
    },
    {
      x: 0.85,
      y: 0.62,
      angle: THREE.MathUtils.degToRad(-45),
    },
    {
      x: -0.45,
      y: 0.04,
      angle: THREE.MathUtils.degToRad(45),
    },
    { x: 0.85, y: 0.04, angle: 0 },
  ],
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function createOpticalElements(): OpticalElement[] {
  return [
    {
      id: 'emitter',
      type: 'emitter',
      x: -1.46,
      y: 0.04,
      angle: 0,
      ringRadius: 0.22,
      length: 0.34,
      hitRadius: 0.11,
    },
    {
      id: 'mirror-a',
      type: 'mirror',
      x: 0.15,
      y: 0.235,
      angle: THREE.MathUtils.degToRad(51),
      ringRadius: 0.28,
      length: 0.42,
      hitRadius: 0.075,
    },
    {
      id: 'mirror-b',
      type: 'mirror',
      x: 0.15,
      y: -0.135,
      angle: THREE.MathUtils.degToRad(-51),
      ringRadius: 0.28,
      length: 0.42,
      hitRadius: 0.075,
    },
    {
      id: 'splitter',
      type: 'splitter',
      x: 0.55,
      y: 0.04,
      angle: THREE.MathUtils.degToRad(45),
      ringRadius: 0.27,
      length: 0.23,
      hitRadius: 0.115,
    },
    {
      id: 'prism',
      type: 'prism',
      x: -0.72,
      y: 0.04,
      angle: 0,
      ringRadius: 0.25,
      length: 0.34,
      hitRadius: 0.18,
    },
  ]
}

function createPhotonTargets(): PhotonTarget[] {
  return [
    {
      id: 'target-a',
      x: 0.15,
      y: 0.82,
      radius: 0.12,
    },
    {
      id: 'target-b',
      x: 0.4,
      y: 0.82,
      radius: 0.12,
    },
    {
      id: 'target-c',
      x: 1.48,
      y: 0.04,
      radius: 0.12,
    },
  ]
}

function createGridGeometry() {
  const positions: number[] = []
  const colors: number[] = []
  const minor = new THREE.Color('#21413f')
  const major = new THREE.Color('#5ebeb0')

  for (let index = -34; index <= 34; index += 1) {
    const x = index * 0.05
    const color = index % 5 === 0 ? major : minor
    positions.push(x, TABLE_MIN_Y, -0.028, x, TABLE_MAX_Y, -0.028)
    colors.push(
      color.r,
      color.g,
      color.b,
      color.r,
      color.g,
      color.b,
    )
  }
  for (let index = -18; index <= 18; index += 1) {
    const y = index * 0.05
    const color = index % 5 === 0 ? major : minor
    positions.push(TABLE_MIN_X, y, -0.028, TABLE_MAX_X, y, -0.028)
    colors.push(
      color.r,
      color.g,
      color.b,
      color.r,
      color.g,
      color.b,
    )
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

function createBeamLineGeometry() {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(MAX_SEGMENTS * 6)
  const colors = new Float32Array(MAX_SEGMENTS * 6)
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  )
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(colors, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  )
  geometry.setDrawRange(0, 0)
  return geometry
}

function createFlareGeometry() {
  const geometry = new THREE.BufferGeometry()
  const capacity = MAX_FLARES * FLARE_LINES * 2
  const positions = new Float32Array(capacity * 3)
  const colors = new Float32Array(capacity * 3)
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  )
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(colors, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  )
  geometry.setDrawRange(0, 0)
  return geometry
}

function createSparkGeometry() {
  const geometry = new THREE.BufferGeometry()
  const capacity = MAX_FLARES * SPARKS_PER_FLARE
  const positions = new Float32Array(capacity * 3)
  const colors = new Float32Array(capacity * 3)
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  )
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(colors, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  )
  geometry.setDrawRange(0, 0)
  return geometry
}

function createTargetParticleGeometry() {
  const geometry = new THREE.BufferGeometry()
  const capacity =
    TARGET_PARTICLES_PER_TARGET * 3
  const positions = new Float32Array(capacity * 3)
  const colors = new Float32Array(capacity * 3)
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  )
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(colors, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  )
  geometry.setDrawRange(0, 0)
  return geometry
}

function createPowerLabelTexture(): PowerLabelTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 112
  const context = canvas.getContext('2d')
  if (!context) return null
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return {
    context,
    texture,
    lastText: '',
  }
}

function paintPowerLabel(
  label: PowerLabelTexture,
  text: string,
) {
  if (label.lastText === text) return
  const { context, texture } = label
  context.clearRect(0, 0, 512, 112)
  context.fillStyle = 'rgba(2, 10, 10, 0.86)'
  context.fillRect(7, 10, 498, 92)
  context.strokeStyle = 'rgba(96, 255, 194, 0.72)'
  context.lineWidth = 2
  context.shadowColor = 'rgba(80, 255, 190, 0.45)'
  context.shadowBlur = 15
  context.strokeRect(8, 11, 496, 90)
  context.shadowBlur = 0
  context.font = '600 32px "JetBrains Mono", monospace'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#dcfff2'
  context.fillText(text, 256, 56)
  label.lastText = text
  texture.needsUpdate = true
}

function DialTicks({
  radius,
  majorColor,
  minorColor,
}: {
  radius: number
  majorColor: string
  minorColor: string
}) {
  const geometry = useMemo(() => {
    const positions: number[] = []
    const colors: number[] = []
    const major = new THREE.Color(majorColor)
    const minor = new THREE.Color(minorColor)
    for (let index = 0; index < 16; index += 1) {
      const angle = (index / 16) * Math.PI * 2
      const isMajor = index % 4 === 0
      const innerRadius =
        radius - (isMajor ? 0.043 : 0.025)
      const color = isMajor ? major : minor
      positions.push(
        Math.cos(angle) * innerRadius,
        Math.sin(angle) * innerRadius,
        0.047,
        Math.cos(angle) * (radius + 0.006),
        Math.sin(angle) * (radius + 0.006),
        0.047,
      )
      colors.push(
        color.r,
        color.g,
        color.b,
        color.r,
        color.g,
        color.b,
      )
    }
    const nextGeometry = new THREE.BufferGeometry()
    nextGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    )
    nextGeometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3),
    )
    return nextGeometry
  }, [majorColor, minorColor, radius])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.58}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  )
}

function createPhotonBeamMaterial(
  timeUniform: { value: number },
  opacity: number,
) {
  const material = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRayTime = timeUniform
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vRayUv;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRayUv = uv;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uRayTime;
        varying vec2 vRayUv;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float photonPulse = pow(
          0.5 + 0.5 * sin(vRayUv.y * 46.0 - uRayTime * 18.0),
          10.0
        );
        float photonFilament = pow(
          0.5 + 0.5 * sin(vRayUv.x * 6.2831),
          5.0
        );
        diffuseColor.rgb *= 0.72 + photonPulse * 1.55;
        diffuseColor.a *= 0.78 + photonPulse * 0.22;
        diffuseColor.rgb *= 0.62 + photonFilament * 0.38;`,
      )
  }
  material.customProgramCacheKey = () =>
    `ray-bounce-photon-${opacity.toFixed(2)}`
  return material
}

class RecursiveRaySolver {
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
    elements: OpticalElement[],
    targets: PhotonTarget[],
    config: RaySolverConfig,
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
    const startX =
      source.x + Math.cos(source.angle) * (source.length * 0.54)
    const startY =
      source.y + Math.sin(source.angle) * (source.length * 0.54)
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
    elements: OpticalElement[],
    targets: PhotonTarget[],
    config: RaySolverConfig,
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
      if (
        hit > RAY_EPSILON &&
        hit < this.nearestT
      ) {
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
    mirror: OpticalElement,
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

function OpticalElementAssembly({
  element,
  index,
  registerGroup,
  registerRingMaterial,
  primary,
  secondary,
  tertiary,
}: {
  element: OpticalElement
  index: number
  registerGroup: (
    index: number,
    group: THREE.Group | null,
  ) => void
  registerRingMaterial: (
    index: number,
    material: THREE.MeshBasicMaterial | null,
  ) => void
  primary: string
  secondary: string
  tertiary: string
}) {
  return (
    <group
      ref={(group) => registerGroup(index, group)}
      position={[element.x, element.y, 0.075]}
      rotation={[0, 0, element.angle]}
    >
      {element.type === 'mirror' ? (
        <>
          <mesh>
            <boxGeometry args={[element.length, 0.075, 0.13]} />
            <meshStandardMaterial
              color="#c8fdf3"
              emissive={primary}
              emissiveIntensity={0.18}
              metalness={1}
              roughness={0.08}
            />
          </mesh>
          <mesh position={[0, 0, 0.071]}>
            <boxGeometry args={[element.length * 0.92, 0.01, 0.03]} />
            <meshBasicMaterial
              color="#ecfffd"
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, -0.045]}>
            <cylinderGeometry args={[0.045, 0.055, 0.08, 16]} />
            <meshStandardMaterial
              color="#233b3b"
              metalness={0.8}
              roughness={0.3}
            />
          </mesh>
        </>
      ) : null}

      {element.type === 'splitter' ? (
        <>
          <mesh>
            <boxGeometry
              args={[
                element.length,
                element.length,
                0.16,
              ]}
            />
            <meshPhysicalMaterial
              color="#a8fff1"
              emissive={secondary}
              emissiveIntensity={0.24}
              transparent
              opacity={0.3}
              roughness={0.08}
              metalness={0.12}
              transmission={0.24}
              thickness={0.2}
            />
          </mesh>
          <mesh scale={1.015}>
            <boxGeometry
              args={[
                element.length,
                element.length,
                0.16,
              ]}
            />
            <meshBasicMaterial
              color={secondary}
              wireframe
              transparent
              opacity={0.7}
              toneMapped={false}
            />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <planeGeometry
              args={[
                element.length * 0.9,
                element.length * 0.9,
              ]}
            />
            <meshBasicMaterial
              color="#eaffff"
              transparent
              opacity={0.1}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </>
      ) : null}

      {element.type === 'prism' ? (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry
              args={[
                element.hitRadius,
                element.hitRadius,
                0.13,
                3,
              ]}
            />
            <meshPhysicalMaterial
              color="#b4fff2"
              emissive={tertiary}
              emissiveIntensity={0.18}
              transparent
              opacity={0.42}
              roughness={0.05}
              metalness={0}
              transmission={0.46}
              thickness={0.3}
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} scale={1.01}>
            <cylinderGeometry
              args={[
                element.hitRadius,
                element.hitRadius,
                0.13,
                3,
              ]}
            />
            <meshBasicMaterial
              color="#dfffff"
              wireframe
              transparent
              opacity={0.6}
              toneMapped={false}
            />
          </mesh>
        </>
      ) : null}

      {element.type === 'emitter' ? (
        <>
          <mesh position={[-0.035, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <cylinderGeometry args={[0.075, 0.09, 0.3, 18]} />
            <meshStandardMaterial
              color="#17272a"
              emissive={primary}
              emissiveIntensity={0.16}
              metalness={0.84}
              roughness={0.24}
            />
          </mesh>
          <mesh position={[0.13, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <cylinderGeometry args={[0.052, 0.068, 0.08, 18]} />
            <meshBasicMaterial
              color="#dffff9"
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0.176, 0, 0]}>
            <sphereGeometry args={[0.028, 16, 12]} />
            <meshBasicMaterial
              color="#ffffff"
              toneMapped={false}
            />
          </mesh>
        </>
      ) : null}

      <mesh position={[0, 0, -0.03]}>
        <cylinderGeometry
          args={[0.075, 0.095, 0.045, 20]}
        />
        <meshStandardMaterial
          color="#0a1213"
          metalness={0.7}
          roughness={0.2}
        />
      </mesh>
      <mesh position={[0, 0, 0.075]}>
        <sphereGeometry args={[0.017, 12, 8]} />
        <meshBasicMaterial
          color={secondary}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <torusGeometry args={[element.ringRadius, 0.006, 6, 64]} />
        <meshBasicMaterial
          ref={(material) =>
            registerRingMaterial(index, material)
          }
          color={secondary}
          transparent
          opacity={0.34}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <DialTicks
        radius={element.ringRadius}
        majorColor={primary}
        minorColor={tertiary}
      />
      <mesh
        position={[element.ringRadius, 0, 0.05]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <coneGeometry args={[0.022, 0.07, 3]} />
        <meshBasicMaterial
          color={primary}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

export function RayBounceMazeExhibit({
  exhibit,
  pointerRef,
  mode = 'pedestal',
}: {
  exhibit: ExhibitMeta
  pointerRef: RefObject<GalleryPointerState>
  mode?: 'pedestal' | 'darkroom'
}) {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const { t } = useI18n()
  const rayMazeCopy = t.gallery.rayMazeInteraction
  const performanceTier = useAppStore(
    (state) => state.performanceTier,
  )
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const activeExhibitId = useGalleryStore(
    (state) => state.activeExhibitId,
  )
  const rayMazeLayoutIndex = useGalleryStore(
    (state) => state.rayMazeLayoutIndex,
  )
  const rayMazeShufflePulse = useGalleryStore(
    (state) => state.rayMazeShufflePulse,
  )
  const palette = useMemo(() => getVfxPreset(vfxPreset), [vfxPreset])
  const highDetail = performanceTier === 'high'
  const interactionActive =
    mode === 'darkroom'
      ? activeExhibitId === 'photonic-mesh'
      : activeExhibitId === null
  const wavelength = exhibit.params.wavelength ?? 532
  const gain = exhibit.params.gain ?? 1.05
  const dispersion = exhibit.params.phase ?? 0.18
  const sourceColor = useMemo(() => {
    const rgb = wavelengthToRgb(wavelength)
    return {
      r: rgb.r / 255,
      g: rgb.g / 255,
      b: rgb.b / 255,
    }
  }, [wavelength])
  const elements = useMemo(() => {
    const nextElements = createOpticalElements()
    const layout =
      RAY_MAZE_LAYOUTS[
        useGalleryStore.getState().rayMazeLayoutIndex
      ] ?? RAY_MAZE_LAYOUTS[0]
    for (let index = 0; index < nextElements.length; index += 1) {
      const pose = layout[index]
      if (!pose) continue
      nextElements[index].x = pose.x
      nextElements[index].y = pose.y
      nextElements[index].angle = pose.angle
    }
    return nextElements
  }, [])
  const targets = useMemo(createPhotonTargets, [])
  const solver = useMemo(() => new RecursiveRaySolver(), [])
  const tableGroupRef = useRef<THREE.Group>(null)
  const elementGroupRefs = useRef<Array<THREE.Group | null>>([])
  const ringMaterialRefs =
    useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const targetGroupRefs = useRef<Array<THREE.Group | null>>([])
  const targetRingMaterialRefs =
    useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const targetCoreMaterialRefs =
    useRef<Array<THREE.MeshPhysicalMaterial | null>>([])
  const targetPowerSpriteRefs =
    useRef<Array<THREE.Sprite | null>>([])
  const targetLightRefs = useRef<Array<THREE.PointLight | null>>([])
  const beamLinesRef = useRef<THREE.LineSegments>(null)
  const outerBeamRef = useRef<THREE.InstancedMesh>(null)
  const mediumBeamRef = useRef<THREE.InstancedMesh>(null)
  const coreBeamRef = useRef<THREE.InstancedMesh>(null)
  const flareLinesRef = useRef<THREE.LineSegments>(null)
  const sparkPointsRef = useRef<THREE.Points>(null)
  const targetParticlesRef = useRef<THREE.Points>(null)
  const activeGrabRef = useRef<InteractionGrab | null>(null)
  const hoveringIdRef = useRef<string | null>(null)
  const previousDraggingRef = useRef(false)
  const lastRayMazePulseRef = useRef(rayMazeShufflePulse)
  const layoutTweenRef = useRef({
    active: false,
    startedAt: 0,
    fromX: new Float32Array(elements.length),
    fromY: new Float32Array(elements.length),
    fromAngle: new Float32Array(elements.length),
  })
  const dataUpdateRef = useRef(0)
  const hostRef = useRef<HTMLElement | null>(null)
  const gridGeometry = useMemo(createGridGeometry, [])
  const beamLineGeometry = useMemo(createBeamLineGeometry, [])
  const flareGeometry = useMemo(createFlareGeometry, [])
  const sparkGeometry = useMemo(createSparkGeometry, [])
  const targetParticleGeometry = useMemo(
    createTargetParticleGeometry,
    [],
  )
  const targetPowerLabels = useMemo(
    () =>
      targets.map(() => createPowerLabelTexture()),
    [targets],
  )
  const beamTimeUniform = useMemo(() => ({ value: 0 }), [])
  const outerBeamMaterial = useMemo(
    () => createPhotonBeamMaterial(beamTimeUniform, 0.055),
    [beamTimeUniform],
  )
  const mediumBeamMaterial = useMemo(
    () => createPhotonBeamMaterial(beamTimeUniform, 0.18),
    [beamTimeUniform],
  )
  const coreBeamMaterial = useMemo(
    () => createPhotonBeamMaterial(beamTimeUniform, 0.72),
    [beamTimeUniform],
  )
  const interaction = useMemo(
    () => ({
      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2(),
      plane: new THREE.Plane(),
      worldNormal: new THREE.Vector3(),
      worldOrigin: new THREE.Vector3(),
      worldHit: new THREE.Vector3(),
      localHit: new THREE.Vector3(),
      projected: new THREE.Vector3(),
      inverseMatrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
      matrix: new THREE.Matrix4(),
      color: new THREE.Color(),
      highlight: new THREE.Color('#ffffff'),
      targetDark: new THREE.Color('#263237'),
      targetEmerald: new THREE.Color('#51ffc1'),
      targetSpark: new THREE.Color('#9dffe0'),
    }),
    [],
  )

  useEffect(
    () => () => {
      gridGeometry.dispose()
      beamLineGeometry.dispose()
      flareGeometry.dispose()
      sparkGeometry.dispose()
      targetParticleGeometry.dispose()
      targetPowerLabels.forEach((label) => label?.texture.dispose())
      outerBeamMaterial.dispose()
      mediumBeamMaterial.dispose()
      coreBeamMaterial.dispose()
      outerBeamRef.current?.dispose()
      mediumBeamRef.current?.dispose()
      coreBeamRef.current?.dispose()
    },
    [
      beamLineGeometry,
      coreBeamMaterial,
      flareGeometry,
      gridGeometry,
      mediumBeamMaterial,
      outerBeamMaterial,
      sparkGeometry,
      targetParticleGeometry,
      targetPowerLabels,
    ],
  )

  useEffect(() => {
    const initializeInstanceColors = (
      mesh: THREE.InstancedMesh | null,
    ) => {
      if (!mesh) return
      const color = new THREE.Color('#ffffff')
      for (let index = 0; index < MAX_SEGMENTS; index += 1) {
        mesh.setColorAt(index, color)
      }
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true
      }
    }
    initializeInstanceColors(outerBeamRef.current)
    initializeInstanceColors(mediumBeamRef.current)
    initializeInstanceColors(coreBeamRef.current)
  }, [])

  useEffect(() => {
    if (!interactionActive) return
    const host = gl.domElement.closest<HTMLElement>(
      '[data-gallery-shared-canvas]',
    )
    if (!host) return
    hostRef.current = host
    host.dataset.rayBounceMaze = 'recursive-cpu-max-depth-10'
    host.dataset.rayBounceMode = mode
    host.dataset.rayBounceTargets = String(targets.length)
    host.dataset.rayBounceOptics = String(elements.length)
    host.dataset.rayBouncePhotonFlow =
      'gaussian-volumetric-instanced-pulse'
    host.dataset.rayBounceInteraction =
      'direct-body-drag-and-dial-rotation'
    return () => {
      delete host.dataset.rayBounceMaze
      delete host.dataset.rayBounceMode
      delete host.dataset.rayBounceTargets
      delete host.dataset.rayBounceOptics
      delete host.dataset.rayBouncePhotonFlow
      delete host.dataset.rayBounceInteraction
      delete host.dataset.rayBounceDepth
      delete host.dataset.rayBounceSegments
      delete host.dataset.rayBounceBranches
      delete host.dataset.rayBounceTargetHits
      delete host.dataset.rayBounceTargetsActive
      delete host.dataset.rayBounceTargetMask
      delete host.dataset.rayBounceCelebrationParticles
      delete host.dataset.rayBounceLockedPower
      delete host.dataset.rayBounceFlares
      delete host.dataset.rayBounceSelected
      delete host.dataset.rayBounceDragMode
      delete host.dataset.rayBounceElements
      delete host.dataset.rayBouncePointer
      delete host.dataset.rayBounceLayout
      delete host.dataset.rayBounceTransition
      hostRef.current = null
    }
  }, [elements, gl, interactionActive, mode, targets])

  useFrame((state, delta) => {
    if (!interactionActive) return
    const timeScale = getEffectiveGalleryTimeScale(
      useGalleryStore.getState().timeScale,
    )
    const time = state.clock.elapsedTime * timeScale
    const safeDelta = Math.min(delta, 0.05)
    const pointer = pointerRef.current
    const group = tableGroupRef.current
    if (!group) return

    if (
      rayMazeShufflePulse !== lastRayMazePulseRef.current
    ) {
      lastRayMazePulseRef.current = rayMazeShufflePulse
      const tween = layoutTweenRef.current
      tween.active = true
      tween.startedAt = state.clock.elapsedTime
      for (let index = 0; index < elements.length; index += 1) {
        tween.fromX[index] = elements[index].x
        tween.fromY[index] = elements[index].y
        tween.fromAngle[index] = elements[index].angle
      }
      activeGrabRef.current = null
    }

    const layoutTween = layoutTweenRef.current
    if (layoutTween.active) {
      const layout =
        RAY_MAZE_LAYOUTS[
          clamp(rayMazeLayoutIndex, 0, RAY_MAZE_LAYOUTS.length - 1)
        ] ?? RAY_MAZE_LAYOUTS[0]
      const progress = clamp(
        (state.clock.elapsedTime - layoutTween.startedAt) /
          LAYOUT_TWEEN_DURATION,
        0,
        1,
      )
      const eased = 1 - (1 - progress) ** 3
      for (let index = 0; index < elements.length; index += 1) {
        const pose = layout[index]
        if (!pose) continue
        elements[index].x =
          layoutTween.fromX[index] +
          (pose.x - layoutTween.fromX[index]) * eased
        elements[index].y =
          layoutTween.fromY[index] +
          (pose.y - layoutTween.fromY[index]) * eased
        elements[index].angle =
          layoutTween.fromAngle[index] +
          wrapAngle(
            pose.angle - layoutTween.fromAngle[index],
          ) *
            eased
      }
      if (progress >= 1) {
        layoutTween.active = false
      }
    }

    group.updateWorldMatrix(true, false)
    interaction.mouse.set(pointer.u, pointer.v)
    interaction.raycaster.setFromCamera(
      interaction.mouse,
      camera,
    )
    interaction.inverseMatrix.copy(group.matrixWorld).invert()
    interaction.worldOrigin
      .set(0, 0, 0)
      .applyMatrix4(group.matrixWorld)
    interaction.worldNormal
      .set(0, 0, 1)
      .transformDirection(group.matrixWorld)
    interaction.plane.setFromNormalAndCoplanarPoint(
      interaction.worldNormal,
      interaction.worldOrigin,
    )
    const planeHit = interaction.raycaster.ray.intersectPlane(
      interaction.plane,
      interaction.worldHit,
    )
    if (planeHit) {
      interaction.localHit
        .copy(planeHit)
        .applyMatrix4(interaction.inverseMatrix)
    }

    const pickElement = (x: number, y: number) => {
      for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index]
        const offsetX = x - element.x
        const offsetY = y - element.y
        const distance = Math.hypot(offsetX, offsetY)
        if (Math.abs(distance - element.ringRadius) <= 0.048) {
          return {
            elementIndex: index,
            mode: 'rotate' as const,
          }
        }
        const cosine = Math.cos(-element.angle)
        const sine = Math.sin(-element.angle)
        const localX = offsetX * cosine - offsetY * sine
        const localY = offsetX * sine + offsetY * cosine
        const bodyHit =
          element.type === 'mirror'
            ? Math.abs(localX) <= element.length * 0.56 &&
              Math.abs(localY) <= element.hitRadius
            : element.type === 'splitter'
              ? Math.abs(localX) <= element.hitRadius * 1.05 &&
                Math.abs(localY) <= element.hitRadius * 1.05
              : Math.hypot(localX, localY) <=
                element.hitRadius * 1.1
        if (bodyHit) {
          return {
            elementIndex: index,
            mode: 'translate' as const,
          }
        }
      }
      return null
    }

    if (planeHit && pointer.active) {
      const hover = pickElement(
        interaction.localHit.x,
        interaction.localHit.y,
      )
      hoveringIdRef.current = hover
        ? elements[hover.elementIndex].id
        : null
    } else {
      hoveringIdRef.current = null
    }

    if (
      pointer.dragging &&
      !previousDraggingRef.current &&
      planeHit
    ) {
      const pick = pickElement(
        interaction.localHit.x,
        interaction.localHit.y,
      )
      if (pick) {
        const element = elements[pick.elementIndex]
        layoutTweenRef.current.active = false
        activeGrabRef.current = {
          elementIndex: pick.elementIndex,
          mode: pick.mode,
          startX: interaction.localHit.x,
          startY: interaction.localHit.y,
          elementX: element.x,
          elementY: element.y,
          startAngle: element.angle,
          pointerAngle: Math.atan2(
            interaction.localHit.y - element.y,
            interaction.localHit.x - element.x,
          ),
        }
      } else {
        activeGrabRef.current = null
      }
    }

    if (!pointer.dragging) {
      activeGrabRef.current = null
    }
    previousDraggingRef.current = pointer.dragging

    const grab = activeGrabRef.current
    if (grab && pointer.dragging && planeHit) {
      const element = elements[grab.elementIndex]
      if (grab.mode === 'translate') {
        element.x = clamp(
          grab.elementX +
            interaction.localHit.x -
            grab.startX,
          TABLE_MIN_X + element.ringRadius,
          TABLE_MAX_X - element.ringRadius,
        )
        element.y = clamp(
          grab.elementY +
            interaction.localHit.y -
            grab.startY,
          TABLE_MIN_Y + element.ringRadius,
          TABLE_MAX_Y - element.ringRadius,
        )
      } else {
        const pointerAngle = Math.atan2(
          interaction.localHit.y - element.y,
          interaction.localHit.x - element.x,
        )
        element.angle =
          grab.startAngle +
          wrapAngle(pointerAngle - grab.pointerAngle)
      }
    }

    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index]
      const elementGroup = elementGroupRefs.current[index]
      if (elementGroup) {
        elementGroup.position.set(
          element.x,
          element.y,
          0.075,
        )
        elementGroup.rotation.z = element.angle
      }
      const ringMaterial = ringMaterialRefs.current[index]
      if (ringMaterial) {
        const highlighted =
          hoveringIdRef.current === element.id ||
          grab?.elementIndex === index
        interaction.color
          .set(palette.secondary)
          .lerp(
            interaction.highlight,
            highlighted ? 0.62 : 0.08,
          )
        ringMaterial.color.copy(interaction.color)
        ringMaterial.opacity = highlighted ? 0.88 : 0.34
      }
    }

    solver.run(elements, targets, {
      gain,
      dispersion,
      sourceR: sourceColor.r,
      sourceG: sourceColor.g,
      sourceB: sourceColor.b,
    })

    const beamPosition = beamLineGeometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute
    const beamColor = beamLineGeometry.getAttribute(
      'color',
    ) as THREE.BufferAttribute
    for (let index = 0; index < solver.segmentCount; index += 1) {
      const offset = index * 6
      beamPosition.array[offset] = solver.segmentStartX[index]
      beamPosition.array[offset + 1] = solver.segmentStartY[index]
      beamPosition.array[offset + 2] = 0.105
      beamPosition.array[offset + 3] = solver.segmentEndX[index]
      beamPosition.array[offset + 4] = solver.segmentEndY[index]
      beamPosition.array[offset + 5] = 0.105
      const energyBoost =
        0.46 + Math.min(1, solver.segmentEnergy[index]) * 0.54
      beamColor.array[offset] =
        solver.segmentR[index] * energyBoost
      beamColor.array[offset + 1] =
        solver.segmentG[index] * energyBoost
      beamColor.array[offset + 2] =
        solver.segmentB[index] * energyBoost
      beamColor.array[offset + 3] =
        solver.segmentR[index] * energyBoost
      beamColor.array[offset + 4] =
        solver.segmentG[index] * energyBoost
      beamColor.array[offset + 5] =
        solver.segmentB[index] * energyBoost
    }
    beamLineGeometry.setDrawRange(0, solver.segmentCount * 2)
    beamPosition.needsUpdate = true
    beamColor.needsUpdate = true

    const updateBeamInstances = (
      mesh: THREE.InstancedMesh | null,
      radius: number,
    ) => {
      if (!mesh) return
      for (let index = 0; index < solver.segmentCount; index += 1) {
        const startX = solver.segmentStartX[index]
        const startY = solver.segmentStartY[index]
        const endX = solver.segmentEndX[index]
        const endY = solver.segmentEndY[index]
        const deltaX = endX - startX
        const deltaY = endY - startY
        const length = Math.max(0.0001, Math.hypot(deltaX, deltaY))
        interaction.direction
          .set(deltaX / length, deltaY / length, 0)
        interaction.position.set(
          (startX + endX) * 0.5,
          (startY + endY) * 0.5,
          0.085,
        )
        interaction.quaternion.setFromUnitVectors(
          ZERO_DIRECTION,
          interaction.direction,
        )
        interaction.scale.set(radius, length, radius)
        interaction.matrix.compose(
          interaction.position,
          interaction.quaternion,
          interaction.scale,
        )
        mesh.setMatrixAt(index, interaction.matrix)
        if (mesh.instanceColor) {
          const energy = solver.segmentEnergy[index]
          mesh.instanceColor.setXYZ(
            index,
            solver.segmentR[index] * (0.72 + energy * 0.28),
            solver.segmentG[index] * (0.72 + energy * 0.28),
            solver.segmentB[index] * (0.72 + energy * 0.28),
          )
        }
      }
      mesh.count = solver.segmentCount
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true
      }
    }
    updateBeamInstances(outerBeamRef.current, 0.032)
    updateBeamInstances(mediumBeamRef.current, 0.018)
    updateBeamInstances(coreBeamRef.current, 0.009)
    beamTimeUniform.value = time

    const flarePosition = flareGeometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute
    const flareColor = flareGeometry.getAttribute(
      'color',
    ) as THREE.BufferAttribute
    let flareVertex = 0
    const flareDirections = [
      [1, 0],
      [0, 1],
      [Math.SQRT1_2, Math.SQRT1_2],
      [Math.SQRT1_2, -Math.SQRT1_2],
    ] as const
    for (let index = 0; index < solver.flareCount; index += 1) {
      const pulse =
        1 +
        Math.sin(time * 18 + index * 2.3) * 0.16 +
        solver.flareEnergy[index] * 0.22
      const radius =
        (0.035 + solver.flareEnergy[index] * 0.045) * pulse
      for (
        let lineIndex = 0;
        lineIndex < flareDirections.length;
        lineIndex += 1
      ) {
        const direction = flareDirections[lineIndex]
        const inner = 0.008
        const outer = radius
        const offset = flareVertex * 3
        flarePosition.array[offset] =
          solver.flareX[index] +
          direction[0] * inner
        flarePosition.array[offset + 1] =
          solver.flareY[index] +
          direction[1] * inner
        flarePosition.array[offset + 2] = 0.12
        flarePosition.array[offset + 3] =
          solver.flareX[index] +
          direction[0] * outer
        flarePosition.array[offset + 4] =
          solver.flareY[index] +
          direction[1] * outer
        flarePosition.array[offset + 5] = 0.12
        const energy = 0.42 + solver.flareEnergy[index] * 0.58
        for (let vertex = 0; vertex < 2; vertex += 1) {
          const colorOffset = offset + vertex * 3
          flareColor.array[colorOffset] =
            solver.flareR[index] * energy
          flareColor.array[colorOffset + 1] =
            solver.flareG[index] * energy
          flareColor.array[colorOffset + 2] =
            solver.flareB[index] * energy
        }
        flareVertex += 2
      }
    }
    flareGeometry.setDrawRange(0, flareVertex)
    flarePosition.needsUpdate = true
    flareColor.needsUpdate = true

    const sparkPosition = sparkGeometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute
    const sparkColor = sparkGeometry.getAttribute(
      'color',
    ) as THREE.BufferAttribute
    let sparkIndex = 0
    for (let index = 0; index < solver.flareCount; index += 1) {
      for (
        let particleIndex = 0;
        particleIndex < SPARKS_PER_FLARE;
        particleIndex += 1
      ) {
        const angle =
          index * 2.399 +
          particleIndex * 2.617 +
          time * 0.45
        const spread =
          0.018 +
          ((time * 0.18 +
            particleIndex * 0.17 +
            index * 0.09) %
            1) *
            (0.1 + solver.flareEnergy[index] * 0.08)
        const offset = sparkIndex * 3
        sparkPosition.array[offset] =
          solver.flareX[index] + Math.cos(angle) * spread
        sparkPosition.array[offset + 1] =
          solver.flareY[index] + Math.sin(angle) * spread
        sparkPosition.array[offset + 2] = 0.125
        const fade = 1 - spread / 0.2
        sparkColor.array[offset] =
          solver.flareR[index] * Math.max(0, fade)
        sparkColor.array[offset + 1] =
          solver.flareG[index] * Math.max(0, fade)
        sparkColor.array[offset + 2] =
          solver.flareB[index] * Math.max(0, fade)
        sparkIndex += 1
      }
    }
    sparkGeometry.setDrawRange(0, sparkIndex)
    sparkPosition.needsUpdate = true
    sparkColor.needsUpdate = true

    for (let index = 0; index < targets.length; index += 1) {
      const targetEnergy = solver.targetEnergy[index]
      const locked = solver.targetLocked[index] === 1
      const targetGroup = targetGroupRefs.current[index]
      const ringMaterial = targetRingMaterialRefs.current[index]
      const coreMaterial = targetCoreMaterialRefs.current[index]
      const powerSprite = targetPowerSpriteRefs.current[index]
      const powerLabel = targetPowerLabels[index]
      const light = targetLightRefs.current[index]
      if (targetGroup) {
        targetGroup.scale.setScalar(
          1 +
            (locked
              ? 0.08 +
                Math.sin(time * 11 + index) * 0.035
              : 0),
        )
        targetGroup.rotation.z =
          time * (locked ? 1.4 : 0.12) + index * 0.8
      }
      if (ringMaterial) {
        interaction.color
          .set(palette.tertiary)
          .lerp(
            interaction.highlight,
            locked ? clamp(targetEnergy, 0, 1) : 0.06,
          )
        ringMaterial.color.copy(interaction.color)
        ringMaterial.opacity = locked ? 0.96 : 0.24
      }
      if (coreMaterial) {
        coreMaterial.color.lerpColors(
          interaction.targetDark,
          interaction.targetEmerald,
          locked ? 1 : 0,
        )
        coreMaterial.emissive.copy(interaction.targetEmerald)
        coreMaterial.emissiveIntensity = locked
          ? 2.4 + Math.sin(time * 9 + index) * 0.35
          : 0.035
      }
      if (powerSprite) {
        const power = Math.max(
          0,
          Math.round(targetEnergy * 1_000),
        )
        const powerText = locked
          ? formatTranslation(rayMazeCopy.powerLocked, {
              power,
            })
          : rayMazeCopy.powerStandby
        powerSprite.visible = locked
        if (locked && powerLabel) {
          paintPowerLabel(powerLabel, powerText)
        }
      }
      if (light) {
        light.intensity = locked
          ? 2.2 + targetEnergy * 5.5
          : 0.18
      }
    }

    const targetParticlePosition =
      targetParticleGeometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute
    const targetParticleColor =
      targetParticleGeometry.getAttribute(
        'color',
      ) as THREE.BufferAttribute
    let targetParticleIndex = 0
    for (let index = 0; index < targets.length; index += 1) {
      if (solver.targetLocked[index] === 0) continue
      const target = targets[index]
      for (
        let particleIndex = 0;
        particleIndex < TARGET_PARTICLES_PER_TARGET;
        particleIndex += 1
      ) {
        const life =
          (time * 0.72 +
            particleIndex * 0.137 +
            index * 0.19) %
          1
        const angle =
          particleIndex * 2.399 + index * 1.7 + time * 0.32
        const spread =
          (0.012 + life * 0.11) *
          (0.5 + (particleIndex % 3) * 0.24)
        const offset = targetParticleIndex * 3
        targetParticlePosition.array[offset] =
          target.x + Math.cos(angle) * spread
        targetParticlePosition.array[offset + 1] =
          target.y +
          0.04 +
          life * (0.22 + (particleIndex % 4) * 0.045)
        targetParticlePosition.array[offset + 2] =
          0.15 + life * 0.035
        const fade = Math.max(0, 1 - life)
        targetParticleColor.array[offset] =
          interaction.targetSpark.r * fade
        targetParticleColor.array[offset + 1] =
          interaction.targetSpark.g * fade
        targetParticleColor.array[offset + 2] =
          interaction.targetSpark.b * fade
        targetParticleIndex += 1
      }
    }
    targetParticleGeometry.setDrawRange(0, targetParticleIndex)
    targetParticlePosition.needsUpdate = true
    targetParticleColor.needsUpdate = true

    if (
      beamLinesRef.current &&
      outerBeamRef.current &&
      mediumBeamRef.current &&
      coreBeamRef.current &&
      flareLinesRef.current &&
      sparkPointsRef.current &&
      targetParticlesRef.current
    ) {
      beamLinesRef.current.renderOrder = 8
      outerBeamRef.current.renderOrder = 6
      mediumBeamRef.current.renderOrder = 7
      coreBeamRef.current.renderOrder = 8
      beamLinesRef.current.renderOrder = 9
      flareLinesRef.current.renderOrder = 10
      sparkPointsRef.current.renderOrder = 10
      targetParticlesRef.current.renderOrder = 11
    }

    dataUpdateRef.current += safeDelta
    const host = hostRef.current
    if (host && dataUpdateRef.current >= 0.08) {
      dataUpdateRef.current = 0
      host.dataset.rayBounceDepth = String(
        solver.maxDepthSeen,
      )
      host.dataset.rayBounceMode = mode
      host.dataset.rayBounceSegments = String(
        solver.segmentCount,
      )
      host.dataset.rayBounceBranches = String(
        solver.branchCount,
      )
      host.dataset.rayBounceTargetHits = String(
        solver.targetHitCount,
      )
      let activeTargets = 0
      let targetMask = 0
      const lockedPowerReadings: string[] = []
      for (let index = 0; index < targets.length; index += 1) {
        if (solver.targetLocked[index] === 1) {
          activeTargets += 1
          targetMask |= 1 << index
          lockedPowerReadings.push(
            `${targets[index].id}:` +
              `${Math.round(solver.targetEnergy[index] * 1_000)}`,
          )
        }
      }
      host.dataset.rayBounceTargetsActive = String(activeTargets)
      host.dataset.rayBounceTargetMask = String(targetMask)
      host.dataset.rayBounceCelebrationParticles = String(
        activeTargets * TARGET_PARTICLES_PER_TARGET,
      )
      host.dataset.rayBounceLockedPower =
        lockedPowerReadings.join(',')
      host.dataset.rayBounceFlares = String(solver.flareCount)
      host.dataset.rayBounceSelected =
        grab?.elementIndex !== undefined
          ? elements[grab.elementIndex].id
          : hoveringIdRef.current ?? 'none'
      host.dataset.rayBounceDragMode = grab?.mode ?? 'none'
      host.dataset.rayBounceLayout = String(rayMazeLayoutIndex)
      host.dataset.rayBounceTransition =
        layoutTweenRef.current.active ? 'active' : 'settled'
      host.dataset.rayBouncePointer =
        `${pointer.u.toFixed(4)},` +
        `${pointer.v.toFixed(4)},` +
        `${interaction.localHit.x.toFixed(4)},` +
        interaction.localHit.y.toFixed(4)

      const stage =
        mode === 'darkroom'
          ? document.querySelector<HTMLElement>(
              '[data-darkroom-viewport]',
            )
          : document.querySelector<HTMLElement>(
              '[data-exhibit-id="photonic-mesh"] [data-gallery-stage]',
            )
      if (stage) {
        const bounds = stage.getBoundingClientRect()
        const entries = elements.map((element) => {
          const bodyProjection = interaction.projected
            .set(element.x, element.y, 0.08)
            .applyMatrix4(group.matrixWorld)
            .project(camera)
          const bodyX =
            bounds.left + (bodyProjection.x * 0.5 + 0.5) * bounds.width
          const bodyY =
            bounds.top + (-bodyProjection.y * 0.5 + 0.5) * bounds.height
          const ringProjection = interaction.projected
            .set(element.x + element.ringRadius, element.y, 0.08)
            .applyMatrix4(group.matrixWorld)
            .project(camera)
          const ringX =
            bounds.left + (ringProjection.x * 0.5 + 0.5) * bounds.width
          const ringY =
            bounds.top +
            (-ringProjection.y * 0.5 + 0.5) * bounds.height
          return {
            id: element.id,
            bodyX: Number(bodyX.toFixed(1)),
            bodyY: Number(bodyY.toFixed(1)),
            ringX: Number(ringX.toFixed(1)),
            ringY: Number(ringY.toFixed(1)),
            angle: Number(element.angle.toFixed(4)),
            x: Number(element.x.toFixed(4)),
            y: Number(element.y.toFixed(4)),
          }
        })
        host.dataset.rayBounceElements = JSON.stringify(entries)
      }
    }
  })

  return (
    <group
      ref={tableGroupRef}
      data-ray-bounce-maze={mode}
      position={[0, -0.015, 0]}
      rotation={[-0.22, 0, 0]}
      scale={mode === 'darkroom' ? 1 : 0.94}
    >
      <mesh position={[0, 0, -0.075]}>
        <boxGeometry
          args={[
            TABLE_MAX_X - TABLE_MIN_X + 0.16,
            TABLE_MAX_Y - TABLE_MIN_Y + 0.16,
            0.11,
          ]}
        />
        <meshStandardMaterial
          color="#071012"
          metalness={0.82}
          roughness={0.34}
        />
      </mesh>
      <mesh position={[0, 0, -0.015]}>
        <planeGeometry
          args={[
            TABLE_MAX_X - TABLE_MIN_X,
            TABLE_MAX_Y - TABLE_MIN_Y,
          ]}
        />
        <meshStandardMaterial
          color="#081213"
          metalness={0.64}
          roughness={0.5}
        />
      </mesh>
      <lineSegments
        geometry={gridGeometry}
        position={[0, 0, 0]}
        frustumCulled={false}
      >
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.42}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>

      {[-1, 1].map((side) => (
        <group
          key={`ruler-${side}`}
          position={[0, side * (TABLE_MAX_Y + 0.065), 0.012]}
        >
          <mesh>
            <boxGeometry
              args={[
                TABLE_MAX_X - TABLE_MIN_X,
                0.012,
                0.012,
              ]}
            />
            <meshBasicMaterial
              color={palette.secondary}
              transparent
              opacity={0.56}
              toneMapped={false}
            />
          </mesh>
          {Array.from({ length: 29 }, (_, index) => {
            const major = index % 5 === 0
            const x = TABLE_MIN_X + index * 0.12
            return (
              <mesh
                key={`${side}-${index}`}
                position={[
                  x,
                  side * (major ? 0.022 : 0.013),
                  0.013,
                ]}
              >
                <boxGeometry
                  args={[0.003, major ? 0.032 : 0.018, 0.006]}
                />
                <meshBasicMaterial
                  color={major ? '#bffef3' : palette.secondary}
                  transparent
                  opacity={major ? 0.72 : 0.34}
                  toneMapped={false}
                />
              </mesh>
            )
          })}
        </group>
      ))}

      {[
        [TABLE_MIN_X, TABLE_MIN_Y],
        [TABLE_MIN_X, TABLE_MAX_Y],
        [TABLE_MAX_X, TABLE_MIN_Y],
        [TABLE_MAX_X, TABLE_MAX_Y],
      ].map(([x, y], index) => (
        <mesh
          key={`bolt-${index}`}
          position={[x, y, 0.025]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.028, 0.028, 0.014, 12]} />
          <meshStandardMaterial
            color="#324746"
            metalness={0.92}
            roughness={0.18}
          />
        </mesh>
      ))}

      {/* Concentric additive shells approximate a Gaussian beam profile. */}
      <instancedMesh
        ref={outerBeamRef}
        args={[undefined, undefined, MAX_SEGMENTS]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, highDetail ? 10 : 7, 1, true]} />
        <primitive
          object={outerBeamMaterial}
          attach="material"
        />
      </instancedMesh>
      <instancedMesh
        ref={mediumBeamRef}
        args={[undefined, undefined, MAX_SEGMENTS]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, highDetail ? 10 : 7, 1, true]} />
        <primitive
          object={mediumBeamMaterial}
          attach="material"
        />
      </instancedMesh>
      <instancedMesh
        ref={coreBeamRef}
        args={[undefined, undefined, MAX_SEGMENTS]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, highDetail ? 8 : 6, 1, true]} />
        <primitive
          object={coreBeamMaterial}
          attach="material"
        />
      </instancedMesh>
      <lineSegments
        ref={beamLinesRef}
        geometry={beamLineGeometry}
        frustumCulled={false}
      >
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.96}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>
      <lineSegments
        ref={flareLinesRef}
        geometry={flareGeometry}
        frustumCulled={false}
      >
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.92}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>
      <points
        ref={sparkPointsRef}
        geometry={sparkGeometry}
        frustumCulled={false}
      >
        <pointsMaterial
          vertexColors
          size={0.024}
          sizeAttenuation
          transparent
          opacity={0.88}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>

      {elements.map((element, index) => (
        <OpticalElementAssembly
          key={element.id}
          element={element}
          index={index}
          primary={palette.primary}
          secondary={palette.secondary}
          tertiary={palette.tertiary}
          registerGroup={(targetIndex, group) => {
            elementGroupRefs.current[targetIndex] = group
          }}
          registerRingMaterial={(targetIndex, material) => {
            ringMaterialRefs.current[targetIndex] = material
          }}
        />
      ))}

      {targets.map((target, index) => (
        <group
          key={target.id}
          ref={(group) => {
            targetGroupRefs.current[index] = group
          }}
          position={[target.x, target.y, 0.06]}
        >
          <mesh>
            <circleGeometry args={[target.radius * 1.08, 40]} />
            <meshStandardMaterial
              color="#091716"
              emissive={palette.tertiary}
              emissiveIntensity={0.12}
              metalness={0.68}
              roughness={0.32}
            />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <ringGeometry
              args={[target.radius * 0.6, target.radius, 40]}
            />
            <meshBasicMaterial
              ref={(material) => {
                targetRingMaterialRefs.current[index] = material
              }}
              color={palette.tertiary}
              transparent
              opacity={0.36}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, 0.028]}>
            <octahedronGeometry args={[target.radius * 0.32, 0]} />
            <meshPhysicalMaterial
              ref={(material) => {
                targetCoreMaterialRefs.current[index] = material
              }}
              color="#263237"
              emissive="#51ffc1"
              emissiveIntensity={0.035}
              metalness={0.55}
              roughness={0.16}
              clearcoat={0.9}
              clearcoatRoughness={0.12}
            />
          </mesh>
          <mesh position={[0, 0, 0.021]}>
            <ringGeometry
              args={[target.radius * 1.08, target.radius * 1.13, 40]}
            />
            <meshBasicMaterial
              color={palette.secondary}
              transparent
              opacity={0.22}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <sprite
            ref={(sprite) => {
              targetPowerSpriteRefs.current[index] = sprite
            }}
            position={[
              0,
              target.radius + 0.12 + (index === 1 ? 0.1 : 0),
              0.14,
            ]}
            scale={[0.42, 0.092, 1]}
            visible={false}
            renderOrder={12}
          >
            <spriteMaterial
              map={targetPowerLabels[index]?.texture ?? null}
              transparent
              opacity={0.94}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
          <pointLight
            ref={(light) => {
              targetLightRefs.current[index] = light
            }}
            color={palette.tertiary}
            intensity={0.18}
            distance={0.65}
            decay={2}
          />
        </group>
      ))}

      <points
        ref={targetParticlesRef}
        geometry={targetParticleGeometry}
        frustumCulled={false}
        renderOrder={11}
      >
        <pointsMaterial
          vertexColors
          size={0.022}
          sizeAttenuation
          transparent
          opacity={0.92}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>

      <pointLight
        position={[-1.4, 0.04, 0.25]}
        color={palette.primary}
        intensity={1.8}
        distance={1.8}
        decay={2}
      />
      <pointLight
        position={[0.4, 0.76, 0.48]}
        color={palette.secondary}
        intensity={1.15}
        distance={1.5}
        decay={2}
      />
      <ambientLight intensity={0.2} color={palette.tertiary} />
    </group>
  )
}
