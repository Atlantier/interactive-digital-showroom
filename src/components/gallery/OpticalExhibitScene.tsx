import { useFrame, useThree } from '@react-three/fiber'
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'
import * as THREE from 'three'
import { getVfxPreset } from '../../data/vfxPresets'
import { useAppStore } from '../../store/useAppStore'
import {
  useGalleryStore,
  type ExhibitMeta,
} from '../../store/useGalleryStore'

const PrismCausticsExhibit = lazy(async () => {
  const module = await import('./exhibits/PrismCausticsExhibit')
  return { default: module.PrismCausticsExhibit }
})

const LaserScanHologramExhibit = lazy(async () => {
  const module = await import('./exhibits/LaserScanHologramExhibit')
  return { default: module.LaserScanHologramExhibit }
})

const ParticleMorphExhibit = lazy(async () => {
  const module = await import('./exhibits/ParticleMorphExhibit')
  return { default: module.ParticleMorphExhibit }
})

const PlasmaReactorExhibit = lazy(async () => {
  const module = await import('./exhibits/PlasmaReactorExhibit')
  return { default: module.PlasmaReactorExhibit }
})

const RayBounceMazeExhibit = lazy(async () => {
  const module = await import('./exhibits/RayBounceMazeExhibit')
  return { default: module.RayBounceMazeExhibit }
})

const AudioSpectrumStageExhibit = lazy(async () => {
  const module = await import('./exhibits/AudioSpectrumStageExhibit')
  return { default: module.AudioSpectrumStageExhibit }
})

const NeuralPulseSandboxExhibit = lazy(async () => {
  const module = await import('./exhibits/NeuralPulseSandboxExhibit')
  return { default: module.NeuralPulseSandboxExhibit }
})

const GpuComputeMatrixExhibit = lazy(async () => {
  const module = await import('./exhibits/GpuComputeMatrixExhibit')
  return { default: module.GpuComputeMatrixExhibit }
})

export interface GalleryPointerState {
  u: number
  v: number
  active: boolean
  dragging: boolean
  forceActive: boolean
  impulse: number
}

export interface OrbitCameraState {
  yaw: number
  pitch: number
  distance: number
  panX: number
  panY: number
}

export function createGalleryPointerState(): GalleryPointerState {
  return {
    u: 0,
    v: 0,
    active: false,
    dragging: false,
    forceActive: false,
    impulse: 0,
  }
}

export function createOrbitCameraState(): OrbitCameraState {
  return {
    yaw: 0.38,
    pitch: 0.14,
    distance: 4.4,
    panX: 0,
    panY: 0,
  }
}

const artifactVertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uEnergy;

  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying float vWave;

  void main() {
    vec3 transformed = position;
    float pointerField =
      sin(position.y * 8.0 + uTime * 1.7 + uPointer.x * 4.0) *
      cos(position.x * 6.0 - uTime * 1.2 + uPointer.y * 3.0);
    float displacement =
      pointerField * 0.028 * uEnergy *
      (0.3 + abs(uPointer.x) + abs(uPointer.y));
    transformed += normal * displacement;
    vWave = pointerField;

    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);

    gl_Position =
      projectionMatrix *
      viewMatrix *
      worldPosition;
  }
`

const artifactFragmentShader = /* glsl */ `
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uTertiary;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uEnergy;
  uniform float uMode;

  varying vec3 vNormal;
  varying vec3 vViewDirection;
  varying float vWave;

  void main() {
    float facing =
      abs(dot(normalize(vNormal), normalize(vViewDirection)));
    float fresnel = pow(1.0 - facing, 2.25);
    float scan =
      0.5 +
      0.5 *
      sin(
        vWave * 8.0 +
        uTime * (2.4 + uMode * 0.11) +
        uEnergy * 4.0
      );
    vec3 spectrum = mix(
      uPrimary,
      uSecondary,
      clamp(scan * 0.72 + uMode * 0.025, 0.0, 1.0)
    );
    spectrum = mix(spectrum, uTertiary, fresnel * 0.34);
    float alpha =
      (0.12 + fresnel * 0.62 + scan * 0.1) *
      (0.72 + uEnergy * 0.32) *
      uIntensity;

    if (alpha < 0.012) discard;
    gl_FragColor = vec4(spectrum * (1.1 + fresnel * 0.8), alpha);
  }
