import { useFrame, useThree } from '@react-three/fiber'
import {
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react'
import * as THREE from 'three'
import { REACTOR_OVERDRIVE_TIMING } from '../../../data/reactorTiming'
import { getVfxPreset } from '../../../data/vfxPresets'
import { useAppStore } from '../../../store/useAppStore'
import {
  useGalleryStore,
  type ExhibitMeta,
} from '../../../store/useGalleryStore'
import { getEffectiveGalleryTimeScale } from '../../../utils/motionPreferences'
import { soundEngine } from '../../../utils/soundEngine'
import type { GalleryPointerState } from '../OpticalExhibitScene'
import {
  plasmaCoreVertexShader,
  plasmaCoreFragmentShader,
  coronaVertexShader,
  coronaFragmentShader,
  shieldVertexShader,
  shieldFragmentShader,
  shockwaveVertexShader,
  shockwaveFragmentShader,
} from '../../../shaders/plasmaReactor'

const TAU = Math.PI * 2
const OVERDRIVE_CHARGE_DURATION =
  REACTOR_OVERDRIVE_TIMING.chargeSeconds
const OVERDRIVE_FADE_START =
  REACTOR_OVERDRIVE_TIMING.fadeStartSeconds
const OVERDRIVE_FADE_END =
  REACTOR_OVERDRIVE_TIMING.fadeEndSeconds
const SHOCKWAVE_DURATION =
  REACTOR_OVERDRIVE_TIMING.shockwaveSeconds
const MAX_ARCS = 24
const BASE_ARC_MIN = 8
const BASE_ARC_MAX = 12
const MAIN_ARC_SEGMENTS = 16
const ARC_POINT_COUNT = MAIN_ARC_SEGMENTS + 1
const BRANCHES_PER_ARC = 2
const BRANCH_SEGMENTS = 3
const SEGMENTS_PER_ARC =
  MAIN_ARC_SEGMENTS + BRANCHES_PER_ARC * BRANCH_SEGMENTS
const MAX_LINE_VERTICES = MAX_ARCS * SEGMENTS_PER_ARC * 2

const GIMBAL_CONFIGS = [
  {
    radius: 0.72,
    baseRotation: [0, 0, 0] as const,
    speed: [0.16, -0.11, -0.22] as const,
    pulseSpeed: 1.55,
    color: '#9ceeff',
  },
  {
    radius: 0.86,
    baseRotation: [Math.PI / 2, 0, 0] as const,
    speed: [0.1, 0.19, 0.14] as const,
    pulseSpeed: 1.92,
    color: '#d0b4ff',
  },
  {
    radius: 0.99,
    baseRotation: [0, Math.PI / 2, 0] as const,
    speed: [-0.15, 0.12, 0.2] as const,
    pulseSpeed: 1.28,
    color: '#8cfff0',
  },
] as const

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(min: number, max: number, value: number) {
  const normalized = clamp(
    (value - min) / Math.max(0.0001, max - min),
    0,
    1,
  )
  return normalized * normalized * (3 - 2 * normalized)
}

function randomSigned(seed: number, iteration: number) {
  const value =
    Math.sin(seed * 91.73 + iteration * 37.19) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

function buildFractalPath(
  start: THREE.Vector3,
  end: THREE.Vector3,
  seed: number,
  time: number,
  turbulence: number,
  source: Float32Array,
  target: Float32Array,
) {
  source[0] = start.x
  source[1] = start.y
  source[2] = start.z
  source[3] = end.x
  source[4] = end.y
  source[5] = end.z
  let count = 2
  let amplitude =
    (start.distanceTo(end) * 0.16 + 0.045) *
    (0.62 + turbulence * 0.74)
  let current = source
  let next = target

  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (let index = 0; index < count; index += 1) {
      const destination = index * 2 * 3
      const sourceOffset = index * 3
      next[destination] = current[sourceOffset]
      next[destination + 1] = current[sourceOffset + 1]
      next[destination + 2] = current[sourceOffset + 2]
    }

    for (let index = 0; index < count - 1; index += 1) {
      const left = index * 3
      const right = (index + 1) * 3
      const destination = (index * 2 + 1) * 3
      const midpointX = (current[left] + current[right]) * 0.5
      const midpointY =
        (current[left + 1] + current[right + 1]) * 0.5
      const midpointZ =
        (current[left + 2] + current[right + 2]) * 0.5
      const radialLength =
        Math.hypot(midpointX, midpointY, midpointZ) || 1
      const noiseX =
        randomSigned(seed + index, iteration) * 0.78 +
        (midpointX / radialLength) * 0.22
      const noiseY =
        randomSigned(seed + 19 + index, iteration) * 0.78 +
        (midpointY / radialLength) * 0.22
      const noiseZ =
        randomSigned(seed + 41 + index, iteration) * 0.78 +
        (midpointZ / radialLength) * 0.22
      const pulse =
        0.72 +
        0.28 * Math.sin(time * 9.0 + seed + index)
      next[destination] = midpointX + noiseX * amplitude * pulse
      next[destination + 1] =
        midpointY + noiseY * amplitude * pulse
      next[destination + 2] =
        midpointZ + noiseZ * amplitude * pulse
    }

    count = count * 2 - 1
    const swap = current
    current = next
    next = swap
    amplitude *= 0.52
  }

  return current
}

function createLightningState() {
  const lineGeometry = new THREE.BufferGeometry()
  const contactGeometry = new THREE.BufferGeometry()
  const linePositions = new Float32Array(MAX_LINE_VERTICES * 3)
  const contactPositions = new Float32Array(MAX_ARCS * 3)
  contactPositions.fill(9999)
  const lineAttribute = new THREE.BufferAttribute(
    linePositions,
    3,
  ).setUsage(THREE.DynamicDrawUsage)
  const contactAttribute = new THREE.BufferAttribute(
    contactPositions,
    3,
  ).setUsage(THREE.DynamicDrawUsage)
  lineGeometry.setAttribute('position', lineAttribute)
  lineGeometry.setDrawRange(0, 0)
  contactGeometry.setAttribute('position', contactAttribute)
  contactGeometry.setDrawRange(0, 0)

  return {
    lineGeometry,
    contactGeometry,
    linePositions,
    contactPositions,
    lineAttribute,
    contactAttribute,
    pathA: new Float32Array(ARC_POINT_COUNT * 3),
    pathB: new Float32Array(ARC_POINT_COUNT * 3),
    ringRotation: new THREE.Euler(),
    baseRotation: new THREE.Euler(),
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    branchStart: new THREE.Vector3(),
    branchEnd: new THREE.Vector3(),
    branchDirection: new THREE.Vector3(),
    branchJitter: new THREE.Vector3(),
    updateAccumulator: 0,
    updateCount: 0,
  }
}

function ringRotationAt(
  ringIndex: number,
  time: number,
  magneticField: number,
  pointer: GalleryPointerState,
  target: THREE.Euler,
) {
  const config = GIMBAL_CONFIGS[ringIndex]
  const fieldScale = 0.72 + magneticField * 0.42
  target.set(
    time * config.speed[0] * fieldScale +
      Math.sin(time * 0.31) * 0.1 +
      pointer.v * 0.035,
    time * config.speed[1] * fieldScale +
      pointer.u * 0.045,
    time * config.speed[2] * fieldScale,
  )
  return target
}

function ringContactPoint(
  ringIndex: number,
  angle: number,
  time: number,
  magneticField: number,
  pointer: GalleryPointerState,
  state: ReturnType<typeof createLightningState>,
  target: THREE.Vector3,
) {
  const config = GIMBAL_CONFIGS[ringIndex]
  ringRotationAt(
    ringIndex,
    time,
    magneticField,
    pointer,
    state.ringRotation,
  )
  state.baseRotation.set(
    config.baseRotation[0],
    config.baseRotation[1],
    config.baseRotation[2],
  )
  return target
    .set(
      Math.cos(angle) * (config.radius - 0.035),
      Math.sin(angle) * (config.radius - 0.035),
      0,
    )
    .applyEuler(state.ringRotation)
    .applyEuler(state.baseRotation)
}

export function PlasmaReactorExhibit({
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
  const magneticField = exhibit.params.magneticField ?? 1.28
  const temperature = exhibit.params.temperature ?? 92
  const turbulence = exhibit.params.turbulence ?? 0.72
  const arcCount = Math.round(
    clamp(
      exhibit.params.arcCount ?? 10,
      BASE_ARC_MIN,
      BASE_ARC_MAX,
    ),
  )
  const reactorOverdrivePulse = useGalleryStore(
    (state) => state.reactorOverdrivePulse,
  )
  const displayScale = mode === 'darkroom' ? 1.18 : 0.94
  const highDetail = performanceTier === 'high'
  const interaction = useMemo(
    () => ({
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      sphere: new THREE.Sphere(
        new THREE.Vector3(),
        1.04 * displayScale,
      ),
      hitWorld: new THREE.Vector3(),
      hitLocal: new THREE.Vector3(),
      inverseMatrix: new THREE.Matrix4(),
    }),
    [displayScale],
  )
  const hostRef = useRef<HTMLElement | null>(null)
  const dataUpdateRef = useRef(0)
  const coreGroupRef = useRef<THREE.Group>(null)
  const shieldGroupRef = useRef<THREE.Group>(null)
  const shockwaveRef = useRef<THREE.Mesh>(null)
  const shockLightRef = useRef<THREE.PointLight>(null)
  const ringRefs = useRef<Array<THREE.Group | null>>([])
  const pulseRefs = useRef<
    Array<Array<THREE.Mesh | null>>
  >([[], [], []])
  const centralLightRef = useRef<THREE.PointLight>(null)
  const ringLightRef = useRef<THREE.PointLight>(null)
  const corePinMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const coreHaloMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const contactMaterialRef =
    useRef<THREE.PointsMaterial>(null)
  const arcGlowMaterialRef =
    useRef<THREE.LineBasicMaterial>(null)
  const arcCoreMaterialRef =
    useRef<THREE.LineBasicMaterial>(null)
  const ringTimeRef = useRef(0)
  const overdriveStartRef = useRef(-1)
  const overdriveRequestRef = useRef(false)
  const lastOverdrivePulseRef = useRef(reactorOverdrivePulse)
  const shockStartedAtRef = useRef(-1)
  const lastPointerImpulseRef = useRef(0)
  const rippleStateRef = useRef({
    age: 10,
    strength: 0,
    hits: 0,
    lastHoverAt: Number.NEGATIVE_INFINITY,
    origin: new THREE.Vector3(0, 1, 0),
    lastHoverOrigin: new THREE.Vector3(0, -1, 0),
  })
  const baseCoreLightColor = useMemo(
    () => new THREE.Color('#48f5c8'),
    [],
  )
  const overdriveCoreLightColor = useMemo(
    () => new THREE.Color('#bceeff'),
    [],
  )
  const basePinColor = useMemo(
    () => new THREE.Color('#d9fff1'),
    [],
  )
  const overdrivePinColor = useMemo(
    () => new THREE.Color('#effbff'),
    [],
  )
  const baseHaloColor = useMemo(
    () => new THREE.Color('#25dfb4'),
    [],
  )
  const overdriveHaloColor = useMemo(
    () => new THREE.Color('#57c8ff'),
    [],
  )

  const coreMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uTemperature: { value: temperature / 160 },
          uTurbulence: { value: turbulence },
          uAudioEnergy: { value: 0 },
          uOverdrive: { value: 0 },
          uCharge: { value: 0 },
        },
        vertexShader: plasmaCoreVertexShader,
        fragmentShader: plasmaCoreFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        toneMapped: false,
      }),
    [],
  )
  const coronaMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uPrimary: { value: new THREE.Color(palette.primary) },
          uSecondary: { value: new THREE.Color(palette.tertiary) },
          uTime: { value: 0 },
          uTurbulence: { value: turbulence },
          uAudioEnergy: { value: 0 },
          uOverdrive: { value: 0 },
          uCharge: { value: 0 },
        },
        vertexShader: coronaVertexShader,
        fragmentShader: coronaFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [palette.primary, palette.tertiary],
  )
  const shieldMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uPrimary: { value: new THREE.Color(palette.primary) },
          uSecondary: { value: new THREE.Color(palette.secondary) },
          uTertiary: { value: new THREE.Color(palette.tertiary) },
          uTime: { value: 0 },
          uAudioEnergy: { value: 0 },
          uRippleOrigin: {
            value: new THREE.Vector3(0, 1, 0),
          },
          uRippleAge: { value: 10 },
          uRippleStrength: { value: 0 },
          uOverdrive: { value: 0 },
          uCharge: { value: 0 },
          uShockProgress: { value: 0 },
        },
        vertexShader: shieldVertexShader,
        fragmentShader: shieldFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [
      palette.primary,
      palette.secondary,
      palette.tertiary,
    ],
  )
  const shockwaveMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uPrimary: { value: new THREE.Color(palette.primary) },
          uSecondary: { value: new THREE.Color(palette.secondary) },
          uTertiary: { value: new THREE.Color(palette.tertiary) },
          uTime: { value: 0 },
          uProgress: { value: 0 },
        },
        vertexShader: shockwaveVertexShader,
        fragmentShader: shockwaveFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [
      palette.primary,
      palette.secondary,
      palette.tertiary,
    ],
  )
  const lightning = useMemo(createLightningState, [])

  useEffect(
    () => () => {
      coreMaterial.dispose()
      coronaMaterial.dispose()
      shieldMaterial.dispose()
      shockwaveMaterial.dispose()
    },
    [
      coreMaterial,
      coronaMaterial,
      shieldMaterial,
      shockwaveMaterial,
    ],
  )

  useEffect(
    () => () => {
      lightning.lineGeometry.dispose()
      lightning.contactGeometry.dispose()
    },
    [lightning],
  )

  useEffect(() => {
    if (
      reactorOverdrivePulse ===
      lastOverdrivePulseRef.current
    ) {
      return
    }
    lastOverdrivePulseRef.current = reactorOverdrivePulse
    overdriveRequestRef.current = true
  }, [reactorOverdrivePulse])

  useEffect(() => {
    const host = gl.domElement.closest<HTMLElement>(
      '[data-gallery-shared-canvas]',
    )
    if (!host) return
    hostRef.current = host
    const instanceCount =
      Number(host.dataset.plasmaReactorInstances ?? 0) + 1
    host.dataset.plasmaReactorInstances = String(instanceCount)
    host.dataset.plasmaReactor = 'hybrid-core'
    host.dataset.plasmaCoreShader =
      'turbulence-fbm-fusion-spectrum'
    host.dataset.plasmaCoreLayers = '3'
    host.dataset.plasmaGimbalRings = '3'
    host.dataset.plasmaArcMode =
      'fractal-midpoint-displacement'
    host.dataset.plasmaArcCount = String(arcCount)
    host.dataset.plasmaShield = 'hex-fbm-scan'
    host.dataset.plasmaTemperature = String(temperature)
    host.dataset.plasmaMagneticField =
      magneticField.toFixed(2)
    host.dataset.plasmaLightningVertices =
      String(MAX_LINE_VERTICES)
    host.dataset.plasmaShieldInteraction =
      'raycast-spherical-ripple'
    host.dataset.plasmaOverdrive =
      'charge-1.5s-rings-4x-arcs-2x'
    host.dataset.plasmaShockwave =
      'spherical-refraction-plasma'

    return () => {
      const remainingInstances = Math.max(
        0,
        Number(host.dataset.plasmaReactorInstances ?? 1) - 1,
      )
      if (remainingInstances > 0) {
        host.dataset.plasmaReactorInstances =
          String(remainingInstances)
        hostRef.current = null
        return
      }
      delete host.dataset.plasmaReactorInstances
      delete host.dataset.plasmaReactor
      delete host.dataset.plasmaCoreShader
      delete host.dataset.plasmaCoreLayers
      delete host.dataset.plasmaGimbalRings
      delete host.dataset.plasmaArcMode
      delete host.dataset.plasmaArcCount
      delete host.dataset.plasmaShield
      delete host.dataset.plasmaTemperature
      delete host.dataset.plasmaMagneticField
      delete host.dataset.plasmaLightningVertices
      delete host.dataset.plasmaShieldInteraction
      delete host.dataset.plasmaShieldHits
      delete host.dataset.plasmaRippleOrigin
      delete host.dataset.plasmaRippleStrength
      delete host.dataset.plasmaOverdrive
      delete host.dataset.plasmaOverdrivePhase
      delete host.dataset.plasmaOverdriveCharge
      delete host.dataset.plasmaRingSpeed
      delete host.dataset.plasmaShockwave
      delete host.dataset.plasmaShockProgress
      delete host.dataset.plasmaAudioEnergy
      delete host.dataset.plasmaArcUpdates
      hostRef.current = null
    }
  }, [arcCount, gl, magneticField, temperature])

  useFrame((state, delta) => {
    const timeScale = getEffectiveGalleryTimeScale(
      useGalleryStore.getState().timeScale,
    )
    const time = state.clock.elapsedTime * timeScale
    const clockTime = state.clock.elapsedTime
    const safeDelta = Math.min(delta, 0.05)
    const pointer = pointerRef.current
    const audioEnergy = soundEngine.readEnergyEnvelope()

    if (overdriveRequestRef.current) {
      overdriveRequestRef.current = false
      overdriveStartRef.current = clockTime
      shockStartedAtRef.current = -1
    }
    const overdriveElapsed =
      overdriveStartRef.current >= 0
        ? clockTime - overdriveStartRef.current
        : Number.POSITIVE_INFINITY
    let overdriveCharge = 0
    let overdrive = 0
    if (
      overdriveElapsed >= 0 &&
      overdriveElapsed < OVERDRIVE_CHARGE_DURATION
    ) {
      overdriveCharge = clamp(
        overdriveElapsed / OVERDRIVE_CHARGE_DURATION,
        0,
        1,
      )
      overdrive =
        smoothstep(0, 0.22, overdriveElapsed) *
        (0.65 + overdriveCharge * 0.35)
    } else if (
      overdriveElapsed >= OVERDRIVE_CHARGE_DURATION &&
      overdriveElapsed < OVERDRIVE_FADE_START
    ) {
      overdriveCharge = 1
      overdrive = 1
    } else if (
      overdriveElapsed >= OVERDRIVE_FADE_START &&
      overdriveElapsed < OVERDRIVE_FADE_END
    ) {
      overdriveCharge = 1
      overdrive =
        1 -
        smoothstep(
          OVERDRIVE_FADE_START,
          OVERDRIVE_FADE_END,
          overdriveElapsed,
        )
    }
    if (
      overdriveStartRef.current >= 0 &&
      overdriveElapsed >= OVERDRIVE_CHARGE_DURATION &&
      shockStartedAtRef.current < 0
    ) {
      shockStartedAtRef.current = clockTime
      rippleStateRef.current.age = 0
      rippleStateRef.current.strength = 1.25
      rippleStateRef.current.hits += 1
      rippleStateRef.current.origin.set(0, 1, 0)
    }
    const shockProgress =
      shockStartedAtRef.current < 0
        ? 0
        : clamp(
            (clockTime - shockStartedAtRef.current) /
              SHOCKWAVE_DURATION,
            0,
            1,
          )
    const overdrivePhase =
      overdriveStartRef.current < 0 ||
      overdriveElapsed >= OVERDRIVE_FADE_END
        ? 'idle'
        : overdriveElapsed < OVERDRIVE_CHARGE_DURATION
          ? 'charging'
          : shockProgress < 1
            ? 'shockwave'
            : 'cooldown'
    const activeArcCount =
      arcCount * (overdrive > 0.06 ? 2 : 1)
    const ringSpeedMultiplier = 1 + overdrive * 3
    ringTimeRef.current +=
      safeDelta * timeScale * ringSpeedMultiplier
    const ringTime = ringTimeRef.current

    interaction.pointer.set(pointer.u, pointer.v)
    interaction.raycaster.setFromCamera(
      interaction.pointer,
      camera,
    )
    const shieldHit =
      interaction.raycaster.ray.intersectSphere(
        interaction.sphere,
        interaction.hitWorld,
      )
    if (shieldHit && shieldGroupRef.current) {
      shieldGroupRef.current.updateWorldMatrix(true, false)
      interaction.hitLocal
        .copy(shieldHit)
        .applyMatrix4(
          interaction.inverseMatrix
            .copy(shieldGroupRef.current.matrixWorld)
            .invert(),
        )
        .normalize()
      const pointerMoved = interaction.hitLocal.distanceTo(
        rippleStateRef.current.lastHoverOrigin,
      )
      const clickRipple =
        pointer.impulse !== lastPointerImpulseRef.current
      if (clickRipple) {
        rippleStateRef.current.age = 0
        rippleStateRef.current.strength = 0.94
        rippleStateRef.current.hits += 1
        rippleStateRef.current.origin.copy(
          interaction.hitLocal,
        )
      } else if (
        pointer.active &&
        pointerMoved > 0.018 &&
        clockTime - rippleStateRef.current.lastHoverAt > 0.16
      ) {
        rippleStateRef.current.age = 0
        rippleStateRef.current.strength = 0.34
        rippleStateRef.current.hits += 1
        rippleStateRef.current.origin.copy(
          interaction.hitLocal,
        )
        rippleStateRef.current.lastHoverAt = clockTime
        rippleStateRef.current.lastHoverOrigin.copy(
          interaction.hitLocal,
        )
      }
      if (clickRipple) {
        rippleStateRef.current.lastHoverOrigin.copy(
          interaction.hitLocal,
        )
      }
    }
    lastPointerImpulseRef.current = pointer.impulse
    rippleStateRef.current.age += safeDelta * timeScale

    if (coreGroupRef.current) {
      coreGroupRef.current.rotation.y =
        time * 0.055 + pointer.u * 0.09
      coreGroupRef.current.rotation.x =
        Math.sin(time * 0.21) * 0.045 + pointer.v * 0.055
    }
    if (shieldGroupRef.current) {
      shieldGroupRef.current.rotation.y =
        -time * 0.024 + pointer.u * 0.035
      shieldGroupRef.current.rotation.x =
        Math.sin(time * 0.13) * 0.02 + pointer.v * 0.02
    }
    if (corePinMaterialRef.current) {
      corePinMaterialRef.current.color.lerpColors(
        basePinColor,
        overdrivePinColor,
        overdrive,
      )
    }
    if (coreHaloMaterialRef.current) {
      coreHaloMaterialRef.current.color.lerpColors(
        baseHaloColor,
        overdriveHaloColor,
        overdrive,
      )
      coreHaloMaterialRef.current.opacity =
        0.22 + overdrive * 0.16
    }

    const coreUniforms = coreMaterial.uniforms
    coreUniforms.uTime.value = time
    coreUniforms.uTemperature.value = clamp(
      temperature / 160 +
        overdrive * (1 - temperature / 160),
      0,
      1,
    )
    coreUniforms.uTurbulence.value =
      turbulence * (1 + overdrive * 0.42)
    coreUniforms.uAudioEnergy.value = audioEnergy
    coreUniforms.uOverdrive.value = overdrive
    coreUniforms.uCharge.value = overdriveCharge
    const coronaUniforms = coronaMaterial.uniforms
    coronaUniforms.uTime.value = time
    coronaUniforms.uTurbulence.value =
      turbulence * (1 + overdrive * 0.5)
    coronaUniforms.uAudioEnergy.value = audioEnergy
    coronaUniforms.uOverdrive.value = overdrive
    coronaUniforms.uCharge.value = overdriveCharge
    const shieldUniforms = shieldMaterial.uniforms
    shieldUniforms.uTime.value = time
    shieldUniforms.uAudioEnergy.value = audioEnergy
    shieldUniforms.uRippleOrigin.value.copy(
      rippleStateRef.current.origin,
    )
    shieldUniforms.uRippleAge.value =
      rippleStateRef.current.age
    shieldUniforms.uRippleStrength.value =
      rippleStateRef.current.strength
    shieldUniforms.uOverdrive.value = overdrive
    shieldUniforms.uCharge.value = overdriveCharge
    shieldUniforms.uShockProgress.value = shockProgress
    const shockUniforms = shockwaveMaterial.uniforms
    shockUniforms.uTime.value = time
    shockUniforms.uProgress.value = shockProgress

    GIMBAL_CONFIGS.forEach((config, ringIndex) => {
      const ring = ringRefs.current[ringIndex]
      if (!ring) return
      ringRotationAt(
        ringIndex,
        ringTime,
        magneticField,
        pointer,
        ring.rotation,
      )
      pulseRefs.current[ringIndex].forEach((pulse, pulseIndex) => {
        if (!pulse) return
        const angle =
          pulseIndex * (TAU / 3) +
          ringTime *
            config.pulseSpeed *
            (0.72 + magneticField * 0.34)
        pulse.position.set(
          Math.cos(angle) * config.radius,
          Math.sin(angle) * config.radius,
          0,
        )
        pulse.scale.setScalar(
          0.82 +
            Math.sin(time * 7.2 + pulseIndex * 2.1) * 0.16,
        )
      })
    })

    lightning.updateAccumulator += delta
    const updateInterval = highDetail ? 1 / 18 : 1 / 10
    const shouldRebuild =
      lightning.updateAccumulator >= updateInterval
    if (shouldRebuild) {
      lightning.updateAccumulator %= updateInterval
      let vertexCursor = 0

      for (
        let arcIndex = 0;
        arcIndex < activeArcCount;
        arcIndex += 1
      ) {
        const ringIndex = arcIndex % GIMBAL_CONFIGS.length
        const config = GIMBAL_CONFIGS[ringIndex]
        const seed = arcIndex * 17.31 + 3.7
        const startTheta = seed * 0.73 + time * 0.08
        const startY = Math.sin(seed * 1.91) * 0.78
        const radial = Math.sqrt(
          Math.max(0, 1 - startY * startY),
        )
        lightning.start.set(
          Math.cos(startTheta) * radial * 0.42,
          startY * 0.42,
          Math.sin(startTheta) * radial * 0.42,
        )
        const contactAngle =
          seed +
          ringTime *
            config.pulseSpeed *
            (0.72 + magneticField * 0.34)
        ringContactPoint(
          ringIndex,
          contactAngle,
          ringTime,
          magneticField,
          pointer,
          lightning,
          lightning.end,
        )
        const path = buildFractalPath(
          lightning.start,
          lightning.end,
          seed,
          time,
          turbulence * (1 + overdrive * 0.82),
          lightning.pathA,
          lightning.pathB,
        )

        for (
          let segment = 0;
          segment < MAIN_ARC_SEGMENTS;
          segment += 1
        ) {
          const left = segment * 3
          const right = (segment + 1) * 3
          const destination = vertexCursor * 3
          lightning.linePositions[destination] = path[left]
          lightning.linePositions[destination + 1] =
            path[left + 1]
          lightning.linePositions[destination + 2] =
            path[left + 2]
          lightning.linePositions[destination + 3] =
            path[right]
          lightning.linePositions[destination + 4] =
            path[right + 1]
          lightning.linePositions[destination + 5] =
            path[right + 2]
          vertexCursor += 2
        }

        for (
          let branchIndex = 0;
          branchIndex < BRANCHES_PER_ARC;
          branchIndex += 1
        ) {
          const sourcePoint =
            (5 + branchIndex * 5 + arcIndex) %
            ARC_POINT_COUNT
          const sourceOffset = sourcePoint * 3
          lightning.branchStart.set(
            path[sourceOffset],
            path[sourceOffset + 1],
            path[sourceOffset + 2],
          )
          lightning.branchDirection
            .copy(lightning.branchStart)
            .normalize()
            .add(
              lightning.branchJitter.set(
                randomSigned(seed + branchIndex, 2),
                randomSigned(seed + branchIndex, 3),
                randomSigned(seed + branchIndex, 4),
              ),
            )
            .normalize()
          lightning.branchEnd
            .copy(lightning.branchStart)
            .addScaledVector(
              lightning.branchDirection,
              0.075 +
                Math.abs(
                  randomSigned(seed + branchIndex, 5),
                ) *
                  0.12,
            )
          for (
            let segment = 0;
            segment < BRANCH_SEGMENTS;
            segment += 1
          ) {
            const startRatio = segment / BRANCH_SEGMENTS
            const endRatio = (segment + 1) / BRANCH_SEGMENTS
            const destination = vertexCursor * 3
            lightning.linePositions[destination] =
              lightning.branchStart.x +
              (lightning.branchEnd.x -
                lightning.branchStart.x) *
                startRatio +
              randomSigned(seed + segment, 8) *
                0.008 *
                (1 - startRatio)
            lightning.linePositions[destination + 1] =
              lightning.branchStart.y +
              (lightning.branchEnd.y -
                lightning.branchStart.y) *
                startRatio +
              randomSigned(seed + segment, 9) *
                0.008 *
                (1 - startRatio)
            lightning.linePositions[destination + 2] =
              lightning.branchStart.z +
              (lightning.branchEnd.z -
                lightning.branchStart.z) *
                startRatio +
              randomSigned(seed + segment, 10) *
                0.008 *
                (1 - startRatio)
            lightning.linePositions[destination + 3] =
              lightning.branchStart.x +
              (lightning.branchEnd.x -
                lightning.branchStart.x) *
                endRatio +
              randomSigned(seed + segment + 1, 8) *
                0.008 *
                (1 - endRatio)
            lightning.linePositions[destination + 4] =
              lightning.branchStart.y +
              (lightning.branchEnd.y -
                lightning.branchStart.y) *
                endRatio +
              randomSigned(seed + segment + 1, 9) *
                0.008 *
                (1 - endRatio)
            lightning.linePositions[destination + 5] =
              lightning.branchStart.z +
              (lightning.branchEnd.z -
                lightning.branchStart.z) *
                endRatio +
              randomSigned(seed + segment + 1, 10) *
                0.008 *
                (1 - endRatio)
            vertexCursor += 2
          }
        }
      }

      lightning.lineGeometry.setDrawRange(0, vertexCursor)
      lightning.lineAttribute.needsUpdate = true
      lightning.updateCount += 1
    }

    for (
      let arcIndex = 0;
      arcIndex < activeArcCount;
      arcIndex += 1
    ) {
      const ringIndex = arcIndex % GIMBAL_CONFIGS.length
      const config = GIMBAL_CONFIGS[ringIndex]
      const seed = arcIndex * 17.31 + 3.7
      const contactAngle =
        seed +
        ringTime *
          config.pulseSpeed *
          (0.72 + magneticField * 0.34)
      ringContactPoint(
        ringIndex,
        contactAngle,
        ringTime,
        magneticField,
        pointer,
        lightning,
        lightning.end,
      )
      const offset = arcIndex * 3
      lightning.contactPositions[offset] = lightning.end.x
      lightning.contactPositions[offset + 1] = lightning.end.y
      lightning.contactPositions[offset + 2] = lightning.end.z
    }
    lightning.contactGeometry.setDrawRange(0, activeArcCount)
    lightning.contactAttribute.needsUpdate = true

    if (contactMaterialRef.current) {
      contactMaterialRef.current.size =
        0.055 +
        Math.sin(time * 16.0) * 0.012 +
        audioEnergy * 0.025 +
        overdrive * 0.018
      contactMaterialRef.current.opacity =
        0.72 +
        Math.sin(time * 23.0) * 0.15 +
        overdrive * 0.1
    }
    if (arcGlowMaterialRef.current) {
      arcGlowMaterialRef.current.opacity =
        0.26 +
        Math.sin(time * 13.0) * 0.08 +
        overdrive * 0.19
    }
    if (arcCoreMaterialRef.current) {
      arcCoreMaterialRef.current.opacity =
        0.72 +
        Math.sin(time * 19.0) * 0.18 +
        overdrive * 0.12
    }
    if (centralLightRef.current) {
      centralLightRef.current.color
        .copy(baseCoreLightColor)
        .lerp(overdriveCoreLightColor, overdrive)
      centralLightRef.current.intensity =
        (mode === 'darkroom' ? 15 : 11) *
        (0.72 + (temperature / 160) * 0.52 + overdrive * 0.58) *
        (0.86 +
          Math.sin(time * 2.6) * 0.12 +
          audioEnergy * 0.28 +
          overdriveCharge * 0.14)
    }
    if (ringLightRef.current) {
      ringLightRef.current.intensity =
        (mode === 'darkroom' ? 10 : 7) *
        (0.7 + magneticField * 0.3) *
        (0.84 +
          Math.sin(time * 3.8) * 0.12 +
          overdrive * 0.52)
    }
    if (shockwaveRef.current) {
      const shockVisible =
        shockStartedAtRef.current >= 0 && shockProgress < 1
      shockwaveRef.current.visible = shockVisible
      if (shockVisible) {
        const shockEase = 1 - (1 - shockProgress) ** 3
        shockwaveRef.current.scale.setScalar(
          0.16 + shockEase * 3.25,
        )
        shockwaveRef.current.rotation.y = time * 0.24
        shockwaveRef.current.rotation.z = time * -0.16
      }
    }
    if (shockLightRef.current) {
      shockLightRef.current.intensity =
        shockStartedAtRef.current >= 0 && shockProgress < 1
          ? (1 - shockProgress) ** 1.4 *
            (mode === 'darkroom' ? 42 : 28)
          : 0
    }

    dataUpdateRef.current += delta
    const host = hostRef.current
    const ownsLiveTelemetry =
      host !== null &&
      (mode === 'darkroom' ||
        host.dataset.galleryCanvasMode === 'gallery')
    if (host && ownsLiveTelemetry && dataUpdateRef.current > 0.1) {
      dataUpdateRef.current = 0
      host.dataset.plasmaAudioEnergy = audioEnergy.toFixed(4)
      host.dataset.plasmaArcUpdates = String(
        lightning.updateCount,
      )
      host.dataset.plasmaArcCount = String(activeArcCount)
      host.dataset.plasmaOverdrivePhase = overdrivePhase
      host.dataset.plasmaOverdriveCharge =
        overdriveCharge.toFixed(3)
      host.dataset.plasmaRingSpeed =
        ringSpeedMultiplier.toFixed(2)
      host.dataset.plasmaShockProgress =
        shockProgress.toFixed(3)
      host.dataset.plasmaShieldHits = String(
        rippleStateRef.current.hits,
      )
      host.dataset.plasmaRippleStrength =
        rippleStateRef.current.strength.toFixed(3)
      host.dataset.plasmaRippleOrigin =
        `${rippleStateRef.current.origin.x.toFixed(3)},` +
        `${rippleStateRef.current.origin.y.toFixed(3)},` +
        rippleStateRef.current.origin.z.toFixed(3)
    }
  })

  return (
    <group scale={displayScale}>
      <group ref={coreGroupRef} position={[0, 0.08, 0]}>
        <mesh>
          <sphereGeometry args={[0.17, 32, 22]} />
          <meshBasicMaterial
            ref={corePinMaterialRef}
            color="#d9fff1"
            toneMapped={false}
          />
        </mesh>
        <mesh scale={1.28}>
          <sphereGeometry args={[0.17, 32, 22]} />
          <meshBasicMaterial
            ref={coreHaloMaterialRef}
            color="#25dfb4"
            transparent
            opacity={0.22}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh material={coreMaterial}>
          <sphereGeometry
            args={[0.46, highDetail ? 80 : 52, highDetail ? 48 : 32]}
          />
        </mesh>
        <mesh material={coronaMaterial} scale={1.055}>
          <sphereGeometry
            args={[0.54, highDetail ? 72 : 48, highDetail ? 44 : 30]}
          />
        </mesh>
        <pointLight
          ref={centralLightRef}
          color="#48f5c8"
          intensity={15}
          distance={3.2}
          decay={2}
        />
      </group>

      {GIMBAL_CONFIGS.map((config, ringIndex) => (
        <group
          key={`${config.radius}-${ringIndex}`}
          rotation={config.baseRotation}
        >
          <group
            ref={(node) => {
              ringRefs.current[ringIndex] = node
            }}
          >
            <mesh>
              <torusGeometry
                args={[config.radius, 0.018, 10, 160]}
              />
              <meshStandardMaterial
                color="#263a43"
                metalness={0.9}
                roughness={0.22}
                emissive={config.color}
                emissiveIntensity={0.09}
              />
            </mesh>
            <mesh>
              <torusGeometry
                args={[config.radius, 0.005, 6, 160]}
              />
              <meshBasicMaterial
                color={config.color}
                transparent
                opacity={0.5}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
            {Array.from({ length: 12 }, (_, markerIndex) => {
              const angle = (markerIndex / 12) * TAU
              return (
                <mesh
                  key={`marker-${markerIndex}`}
                  position={[
                    Math.cos(angle) * config.radius,
                    Math.sin(angle) * config.radius,
                    0,
                  ]}
                  rotation={[0, 0, angle]}
                >
                  <boxGeometry
                    args={[
                      markerIndex % 3 === 0 ? 0.052 : 0.026,
                      0.007,
                      0.012,
                    ]}
                  />
                  <meshBasicMaterial
                    color={
                      markerIndex % 3 === 0
                        ? config.color
                        : '#53616a'
                    }
                    transparent
                    opacity={markerIndex % 3 === 0 ? 0.76 : 0.4}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                  />
                </mesh>
              )
            })}
            {Array.from({ length: 3 }, (_, pulseIndex) => (
              <mesh
                key={`pulse-${pulseIndex}`}
                ref={(node) => {
                  pulseRefs.current[ringIndex][pulseIndex] = node
                }}
              >
                <sphereGeometry args={[0.033, 10, 8]} />
                <meshBasicMaterial
                  color={config.color}
                  transparent
                  opacity={0.96}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </mesh>
            ))}
          </group>
        </group>
      ))}

      <group ref={shieldGroupRef}>
        <mesh material={shieldMaterial}>
          <sphereGeometry
            args={[1.04, highDetail ? 72 : 48, highDetail ? 44 : 30]}
          />
        </mesh>
      </group>

      <mesh
        ref={shockwaveRef}
        material={shockwaveMaterial}
        visible={false}
        frustumCulled={false}
        renderOrder={7}
      >
        <sphereGeometry
          args={[1, highDetail ? 72 : 48, highDetail ? 44 : 30]}
        />
      </mesh>
      <pointLight
        ref={shockLightRef}
        position={[0, 0.1, 0]}
        color="#a9efff"
        intensity={0}
        distance={8}
        decay={2}
      />

      <lineSegments
        geometry={lightning.lineGeometry}
        frustumCulled={false}
        renderOrder={4}
      >
        <lineBasicMaterial
          ref={arcGlowMaterialRef}
          color={palette.tertiary}
          transparent
          opacity={0.44}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>
      <lineSegments
        geometry={lightning.lineGeometry}
        frustumCulled={false}
        renderOrder={5}
      >
        <lineBasicMaterial
          ref={arcCoreMaterialRef}
          color="#d8ffff"
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>
      <points
        geometry={lightning.lineGeometry}
        frustumCulled={false}
        renderOrder={5}
      >
        <pointsMaterial
          color={palette.tertiary}
          size={mode === 'darkroom' ? 0.024 : 0.018}
          sizeAttenuation
          transparent
          opacity={mode === 'darkroom' ? 0.42 : 0.28}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
      <points
        geometry={lightning.contactGeometry}
        frustumCulled={false}
        renderOrder={6}
      >
        <pointsMaterial
          ref={contactMaterialRef}
          color="#e9ffff"
          size={0.06}
          sizeAttenuation
          transparent
          opacity={0.86}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>

      <mesh
        position={[0, -0.78, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.96, 1.18, 96]} />
        <meshBasicMaterial
          color={palette.primary}
          transparent
          opacity={0.055}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight
        ref={ringLightRef}
        position={[0, 0.12, 0.4]}
        color={palette.secondary}
        intensity={8}
        distance={3.6}
        decay={2}
      />
      <spotLight
        position={[0.2, 2.0, 1.3]}
        color={palette.tertiary}
        intensity={mode === 'darkroom' ? 12 : 7}
        angle={0.4}
        penumbra={0.9}
        distance={5.4}
        decay={2}
      />
    </group>
  )
}
