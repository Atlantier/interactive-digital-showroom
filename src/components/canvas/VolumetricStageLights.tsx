import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getVfxPreset } from '../../data/vfxPresets'
import { setParticleSourceCount } from '../../store/performanceTelemetry'
import {
  readTransientState,
  useAppStore,
} from '../../store/useAppStore'
import { soundEngine } from '../../utils/soundEngine'

export const VOLUMETRIC_BEAM_COUNT = 3
export const VOLUMETRIC_DUST_COUNT = 1500
const INITIAL_PALETTE = ['#10b981', '#72e6ff', '#a7f3d0'] as const

type StageVariant = 'hero' | 'architecture'

interface BeamDefinition {
  position: [number, number, number]
  height: number
  radius: number
  rotationX: number
  rotationZ: number
  color: string
  phase: number
}

const HERO_BEAMS: readonly BeamDefinition[] = [
  {
    position: [-3.8, 5.7, -1.15],
    height: 10.5,
    radius: 3.8,
    rotationX: 0.1,
    rotationZ: -0.18,
    color: '#10b981',
    phase: 0.2,
  },
  {
    position: [-0.15, 5.95, -1.8],
    height: 11.6,
    radius: 4.35,
    rotationX: 0.06,
    rotationZ: 0.06,
    color: '#3b82f6',
    phase: 2.1,
  },
  {
    position: [4.05, 5.55, -0.95],
    height: 9.8,
    radius: 3.45,
    rotationX: 0.13,
    rotationZ: 0.22,
    color: '#8b5cf6',
    phase: 4.2,
  },
]

const ARCHITECTURE_BEAMS: readonly BeamDefinition[] = [
  {
    position: [-3.2, 4.9, -1.4],
    height: 9.5,
    radius: 3.2,
    rotationX: 0.08,
    rotationZ: -0.12,
    color: '#10b981',
    phase: 0.7,
  },
  {
    position: [0.1, 5.2, -2.15],
    height: 10.6,
    radius: 3.85,
    rotationX: 0.03,
    rotationZ: 0.03,
    color: '#3b82f6',
    phase: 2.8,
  },
  {
    position: [3.15, 4.75, -1.35],
    height: 9.1,
    radius: 3.05,
    rotationX: 0.11,
    rotationZ: 0.16,
    color: '#8b5cf6',
    phase: 5.1,
  },
]

const beamVertexShader = /* glsl */ `
  uniform float uHeight;

  varying vec3 vLocalPosition;
  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;

  void main() {
    vLocalPosition = position;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const beamFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  uniform float uOpacity;
  uniform float uPhase;
  uniform float uAudioEnergy;
  uniform vec3 uColor;

  varying vec3 vLocalPosition;
  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;

  vec3 fadeCurve(vec3 value) {
    return
      value *
      value *
      value *
      (value * (value * 6.0 - 15.0) + 10.0);
  }

  vec3 gradientHash(vec3 point) {
    vec3 hashed = fract(point * 0.1031);
    hashed += dot(hashed, hashed.yzx + 33.33);
    return normalize(
      fract(
        (hashed.xxy + hashed.yzz) * hashed.zyx
      ) *
      2.0 -
      1.0 +
      vec3(0.001)
    );
  }

  float perlin3(vec3 point) {
    vec3 cell = floor(point);
    vec3 local = fract(point);
    vec3 blend = fadeCurve(local);

    float n000 = dot(
      gradientHash(cell),
      local
    );
    float n100 = dot(
      gradientHash(cell + vec3(1.0, 0.0, 0.0)),
      local - vec3(1.0, 0.0, 0.0)
    );
    float n010 = dot(
      gradientHash(cell + vec3(0.0, 1.0, 0.0)),
      local - vec3(0.0, 1.0, 0.0)
    );
    float n110 = dot(
      gradientHash(cell + vec3(1.0, 1.0, 0.0)),
      local - vec3(1.0, 1.0, 0.0)
    );
    float n001 = dot(
      gradientHash(cell + vec3(0.0, 0.0, 1.0)),
      local - vec3(0.0, 0.0, 1.0)
    );
    float n101 = dot(
      gradientHash(cell + vec3(1.0, 0.0, 1.0)),
      local - vec3(1.0, 0.0, 1.0)
    );
    float n011 = dot(
      gradientHash(cell + vec3(0.0, 1.0, 1.0)),
      local - vec3(0.0, 1.0, 1.0)
    );
    float n111 = dot(
      gradientHash(cell + vec3(1.0, 1.0, 1.0)),
      local - vec3(1.0, 1.0, 1.0)
    );

    float x00 = mix(n000, n100, blend.x);
    float x10 = mix(n010, n110, blend.x);
    float x01 = mix(n001, n101, blend.x);
    float x11 = mix(n011, n111, blend.x);

    return mix(
      mix(x00, x10, blend.y),
      mix(x01, x11, blend.y),
      blend.z
    );
  }

  void main() {
    float heightRatio =
      clamp(-vLocalPosition.y / uHeight, 0.0, 1.0);
    float topFade =
      smoothstep(0.0, 0.075, heightRatio);
    float bottomFade =
      1.0 - smoothstep(0.76, 1.0, heightRatio);
    float verticalFade =
      topFade *
      bottomFade *
      mix(1.0, 0.38, heightRatio);

    float facing =
      abs(dot(normalize(vWorldNormal), normalize(vViewDirection)));
    float softEdge =
      smoothstep(0.0, 0.68, facing);
    softEdge *= softEdge;

    if (verticalFade < 0.004 || softEdge < 0.004) discard;

    vec3 flowPoint =
      vLocalPosition *
      vec3(0.72, 0.49, 0.72) +
      vec3(
        uTime * 0.045,
        -uTime * 0.17,
        uTime * 0.025
      );
    float broadNoise = perlin3(flowPoint);
    float detailNoise = perlin3(
      flowPoint * 2.17 +
      vec3(
        13.7,
        -uTime * 0.12,
        uPhase * 3.1
      )
    );
    float smoke =
      clamp(
        0.55 +
        broadNoise * 0.3 +
        detailNoise * 0.15,
        0.0,
        1.0
      );
    float filaments =
      smoothstep(0.2, 0.84, smoke);
    float breath =
      0.9 +
      0.1 *
      sin(uTime * 0.42 + uPhase);
    float alpha =
      uOpacity *
      softEdge *
      verticalFade *
      (0.035 + filaments * 0.965) *
      breath *
      (1.0 + uAudioEnergy * 0.42);

    if (alpha < 0.002) discard;

    vec3 color =
      uColor *
      (0.72 + smoke * 0.72) *
      (0.9 + heightRatio * 0.18) *
      (1.0 + uAudioEnergy * 0.5);
    gl_FragColor = vec4(color, alpha);
  }
`

const dustVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uMotionScale;
  uniform float uAudioEnergy;
  uniform vec3 uBeamOrigin[3];
  uniform vec3 uBeamDirection[3];
  uniform vec3 uBeamRight[3];
  uniform vec3 uBeamUp[3];
  uniform vec3 uBeamColor[3];
  uniform float uBeamHeight[3];
  uniform float uBeamRadius[3];

  attribute float aSeed;
  attribute float aBeam;
  attribute float aHeight;
  attribute float aRadial;
  attribute float aAngle;
  attribute float aSize;
  attribute float aDrift;

  varying vec3 vColor;
  varying float vBrightness;

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

  vec3 brownianDrift(float seed, float time) {
    vec3 phase = vec3(
      seed * 17.31,
      seed * 29.73,
      seed * 43.19
    );
    vec3 slowField = vec3(
      noise3(phase + vec3(time * 0.08, 0.0, 0.0)),
      noise3(phase + vec3(0.0, time * 0.065, 7.2)),
      noise3(phase + vec3(11.4, 0.0, time * 0.052))
    );
    vec3 fineField = vec3(
      noise3(phase * 1.73 + vec3(time * 0.19, 0.0, 0.0)),
      noise3(phase * 1.51 + vec3(0.0, time * 0.16, 5.3)),
      noise3(phase * 1.91 + vec3(8.1, 0.0, time * 0.14))
    );

    return
      (slowField * 2.0 - 1.0) * 0.72 +
      (fineField * 2.0 - 1.0) * 0.28;
  }

  void main() {
    int beamIndex = int(clamp(aBeam, 0.0, 2.0) + 0.5);
    vec3 origin = uBeamOrigin[beamIndex];
    vec3 direction = uBeamDirection[beamIndex];
    vec3 right = uBeamRight[beamIndex];
    vec3 up = uBeamUp[beamIndex];
    vec3 beamColor = uBeamColor[beamIndex];
    float beamHeight = uBeamHeight[beamIndex];
    float beamRadius = uBeamRadius[beamIndex];
    vec3 brownian =
      brownianDrift(aSeed, uTime) *
      uMotionScale;

    float heightRatio =
      clamp(
        aHeight +
        brownian.y * (0.018 + aHeight * 0.016),
        0.0,
        1.0
      );
    float coneRadius =
      mix(0.025, beamRadius, heightRatio);
    float angle =
      aAngle +
      uTime *
      (0.025 + aDrift * 0.025) *
      uMotionScale +
      brownian.x * 0.22;
    float radialDistance =
      aRadial *
      coneRadius +
      brownian.z *
      (0.13 + heightRatio * 0.18) *
      uMotionScale;
    vec3 coneCenter =
      origin +
      direction * beamHeight * heightRatio;
    vec3 transformed =
      coneCenter +
      right * cos(angle) * radialDistance +
      up * sin(angle) * radialDistance;

    float insideCone =
      1.0 -
      smoothstep(
        coneRadius * 0.92,
        coneRadius * 1.08,
        radialDistance
      );
    float heightVisibility =
      smoothstep(0.02, 0.12, heightRatio) *
      (1.0 - smoothstep(0.76, 0.98, heightRatio));
    float illumination =
      insideCone * heightVisibility;
    float twinkleWave =
      0.62 +
      0.38 *
      sin(
        uTime * (2.6 + aSeed * 3.4) +
        aSeed * 67.0
      );
    float twinkle =
      twinkleWave * twinkleWave;
    float lightGain = illumination * 2.8;

    vec4 modelViewPosition =
      modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;
    gl_PointSize =
      aSize *
      uPixelRatio *
      (6.2 / max(1.0, -modelViewPosition.z)) *
      (0.66 + illumination * 0.9) *
      (0.72 + twinkle * 0.46) *
      (1.0 + uAudioEnergy * 0.34);

    if (lightGain < 0.002) {
      gl_PointSize = 0.0;
    }

    vColor =
      mix(beamColor, vec3(0.78, 0.96, 1.0), 0.18) *
      (0.72 + illumination * 0.38);
    vBrightness =
      lightGain *
      twinkle *
      (1.0 + uAudioEnergy * 0.78);
  }
