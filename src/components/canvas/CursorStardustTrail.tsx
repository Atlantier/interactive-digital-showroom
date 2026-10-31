import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getVfxPreset } from '../../data/vfxPresets'
import { setParticleSourceCount } from '../../store/performanceTelemetry'
import {
  readTransientState,
  useAppStore,
} from '../../store/useAppStore'

export const CURSOR_STARDUST_COUNT = 4000
export const SHOCKWAVE_PARTICLE_COUNT = 150
export const LIGHT_RIBBON_HISTORY_SIZE = 24

const LIGHT_RIBBON_SUBDIVISIONS = 3
const LIGHT_RIBBON_SAMPLE_COUNT =
  (LIGHT_RIBBON_HISTORY_SIZE - 1) * LIGHT_RIBBON_SUBDIVISIONS + 1
const LIGHT_RIBBON_VERTEX_COUNT = LIGHT_RIBBON_SAMPLE_COUNT * 2
const MAX_EMISSIONS_PER_FRAME = 180
const MIN_SEGMENT_DISTANCE = 0.002
const CURSOR_PLANE_DISTANCE = 6.35
const MIN_FRAME_DELTA = 1 / 240
const SHOCKWAVE_DURATION = 0.72
const SHOCKWAVE_PARTICLE_DURATION = 1.2

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uMotionScale;
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uTertiary;

  attribute vec3 aVelocity;
  attribute float aBirth;
  attribute float aLife;
  attribute float aSeed;
  attribute float aSize;
  attribute float aEnergy;
  attribute float aBurst;

  varying vec3 vColor;
  varying float vGlow;
  varying float vLife;
  varying float vBurst;

  const float PI = 3.141592653589793;

  float hash31(vec3 point) {
    point = fract(point * 0.1031);
    point += dot(point, point.yzx + 33.33);
    return fract((point.x + point.y) * point.z);
  }

  float noise3(vec3 point) {
    vec3 cell = floor(point);
    vec3 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);

    float n000 = hash31(cell);
    float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));

    float x00 = mix(n000, n100, local.x);
    float x10 = mix(n010, n110, local.x);
    float x01 = mix(n001, n101, local.x);
    float x11 = mix(n011, n111, local.x);

    return mix(
      mix(x00, x10, local.y),
      mix(x01, x11, local.y),
      local.z
    );
  }

  vec3 curlNoiseApprox(vec3 point) {
    vec3 fieldA = vec3(
      noise3(point),
      noise3(point + vec3(13.17, 7.41, 3.73)),
      noise3(point + vec3(29.31, 17.83, 11.29))
    ) - 0.5;
    vec3 fieldB = vec3(
      noise3(point * 1.63 + vec3(5.11, 19.07, 23.89)),
      noise3(point * 1.41 + vec3(31.13, 2.71, 15.37)),
      noise3(point * 1.87 + vec3(9.19, 37.03, 7.61))
    ) - 0.5;

    return normalize(cross(fieldA, fieldB) + vec3(0.00001));
  }

  void main() {
    float age = max(0.0, uTime - aBirth);
    float life = clamp(age / max(aLife, 0.0001), 0.0, 1.0);

    if (aLife <= 0.0 || life >= 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vColor = vec3(0.0);
      vGlow = 0.0;
      vLife = 1.0;
      vBurst = 0.0;
      return;
    }

    float burst = clamp(aBurst, 0.0, 1.0);
    float speedEnergy = clamp(aEnergy, 0.0, 1.0);
    float turbulenceScale =
      uMotionScale *
      mix(0.72 + speedEnergy * 0.58, 0.24, burst);
    vec3 flow = curlNoiseApprox(
      position * 0.42 +
      vec3(
        aSeed * 31.7,
        uTime * (0.11 + aSeed * 0.06),
        -uTime * 0.045
      )
    );

    float spiralAngle =
      age * (1.45 + aSeed * 2.35) +
      aSeed * 6.2831853;
    vec3 spiral = vec3(
      cos(spiralAngle),
      sin(spiralAngle * 0.57) * 0.34,
      sin(spiralAngle)
    ) * (0.016 + life * 0.085) * (1.0 - burst * 0.7);

    float burstTravel =
      (1.0 - exp(-age * 2.8)) / 2.8;
    float travel = mix(age, burstTravel, burst);
    vec3 transformed = position + aVelocity * travel;
    transformed +=
      flow *
      (0.045 + age * (0.04 + speedEnergy * 0.07)) *
      turbulenceScale;
    transformed += spiral * turbulenceScale;
    transformed.y +=
      age *
      (0.13 + speedEnergy * 0.17) *
      uMotionScale *
      (1.0 - burst * 0.82);

    vec4 modelViewPosition =
      modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;

    float stardustSize = sin(PI * life);
    float burstSize =
      smoothstep(0.0, 0.07, life) *
      (1.0 - smoothstep(0.72, 1.0, life));
    float sizeCurve = mix(stardustSize, burstSize, burst);
    float speedScale =
      0.82 + speedEnergy * 0.76 + burst * 0.22;
    gl_PointSize = clamp(
      aSize *
      uPixelRatio *
      (8.5 / max(1.0, -modelViewPosition.z)) *
      sizeCurve *
      speedScale,
      0.0,
      36.0 * uPixelRatio
    );

    float birthHeat =
      1.0 - smoothstep(0.015, 0.18, life);
    vec3 primary = uPrimary;
    vec3 secondary = uSecondary;
    vec3 tertiary = uTertiary;

    vec3 color = mix(
      vec3(1.65, 2.0, 2.15),
      secondary,
      smoothstep(0.0, 0.1, life)
    );
    color = mix(
      color,
      primary,
      smoothstep(0.1, 0.44, life)
    );
    color = mix(
      color,
      tertiary,
      smoothstep(0.56, 1.0, life)
    );
    color = mix(
      color,
      vec3(1.4, 1.8, 1.9),
      birthHeat * (0.22 + speedEnergy * 0.3)
    );

    float sparkSelector = step(0.5, aSeed);
    vec3 sparkColor = mix(
      tertiary * 1.22,
      secondary * 1.35,
      sparkSelector
    );
    float sparkLife = 1.0 - smoothstep(0.38, 0.94, life);
    color = mix(color, sparkColor, burst * sparkLife * 0.88);

    float flicker =
      mix(
        1.0,
        0.64 +
          0.36 *
          sin(age * (44.0 + aSeed * 22.0) + aSeed * 71.0),
        burst
      );

    vColor = color * (0.9 + speedEnergy * 0.5);
    vGlow =
      sizeCurve *
      (0.52 + speedEnergy * 0.7 + birthHeat * 0.34) *
      flicker;
    vLife = life;
    vBurst = burst;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uSecondary;
  uniform vec3 uTertiary;

  varying vec3 vColor;
  varying float vGlow;
  varying float vLife;
  varying float vBurst;

  void main() {
    vec2 centered = gl_PointCoord - 0.5;
    float radialSquared = dot(centered, centered) * 4.0;
    float halo = exp(-5.5 * radialSquared);
    float core = exp(-22.0 * radialSquared);
    float tailSoftness = mix(0.64, 0.38, vLife);
    float alpha =
      (halo * tailSoftness + core * 0.72) * vGlow;

    if (alpha < 0.006) discard;

    vec3 luminous =
      vColor * (0.82 + core * 2.6) +
      mix(
        uSecondary * 1.08,
        uTertiary * 1.42,
        vBurst
      ) *
      core *
      0.48;
    gl_FragColor = vec4(luminous, alpha);
  }
`

const ribbonVertexShader = /* glsl */ `
  uniform float uSampleCount;

  attribute float aIndex;
  attribute float aEdge;

  varying float vTrail;
  varying float vEdge;

  void main() {
    vTrail =
      clamp(aIndex / max(1.0, uSampleCount - 1.0), 0.0, 1.0);
    vEdge = aEdge;
    gl_Position =
      projectionMatrix *
      modelViewMatrix *
      vec4(position, 1.0);
  }
`

const ribbonFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uTertiary;

  varying float vTrail;
  varying float vEdge;

  const float PI = 3.141592653589793;

  void main() {
    float crossSection =
      sin(PI * clamp(vEdge, 0.0, 1.0));
    float head = smoothstep(0.08, 1.0, vTrail);
    float pulsePosition =
      fract(vTrail * 2.2 - uTime * 0.72);
    float pulse =
      pow(1.0 - abs(pulsePosition * 2.0 - 1.0), 18.0);
    float shimmer =
      0.82 +
      0.18 * sin(vTrail * 46.0 - uTime * 8.4);

    vec3 white = vec3(1.25, 1.65, 1.72);

    vec3 color = mix(
      uTertiary,
      uSecondary,
      smoothstep(0.04, 0.82, vTrail)
    );
    color = mix(
      color,
      white,
      pow(vTrail, 5.0) * 0.72
    );
    color += uPrimary * pulse * head * 0.46;

    float alpha =
      uOpacity *
      crossSection *
      (0.04 + head * 0.34) *
      shimmer;
    gl_FragColor = vec4(color * (0.92 + pulse * 0.5), alpha);
  }
`

const shockwaveVertexShader = /* glsl */ `
  uniform float uProgress;

  varying vec2 vLocalPosition;

  void main() {
    vec3 transformed = position;
    float angle = atan(position.y, position.x);
    float radius = length(position.xy);
    transformed.z +=
      sin(angle * 8.0 - uProgress * 18.0) * 0.035 +
      sin(radius * 34.0 - uProgress * 12.0) * 0.018;

    vLocalPosition = position.xy;
    gl_Position =
      projectionMatrix *
      modelViewMatrix *
      vec4(transformed, 1.0);
  }
`

const shockwaveFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uOpacity;
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uTertiary;

  varying vec2 vLocalPosition;

  void main() {
    float radius = length(vLocalPosition);
    float angle = atan(vLocalPosition.y, vLocalPosition.x);
    float spectral =
      0.5 +
      0.5 *
      sin(
        angle * 7.0 +
        uProgress * 15.0 +
        radius * 24.0 +
        uTime * 1.8
      );
    float radialBands =
      0.72 +
      0.28 *
      sin(radius * 88.0 - uProgress * 22.0);
    float edgeFade =
      smoothstep(0.78, 0.84, radius) *
      (1.0 - smoothstep(0.96, 1.0, radius));

    vec3 color = mix(uSecondary, uPrimary, spectral);
    color = mix(color, uTertiary, 0.1 + spectral * 0.12);
    color *= 0.76 + radialBands * 0.46;

    float alpha =
      uOpacity *
      edgeFade *
      radialBands *
      (0.28 + spectral * 0.32);
    gl_FragColor = vec4(color, alpha);
  }
`

function createParticleSystem(particleCount: number) {
  const positions = new Float32Array(particleCount * 3)
  const velocities = new Float32Array(particleCount * 3)
  const births = new Float32Array(particleCount)
  const lifetimes = new Float32Array(particleCount)
  const seeds = new Float32Array(particleCount)
  const sizes = new Float32Array(particleCount)
  const energies = new Float32Array(particleCount)
  const bursts = new Float32Array(particleCount)

  const geometry = new THREE.BufferGeometry()
  const positionAttribute = new THREE.BufferAttribute(positions, 3)
  const velocityAttribute = new THREE.BufferAttribute(velocities, 3)
  const birthAttribute = new THREE.BufferAttribute(births, 1)
  const lifetimeAttribute = new THREE.BufferAttribute(lifetimes, 1)
  const seedAttribute = new THREE.BufferAttribute(seeds, 1)
  const sizeAttribute = new THREE.BufferAttribute(sizes, 1)
  const energyAttribute = new THREE.BufferAttribute(energies, 1)
  const burstAttribute = new THREE.BufferAttribute(bursts, 1)

  positionAttribute.setUsage(THREE.DynamicDrawUsage)
  velocityAttribute.setUsage(THREE.DynamicDrawUsage)
  birthAttribute.setUsage(THREE.DynamicDrawUsage)
  lifetimeAttribute.setUsage(THREE.DynamicDrawUsage)
  seedAttribute.setUsage(THREE.DynamicDrawUsage)
  sizeAttribute.setUsage(THREE.DynamicDrawUsage)
  energyAttribute.setUsage(THREE.DynamicDrawUsage)
  burstAttribute.setUsage(THREE.DynamicDrawUsage)

  geometry.setAttribute('position', positionAttribute)
  geometry.setAttribute('aVelocity', velocityAttribute)
  geometry.setAttribute('aBirth', birthAttribute)
  geometry.setAttribute('aLife', lifetimeAttribute)
  geometry.setAttribute('aSeed', seedAttribute)
  geometry.setAttribute('aSize', sizeAttribute)
  geometry.setAttribute('aEnergy', energyAttribute)
  geometry.setAttribute('aBurst', burstAttribute)
  geometry.setDrawRange(0, particleCount)

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uMotionScale: { value: 1 },
      uPrimary: { value: new THREE.Color('#10b981') },
      uSecondary: { value: new THREE.Color('#72e6ff') },
      uTertiary: { value: new THREE.Color('#a7f3d0') },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })

  const points = new THREE.Points(geometry, material)
  points.name = 'CursorStardustTrail'
  points.frustumCulled = false
  points.renderOrder = 2
  points.userData.kind = 'cursor-stardust-trail'
  points.userData.particleCount = particleCount

  const ribbonHistory = new Float32Array(
    LIGHT_RIBBON_HISTORY_SIZE * 3,
  )
  const ribbonSamples = new Float32Array(
    LIGHT_RIBBON_SAMPLE_COUNT * 3,
  )
  const ribbonPositions = new Float32Array(
    LIGHT_RIBBON_VERTEX_COUNT * 3,
  )
  const ribbonIndexValues = new Float32Array(
    LIGHT_RIBBON_VERTEX_COUNT,
  )
  const ribbonEdges = new Float32Array(LIGHT_RIBBON_VERTEX_COUNT)
  const ribbonIndices = new Uint16Array(
    (LIGHT_RIBBON_SAMPLE_COUNT - 1) * 6,
  )

  for (let index = 0; index < LIGHT_RIBBON_SAMPLE_COUNT; index += 1) {
    const vertexOffset = index * 2
    ribbonIndexValues[vertexOffset] = index
    ribbonIndexValues[vertexOffset + 1] = index
    ribbonEdges[vertexOffset] = 0
    ribbonEdges[vertexOffset + 1] = 1
  }

  for (
    let index = 0;
    index < LIGHT_RIBBON_SAMPLE_COUNT - 1;
    index += 1
  ) {
    const vertexOffset = index * 2
    const indexOffset = index * 6
    ribbonIndices[indexOffset] = vertexOffset
    ribbonIndices[indexOffset + 1] = vertexOffset + 1
    ribbonIndices[indexOffset + 2] = vertexOffset + 2
    ribbonIndices[indexOffset + 3] = vertexOffset + 1
    ribbonIndices[indexOffset + 4] = vertexOffset + 3
    ribbonIndices[indexOffset + 5] = vertexOffset + 2
  }

  const ribbonGeometry = new THREE.BufferGeometry()
  const ribbonPositionAttribute = new THREE.BufferAttribute(
    ribbonPositions,
    3,
  )
  ribbonPositionAttribute.setUsage(THREE.DynamicDrawUsage)
  ribbonGeometry.setAttribute('position', ribbonPositionAttribute)
  ribbonGeometry.setAttribute(
    'aIndex',
    new THREE.BufferAttribute(ribbonIndexValues, 1),
  )
  ribbonGeometry.setAttribute(
    'aEdge',
    new THREE.BufferAttribute(ribbonEdges, 1),
  )
  ribbonGeometry.setIndex(
    new THREE.BufferAttribute(ribbonIndices, 1),
  )
  ribbonGeometry.setDrawRange(0, 0)

  const ribbonMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSampleCount: { value: 0 },
      uPrimary: { value: new THREE.Color('#10b981') },
      uSecondary: { value: new THREE.Color('#72e6ff') },
      uTertiary: { value: new THREE.Color('#a7f3d0') },
    },
    vertexShader: ribbonVertexShader,
    fragmentShader: ribbonFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  })

  const ribbonMesh = new THREE.Mesh(ribbonGeometry, ribbonMaterial)
  ribbonMesh.name = 'CursorLightRibbon'
  ribbonMesh.frustumCulled = false
  ribbonMesh.renderOrder = 1.8
  ribbonMesh.visible = false
  ribbonMesh.userData.historySize = LIGHT_RIBBON_HISTORY_SIZE

  const shockwaveGeometry = new THREE.RingGeometry(
    0.78,
    1,
    160,
    3,
  )
  const shockwaveMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
      uPrimary: { value: new THREE.Color('#10b981') },
      uSecondary: { value: new THREE.Color('#72e6ff') },
      uTertiary: { value: new THREE.Color('#a7f3d0') },
    },
    vertexShader: shockwaveVertexShader,
    fragmentShader: shockwaveFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  const shockwaveMesh = new THREE.Mesh(
    shockwaveGeometry,
    shockwaveMaterial,
  )
  shockwaveMesh.name = 'ClickShockwaveRing'
  shockwaveMesh.frustumCulled = false
  shockwaveMesh.renderOrder = 3
  shockwaveMesh.visible = false

  return {
    points,
    geometry,
    material,
    positionAttribute,
    velocityAttribute,
    birthAttribute,
    lifetimeAttribute,
    seedAttribute,
    sizeAttribute,
    energyAttribute,
    burstAttribute,
    positions,
    velocities,
    births,
    lifetimes,
    seeds,
    sizes,
    energies,
    bursts,
    ribbonHistory,
    ribbonSamples,
    ribbonPositions,
    ribbonMesh,
    ribbonGeometry,
    ribbonMaterial,
    ribbonPositionAttribute,
    shockwaveMesh,
    shockwaveGeometry,
    shockwaveMaterial,
    scratch: {
      raycaster: new THREE.Raycaster(),
      plane: new THREE.Plane(),
      pointerNdc: new THREE.Vector2(),
      burstNdc: new THREE.Vector2(),
      cameraForward: new THREE.Vector3(),
      cameraRight: new THREE.Vector3(1, 0, 0),
      cameraPlanePoint: new THREE.Vector3(),
      cursorWorld: new THREE.Vector3(),
      previousCursorWorld: new THREE.Vector3(),
      burstWorld: new THREE.Vector3(),
      shockwaveOrigin: new THREE.Vector3(),
      segmentDirection: new THREE.Vector3(),
      emissionPoint: new THREE.Vector3(),
      ribbonTangent: new THREE.Vector3(),
      ribbonSide: new THREE.Vector3(),
    },
  }
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = Math.min(
    1,
    Math.max(0, (value - edge0) / (edge1 - edge0)),
  )
  return normalized * normalized * (3 - 2 * normalized)
}

function writeCatmullRomSample(
  history: Float32Array,
  segmentIndex: number,
  pointCount: number,
  interpolation: number,
  target: Float32Array,
  targetOffset: number,
) {
  const p0Offset = Math.max(0, segmentIndex - 1) * 3
  const p1Offset = segmentIndex * 3
  const p2Offset = (segmentIndex + 1) * 3
  const p3Offset = Math.min(pointCount - 1, segmentIndex + 2) * 3
  const t2 = interpolation * interpolation
  const t3 = t2 * interpolation
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + interpolation
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2

  for (let component = 0; component < 3; component += 1) {
    const p0 = history[p0Offset + component]
    const p1 = history[p1Offset + component]
    const p2 = history[p2Offset + component]
    const p3 = history[p3Offset + component]
    target[targetOffset + component] =
      h00 * p1 +
      h10 * 0.5 * (p2 - p0) +
      h01 * p2 +
      h11 * 0.5 * (p3 - p1)
  }
}

export function CursorStardustTrail() {
  const particleSystem = useMemo(
    () => createParticleSystem(CURSOR_STARDUST_COUNT),
    [],
  )
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const performanceTier = useAppStore((state) => state.performanceTier)
  const viewportWidth = useThree((state) => state.size.width)
  const invalidate = useThree((state) => state.invalidate)
  const activeParticleCount =
    performanceTier === 'high' && viewportWidth >= 768
      ? CURSOR_STARDUST_COUNT
      : Math.round(CURSOR_STARDUST_COUNT / 2)
  const pointerState = useRef({
    hasPrevious: false,
    lastNdcX: 0,
    lastNdcY: 0,
    randomState: 19349663,
    ribbonCount: 0,
    ribbonOpacity: 0,
    lastMoveTime: -1,
  })
  const burstRequest = useRef({
    pending: false,
    x: 0,
    y: 0,
  })
  const shockwaveState = useRef({
    active: false,
    startedAt: 0,
    animationUntil: 0,
  })
  const disposalTimer = useRef<number | null>(null)
  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const {
    points,
    geometry,
    material,
    positionAttribute,
    velocityAttribute,
    birthAttribute,
    lifetimeAttribute,
    seedAttribute,
    sizeAttribute,
    energyAttribute,
    burstAttribute,
    positions,
    velocities,
    births,
    lifetimes,
    seeds,
    sizes,
    energies,
    bursts,
    ribbonHistory,
    ribbonSamples,
    ribbonPositions,
    ribbonMesh,
    ribbonGeometry,
    ribbonMaterial,
    ribbonPositionAttribute,
    shockwaveMesh,
    shockwaveGeometry,
    shockwaveMaterial,
    scratch,
  } = particleSystem

  useEffect(() => {
    geometry.setDrawRange(0, activeParticleCount)
    points.userData.particleCount = activeParticleCount
    material.userData.ringIndex = 0
    births.fill(0)
    lifetimes.fill(0)
    energies.fill(0)
    bursts.fill(0)
    positions.fill(0)
    velocities.fill(0)
    positionAttribute.needsUpdate = true
    velocityAttribute.needsUpdate = true
    birthAttribute.needsUpdate = true
    lifetimeAttribute.needsUpdate = true
    energyAttribute.needsUpdate = true
    burstAttribute.needsUpdate = true
    setParticleSourceCount('cursor-stardust', activeParticleCount)
    return () => setParticleSourceCount('cursor-stardust', 0)
  }, [
    activeParticleCount,
    birthAttribute,
    births,
    burstAttribute,
    bursts,
    energyAttribute,
    energies,
    geometry,
    lifetimeAttribute,
    lifetimes,
    material,
    points,
    positionAttribute,
    positions,
    velocityAttribute,
    velocities,
  ])

  useEffect(() => {
    const preset = getVfxPreset(vfxPreset)
    for (const targetMaterial of [
      material,
      ribbonMaterial,
      shockwaveMaterial,
    ]) {
      ;(targetMaterial.uniforms.uPrimary.value as THREE.Color).set(
        preset.primary,
      )
      ;(targetMaterial.uniforms.uSecondary.value as THREE.Color).set(
        preset.secondary,
      )
      ;(targetMaterial.uniforms.uTertiary.value as THREE.Color).set(
        preset.tertiary,
      )
    }
  }, [material, ribbonMaterial, shockwaveMaterial, vfxPreset])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return

      const visualViewport = window.visualViewport
      const width =
        visualViewport?.width ??
        document.documentElement.clientWidth ??
        window.innerWidth
      const height =
        visualViewport?.height ??
        document.documentElement.clientHeight ??
        window.innerHeight
      const offsetLeft = visualViewport?.offsetLeft ?? 0
      const offsetTop = visualViewport?.offsetTop ?? 0

      burstRequest.current.pending = true
      burstRequest.current.x =
        ((event.clientX - offsetLeft) / Math.max(1, width)) * 2 - 1
      burstRequest.current.y =
        1 -
        ((event.clientY - offsetTop) / Math.max(1, height)) * 2
      invalidate()
    }

    window.addEventListener('pointerdown', handlePointerDown, {
      capture: true,
      passive: true,
    })

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, {
        capture: true,
      })
    }
  }, [invalidate])

  useEffect(() => {
    if (disposalTimer.current !== null) {
      window.clearTimeout(disposalTimer.current)
      disposalTimer.current = null
    }

    return () => {
      // Deferring avoids StrictMode's simulated cleanup disposing the live scene.
      disposalTimer.current = window.setTimeout(() => {
        points.removeFromParent()
        geometry.dispose()
        material.dispose()
        ribbonMesh.removeFromParent()
        ribbonGeometry.dispose()
        ribbonMaterial.dispose()
        shockwaveMesh.removeFromParent()
        shockwaveGeometry.dispose()
        shockwaveMaterial.dispose()
        disposalTimer.current = null
      }, 0)
    }
  }, [
    geometry,
    material,
    points,
    ribbonGeometry,
    ribbonMaterial,
    ribbonMesh,
    shockwaveGeometry,
    shockwaveMaterial,
    shockwaveMesh,
  ])

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime
    const transient = readTransientState()
    const motionScale = reducedMotion ? 0.2 : 1
    const safeDelta = Math.max(
      MIN_FRAME_DELTA,
      Math.min(delta, 0.1),
    )

    material.uniforms.uTime.value = time
    material.uniforms.uPixelRatio.value = state.viewport.dpr
    material.uniforms.uMotionScale.value = motionScale
    ribbonMaterial.uniforms.uTime.value = time
    shockwaveMaterial.uniforms.uTime.value = time

    state.camera.updateMatrixWorld()
    state.camera.getWorldDirection(scratch.cameraForward)
    state.camera.getWorldPosition(scratch.cameraPlanePoint)
    scratch.cameraPlanePoint.addScaledVector(
      scratch.cameraForward,
      CURSOR_PLANE_DISTANCE,
    )
    scratch.plane.setFromNormalAndCoplanarPoint(
      scratch.cameraForward,
      scratch.cameraPlanePoint,
    )
    scratch.cameraRight.setFromMatrixColumn(
      state.camera.matrixWorld,
      0,
    )

    let ringIndex = material.userData.ringIndex as number | undefined
    if (ringIndex === undefined) ringIndex = 0
    let randomState = pointerState.current.randomState
    let particleAttributesChanged = false

    if (burstRequest.current.pending) {
      burstRequest.current.pending = false
      scratch.burstNdc.set(
        burstRequest.current.x,
        burstRequest.current.y,
      )
      scratch.raycaster.setFromCamera(
        scratch.burstNdc,
        state.camera,
      )

      if (
        scratch.raycaster.ray.intersectPlane(
          scratch.plane,
          scratch.burstWorld,
        )
      ) {
        const burstSpeedScale = reducedMotion ? 0.42 : 1

        for (
          let index = 0;
          index < SHOCKWAVE_PARTICLE_COUNT;
          index += 1
        ) {
          randomState = (randomState * 16807) % 2147483647
          const seed = (randomState - 1) / 2147483646
          randomState = (randomState * 16807) % 2147483647
          const speedRandom = (randomState - 1) / 2147483646
          randomState = (randomState * 16807) % 2147483647
          const thetaJitter = (randomState - 1) / 2147483646
          randomState = (randomState * 16807) % 2147483647
          const sizeRandom = (randomState - 1) / 2147483646

          const sphereY =
            1 - ((index + 0.5) / SHOCKWAVE_PARTICLE_COUNT) * 2
          const sphereRadius = Math.sqrt(
            Math.max(0, 1 - sphereY * sphereY),
          )
          const sphereTheta =
            index * 2.39996323 + (thetaJitter - 0.5) * 0.22
          const directionX = Math.cos(sphereTheta) * sphereRadius
          const directionZ = Math.sin(sphereTheta) * sphereRadius
          const speed =
            (3.2 + speedRandom * 2.8) * burstSpeedScale
          const particleOffset = ringIndex * 3

          positions[particleOffset] =
            scratch.burstWorld.x + directionX * 0.035
          positions[particleOffset + 1] =
            scratch.burstWorld.y + sphereY * 0.035
          positions[particleOffset + 2] =
            scratch.burstWorld.z + directionZ * 0.035
          velocities[particleOffset] = directionX * speed
          velocities[particleOffset + 1] = sphereY * speed
          velocities[particleOffset + 2] = directionZ * speed
          births[ringIndex] = time
          lifetimes[ringIndex] =
            0.58 + seed * 0.48 - (reducedMotion ? 0.18 : 0)
          seeds[ringIndex] =
            index % 2 === 0
              ? 0.16 + seed * 0.2
              : 0.64 + seed * 0.24
          sizes[ringIndex] = 9.8 + sizeRandom * 12.8
          energies[ringIndex] = 0.82 + speedRandom * 0.18
          bursts[ringIndex] = 1

          ringIndex += 1
          if (ringIndex >= activeParticleCount) ringIndex = 0
        }

        scratch.shockwaveOrigin.copy(scratch.burstWorld)
        shockwaveState.current.active = true
        shockwaveState.current.startedAt = time
        shockwaveState.current.animationUntil = Math.max(
          shockwaveState.current.animationUntil,
          time + SHOCKWAVE_PARTICLE_DURATION,
        )
        particleAttributesChanged = true
      }
    }

    if (transient.pointerActive) {
      scratch.pointerNdc.set(transient.pointer.x, transient.pointer.y)
      scratch.raycaster.setFromCamera(
        scratch.pointerNdc,
        state.camera,
      )

      if (
        scratch.raycaster.ray.intersectPlane(
          scratch.plane,
          scratch.cursorWorld,
        )
      ) {
        const currentNdcX = transient.pointer.x
        const currentNdcY = transient.pointer.y
        const ndcDeltaX =
          currentNdcX - pointerState.current.lastNdcX
        const ndcDeltaY =
          currentNdcY - pointerState.current.lastNdcY
        const pointerMoved =
          ndcDeltaX * ndcDeltaX + ndcDeltaY * ndcDeltaY >
          0.00000004

        if (pointerMoved) {
          pointerState.current.lastMoveTime = time
        }
        pointerState.current.lastNdcX = currentNdcX
        pointerState.current.lastNdcY = currentNdcY

        if (
          pointerState.current.ribbonCount <
          LIGHT_RIBBON_HISTORY_SIZE
        ) {
          const historyOffset =
            pointerState.current.ribbonCount * 3
          ribbonHistory[historyOffset] = scratch.cursorWorld.x
          ribbonHistory[historyOffset + 1] = scratch.cursorWorld.y
          ribbonHistory[historyOffset + 2] = scratch.cursorWorld.z
          pointerState.current.ribbonCount += 1
        } else {
          ribbonHistory.copyWithin(0, 3)
          const historyOffset =
            (LIGHT_RIBBON_HISTORY_SIZE - 1) * 3
          ribbonHistory[historyOffset] = scratch.cursorWorld.x
          ribbonHistory[historyOffset + 1] = scratch.cursorWorld.y
          ribbonHistory[historyOffset + 2] = scratch.cursorWorld.z
        }

        if (!pointerState.current.hasPrevious) {
          scratch.previousCursorWorld.copy(scratch.cursorWorld)
          pointerState.current.hasPrevious = true
        } else if (pointerMoved) {
          const segmentDistance =
            scratch.previousCursorWorld.distanceTo(
              scratch.cursorWorld,
            )

          if (segmentDistance >= MIN_SEGMENT_DISTANCE) {
            const cursorSpeed = segmentDistance / safeDelta
            const speed01 = smoothstep(0.2, 12, cursorSpeed)
            const spacing = THREE.MathUtils.lerp(
              0.042,
              0.012,
              speed01,
            )
            const uncappedEmissions = Math.ceil(
              segmentDistance / spacing,
            )
            const emissionLimit = reducedMotion
              ? Math.min(48, MAX_EMISSIONS_PER_FRAME)
              : MAX_EMISSIONS_PER_FRAME
            const emissionCount = Math.min(
              emissionLimit,
              Math.max(1, uncappedEmissions),
            )

            scratch.segmentDirection
              .subVectors(
                scratch.cursorWorld,
                scratch.previousCursorWorld,
              )
              .normalize()

            for (
              let index = 0;
              index < emissionCount;
              index += 1
            ) {
              const lerpAmount =
                (index + 0.5) / emissionCount
              scratch.emissionPoint.lerpVectors(
                scratch.previousCursorWorld,
                scratch.cursorWorld,
                lerpAmount,
              )

              randomState = (randomState * 16807) % 2147483647
              const seed = (randomState - 1) / 2147483646
              randomState = (randomState * 16807) % 2147483647
              const lateralRandom =
                (randomState - 1) / 2147483646 - 0.5
              randomState = (randomState * 16807) % 2147483647
              const depthRandom =
                (randomState - 1) / 2147483646 - 0.5
              randomState = (randomState * 16807) % 2147483647
              const velocityRandom =
                (randomState - 1) / 2147483646

              const jitterWidth = 0.022 + speed01 * 0.06
              const lateralOffset =
                lateralRandom * jitterWidth +
                Math.sin(
                  lerpAmount * Math.PI * 3 + seed * 8,
                ) *
                  jitterWidth *
                  0.28

              scratch.emissionPoint.x +=
                -scratch.segmentDirection.y * lateralOffset
              scratch.emissionPoint.y +=
                scratch.segmentDirection.x * lateralOffset
              scratch.emissionPoint.z +=
                depthRandom * (0.025 + speed01 * 0.045)

              const particleOffset = ringIndex * 3
              positions[particleOffset] =
                scratch.emissionPoint.x
              positions[particleOffset + 1] =
                scratch.emissionPoint.y
              positions[particleOffset + 2] =
                scratch.emissionPoint.z

              const trailVelocity = 0.035 + speed01 * 0.07
              const turbulenceVelocity =
                0.018 + velocityRandom * 0.045
              velocities[particleOffset] =
                scratch.segmentDirection.x * trailVelocity +
                lateralRandom * turbulenceVelocity
              velocities[particleOffset + 1] =
                scratch.segmentDirection.y * trailVelocity +
                (velocityRandom - 0.5) * turbulenceVelocity
              velocities[particleOffset + 2] =
                depthRandom * turbulenceVelocity

              births[ringIndex] =
                time -
                (1 - lerpAmount) * Math.min(safeDelta, 0.05)
              lifetimes[ringIndex] =
                1.2 +
                seed * 0.85 +
                speed01 * 0.38 -
                (reducedMotion ? 0.42 : 0)
              seeds[ringIndex] = seed
              sizes[ringIndex] =
                5.2 +
                velocityRandom * 7.2 +
                speed01 * 2.2
              energies[ringIndex] = speed01
              bursts[ringIndex] = 0

              ringIndex += 1
              if (ringIndex >= activeParticleCount) {
                ringIndex = 0
              }
            }

            particleAttributesChanged = true
          }
        }

        scratch.previousCursorWorld.copy(scratch.cursorWorld)
      } else {
        pointerState.current.hasPrevious = false
      }
    } else {
      pointerState.current.hasPrevious = false
    }

    const ribbonCount = pointerState.current.ribbonCount
    const segmentCount = Math.max(0, ribbonCount - 1)
    const sampleCount =
      segmentCount > 0
        ? segmentCount * LIGHT_RIBBON_SUBDIVISIONS + 1
        : 0
    const idleDuration =
      pointerState.current.lastMoveTime < 0
        ? Number.POSITIVE_INFINITY
        : time - pointerState.current.lastMoveTime
    let targetRibbonOpacity = 0

    if (transient.pointerActive && idleDuration < 0.7) {
      targetRibbonOpacity =
        idleDuration < 0.16 ? 0.92 : 0.58
    }

    pointerState.current.ribbonOpacity +=
      (targetRibbonOpacity -
        pointerState.current.ribbonOpacity) *
      (1 - Math.exp(-safeDelta * 9))
    const ribbonOpacity = pointerState.current.ribbonOpacity
    ribbonMaterial.uniforms.uOpacity.value =
      ribbonOpacity * (reducedMotion ? 0.68 : 1)

    if (sampleCount > 1 && ribbonOpacity > 0.008) {
      for (
        let segmentIndex = 0;
        segmentIndex < segmentCount;
        segmentIndex += 1
      ) {
        for (
          let step = 0;
          step < LIGHT_RIBBON_SUBDIVISIONS;
          step += 1
        ) {
          const sampleIndex =
            segmentIndex * LIGHT_RIBBON_SUBDIVISIONS + step
          writeCatmullRomSample(
            ribbonHistory,
            segmentIndex,
            ribbonCount,
            step / LIGHT_RIBBON_SUBDIVISIONS,
            ribbonSamples,
            sampleIndex * 3,
          )
        }
      }

      const finalSampleOffset = (sampleCount - 1) * 3
      const finalHistoryOffset = (ribbonCount - 1) * 3
      ribbonSamples[finalSampleOffset] =
        ribbonHistory[finalHistoryOffset]
      ribbonSamples[finalSampleOffset + 1] =
        ribbonHistory[finalHistoryOffset + 1]
      ribbonSamples[finalSampleOffset + 2] =
        ribbonHistory[finalHistoryOffset + 2]

      for (
        let sampleIndex = 0;
        sampleIndex < sampleCount;
        sampleIndex += 1
      ) {
        const previousSample = Math.max(0, sampleIndex - 1)
        const nextSample = Math.min(
          sampleCount - 1,
          sampleIndex + 1,
        )
        const previousOffset = previousSample * 3
        const nextOffset = nextSample * 3
        const sampleOffset = sampleIndex * 3
        const headRatio =
          sampleCount > 1 ? sampleIndex / (sampleCount - 1) : 0
        const ribbonWidth =
          0.006 + Math.pow(headRatio, 0.72) * 0.079

        scratch.ribbonTangent
          .set(
            ribbonSamples[nextOffset] -
              ribbonSamples[previousOffset],
            ribbonSamples[nextOffset + 1] -
              ribbonSamples[previousOffset + 1],
            ribbonSamples[nextOffset + 2] -
              ribbonSamples[previousOffset + 2],
          )
          .normalize()
        scratch.ribbonSide.crossVectors(
          scratch.ribbonTangent,
          scratch.cameraForward,
        )

        if (scratch.ribbonSide.lengthSq() < 0.000001) {
          scratch.ribbonSide.copy(scratch.cameraRight)
        } else {
          scratch.ribbonSide.normalize()
        }

        const leftOffset = sampleIndex * 6
        const rightOffset = leftOffset + 3
        ribbonPositions[leftOffset] =
          ribbonSamples[sampleOffset] +
          scratch.ribbonSide.x * ribbonWidth
        ribbonPositions[leftOffset + 1] =
          ribbonSamples[sampleOffset + 1] +
          scratch.ribbonSide.y * ribbonWidth
        ribbonPositions[leftOffset + 2] =
          ribbonSamples[sampleOffset + 2] +
          scratch.ribbonSide.z * ribbonWidth
        ribbonPositions[rightOffset] =
          ribbonSamples[sampleOffset] -
          scratch.ribbonSide.x * ribbonWidth
        ribbonPositions[rightOffset + 1] =
          ribbonSamples[sampleOffset + 1] -
          scratch.ribbonSide.y * ribbonWidth
        ribbonPositions[rightOffset + 2] =
          ribbonSamples[sampleOffset + 2] -
          scratch.ribbonSide.z * ribbonWidth
      }

      ribbonPositionAttribute.needsUpdate = true
      ribbonGeometry.setDrawRange(0, (sampleCount - 1) * 6)
      ribbonMaterial.uniforms.uSampleCount.value = sampleCount
      ribbonMesh.visible = true
    } else {
      ribbonMesh.visible = false
      ribbonGeometry.setDrawRange(0, 0)
    }

    if (
      !transient.pointerActive &&
      ribbonOpacity < 0.01
    ) {
      pointerState.current.ribbonCount = 0
    }

    if (shockwaveState.current.active) {
      const duration = reducedMotion ? 0.46 : SHOCKWAVE_DURATION
      const progress = Math.min(
        1,
        (time - shockwaveState.current.startedAt) / duration,
      )
      const easedProgress = 1 - (1 - progress) ** 3
      const maxScale = reducedMotion ? 1.25 : 2.35

      shockwaveMesh.visible = progress < 1
      shockwaveMesh.position.copy(scratch.shockwaveOrigin)
      shockwaveMesh.quaternion.copy(state.camera.quaternion)
      shockwaveMesh.scale.setScalar(
        0.12 + easedProgress * maxScale,
      )
      shockwaveMaterial.uniforms.uProgress.value = progress
      shockwaveMaterial.uniforms.uOpacity.value =
        (1 - progress) ** 2 * (reducedMotion ? 0.5 : 0.92)

      if (progress >= 1) {
        shockwaveState.current.active = false
        shockwaveMesh.visible = false
      }
    }

    material.userData.ringIndex = ringIndex
    pointerState.current.randomState = randomState

    if (particleAttributesChanged) {
      positionAttribute.needsUpdate = true
      velocityAttribute.needsUpdate = true
      birthAttribute.needsUpdate = true
      lifetimeAttribute.needsUpdate = true
      seedAttribute.needsUpdate = true
      sizeAttribute.needsUpdate = true
      energyAttribute.needsUpdate = true
      burstAttribute.needsUpdate = true
    }

    if (
      shockwaveState.current.active ||
      time < shockwaveState.current.animationUntil
    ) {
      invalidate()
    }
  })

  return (
    <>
      <primitive object={points} />
      <primitive object={ribbonMesh} />
      <primitive object={shockwaveMesh} />
    </>
  )
}