`

const curtainVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position =
      projectionMatrix *
      modelViewMatrix *
      vec4(position, 1.0);
  }
`

const curtainFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;

  varying vec2 vUv;

  void main() {
    float verticalFade =
      smoothstep(0.0, 0.18, vUv.y) *
      (1.0 - smoothstep(0.72, 1.0, vUv.y));
    float filaments =
      0.5 +
      0.5 *
      sin(
        vUv.y * 42.0 -
        uTime * 2.2 +
        sin(vUv.x * 34.0 + uTime) * 2.0
      );
    float edgeFade =
      smoothstep(0.0, 0.15, vUv.x) *
      (1.0 - smoothstep(0.85, 1.0, vUv.x));
    float alpha =
      verticalFade *
      edgeFade *
      (0.16 + filaments * 0.84) *
      uOpacity;

    if (alpha < 0.003) discard;
    gl_FragColor = vec4(uColor * (1.0 + filaments * 0.36), alpha);
  }
`

const EXHIBIT_ORDER = [
  'prism-caustics',
  'laser-scan-hologram',
  'particle-morph',
  'plasma-reactor',
  'photonic-mesh',
  'orbital-lens',
  'quantum-lattice',
  'phase-torus',
] as const

type ThemeColorTuple = [
  THREE.Color,
  THREE.Color,
  THREE.Color,
]

interface ThemePaletteState {
  current: ThemeColorTuple
  target: ThemeColorTuple
  progress: number
}

function createThemeColorTuple(
  colors: readonly [string, string, string],
): ThemeColorTuple {
  return [
    new THREE.Color(colors[0]),
    new THREE.Color(colors[1]),
    new THREE.Color(colors[2]),
  ]
}

function useSmoothThemePalette(
  colors: readonly [string, string, string],
  presetId: string,
) {
  const state = useMemo<ThemePaletteState>(
    () => ({
      current: createThemeColorTuple(colors),
      target: createThemeColorTuple(colors),
      progress: 1,
    }),
    [],
  )
  const gl = useThree((threeState) => threeState.gl)
  const hostRef = useRef<HTMLElement | null>(null)
  const diagnosticTimerRef = useRef(0)

  useEffect(() => {
    state.target[0].set(colors[0])
    state.target[1].set(colors[1])
    state.target[2].set(colors[2])
    state.progress = 0
    const host = gl.domElement.closest<HTMLElement>(
      '[data-gallery-shared-canvas]',
    )
    if (!host) return
    hostRef.current = host
    host.dataset.galleryThemeSync =
      'smooth-hologram-spotlight-laser'
    host.dataset.galleryThemePreset = presetId
    host.dataset.galleryThemeTargetPrimary = colors[0]
    host.dataset.galleryThemeTargetSecondary = colors[1]
    host.dataset.galleryThemeTargetTertiary = colors[2]
  }, [colors, gl, presetId, state])

  useFrame((_, delta) => {
    const safeDelta = Math.min(delta, 0.05)
    const blend = 1 - Math.exp(-safeDelta * 4.6)
    state.current[0].lerp(state.target[0], blend)
    state.current[1].lerp(state.target[1], blend)
    state.current[2].lerp(state.target[2], blend)
    state.progress = Math.min(
      1,
      state.progress + safeDelta * 0.92,
    )
    diagnosticTimerRef.current += safeDelta
    const host = hostRef.current
    if (host && diagnosticTimerRef.current >= 0.08) {
      diagnosticTimerRef.current = 0
      host.dataset.galleryThemeProgress =
        state.progress.toFixed(3)
      host.dataset.galleryThemeCurrentPrimary =
        `#${state.current[0].getHexString()}`
      host.dataset.galleryThemeCurrentSecondary =
        `#${state.current[1].getHexString()}`
      host.dataset.galleryThemeCurrentTertiary =
        `#${state.current[2].getHexString()}`
      host.dataset.galleryThemeLaserColor =
        `#${state.current[1].getHexString()}`
      host.dataset.galleryThemeSpotlightColor =
        `#${state.current[2].getHexString()}`
    }
  })

  return state
}