`

const dustFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vBrightness;

  void main() {
    if (vBrightness < 0.002) discard;

    vec2 centered = gl_PointCoord - 0.5;
    float radialSquared = dot(centered, centered) * 4.0;
    float halo = exp(-6.5 * radialSquared);
    float core = exp(-24.0 * radialSquared);
    float alpha =
      (halo * 0.35 + core * 0.72) *
      min(1.0, vBrightness);

    if (alpha < 0.004) discard;

    vec3 luminous =
      vColor * (0.92 + core * 1.45) +
      vec3(0.78, 0.94, 1.0) * core * 0.18;
    gl_FragColor = vec4(luminous, alpha);
  }
`

function createRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function createVolumetricSystem(variant: StageVariant) {
  const definitions =
    variant === 'architecture' ? ARCHITECTURE_BEAMS : HERO_BEAMS
  const opacity = variant === 'architecture' ? 0.05 : 0.034
  const beamGeometries: THREE.ConeGeometry[] = []
  const beamMaterials: THREE.ShaderMaterial[] = []
  const beamMeshes: THREE.Mesh[] = []
  const beamOrigins: THREE.Vector3[] = []
  const beamDirections: THREE.Vector3[] = []
  const beamRights: THREE.Vector3[] = []
  const beamUps: THREE.Vector3[] = []
  const beamColors: THREE.Color[] = []

  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index]
    const geometry = new THREE.ConeGeometry(
      definition.radius,
      definition.height,
      96,
      24,
      true,
    )
    geometry.translate(0, -definition.height / 2, 0)

    const color = new THREE.Color(
      INITIAL_PALETTE[index % INITIAL_PALETTE.length],
    )
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHeight: { value: definition.height },
        uOpacity: { value: opacity },
        uPhase: { value: definition.phase },
        uAudioEnergy: { value: 0 },
        uColor: { value: color },
      },
      vertexShader: beamVertexShader,
      fragmentShader: beamFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `VolumetricBeam-${beamMeshes.length}`
    mesh.renderOrder = -2
    mesh.frustumCulled = false

    beamGeometries.push(geometry)
    beamMaterials.push(material)
    beamMeshes.push(mesh)
    beamOrigins.push(new THREE.Vector3())
    beamDirections.push(new THREE.Vector3(0, -1, 0))
    beamRights.push(new THREE.Vector3(1, 0, 0))
    beamUps.push(new THREE.Vector3(0, 0, 1))
    beamColors.push(color)
  }

  const dustPositions = new Float32Array(VOLUMETRIC_DUST_COUNT * 3)
  const dustSeeds = new Float32Array(VOLUMETRIC_DUST_COUNT)
  const dustBeams = new Float32Array(VOLUMETRIC_DUST_COUNT)
  const dustHeights = new Float32Array(VOLUMETRIC_DUST_COUNT)
  const dustRadials = new Float32Array(VOLUMETRIC_DUST_COUNT)
  const dustAngles = new Float32Array(VOLUMETRIC_DUST_COUNT)
  const dustSizes = new Float32Array(VOLUMETRIC_DUST_COUNT)
  const dustDrifts = new Float32Array(VOLUMETRIC_DUST_COUNT)
  const random = createRandom(variant === 'hero' ? 821 : 1447)

  for (let index = 0; index < VOLUMETRIC_DUST_COUNT; index += 1) {
    dustSeeds[index] = random()
    dustBeams[index] = index % VOLUMETRIC_BEAM_COUNT
    dustHeights[index] = 0.04 + random() * 0.84
    dustRadials[index] = Math.sqrt(random()) * 1.18
    dustAngles[index] = random() * Math.PI * 2
    dustSizes[index] = 1.35 + random() * 3.7
    dustDrifts[index] = random()
  }

  const dustGeometry = new THREE.BufferGeometry()
  dustGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(dustPositions, 3),
  )
  dustGeometry.setAttribute(
    'aSeed',
    new THREE.BufferAttribute(dustSeeds, 1),
  )
  dustGeometry.setAttribute(
    'aBeam',
    new THREE.BufferAttribute(dustBeams, 1),
  )
  dustGeometry.setAttribute(
    'aHeight',
    new THREE.BufferAttribute(dustHeights, 1),
  )
  dustGeometry.setAttribute(
    'aRadial',
    new THREE.BufferAttribute(dustRadials, 1),
  )
  dustGeometry.setAttribute(
    'aAngle',
    new THREE.BufferAttribute(dustAngles, 1),
  )
  dustGeometry.setAttribute(
    'aSize',
    new THREE.BufferAttribute(dustSizes, 1),
  )
  dustGeometry.setAttribute(
    'aDrift',
    new THREE.BufferAttribute(dustDrifts, 1),
  )
  dustGeometry.setDrawRange(0, VOLUMETRIC_DUST_COUNT)

  const dustMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uMotionScale: { value: 1 },
      uAudioEnergy: { value: 0 },
      uBeamOrigin: { value: beamOrigins },
      uBeamDirection: { value: beamDirections },
      uBeamRight: { value: beamRights },
      uBeamUp: { value: beamUps },
      uBeamColor: { value: beamColors },
      uBeamHeight: {
        value: definitions.map((definition) => definition.height),
      },
      uBeamRadius: {
        value: definitions.map((definition) => definition.radius),
      },
    },
    vertexShader: dustVertexShader,
    fragmentShader: dustFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })

  const dustPoints = new THREE.Points(dustGeometry, dustMaterial)
  dustPoints.name = 'VolumetricIlluminatedDust'
  dustPoints.renderOrder = -1
  dustPoints.frustumCulled = false
  dustPoints.userData.particleCount = VOLUMETRIC_DUST_COUNT

  return {
    definitions,
    beamMeshes,
    beamGeometries,
    beamMaterials,
    beamOrigins,
    beamDirections,
    beamRights,
    beamUps,
    dustPoints,
    dustGeometry,
    dustMaterial,
  }
}

