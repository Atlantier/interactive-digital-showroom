import * as THREE from 'three'
import { MAX_FLARES, MAX_SEGMENTS } from '../../../utils/rayMazeSolver'
import {
  PHOTON_BEAM_BEGIN_VERTEX,
  PHOTON_BEAM_COLOR_FRAGMENT,
  PHOTON_BEAM_FRAGMENT_COMMON,
  PHOTON_BEAM_VERTEX_COMMON,
} from '../../../shaders/rayBounceMaze'

export const SPARKS_PER_FLARE = 6
export const TARGET_PARTICLES_PER_TARGET = 20
export const TABLE_MIN_X = -1.72
export const TABLE_MAX_X = 1.72
export const TABLE_MIN_Y = -0.95
export const TABLE_MAX_Y = 0.95
const FLARE_LINES = 4
export interface PowerLabelTexture {
  context: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
  lastText: string
}

export function createGridGeometry() {
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

export function createBeamLineGeometry() {
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

export function createFlareGeometry() {
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

export function createSparkGeometry() {
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

export function createTargetParticleGeometry() {
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

export function createPowerLabelTexture(): PowerLabelTexture | null {
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

export function paintPowerLabel(
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

export function createPhotonBeamMaterial(
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
        PHOTON_BEAM_VERTEX_COMMON,
      )
      .replace(
        '#include <begin_vertex>',
        PHOTON_BEAM_BEGIN_VERTEX,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        PHOTON_BEAM_FRAGMENT_COMMON,
      )
      .replace(
        '#include <color_fragment>',
        PHOTON_BEAM_COLOR_FRAGMENT,
      )
  }
  material.customProgramCacheKey = () =>
    `ray-bounce-photon-${opacity.toFixed(2)}`
  return material
}
