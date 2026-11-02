import { useFrame, useThree } from '@react-three/fiber'
import {
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react'
import * as THREE from 'three'
import { getVfxPreset } from '../../../data/vfxPresets'
import { useAppStore } from '../../../store/useAppStore'
import {
  useGalleryStore,
  type ExhibitMeta,
  type ParticleManifold,
} from '../../../store/useGalleryStore'
import { getEffectiveGalleryTimeScale } from '../../../utils/motionPreferences'
import type { GalleryPointerState } from '../OpticalExhibitScene'

const PARTICLE_COUNT = 20_000
const TAU = Math.PI * 2
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const MANIFOLD_TILT: Record<ParticleManifold, number> = {
  'mobius-ring': 0.74,
  'double-helix': 0.03,
  'trefoil-knot': 0.18,
  'fibonacci-sphere': 0.08,
  'wafer-city': 0.88,
}

const MORPH_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uMorphProgress;
  uniform float uCurlStrength;
  uniform float uCurlScale;
  uniform float uPhase;
  uniform float uGlow;
  uniform float uForceCharge;
  uniform float uShockProgress;
  uniform float uShockStrength;
  uniform vec3 uForcePoint;

  attribute vec3 aPositionA;
  attribute vec3 aPositionB;
  attribute float aDensityA;
  attribute float aDensityB;
  attribute float aSeed;

  varying vec3 vColor;
  varying float vEnergy;
  varying float vDensity;
  varying float vSeed;
  varying float vStorm;
  varying float vForce;

  vec3 potential(vec3 point, float time) {
    return vec3(
      sin(point.y * 1.73 + point.z * 0.31 + time * 0.62),
      sin(point.z * 1.41 - point.x * 0.24 - time * 0.47),
      sin(point.x * 1.62 + point.y * 0.37 + time * 0.39)
    );
  }

  vec3 curlNoise(vec3 point, float time) {
    float epsilon = 0.075;
    vec3 dx = vec3(epsilon, 0.0, 0.0);
    vec3 dy = vec3(0.0, epsilon, 0.0);
    vec3 dz = vec3(0.0, 0.0, epsilon);
    vec3 fieldX0 = potential(point - dx, time);
    vec3 fieldX1 = potential(point + dx, time);
    vec3 fieldY0 = potential(point - dy, time);
    vec3 fieldY1 = potential(point + dy, time);
    vec3 fieldZ0 = potential(point - dz, time);
    vec3 fieldZ1 = potential(point + dz, time);

    return vec3(
      (fieldX1.z - fieldX0.z - fieldY1.y + fieldY0.y) /
        (2.0 * epsilon),
      (fieldY1.x - fieldY0.x - fieldZ1.z + fieldZ0.z) /
        (2.0 * epsilon),
      (fieldZ1.y - fieldZ0.y - fieldX1.x + fieldX0.x) /
        (2.0 * epsilon)
    );
  }

  mat2 rotate2d(float angle) {
    float sine = sin(angle);
    float cosine = cos(angle);
    return mat2(cosine, -sine, sine, cosine);
  }

  vec3 palette(
    vec3 coolA,
    vec3 coolB,
    vec3 hotA,
    vec3 hotB,
    float energy,
    float density,
    float seed
  ) {
    vec3 cold = mix(
      coolA,
      coolB,
      clamp(density + seed * 0.2, 0.0, 1.0)
    );
    vec3 hot = mix(
      hotA,
      hotB,
      clamp(energy * 0.82 + seed * 0.24, 0.0, 1.0)
    );
    return mix(
      cold,
      hot,
      smoothstep(0.14, 0.78, energy)
    );
  }

  uniform vec3 uColdA;
  uniform vec3 uColdB;
  uniform vec3 uHotA;
  uniform vec3 uHotB;

  void main() {
    float morph = clamp(uMorphProgress, 0.0, 1.0);
    float envelope = sin(morph * 3.14159265);
    vec3 blended = mix(aPositionA, aPositionB, morph);
    vec3 curlPoint =
      blended * uCurlScale +
      vec3(
        aSeed * 2.1,
        aSeed * 1.37,
        aSeed * 3.11
      ) +
      uTime * 0.11;
    vec3 curl = curlNoise(curlPoint, uTime + uPhase);
    float angle =
      envelope *
      (
        1.15 +
        aSeed * 2.4 +
        sin(aSeed * 21.0 + uTime) * 0.35
      ) +
      uTime * 0.055;
    vec3 spiral = vec3(
      rotate2d(angle) * blended.xz,
      blended.y * (1.0 - envelope * 0.14)
    ).xzy;
    vec3 storm = mix(blended, spiral, envelope * 0.7);
    storm +=
      curl *
      envelope *
      uCurlStrength *
      (0.48 + aSeed * 0.82);
    float galaxySeed = fract(aSeed * 17.13);
    float galaxyRadius =
      0.18 +
      pow(galaxySeed, 0.72) * 0.72;
    float galaxyArm =
      floor(fract(aSeed * 7.91) * 3.0);
    float galaxyAngle =
      galaxySeed * 6.2831853 +
      galaxyArm * 2.0943951 +
      galaxyRadius * 6.4 +
      uTime * 0.42;
    float galaxyLift = fract(aSeed * 43.17) - 0.5;
    float galaxyTilt =
      sin(galaxyAngle * 2.0 + aSeed * 31.0) * 0.09;
    vec3 galaxyStorm = vec3(
      cos(galaxyAngle) * galaxyRadius,
      galaxyLift * 0.42 +
        galaxyTilt,
      sin(galaxyAngle) * galaxyRadius
    );
    float stormWeight = smoothstep(0.04, 0.96, envelope);
    storm = mix(storm, galaxyStorm, stormWeight);
    float radial = length(blended);
    vec3 radialDirection =
      blended / max(0.0001, radial);
    storm +=
      radialDirection *
      envelope *
      (0.12 + aSeed * 0.3);
    float idle = sin(
      uTime * (0.45 + aSeed * 0.22) +
      aSeed * 35.0
    );
    storm +=
      normalize(vec3(
        sin(aSeed * 17.0),
        cos(aSeed * 13.0),
        sin(aSeed * 29.0)
      )) *
      idle *
      0.006;

    float accretionSeed = fract(aSeed * 61.71);
    float accretionBand = fract(aSeed * 23.47);
    float accretionShell = floor(accretionBand * 4.0);
    float accretionRadius =
      0.16 +
      accretionShell * 0.16 +
      fract(accretionSeed * 19.3) * 0.05;
    float accretionAngle =
      aSeed * 37.7 +
      uTime * (2.8 + accretionShell * 0.48 + accretionSeed * 1.6) +
      accretionRadius * 8.0;
    float accretionLift =
      (fract(aSeed * 37.91) - 0.5) * 0.034;
    vec3 accretionDisk =
      uForcePoint +
      vec3(
        cos(accretionAngle) * accretionRadius,
        accretionLift,
        sin(accretionAngle) * accretionRadius
      );
    vec3 sourceToCore = uForcePoint - storm;
    float coreDistance = length(sourceToCore);
    float capture =
      1.0 - smoothstep(0.05, 2.4, coreDistance);
    float forceMix =
      uForceCharge * mix(0.96, 1.0, capture);
    vec3 bound =
      mix(storm, accretionDisk, forceMix);
    bound +=
      normalize(sourceToCore + vec3(0.0001)) *
      sin(uTime * (7.0 + accretionSeed * 5.0) + aSeed * 41.0) *
      0.018 *
      forceMix;

    float shockEnvelope =
      smoothstep(0.0, 0.14, uShockProgress) *
      (1.0 - smoothstep(0.14, 1.0, uShockProgress));
    vec3 shockJitter = normalize(vec3(
      sin(aSeed * 53.0),
      cos(aSeed * 67.0),
      sin(aSeed * 79.0)
    ));
    vec3 outwardDirection = normalize(
      sourceToCore / max(0.001, coreDistance) * -1.0 +
      shockJitter * 0.72
    );
    float blastDistance =
      pow(max(0.0, shockEnvelope), 0.68) *
      (0.58 + aSeed * 1.32) *
      uShockStrength;
    vec3 blastPosition =
      accretionDisk +
      outwardDirection * blastDistance +
      curl * shockEnvelope * (0.26 + aSeed * 0.24);
    storm = mix(
      bound,
      blastPosition,
      shockEnvelope * uShockStrength
    );

    float distanceAtoB =
      length(aPositionB - aPositionA);
    float motionSpeed =
      envelope *
      (
        1.02 +
        distanceAtoB * 1.35 +
        length(curl) * uCurlStrength * 0.12
      );
    float density = mix(aDensityA, aDensityB, morph);
    float forceEnergy = clamp(
      max(uForceCharge, shockEnvelope * uShockStrength),
      0.0,
      1.0
    );
    float energy = clamp(
      motionSpeed + envelope * 0.34,
      0.0,
      1.0
    );
    energy = clamp(
      max(energy, forceEnergy * 1.08),
      0.0,
      1.0
    );

    vec4 viewPosition =
      modelViewMatrix * vec4(storm, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float pointEnergyScale =
      mix(1.7, 0.82, stormWeight);
    gl_PointSize =
      (1.35 + aSeed * 1.75) *
      (1.0 + energy * pointEnergyScale) *
      (6.8 / max(1.0, -viewPosition.z)) *
      (0.9 + uGlow * 0.18) *
      mix(1.0, 0.55, forceEnergy);

    vec3 formedSpectrum = palette(
      uColdA,
      uColdB,
      uHotA,
      uHotB,
      energy,
      density,
      aSeed
    );
    vec3 stormSpectrum = mix(
      vec3(1.0, 0.3, 0.018),
      vec3(0.42, 0.045, 1.0),
      step(0.52, galaxySeed)
    );
    vColor = mix(
      formedSpectrum,
      stormSpectrum * 1.24,
      stormWeight * 0.84
    );
    vec3 forceSpectrum = mix(
      vec3(0.12, 0.86, 1.0),
      vec3(1.0, 0.34, 0.035),
      pow(accretionSeed, 1.4)
    );
    vColor = mix(
      vColor,
      forceSpectrum * 1.38,
      max(forceEnergy * 0.9, shockEnvelope * 0.36)
    );
    vEnergy = energy;
    vDensity = density;
    vSeed = aSeed;
    vStorm = stormWeight;
    vForce = forceEnergy;
  }
`

const MORPH_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vEnergy;
  varying float vDensity;
  varying float vSeed;
  varying float vStorm;
  varying float vForce;

  void main() {
    float radialDistance =
      length(gl_PointCoord - vec2(0.5));
    if (radialDistance > 0.5) discard;
    float softPoint =
      smoothstep(0.5, 0.05, radialDistance);
    float core =
      smoothstep(0.2, 0.0, radialDistance);
    float shimmer =
      0.84 +
      0.16 *
      sin(vSeed * 93.0 + vEnergy * 18.0);
    float colorGain =
      mix(
        1.08 + vEnergy * 1.45,
        0.84 + vEnergy * 0.62,
        vStorm
      ) *
      mix(1.0, 0.5, vForce);
    vec3 color = vColor * colorGain * shimmer;
    color +=
      vec3(0.2, 0.42, 0.38) *
      core *
      (0.12 + vDensity * 0.16);
    color +=
      vec3(1.0, 0.36, 0.05) *
      core *
      vForce *
      0.24;
    gl_FragColor = vec4(
      color,
      softPoint *
        mix(
          0.32 + vEnergy * 0.42,
          0.18 + vEnergy * 0.2,
          vStorm
        ) *
        mix(1.0, 0.14, vForce)
    );
  }
`

interface ManifoldBuffers {
  positions: Float32Array
  density: Float32Array
}

type ManifoldSet = Record<ParticleManifold, ManifoldBuffers>
let manifoldCache: ManifoldSet | null = null
let seedCache: Float32Array | null = null

function random(index: number, salt: number) {
  let seed =
    Math.imul(index + 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(salt + 0xc2b2ae35, 0x27d4eb2f)
  seed = Math.imul(seed ^ (seed >>> 16), 0x7feb352d)
  seed = Math.imul(seed ^ (seed >>> 15), 0x846ca68b)
  return ((seed ^ (seed >>> 16)) >>> 0) / 0x1_0000_0000
}

function smoothstep(min: number, max: number, value: number) {
  const normalized = Math.min(
    1,
    Math.max(0, (value - min) / Math.max(0.0001, max - min)),
  )
  return normalized * normalized * (3 - 2 * normalized)
}

function getShockEnvelope(progress: number) {
  return (
    smoothstep(0, 0.14, progress) *
    (1 - smoothstep(0.14, 1, progress))
  )
}

function normalizeVector(
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const length = Math.hypot(x, y, z) || 1
  return [x / length, y / length, z / length]
}

function createManifoldSet(): ManifoldSet {
  const mobius: ManifoldBuffers = {
    positions: new Float32Array(PARTICLE_COUNT * 3),
    density: new Float32Array(PARTICLE_COUNT),
  }
  const helix: ManifoldBuffers = {
    positions: new Float32Array(PARTICLE_COUNT * 3),
    density: new Float32Array(PARTICLE_COUNT),
  }
  const trefoil: ManifoldBuffers = {
    positions: new Float32Array(PARTICLE_COUNT * 3),
    density: new Float32Array(PARTICLE_COUNT),
  }
  const fibonacci: ManifoldBuffers = {
    positions: new Float32Array(PARTICLE_COUNT * 3),
    density: new Float32Array(PARTICLE_COUNT),
  }
  const wafer: ManifoldBuffers = {
    positions: new Float32Array(PARTICLE_COUNT * 3),
    density: new Float32Array(PARTICLE_COUNT),
  }

  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const offset = index * 3
    const seed = random(index, 1)

    const mobiusU = (index * GOLDEN_ANGLE) % TAU
    const mobiusV = (random(index, 2) * 2 - 1) * 0.34
    const mobiusRadius =
      0.7 + mobiusV * 0.36 * Math.cos(mobiusU * 0.5)
    mobius.positions[offset] =
      Math.cos(mobiusU) * mobiusRadius
    mobius.positions[offset + 1] =
      mobiusV * 0.62 * Math.sin(mobiusU * 0.5)
    mobius.positions[offset + 2] =
      Math.sin(mobiusU) * mobiusRadius
    mobius.density[index] =
      0.18 +
      0.7 *
        Math.abs(Math.cos(mobiusU * 0.5)) +
      Math.abs(mobiusV) * 0.34

    const helixT = random(index, 3) * TAU * 4.1
    const helixY =
      (helixT / (TAU * 4.1) - 0.5) * 1.42
    const helixStrand = index % 2
    const bridge = index % 6 === 0
    const bridgeAmount = random(index, 4) * 2 - 1
    const helixRadius = 0.29
    if (bridge) {
      helix.positions[offset] =
        Math.cos(helixT) * helixRadius * bridgeAmount
      helix.positions[offset + 1] = helixY
      helix.positions[offset + 2] =
        Math.sin(helixT) * helixRadius * bridgeAmount
      helix.density[index] =
        0.3 + (1 - Math.abs(bridgeAmount)) * 0.7
    } else {
      const strandPhase =
        helixT + helixStrand * Math.PI
      helix.positions[offset] =
        Math.cos(strandPhase) * helixRadius
      helix.positions[offset + 1] =
        helixY + (seed - 0.5) * 0.022
      helix.positions[offset + 2] =
        Math.sin(strandPhase) * helixRadius
      helix.density[index] = 0.42 + seed * 0.38
    }

    const knotT = random(index, 5) * TAU
    const knotScale = 0.215
    const knotX =
      (Math.sin(knotT) + 2 * Math.sin(2 * knotT)) *
      knotScale
    const knotY =
      (Math.cos(knotT) - 2 * Math.cos(2 * knotT)) *
      knotScale
    const knotZ =
      -Math.sin(3 * knotT) * knotScale
    const tangent = normalizeVector(
      Math.cos(knotT) + 4 * Math.cos(2 * knotT),
      -Math.sin(knotT) + 4 * Math.sin(2 * knotT),
      -3 * Math.cos(3 * knotT),
    )
    let knotNormal = normalizeVector(
      -tangent[2],
      0.22,
      tangent[0],
    )
    const knotBinormal = normalizeVector(
      tangent[1] * knotNormal[2] -
        tangent[2] * knotNormal[1],
      tangent[2] * knotNormal[0] -
        tangent[0] * knotNormal[2],
      tangent[0] * knotNormal[1] -
        tangent[1] * knotNormal[0],
    )
    knotNormal = normalizeVector(
      knotBinormal[1] * tangent[2] -
        knotBinormal[2] * tangent[1],
      knotBinormal[2] * tangent[0] -
        knotBinormal[0] * tangent[2],
      knotBinormal[0] * tangent[1] -
        knotBinormal[1] * tangent[0],
    )
    const tubeAngle = random(index, 6) * TAU
    const tubeRadius = Math.sqrt(random(index, 7)) * 0.064
    trefoil.positions[offset] =
      knotX +
      (Math.cos(tubeAngle) * knotNormal[0] +
        Math.sin(tubeAngle) * knotBinormal[0]) *
        tubeRadius
    trefoil.positions[offset + 1] =
      knotY +
      (Math.cos(tubeAngle) * knotNormal[1] +
        Math.sin(tubeAngle) * knotBinormal[1]) *
        tubeRadius
    trefoil.positions[offset + 2] =
      knotZ +
      (Math.cos(tubeAngle) * knotNormal[2] +
        Math.sin(tubeAngle) * knotBinormal[2]) *
        tubeRadius
    trefoil.density[index] =
      0.34 + Math.sqrt(random(index, 8)) * 0.64

    const fibonacciY =
      1 - (2 * (index + 0.5)) / PARTICLE_COUNT
    const fibonacciRadius = Math.sqrt(
      Math.max(0, 1 - fibonacciY * fibonacciY),
    )
    const fibonacciTheta = index * GOLDEN_ANGLE
    const shell =
      0.72 + (index % 19 === 0 ? random(index, 9) * 0.11 : 0)
    fibonacci.positions[offset] =
      Math.cos(fibonacciTheta) * fibonacciRadius * shell
    fibonacci.positions[offset + 1] = fibonacciY * shell
    fibonacci.positions[offset + 2] =
      Math.sin(fibonacciTheta) * fibonacciRadius * shell
    fibonacci.density[index] =
      0.2 +
      Math.abs(Math.sin(fibonacciTheta * 5.0)) * 0.64

    const gridSize = 13
    const gridX = (index * 37) % gridSize
    const gridZ = (index * 53) % gridSize
    let waferX = (gridX / (gridSize - 1) - 0.5) * 1.55
    let waferZ = (gridZ / (gridSize - 1) - 0.5) * 1.55
    const waferRadius = Math.hypot(waferX, waferZ)
    if (waferRadius > 0.77) {
      const radialScale = 0.77 / waferRadius
      waferX *= radialScale
      waferZ *= radialScale
    }
    const pillarHeight =
      0.055 + random(gridX * 31 + gridZ, 10) * 0.52
    const pillarParticle = index % 5 !== 0
    wafer.positions[offset] = waferX
    wafer.positions[offset + 1] = pillarParticle
      ? -0.33 + random(index, 11) * pillarHeight
      : -0.33 + random(index, 12) * 0.012
    wafer.positions[offset + 2] = waferZ
    wafer.density[index] =
      pillarParticle
        ? 0.38 + pillarHeight
        : 0.14 + random(index, 13) * 0.2
  }

  return {
    'mobius-ring': mobius,
    'double-helix': helix,
    'trefoil-knot': trefoil,
    'fibonacci-sphere': fibonacci,
    'wafer-city': wafer,
  }
}

function createSeedBuffer() {
  const seeds = new Float32Array(PARTICLE_COUNT)
  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    seeds[index] = random(index, 21)
  }
  return seeds
}

function getManifoldSet() {
  manifoldCache ??= createManifoldSet()
  return manifoldCache
}

function getSeedBuffer() {
  seedCache ??= createSeedBuffer()
  return seedCache
}

export function ParticleMorphExhibit({
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
  const performanceTier = useAppStore(
    (state) => state.performanceTier,
  )
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const palette = useMemo(() => getVfxPreset(vfxPreset), [vfxPreset])
  const manifold = useGalleryStore(
    (state) => state.particleManifold,
  )
  const manifolds = useMemo(getManifoldSet, [])
  const seeds = useMemo(getSeedBuffer, [])
  const phase = exhibit.params.phase ?? 1.2
  const coupling = exhibit.params.coupling ?? 0.64
  const flow = exhibit.params.flow ?? 0.82
  const gain = exhibit.params.gain ?? 1.24
  const displayScale = mode === 'darkroom' ? 1.24 : 0.98
  const forceMath = useMemo(
    () => ({
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      plane: new THREE.Plane(),
      normal: new THREE.Vector3(),
      origin: new THREE.Vector3(),
      worldPoint: new THREE.Vector3(),
    }),
    [],
  )
  const pointsRef = useRef<THREE.Points>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const hostRef = useRef<HTMLElement | null>(null)
  const progressRef = useRef(1)
  const morphingRef = useRef(false)
  const currentManifoldRef = useRef(manifold)
  const initialManifoldRef = useRef(manifold)
  const dataUpdateRef = useRef(0)
  const forcePointRef = useRef(new THREE.Vector3())
  const forceChargeRef = useRef(0)
  const shockProgressRef = useRef(1)
  const forceWasActiveRef = useRef(false)
  const singularityRef = useRef<THREE.Group>(null)
  const accretionSpinRef = useRef<THREE.Group>(null)
  const shockwaveRef = useRef<THREE.Mesh>(null)
  const shockwaveMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const forceLightRef = useRef<THREE.PointLight>(null)
  const initial = manifolds[initialManifoldRef.current]
  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry()
    const positionA = new Float32Array(initial.positions)
    const positionB = new Float32Array(initial.positions)
    const densityA = new Float32Array(initial.density)
    const densityB = new Float32Array(initial.density)
    const position = new THREE.BufferAttribute(
      positionA,
      3,
    )
    position.setUsage(THREE.DynamicDrawUsage)
    buffer.setAttribute('position', position)
    buffer.setAttribute('aPositionA', position)
    buffer.setAttribute(
      'aPositionB',
      new THREE.BufferAttribute(positionB, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    )
    buffer.setAttribute(
      'aDensityA',
      new THREE.BufferAttribute(densityA, 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    )
    buffer.setAttribute(
      'aDensityB',
      new THREE.BufferAttribute(densityB, 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    )
    buffer.setAttribute(
      'aSeed',
      new THREE.BufferAttribute(seeds, 1),
    )
    return buffer
  }, [initial, seeds])
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMorphProgress: { value: 1 },
      uCurlStrength: { value: flow },
      uCurlScale: { value: 0.72 + coupling * 1.1 },
      uPhase: { value: phase },
      uGlow: { value: gain },
      uForceCharge: { value: 0 },
      uShockProgress: { value: 1 },
      uShockStrength: { value: 1 },
      uForcePoint: { value: new THREE.Vector3() },
      uColdA: { value: new THREE.Color('#4cf5ff') },
      uColdB: { value: new THREE.Color('#43ff9c') },
      uHotA: { value: new THREE.Color('#ffc14d') },
      uHotB: { value: new THREE.Color('#b45cff') },
    }),
    [],
  )
  const hotLightARef = useRef<THREE.PointLight>(null)
  const hotLightBRef = useRef<THREE.PointLight>(null)

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(
    () => () => {
      materialRef.current?.dispose()
    },
    [],
  )

  useEffect(() => {
    if (currentManifoldRef.current === manifold) return
    const from = manifolds[currentManifoldRef.current]
    const target = manifolds[manifold]
    const positionA = geometry.getAttribute(
      'aPositionA',
    ) as THREE.BufferAttribute
    const positionB = geometry.getAttribute(
      'aPositionB',
    ) as THREE.BufferAttribute
    const densityA = geometry.getAttribute(
      'aDensityA',
    ) as THREE.BufferAttribute
    const densityB = geometry.getAttribute(
      'aDensityB',
    ) as THREE.BufferAttribute
    positionA.array.set(from.positions)
    positionB.array.set(target.positions)
    densityA.array.set(from.density)
    densityB.array.set(target.density)
    positionA.needsUpdate = true
    positionB.needsUpdate = true
    densityA.needsUpdate = true
    densityB.needsUpdate = true
    currentManifoldRef.current = manifold
    progressRef.current = 0
    morphingRef.current = true
  }, [geometry, manifold, manifolds])

  useEffect(() => {
    const target = materialRef.current?.uniforms ?? uniforms
    target.uCurlStrength.value = flow
    target.uCurlScale.value = 0.72 + coupling * 1.1
    target.uPhase.value = phase
    target.uGlow.value =
      gain * (performanceTier === 'high' ? 1 : 0.86)
  }, [coupling, flow, gain, performanceTier, phase, uniforms])

  useEffect(() => {
    const host = gl.domElement.closest<HTMLElement>(
      '[data-gallery-shared-canvas]',
    )
    if (!host) return
    hostRef.current = host
    const instanceCount =
      Number(host.dataset.particleMorphInstances ?? 0) + 1
    host.dataset.particleMorphInstances = String(instanceCount)
    host.dataset.particleMorph = 'gpu-curl-morph'
    host.dataset.particleMorphShader =
      'aPositionA,aPositionB,curl-noise'
    host.dataset.particleMorphCount = String(PARTICLE_COUNT)
    host.dataset.particleMorphTargets = '5'
    host.dataset.particleForce = 'gravity-supernova'
    host.dataset.particleManifold = manifold

    return () => {
      const remainingInstances = Math.max(
        0,
        Number(host.dataset.particleMorphInstances ?? 1) - 1,
      )
      if (remainingInstances > 0) {
        host.dataset.particleMorphInstances =
          String(remainingInstances)
        hostRef.current = null
        return
      }
      delete host.dataset.particleMorphInstances
      delete host.dataset.particleMorph
      delete host.dataset.particleMorphShader
      delete host.dataset.particleMorphCount
      delete host.dataset.particleMorphTargets
      delete host.dataset.particleForce
      delete host.dataset.particleForceState
      delete host.dataset.particleForceCharge
      delete host.dataset.particleForceUniform
      delete host.dataset.particleShockProgress
      delete host.dataset.particleForceX
      delete host.dataset.particleForceY
      delete host.dataset.particleForceZ
      delete host.dataset.particleManifold
      delete host.dataset.particleMorphProgress
      delete host.dataset.particleMorphUniform
      delete host.dataset.particleMorphState
      hostRef.current = null
    }
  }, [gl, manifold])

  useFrame((state, delta) => {
    const timeScale = getEffectiveGalleryTimeScale(
      useGalleryStore.getState().timeScale,
    )
    const time = state.clock.elapsedTime * timeScale
    const safeDelta = Math.min(delta, 1 / 20)
    const pointer = pointerRef.current
    const forceActive = pointer.forceActive && pointer.active
    const wasForceActive = forceWasActiveRef.current
    const materialUniforms = materialRef.current?.uniforms

    if (pointsRef.current) {
      const pointerInfluence = forceActive ? 0.055 : 1
      pointsRef.current.rotation.y =
        time * 0.07 + pointer.u * 0.24 * pointerInfluence
      pointsRef.current.rotation.x =
        MANIFOLD_TILT[manifold] +
        Math.sin(time * 0.19) * 0.055 +
        pointer.v * 0.1 * pointerInfluence
      pointsRef.current.rotation.z =
        Math.sin(time * 0.13) * 0.025
    }

    if (forceActive && pointsRef.current) {
      forceMath.pointer.set(pointer.u, pointer.v)
      forceMath.raycaster.setFromCamera(
        forceMath.pointer,
        camera,
      )
      camera.getWorldDirection(forceMath.normal)
      forceMath.plane.setFromNormalAndCoplanarPoint(
        forceMath.normal,
        forceMath.origin,
      )
      const intersection =
        forceMath.raycaster.ray.intersectPlane(
          forceMath.plane,
          forceMath.worldPoint,
        )
      if (intersection) {
        pointsRef.current.updateWorldMatrix(true, false)
        pointsRef.current.worldToLocal(intersection)
        const forceSmoothing =
          forceChargeRef.current < 0.02
            ? 1
            : 1 - Math.exp(-safeDelta * 18)
        forcePointRef.current.lerp(
          intersection,
          forceSmoothing,
        )
      }
    }

    if (forceActive) {
      if (!wasForceActive) {
        shockProgressRef.current = 1
      }
      forceChargeRef.current = Math.min(
        1,
        forceChargeRef.current + safeDelta * 4.2,
      )
    } else {
      if (wasForceActive) {
        shockProgressRef.current = 0.0001
      }
      forceChargeRef.current = Math.max(
        0,
        forceChargeRef.current - safeDelta * 7.5,
      )
      if (
        shockProgressRef.current > 0 &&
        shockProgressRef.current < 1
      ) {
        shockProgressRef.current = Math.min(
          1,
          shockProgressRef.current + safeDelta / 1.9,
        )
      }
    }
    forceWasActiveRef.current = forceActive

    const forceCharge = forceChargeRef.current
    const shockProgress = shockProgressRef.current
    const shockEnvelope = getShockEnvelope(shockProgress)

    if (materialUniforms) {
      materialUniforms.uTime.value = time
      materialUniforms.uCurlStrength.value = flow
      materialUniforms.uCurlScale.value = 0.72 + coupling * 1.1
      materialUniforms.uPhase.value = phase
      materialUniforms.uGlow.value =
        gain * (performanceTier === 'high' ? 1 : 0.86)
      materialUniforms.uForceCharge.value = forceCharge
      materialUniforms.uShockProgress.value = shockProgress
      materialUniforms.uShockStrength.value = 1
      materialUniforms.uForcePoint.value.copy(
        forcePointRef.current,
      )
    }

    if (morphingRef.current) {
      const morphDelta = Math.min(delta, 1 / 30)
      progressRef.current = Math.min(
        1,
        progressRef.current + morphDelta * timeScale * 0.82,
      )
      if (progressRef.current >= 1) {
        morphingRef.current = false
      }
    }
    if (materialUniforms) {
      materialUniforms.uMorphProgress.value = progressRef.current
    }

    if (singularityRef.current) {
      singularityRef.current.visible = forceCharge > 0.012
      singularityRef.current.position.copy(forcePointRef.current)
      singularityRef.current.scale.setScalar(
        0.64 + forceCharge * 0.36,
      )
    }
    if (accretionSpinRef.current) {
      accretionSpinRef.current.rotation.y =
        time * (2.7 + forceCharge * 2.1)
      accretionSpinRef.current.rotation.z =
        Math.sin(time * 1.4) * 0.18
    }
    if (forceLightRef.current) {
      forceLightRef.current.position.copy(forcePointRef.current)
      forceLightRef.current.intensity =
        forceCharge * (mode === 'darkroom' ? 11 : 7) +
        shockEnvelope * (mode === 'darkroom' ? 18 : 12)
    }
    if (shockwaveRef.current && shockwaveMaterialRef.current) {
      const shockVisible = shockEnvelope > 0.008
      shockwaveRef.current.visible = shockVisible
      shockwaveRef.current.position.copy(forcePointRef.current)
      shockwaveRef.current.scale.setScalar(
        0.24 + shockProgress * 2.7,
      )
      shockwaveRef.current.lookAt(camera.position)
      shockwaveMaterialRef.current.opacity =
        shockEnvelope * (mode === 'darkroom' ? 0.78 : 0.58)
    }
    if (hotLightARef.current) {
      hotLightARef.current.intensity =
        (morphingRef.current
          ? mode === 'darkroom'
            ? 4.6
            : 2.8
          : 0.4) +
        forceCharge * 3.8 +
        shockEnvelope * 7.5
    }
    if (hotLightBRef.current) {
      hotLightBRef.current.intensity =
        (morphingRef.current
          ? mode === 'darkroom'
            ? 4.2
            : 2.5
          : 0.35) +
        forceCharge * 3.2 +
        shockEnvelope * 6.4
    }

    dataUpdateRef.current += delta
    const host = hostRef.current
    const ownsLiveTelemetry =
      host !== null &&
      (mode === 'darkroom' ||
        host.dataset.galleryCanvasMode === 'gallery')
    if (host && ownsLiveTelemetry && dataUpdateRef.current > 0.1) {
      dataUpdateRef.current = 0
      host.dataset.particleMorphProgress =
        progressRef.current.toFixed(3)
      host.dataset.particleMorphUniform =
        materialRef.current?.uniforms.uMorphProgress.value.toFixed(3) ??
        'missing'
      host.dataset.particleManifold = manifold
      host.dataset.particleMorphState =
        morphingRef.current ? 'morphing' : 'formed'
      host.dataset.particleForceState = forceActive
        ? forceCharge < 0.92
          ? 'charging'
          : 'accreting'
        : shockProgress < 1
          ? shockProgress < 0.22
            ? 'supernova'
            : 'reforming'
          : 'idle'
      host.dataset.particleForceCharge =
        forceCharge.toFixed(3)
      host.dataset.particleForceUniform =
        materialRef.current?.uniforms.uForceCharge.value.toFixed(3) ??
        'missing'
      host.dataset.particleShockProgress =
        shockProgress.toFixed(3)
      host.dataset.particleForceX =
        forcePointRef.current.x.toFixed(3)
      host.dataset.particleForceY =
        forcePointRef.current.y.toFixed(3)
      host.dataset.particleForceZ =
        forcePointRef.current.z.toFixed(3)
    }
  })

  return (
    <group scale={displayScale}>
      <points
        ref={pointsRef}
        geometry={geometry}
        frustumCulled={false}
      >
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={MORPH_VERTEX_SHADER}
          fragmentShader={MORPH_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
        <group ref={singularityRef} visible={false}>
          <mesh>
            <sphereGeometry args={[0.052, 20, 14]} />
            <meshBasicMaterial color="#010204" />
          </mesh>
          <group ref={accretionSpinRef}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.18, 0.008, 6, 96]} />
              <meshBasicMaterial
                color={palette.secondary}
                transparent
                opacity={0.82}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
            <mesh rotation={[Math.PI / 2.35, 0.4, 0.18]}>
              <torusGeometry args={[0.29, 0.004, 5, 112]} />
              <meshBasicMaterial
                color="#ffb84d"
                transparent
                opacity={0.46}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
            <mesh rotation={[Math.PI / 1.75, -0.32, 0.45]}>
              <torusGeometry args={[0.39, 0.003, 5, 128]} />
              <meshBasicMaterial
                color={palette.tertiary}
                transparent
                opacity={0.26}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          </group>
          <pointLight
            ref={forceLightRef}
            color={palette.secondary}
            intensity={0}
            distance={2.2}
            decay={2}
          />
        </group>
        <mesh ref={shockwaveRef} visible={false} renderOrder={3}>
          <ringGeometry args={[0.82, 0.92, 128]} />
          <meshBasicMaterial
            ref={shockwaveMaterialRef}
            color="#ff8b2e"
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </points>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.92, 0.006, 6, 128]} />
        <meshBasicMaterial
          color={palette.secondary}
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2.7, 0.32, 0.2]}>
        <torusGeometry args={[1.05, 0.004, 5, 128]} />
        <meshBasicMaterial
          color={palette.tertiary}
          transparent
          opacity={0.1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        position={[0, 0.15, 0.8]}
        color={palette.secondary}
        intensity={
          (mode === 'darkroom' ? 7 : 4.5) *
          gain *
          (morphingRef.current ? 1.65 : 1)
        }
        distance={3.2}
        decay={2}
      />
      <pointLight
        ref={hotLightARef}
        position={[-0.8, 0.42, -0.4]}
        color="#ffae4d"
        intensity={0.4}
        distance={2.5}
        decay={2}
      />
      <pointLight
        ref={hotLightBRef}
        position={[0.9, -0.3, 0.4]}
        color="#aa55ff"
        intensity={0.35}
        distance={2.4}
        decay={2}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.7, 0]}>
        <ringGeometry args={[0.62, 1.28, 96]} />
        <meshBasicMaterial
          color={palette.primary}
          transparent
          opacity={0.045}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}