function ThemeStageLights({
  palette,
}: {
  palette: ThemePaletteState
}) {
  const ambientRef = useRef<THREE.AmbientLight>(null)
  const directionalRef = useRef<THREE.DirectionalLight>(null)
  const pointRef = useRef<THREE.PointLight>(null)

  useFrame(() => {
    ambientRef.current?.color.copy(palette.current[2])
    directionalRef.current?.color.copy(palette.current[0])
    pointRef.current?.color.copy(palette.current[1])
  })

  return (
    <>
      <ambientLight
        ref={ambientRef}
        intensity={0.36}
        color={palette.current[2]}
      />
      <directionalLight
        ref={directionalRef}
        position={[2.4, 3.6, 3.8]}
        intensity={1.2}
        color={palette.current[0]}
      />
      <pointLight
        ref={pointRef}
        position={[-2.2, 1.1, 2.4]}
        intensity={4.5}
        distance={6}
        color={palette.current[1]}
      />
    </>
  )
}

function createExhibitPalette(
  primary: string,
  secondary: string,
  tertiary: string,
  laserColor?: string,
) {
  if (!laserColor) return [primary, secondary, tertiary] as const
  const base = new THREE.Color(laserColor)
  return [
    laserColor,
    `#${base.clone().offsetHSL(0, 0.08, 0.17).getHexString()}`,
    `#${base.clone().offsetHSL(0, 0.16, 0.34).getHexString()}`,
  ] as const
}

function ArtifactGeometry({ exhibitId }: { exhibitId: string }) {
  switch (exhibitId) {
    case 'prism-caustics':
      return <icosahedronGeometry args={[0.68, 0]} />
    case 'laser-scan-hologram':
      return <icosahedronGeometry args={[0.58, 2]} />
    case 'particle-morph':
      return <icosahedronGeometry args={[0.72, 3]} />
    case 'plasma-reactor':
      return <icosahedronGeometry args={[0.72, 2]} />
    case 'photonic-mesh':
      return <icosahedronGeometry args={[0.76, 2]} />
    case 'orbital-lens':
      return <sphereGeometry args={[0.7, 36, 22]} />
    case 'quantum-lattice':
      return <dodecahedronGeometry args={[0.72, 1]} />
    case 'phase-torus':
      return <torusGeometry args={[0.68, 0.14, 28, 108]} />
    default:
      return <octahedronGeometry args={[0.72, 1]} />
  }
}

function ParticleHalo({
  exhibit,
  color,
  pointerRef,
}: {
  exhibit: ExhibitMeta
  color: string
  pointerRef: RefObject<GalleryPointerState>
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const geometry = useMemo(() => {
    let randomState =
      EXHIBIT_ORDER.indexOf(
        exhibit.id as (typeof EXHIBIT_ORDER)[number],
      ) *
        7919 +
      104729
    const positions = new Float32Array(144 * 3)
    const seeds = new Float32Array(144)

    for (let index = 0; index < 144; index += 1) {
      randomState = (randomState * 16807) % 2147483647
      const radius =
        0.76 + ((randomState - 1) / 2147483646) * 0.62
      randomState = (randomState * 16807) % 2147483647
      const theta =
        ((randomState - 1) / 2147483646) * Math.PI * 2
      randomState = (randomState * 16807) % 2147483647
      const y =
        (((randomState - 1) / 2147483646) * 2 - 1) * 0.76
      const radial = Math.sqrt(Math.max(0, 1 - y * y)) * radius
      const offset = index * 3
      positions[offset] = Math.cos(theta) * radial
      positions[offset + 1] = y
      positions[offset + 2] = Math.sin(theta) * radial
      seeds[index] = randomState / 2147483647
    }

    const buffer = new THREE.BufferGeometry()
    buffer.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    )
    buffer.setAttribute(
      'aSeed',
      new THREE.BufferAttribute(seeds, 1),
    )
    return buffer
  }, [exhibit.id])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((state) => {
    if (!pointsRef.current) return
    const timeScale = useGalleryStore.getState().timeScale
    const pointer = pointerRef.current
    const time = state.clock.elapsedTime * timeScale
    pointsRef.current.rotation.y =
      time * 0.072 + pointer.u * 0.12
    pointsRef.current.rotation.x =
      Math.sin(time * 0.17) * 0.12 + pointer.v * 0.08
  })

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color={color}
        size={0.018}
        sizeAttenuation
        transparent
        opacity={0.58}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
}