export function VolumetricStageLights({
  variant = 'hero',
}: {
  variant?: StageVariant
}) {
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const performanceTier = useAppStore((state) => state.performanceTier)
  const viewportWidth = useThree((state) => state.size.width)
  const preset = getVfxPreset(vfxPreset)
  const volumetricSystem = useMemo(
    () => createVolumetricSystem(variant),
    [variant],
  )
  const primaryGroupRef = useRef<THREE.Group>(null)
  const secondaryGroupRef = useRef<THREE.Group>(null)
  const tertiaryGroupRef = useRef<THREE.Group>(null)
  const beamGroupRefs = useMemo(
    () => [
      primaryGroupRef,
      secondaryGroupRef,
      tertiaryGroupRef,
    ],
    [],
  )
  const disposalRef = useRef<{
    resource: object
    timer: number
  } | null>(null)
  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const {
    definitions,
    beamMeshes,
    beamGeometries,
    beamMaterials,
    beamOrigins,
    beamDirections,
    beamRights,
    beamUps,
    dustPoints,
    dustGeometry,
    dustMaterial,
  } = volumetricSystem
  const activeDustCount =
    performanceTier === 'high' && viewportWidth >= 768
      ? VOLUMETRIC_DUST_COUNT
      : Math.round(VOLUMETRIC_DUST_COUNT / 2)
  const telemetrySource = `volumetric-${variant}`

  useEffect(() => {
    const colors = [preset.primary, preset.secondary, preset.tertiary]
    for (let index = 0; index < beamMaterials.length; index += 1) {
      ;(beamMaterials[index].uniforms.uColor.value as THREE.Color).set(
        colors[index % colors.length],
      )
    }
  }, [beamMaterials, preset.primary, preset.secondary, preset.tertiary])

  useEffect(() => {
    dustGeometry.setDrawRange(0, activeDustCount)
    dustPoints.userData.particleCount = activeDustCount
    setParticleSourceCount(telemetrySource, activeDustCount)
    return () => setParticleSourceCount(telemetrySource, 0)
  }, [activeDustCount, dustGeometry, dustPoints, telemetrySource])

  useEffect(() => {
    if (disposalRef.current?.resource === volumetricSystem) {
      window.clearTimeout(disposalRef.current.timer)
      disposalRef.current = null
    }

    const resource = volumetricSystem
    return () => {
      const timer = window.setTimeout(() => {
        for (let index = 0; index < beamMeshes.length; index += 1) {
          beamMeshes[index].removeFromParent()
          beamGeometries[index].dispose()
          beamMaterials[index].dispose()
        }
        dustPoints.removeFromParent()
        dustGeometry.dispose()
        dustMaterial.dispose()
        if (disposalRef.current?.timer === timer) {
          disposalRef.current = null
        }
      }, 0)
      disposalRef.current = { resource, timer }
    }
  }, [volumetricSystem])

  useFrame((state, delta) => {
    const transient = readTransientState()
    const audioEnergy = soundEngine.readEnergyEnvelope()
    const time = state.clock.elapsedTime
    const motionScale = reducedMotion ? 0.18 : 1
    const pointerX =
      transient.pointerActive ? transient.pointer.x : 0
    const pointerY =
      transient.pointerActive ? transient.pointer.y : 0
    const scrollEnergy =
      Math.sin(
        transient.scrollProgress * Math.PI * 2 +
        (variant === 'hero' ? 0.4 : 1.8),
      )
    const compactSpread = state.size.width < 700 ? 0.42 : 1

    for (let index = 0; index < definitions.length; index += 1) {
      const group = beamGroupRefs[index].current
      const definition = definitions[index]

      if (!group) continue

      group.position.x = THREE.MathUtils.damp(
        group.position.x,
        definition.position[0] * compactSpread,
        2.4,
        delta,
      )
      const targetRotationX =
        definition.rotationX +
        pointerY * 0.032 * motionScale +
        Math.sin(time * 0.18 + definition.phase) *
          0.012 *
          motionScale +
        scrollEnergy * 0.009 * motionScale
      const targetRotationZ =
        definition.rotationZ +
        pointerX * 0.042 * motionScale +
        Math.cos(time * 0.145 + definition.phase) *
          0.014 *
          motionScale +
        transient.scrollProgress * 0.018 * motionScale

      group.rotation.x = THREE.MathUtils.damp(
        group.rotation.x,
        targetRotationX,
        2.8,
        delta,
      )
      group.rotation.z = THREE.MathUtils.damp(
        group.rotation.z,
        targetRotationZ,
        2.6,
        delta,
      )
      group.updateMatrixWorld()
      group.getWorldPosition(beamOrigins[index])
      beamDirections[index]
        .set(0, -1, 0)
        .applyQuaternion(group.quaternion)
        .normalize()
      beamRights[index]
        .set(1, 0, 0)
        .applyQuaternion(group.quaternion)
        .normalize()
      beamUps[index]
        .set(0, 0, 1)
        .applyQuaternion(group.quaternion)
        .normalize()

      beamMaterials[index].uniforms.uTime.value = time
      beamMaterials[index].uniforms.uAudioEnergy.value = audioEnergy
      beamMaterials[index].uniforms.uOpacity.value =
        (variant === 'architecture' ? 0.05 : 0.034) *
        (reducedMotion ? 0.72 : 1)
    }

    dustMaterial.uniforms.uTime.value = time
    dustMaterial.uniforms.uPixelRatio.value = state.viewport.dpr
    dustMaterial.uniforms.uMotionScale.value = motionScale
    dustMaterial.uniforms.uAudioEnergy.value = audioEnergy
  })

  return (
    <>
      {beamMeshes.map((mesh, index) => (
        <group
          key={mesh.name}
          ref={beamGroupRefs[index]}
          position={definitions[index].position}
          rotation={[
            definitions[index].rotationX,
            0,
            definitions[index].rotationZ,
          ]}
        >
          <primitive object={mesh} />
        </group>
      ))}
      <primitive object={dustPoints} />
    </>
  )
}