function HologramPedestal({
  palette,
  pointerRef,
}: {
  palette: ThemePaletteState
  pointerRef: RefObject<GalleryPointerState>
}) {
  const ringGroupRef = useRef<THREE.Group>(null)
  const curtainMaterialRef = useRef<THREE.ShaderMaterial>(null)
  const discMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const ringMaterialRefs = useRef<
    Array<THREE.MeshBasicMaterial | null>
  >([])
  const tickMaterialRefs = useRef<
    Array<THREE.MeshBasicMaterial | null>
  >([])
  const topConeMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const topLightMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const washLightRef = useRef<THREE.PointLight>(null)
  const spotLightRef = useRef<THREE.SpotLight>(null)
  const curtainUniforms = useMemo(
    () => ({
      uColor: {
        value: palette.current[1].clone(),
      },
      uTime: { value: 0 },
      uOpacity: { value: 0.14 },
    }),
    [palette],
  )
  const ringRadii = [0.58, 0.78, 1.02, 1.28]

  useFrame((state) => {
    const time =
      state.clock.elapsedTime *
      useGalleryStore.getState().timeScale
    const pointer = pointerRef.current
    if (ringGroupRef.current) {
      ringGroupRef.current.rotation.y =
        time * 0.08 + pointer.u * 0.18
      ringGroupRef.current.rotation.z =
        Math.sin(time * 0.11) * 0.035 + pointer.v * 0.025
    }
    if (curtainMaterialRef.current) {
      curtainMaterialRef.current.uniforms.uTime.value = time
      curtainMaterialRef.current.uniforms.uOpacity.value =
        0.1 + (pointer.active ? 0.075 : 0.035)
      curtainMaterialRef.current.uniforms.uColor.value.copy(
        palette.current[1],
      )
    }
    if (discMaterialRef.current) {
      discMaterialRef.current.color.copy(palette.current[0])
    }
    for (
      let index = 0;
      index < ringMaterialRefs.current.length;
      index += 1
    ) {
      ringMaterialRefs.current[index]?.color.copy(
        palette.current[index % palette.current.length],
      )
    }
    for (
      let index = 0;
      index < tickMaterialRefs.current.length;
      index += 1
    ) {
      tickMaterialRefs.current[index]?.color.copy(
        palette.current[2],
      )
    }
    topConeMaterialRef.current?.color.copy(palette.current[2])
    topLightMaterialRef.current?.color.copy(palette.current[2])
    washLightRef.current?.color.copy(palette.current[2])
    spotLightRef.current?.color.copy(palette.current[2])
  })

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.78, 0]}
      >
        <circleGeometry args={[1.42, 72]} />
        <meshBasicMaterial
          ref={discMaterialRef}
          color={palette.current[0]}
          transparent
          opacity={0.075}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      <group ref={ringGroupRef} position={[0, -0.71, 0]}>
        {ringRadii.map((radius, index) => (
          <mesh
            key={radius}
            rotation={[
              -Math.PI / 2,
              0,
              index * 0.19,
            ]}
          >
            <torusGeometry args={[radius, 0.008, 6, 112]} />
            <meshBasicMaterial
              ref={(material) => {
                ringMaterialRefs.current[index] = material
              }}
              color={
                palette.current[index % palette.current.length]
              }
              transparent
              opacity={0.36 - index * 0.055}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        ))}
        {Array.from({ length: 16 }, (_, index) => {
          const angle = (index / 16) * Math.PI * 2
          return (
            <mesh
              key={`tick-${index}`}
              position={[
                Math.cos(angle) * 1.16,
                0.014,
                Math.sin(angle) * 1.16,
              ]}
              rotation={[0, -angle, 0]}
            >
              <boxGeometry args={[0.075, 0.008, 0.012]} />
              <meshBasicMaterial
                ref={(material) => {
                  tickMaterialRefs.current[index] = material
                }}
                color={palette.current[2]}
                transparent
                opacity={index % 4 === 0 ? 0.68 : 0.24}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          )
        })}
      </group>

      <mesh
        position={[0, 0.22, 0]}
        rotation={[0, Math.PI * 0.34, 0]}
      >
        <coneGeometry args={[1.18, 2.1, 56, 1, true]} />
        <shaderMaterial
          ref={curtainMaterialRef}
          uniforms={curtainUniforms}
          vertexShader={curtainVertexShader}
          fragmentShader={curtainFragmentShader}
          transparent
          depthWrite={false}
          depthTest
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <mesh position={[0, 2.18, 0.2]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.7, 2.5, 36, 1, true]} />
        <meshBasicMaterial
          ref={topConeMaterialRef}
          color={palette.current[2]}
          transparent
          opacity={0.018}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh position={[0, 2.18, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.24, 48]} />
        <meshBasicMaterial
          ref={topLightMaterialRef}
          color={palette.current[2]}
          transparent
          opacity={0.62}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight
        ref={washLightRef}
        position={[0, 1.65, 1.1]}
        color={palette.current[2]}
        intensity={8}
        distance={5}
        decay={2}
      />
      <spotLight
        ref={spotLightRef}
        position={[0, 2.1, 0.3]}
        color={palette.current[2]}
        intensity={11}
        angle={0.42}
        penumbra={0.9}
        distance={7}
        decay={2}
      />
    </group>
  )
}

function ArtifactRig({
  exhibit,
  pointerRef,
  mode,
  laserColor,
}: {
  exhibit: ExhibitMeta
  pointerRef: RefObject<GalleryPointerState>
  mode: 'pedestal' | 'darkroom'
  laserColor?: string
}) {
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const palette = useMemo(
    () => getVfxPreset(vfxPreset),
    [vfxPreset],
  )
  const colors = useMemo(
    () =>
      createExhibitPalette(
        palette.primary,
        palette.secondary,
        palette.tertiary,
        laserColor,
      ),
    [
      laserColor,
      palette.primary,
      palette.secondary,
      palette.tertiary,
    ],
  )
  const artifactRef = useRef<THREE.Mesh>(null)
  const wireRef = useRef<THREE.Mesh>(null)
  const orbitRef = useRef<THREE.Group>(null)
  const shaderRef = useRef<THREE.ShaderMaterial>(null)
  const exhibitRef = useRef(exhibit)
  exhibitRef.current = exhibit
  const shaderUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2() },
      uEnergy: { value: 0.7 },
      uIntensity: { value: mode === 'darkroom' ? 1.15 : 0.92 },
      uMode: {
        value: Math.max(
          0,
          EXHIBIT_ORDER.indexOf(
            exhibit.id as (typeof EXHIBIT_ORDER)[number],
          ),
        ),
      },
      uPrimary: { value: new THREE.Color(colors[0]) },
      uSecondary: { value: new THREE.Color(colors[1]) },
      uTertiary: { value: new THREE.Color(colors[2]) },
    }),
    [colors, exhibit.id, mode],
  )

  useEffect(() => {
    shaderUniforms.uPrimary.value.set(colors[0])
    shaderUniforms.uSecondary.value.set(colors[1])
    shaderUniforms.uTertiary.value.set(colors[2])
  }, [colors, shaderUniforms])

  useFrame((state) => {
    const timeScale = useGalleryStore.getState().timeScale
    const time = state.clock.elapsedTime * timeScale
    const pointer = pointerRef.current
    const current = exhibitRef.current
    const values = Object.values(current.params)
    const energy = Math.min(
      1.35,
      0.48 + values.reduce((sum, value) => sum + Math.abs(value), 0) /
        Math.max(1, values.length * 40),
    )

    if (artifactRef.current) {
      const pointerTilt = pointer.active ? (mode === 'darkroom' ? 0.22 : 0.5) : 0.2
      artifactRef.current.rotation.x =
        Math.sin(time * 0.31) * 0.18 + pointer.v * pointerTilt
      artifactRef.current.rotation.y =
        time * (0.12 + (current.params.flow ?? 0.2) * 0.08) +
        pointer.u * pointerTilt
      artifactRef.current.rotation.z =
        Math.sin(time * 0.23) * 0.12
      artifactRef.current.position.y =
        0.08 + Math.sin(time * 0.8) * 0.035
      artifactRef.current.scale.setScalar(
        (mode === 'darkroom' ? 1.42 : 1) *
          (1 + (pointer.dragging ? 0.035 : 0)),
      )
    }
    if (wireRef.current) {
      wireRef.current.rotation.copy(
        artifactRef.current?.rotation ?? wireRef.current.rotation,
      )
      wireRef.current.position.copy(
        artifactRef.current?.position ?? wireRef.current.position,
      )
      wireRef.current.scale.copy(
        artifactRef.current?.scale ?? wireRef.current.scale,
      )
      wireRef.current.scale.multiplyScalar(1.018)
    }
    if (orbitRef.current) {
      orbitRef.current.rotation.y =
        -time * 0.09 - pointer.u * 0.24
      orbitRef.current.rotation.x =
        0.96 + Math.sin(time * 0.19) * 0.16 + pointer.v * 0.08
    }
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = time
      shaderRef.current.uniforms.uPointer.value.set(
        pointer.u,
        pointer.v,
      )
      shaderRef.current.uniforms.uEnergy.value = energy
    }
  })

  const core = (
    <>
      <mesh ref={artifactRef}>
        <ArtifactGeometry exhibitId={exhibit.id} />
        <shaderMaterial
          ref={shaderRef}
          uniforms={shaderUniforms}
          vertexShader={artifactVertexShader}
          fragmentShader={artifactFragmentShader}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={wireRef}>
        <ArtifactGeometry exhibitId={exhibit.id} />
        <meshBasicMaterial
          color={colors[2]}
          wireframe
          transparent
          opacity={0.18}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </>
  )

  return (
    <group position={[0, 0.05, 0]}>
      {mode === 'pedestal' ? (
        <group ref={orbitRef}>
          <mesh rotation={[Math.PI / 2.5, 0.2, 0]}>
            <torusGeometry args={[1.02, 0.012, 8, 128]} />
            <meshBasicMaterial
              color={colors[1]}
              transparent
              opacity={0.5}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          <mesh rotation={[Math.PI / 3.2, -0.45, 0.35]}>
            <torusGeometry args={[1.22, 0.006, 6, 128]} />
            <meshBasicMaterial
              color={colors[2]}
              transparent
              opacity={0.28}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      ) : (
        <>
          <group ref={orbitRef}>
            <mesh rotation={[Math.PI / 2.2, 0.1, 0]}>
              <torusGeometry args={[1.52, 0.015, 8, 160]} />
              <meshBasicMaterial
                color={colors[1]}
                transparent
                opacity={0.55}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            <mesh rotation={[Math.PI / 3, -0.52, 0.28]}>
              <torusGeometry args={[1.78, 0.007, 6, 160]} />
              <meshBasicMaterial
                color={colors[2]}
                transparent
                opacity={0.3}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          </group>
          {core}
        </>
      )}
      {mode === 'pedestal' ? core : null}
      <ParticleHalo
        exhibit={exhibit}
        color={colors[1]}
        pointerRef={pointerRef}
      />
    </group>
  )
}

export function DarkroomOrbitRig({
  orbitRef,
}: {
  orbitRef: RefObject<OrbitCameraState>
}) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    const host = gl.domElement.closest<HTMLElement>(
      '[data-gallery-shared-canvas]',
    )
    return () => {
      if (host) {
        delete host.dataset.galleryCameraYaw
        delete host.dataset.galleryCameraPitch
        delete host.dataset.galleryCameraDistance
      }
    }
  }, [gl])

  useFrame(() => {
    const orbit = orbitRef.current
    if (!orbit) return
    const horizontalDistance =
      Math.cos(orbit.pitch) * orbit.distance
    camera.position.set(
      orbit.panX +
        Math.sin(orbit.yaw) * horizontalDistance,
      orbit.panY +
        Math.sin(orbit.pitch) * orbit.distance +
        0.12,
      Math.cos(orbit.yaw) * horizontalDistance,
    )
    camera.lookAt(orbit.panX, orbit.panY, 0)
    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== 46) {
      camera.fov = 46
      camera.updateProjectionMatrix()
    }

    const host = gl.domElement.closest<HTMLElement>(
      '[data-gallery-shared-canvas]',
    )
    if (host) {
      host.dataset.galleryCameraYaw = orbit.yaw.toFixed(4)
      host.dataset.galleryCameraPitch = orbit.pitch.toFixed(4)
      host.dataset.galleryCameraDistance =
        orbit.distance.toFixed(3)
    }
  })

  return null
}

export function ExhibitSceneEntrance({
  children,
}: {
  children: ReactNode
}) {
  const groupRef = useRef<THREE.Group>(null)
  const startedAtRef = useRef<number | null>(null)

  useFrame((state) => {
    const group = groupRef.current
    if (!group) return
    if (startedAtRef.current === null) {
      startedAtRef.current = state.clock.elapsedTime
    }
    const progress = THREE.MathUtils.clamp(
      (state.clock.elapsedTime - startedAtRef.current) / 0.42,
      0,
      1,
    )
    const eased = 1 - (1 - progress) ** 3
    group.scale.setScalar(0.86 + eased * 0.14)
    group.position.y = (1 - eased) * -0.16
    group.rotation.y = (1 - eased) * -0.16
  })

  return <group ref={groupRef}>{children}</group>
}

export function OpticalExhibitScene({
  exhibit,
  pointerRef,
  mode = 'pedestal',
  orbitRef,
  laserColor,
}: {
  exhibit: ExhibitMeta
  pointerRef: RefObject<GalleryPointerState>
  mode?: 'pedestal' | 'darkroom'
  orbitRef?: RefObject<OrbitCameraState>
  laserColor?: string
}) {
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const palette = useMemo(
    () => getVfxPreset(vfxPreset),
    [vfxPreset],
  )
  const themeColors = useMemo<
    readonly [string, string, string]
  >(
    () => [
      palette.primary,
      palette.secondary,
      palette.tertiary,
    ],
    [palette.primary, palette.secondary, palette.tertiary],
  )
  const themePalette = useSmoothThemePalette(
    themeColors,
    vfxPreset,
  )

  return (
    <>
      <ThemeStageLights palette={themePalette} />
      {mode === 'darkroom' && orbitRef ? (
        <DarkroomOrbitRig orbitRef={orbitRef} />
      ) : null}
      <HologramPedestal
        palette={themePalette}
        pointerRef={pointerRef}
      />
      <Suspense fallback={null}>
        {exhibit.id === 'prism-caustics' ? (
          <PrismCausticsExhibit
            exhibit={exhibit}
            pointerRef={pointerRef}
            mode={mode}
          />
        ) : exhibit.id === 'laser-scan-hologram' ? (
          <LaserScanHologramExhibit
            exhibit={exhibit}
            pointerRef={pointerRef}
            mode={mode}
          />
        ) : exhibit.id === 'particle-morph' ? (
          <ParticleMorphExhibit
            exhibit={exhibit}
            pointerRef={pointerRef}
            mode={mode}
          />
        ) : exhibit.id === 'plasma-reactor' ? (
          <PlasmaReactorExhibit
            exhibit={exhibit}
            pointerRef={pointerRef}
            mode={mode}
          />
        ) : exhibit.id === 'photonic-mesh' ? (
          <RayBounceMazeExhibit
            exhibit={exhibit}
            pointerRef={pointerRef}
            mode={mode}
          />
        ) : exhibit.id === 'orbital-lens' ? (
          <AudioSpectrumStageExhibit
            exhibit={exhibit}
            pointerRef={pointerRef}
            mode={mode}
          />
        ) : exhibit.id === 'quantum-lattice' ? (
          <NeuralPulseSandboxExhibit
            exhibit={exhibit}
            pointerRef={pointerRef}
            mode={mode}
          />
        ) : exhibit.id === 'phase-torus' ? (
          <GpuComputeMatrixExhibit
            exhibit={exhibit}
            pointerRef={pointerRef}
            mode={mode}
          />
        ) : (
          <ArtifactRig
            exhibit={exhibit}
            pointerRef={pointerRef}
            mode={mode}
            laserColor={laserColor}
          />
        )}
      </Suspense>
    </>
  )
}
