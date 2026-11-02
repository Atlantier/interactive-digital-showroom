import { MeshTransmissionMaterial } from '@react-three/drei'
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
  type PrismShape,
} from '../../../store/useGalleryStore'
import { getEffectiveGalleryTimeScale } from '../../../utils/motionPreferences'
import { wavelengthToCss } from '../../../utils/optics'
import type { GalleryPointerState } from '../OpticalExhibitScene'

const CRYSTAL_IOR = 2.4
const CRYSTAL_CHROMATIC_ABERRATION = 0.8
const SPECTRAL_WAVELENGTHS = [
  680, 620, 580, 530, 490, 450, 410,
] as const
const SPECTRAL_COLORS = SPECTRAL_WAVELENGTHS.map((wavelength) =>
  wavelengthToCss(wavelength),
)
const SPECTRAL_DUST_PER_BEAM = 16
const BEAM_UP = new THREE.Vector3(0, 1, 0)

interface SpectralBeam {
  color: string
  end: readonly [number, number, number]
  index: number
  opacity: number
}

const spectralDustVertexShader = /* glsl */ `
  uniform float uTime;

  attribute float aSeed;
  attribute vec3 color;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 transformed = position;
    float drift = uTime * (0.55 + aSeed * 0.8);
    transformed.y += sin(drift + aSeed * 19.0) * 0.022;
    transformed.z += cos(drift * 0.82 + aSeed * 13.0) * 0.018;
    transformed.x += sin(drift * 0.37 + aSeed * 7.0) * 0.01;

    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_PointSize =
      (4.2 + aSeed * 5.8) *
      (3.8 / max(1.0, -viewPosition.z));
    gl_Position = projectionMatrix * viewPosition;
    vColor = color;
    vAlpha = 0.3 + aSeed * 0.54;
  }
`

const spectralDustFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float distanceToCenter =
      length(gl_PointCoord - vec2(0.5));
    if (distanceToCenter > 0.5) discard;
    float core = smoothstep(0.5, 0.04, distanceToCenter);
    gl_FragColor = vec4(
      vColor * (0.9 + core * 1.5),
      core * vAlpha
    );
  }
`

const causticsVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position =
      projectionMatrix *
      modelViewMatrix *
      vec4(position, 1.0);
  }
`

const causticsFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uDispersion;
  uniform float uIncidence;
  uniform float uPower;
  uniform vec3 uRotation;
  uniform vec3 uTintA;
  uniform vec3 uTintB;

  varying vec2 vUv;

  mat2 rotate2d(float angle) {
    float sine = sin(angle);
    float cosine = cos(angle);
    return mat2(cosine, -sine, sine, cosine);
  }

  vec2 hash22(vec2 point) {
    point = vec2(
      dot(point, vec2(127.1, 311.7)),
      dot(point, vec2(269.5, 183.3))
    );
    return fract(sin(point) * 43758.5453123);
  }

  float voronoiEdge(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    float nearest = 8.0;
    float second = 8.0;

    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 origin = hash22(cell + neighbor);
        float distanceToPoint =
          length(neighbor + origin - local);
        if (distanceToPoint < nearest) {
          second = nearest;
          nearest = distanceToPoint;
        } else if (distanceToPoint < second) {
          second = distanceToPoint;
        }
      }
    }

    return 1.0 - smoothstep(0.025, 0.34, second - nearest);
  }

  float causticField(vec2 uv) {
    vec2 point = (uv - 0.5) * vec2(5.3, 3.35);
    point =
      rotate2d(uRotation.y * 0.72 + uTime * 0.075) *
      point;
    point += vec2(
      sin(point.y * 1.42 + uTime * 0.82),
      cos(point.x * 1.18 - uTime * 0.66)
    ) * (0.2 + abs(uRotation.z) * 0.16);

    float first = voronoiEdge(
      point +
      vec2(
        uRotation.x * 0.34,
        -uRotation.z * 0.28
      ) +
      uIncidence * 0.006
    );
    float second = voronoiEdge(
      rotate2d(1.16) * point * 1.82 -
      vec2(uTime * 0.11, uRotation.y * 0.22)
    );
    float folded = 0.72 * first + 0.54 * second;
    return pow(clamp(folded, 0.0, 1.0), 2.15);
  }

  void main() {
    vec2 centered = vUv * 2.0 - 1.0;
    float radialMask =
      1.0 -
      smoothstep(0.68, 1.22, length(centered * vec2(0.82, 1.05)));
    float separation = 0.008 + uDispersion * 0.012;

    float red = causticField(
      vUv + vec2(separation, -separation * 0.3)
    );
    float green = causticField(vUv);
    float blue = causticField(
      vUv - vec2(separation, separation * 0.24)
    );
    float phase =
      0.5 +
      0.5 *
      sin(
        (red + green - blue) * 8.0 +
        uTime * 1.4 +
        uRotation.x * 2.0
      );

    vec3 rgbField = vec3(red, green, blue);
    vec3 color =
      rgbField * (0.72 + phase * 0.7) +
      mix(uTintA, uTintB, phase) *
        (red + green + blue) *
        0.055;
    float alpha =
      (red * 0.72 + green + blue * 0.82) *
      radialMask *
      uPower *
      0.36;

    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color * 1.75, alpha);
  }
`

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function createCrystalGeometry(shape: PrismShape) {
  if (shape === 'prism') {
    return new THREE.CylinderGeometry(
      0.5,
      0.58,
      1.04,
      3,
      1,
      false,
    )
  }
  if (shape === 'octahedron') {
    return new THREE.OctahedronGeometry(0.66, 0)
  }
  return new THREE.IcosahedronGeometry(0.68, 0)
}

function BeamSegment({
  start,
  end,
  width,
  color,
  opacity,
}: {
  start: readonly [number, number, number]
  end: readonly [number, number, number]
  width: number
  color: string
  opacity: number
}) {
  const segment = useMemo(() => {
    const from = new THREE.Vector3(...start)
    const to = new THREE.Vector3(...end)
    const direction = to.clone().sub(from)
    const length = Math.max(0.001, direction.length())
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      BEAM_UP,
      direction.normalize(),
    )
    const midpoint = from.add(to).multiplyScalar(0.5)
    return {
      length,
      midpoint,
      quaternion,
    }
  }, [end, start])

  return (
    <group
      position={segment.midpoint}
      quaternion={segment.quaternion}
    >
      <mesh>
        <cylinderGeometry
          args={[
            width * 0.62,
            width,
            segment.length,
            12,
            1,
            true,
          ]}
        />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.2}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh>
        <cylinderGeometry
          args={[
            width * 0.16,
            width * 0.22,
            segment.length,
            8,
            1,
            true,
          ]}
        />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

function createSpectralBeams(
  dispersion: number,
  incidence: number,
  power: number,
  mode: 'pedestal' | 'darkroom',
) {
  const dispersionRatio = clamp(dispersion / 2.4, 0, 1)
  const fanHalfAngle =
    0.17 +
    dispersionRatio * 0.3 +
    Math.max(0, incidence - 10) * 0.0022
  const centerAngle =
    THREE.MathUtils.degToRad(incidence - 42) * 0.2
  const beamLength = mode === 'darkroom' ? 1.7 : 1.54
  const beams = SPECTRAL_COLORS.map((color, index): SpectralBeam => {
    const ratio = (index - 3) / 3
    const angle = centerAngle + ratio * fanHalfAngle
    const depth = ratio * 0.13
    return {
      color,
      end: [
        Math.cos(angle) * beamLength,
        Math.sin(angle) * beamLength,
        depth,
      ],
      index,
      opacity:
        (0.56 + power * 0.22) *
        (1 - Math.abs(ratio) * 0.12),
    }
  })

  return { beams, beamLength }
}

function SpectralDust({
  exit,
  beams,
  totalInternalReflection,
}: {
  exit: readonly [number, number, number]
  beams: readonly SpectralBeam[]
  totalInternalReflection: boolean
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    [],
  )
  const geometry = useMemo(() => {
    const count = beams.length * SPECTRAL_DUST_PER_BEAM
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const seeds = new Float32Array(count)

    beams.forEach((beam, beamIndex) => {
      const color = new THREE.Color(beam.color)
      for (let index = 0; index < SPECTRAL_DUST_PER_BEAM; index += 1) {
        const particleIndex =
          beamIndex * SPECTRAL_DUST_PER_BEAM + index
        const seed =
          ((particleIndex * 47 + beamIndex * 17) % 101) / 101
        const travel = 0.12 + seed * 0.82
        const offset = particleIndex * 3
        positions[offset] = beam.end[0] * travel
        positions[offset + 1] = beam.end[1] * travel
        positions[offset + 2] = beam.end[2] * travel
        colors[offset] = color.r
        colors[offset + 1] = color.g
        colors[offset + 2] = color.b
        seeds[particleIndex] = seed
      }
    })

    const buffer = new THREE.BufferGeometry()
    buffer.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    )
    buffer.setAttribute(
      'color',
      new THREE.BufferAttribute(colors, 3),
    )
    buffer.setAttribute(
      'aSeed',
      new THREE.BufferAttribute(seeds, 1),
    )
    return buffer
  }, [beams])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(
    () => () => {
      materialRef.current?.dispose()
    },
    [],
  )

  useFrame((state) => {
    if (!materialRef.current) return
    materialRef.current.uniforms.uTime.value =
      state.clock.elapsedTime *
      getEffectiveGalleryTimeScale(
        useGalleryStore.getState().timeScale,
      )
  })

  return (
    <points
      position={exit}
      geometry={geometry}
      visible={!totalInternalReflection}
      frustumCulled={false}
    >
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={spectralDustVertexShader}
        fragmentShader={spectralDustFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
}

function SpectralFan({
  groupRef,
  exit,
  beams,
  beamLength,
  mode,
  totalInternalReflection,
}: {
  groupRef: RefObject<THREE.Group | null>
  exit: readonly [number, number, number]
  beams: readonly SpectralBeam[]
  beamLength: number
  mode: 'pedestal' | 'darkroom'
  totalInternalReflection: boolean
}) {
  const screenHeight = mode === 'darkroom' ? 2.45 : 1.9

  return (
    <group ref={groupRef} position={exit}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry
          args={[
            beamLength,
            beamLength,
            screenHeight,
            72,
            1,
            true,
            Math.PI / 2 - 0.42,
            0.84,
          ]}
        />
        <meshPhysicalMaterial
          color="#81eaff"
          transparent
          opacity={0.075}
          roughness={0.48}
          metalness={0.04}
          transmission={0.24}
          thickness={0.18}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.06, 0]} scale={1.002}>
        <cylinderGeometry
          args={[
            beamLength,
            beamLength,
            screenHeight,
            24,
            1,
            true,
            Math.PI / 2 - 0.42,
            0.84,
          ]}
        />
        <meshBasicMaterial
          color="#9befff"
          wireframe
          transparent
          opacity={0.045}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {!totalInternalReflection
        ? beams.map(({ color, end, index, opacity }) => (
            <group key={SPECTRAL_WAVELENGTHS[index]}>
              <BeamSegment
                start={[0, 0, 0]}
                end={end}
                width={mode === 'darkroom' ? 0.042 : 0.034}
                color={color}
                opacity={opacity}
              />
              <mesh position={end} scale={1.9}>
                <sphereGeometry args={[0.052, 12, 10]} />
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={0.14}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </mesh>
              <mesh position={end}>
                <sphereGeometry args={[0.026, 12, 10]} />
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={0.92}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </mesh>
            </group>
          ))
        : null}
    </group>
  )
}

function TotalInternalReflectionPath({
  entry,
  entryY,
  power,
}: {
  entry: readonly [number, number, number]
  entryY: number
  power: number
}) {
  const points = [
    entry,
    [-0.22, 0.49 + entryY * 0.12, 0.035],
    [0.17, -0.45, 0.018],
    [-0.03, 0.47, -0.015],
    [0.33, -0.31, 0.028],
    [0.48, 0.24, 0.02],
  ] as const
  const colors = ['#ffffff', '#8ff8ff', '#ff8df2'] as const

  return (
    <group>
      {points.slice(0, -1).map((point, index) => (
        <BeamSegment
          key={`${point.join('-')}-${index}`}
          start={point}
          end={points[index + 1]}
          width={0.052 + index * 0.004}
          color={colors[index % colors.length]}
          opacity={0.74 + power * 0.12}
        />
      ))}
    </group>
  )
}

export function PrismCausticsExhibit({
  exhibit,
  pointerRef,
  mode = 'pedestal',
}: {
  exhibit: ExhibitMeta
  pointerRef: RefObject<GalleryPointerState>
  mode?: 'pedestal' | 'darkroom'
}) {
  const gl = useThree((state) => state.gl)
  const performanceTier = useAppStore(
    (state) => state.performanceTier,
  )
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const shape = useGalleryStore((state) => state.prismShape)
  const palette = useMemo(() => getVfxPreset(vfxPreset), [vfxPreset])
  const dispersion = exhibit.params.dispersion ?? 1.6
  const incidence = exhibit.params.incidence ?? 18
  const refractiveIndex = exhibit.params.ior ?? CRYSTAL_IOR
  const beamPower = exhibit.params.beamPower ?? 1.2
  const displayScale = mode === 'darkroom' ? 1.23 : 0.94
  const incidenceRadians = THREE.MathUtils.degToRad(incidence)
  const criticalAngleRadians = Math.asin(
    clamp(1 / refractiveIndex, 0, 1),
  )
  const criticalAngleDegrees =
    THREE.MathUtils.radToDeg(criticalAngleRadians)
  const totalInternalReflection =
    incidenceRadians > criticalAngleRadians
  const emitterY = clamp(
    Math.tan(incidenceRadians) * 0.54,
    -0.48,
    0.62,
  )
  const entryY = clamp(
    emitterY * 0.49 + 0.015,
    -0.23,
    0.23,
  )
  const entry = useMemo(
    () => [-0.49, entryY, 0.035] as const,
    [entryY],
  )
  const exit = useMemo(() => [0.46, 0.045, 0.02] as const, [])
  const emitter = useMemo(
    () => [-1.56, emitterY, 0.035] as const,
    [emitterY],
  )
  const emitterAngle = Math.atan2(
    entryY - emitterY,
    entry[0] - emitter[0],
  )
  const spectralGeometry = useMemo(
    () =>
      createSpectralBeams(
        dispersion,
        incidence,
        beamPower,
        mode,
      ),
    [beamPower, dispersion, incidence, mode],
  )
  const crystalGeometry = useMemo(
    () => createCrystalGeometry(shape),
    [shape],
  )
  const crystalRef = useRef<THREE.Group>(null)
  const fanRef = useRef<THREE.Group>(null)
  const causticsMaterialRef = useRef<THREE.ShaderMaterial>(null)
  const plasmaLightRef = useRef<THREE.PointLight>(null)
  const emitterLightRef = useRef<THREE.PointLight>(null)
  const spectralLightsRef = useRef<THREE.Group>(null)
  const crystalWireMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const tirShellMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const tirBurstRef = useRef<THREE.Group>(null)
  const causticsUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDispersion: { value: dispersion },
      uIncidence: { value: incidence },
      uPower: {
        value:
          beamPower *
          (mode === 'darkroom' ? 1.35 : 1),
      },
      uRotation: { value: new THREE.Vector3() },
      uTintA: { value: new THREE.Color(palette.primary) },
      uTintB: { value: new THREE.Color(palette.secondary) },
    }),
    [beamPower, dispersion, incidence, mode, palette],
  )

  useEffect(
    () => () => {
      crystalGeometry.dispose()
    },
    [crystalGeometry],
  )

  useEffect(
    () => () => {
      causticsMaterialRef.current?.dispose()
    },
    [],
  )

  useEffect(() => {
    const host = gl.domElement.closest<HTMLElement>(
      '[data-gallery-shared-canvas]',
    )
    if (!host) return

    host.dataset.prismCaustics = 'voronoi-rgb'
    host.dataset.prismShape = shape
    host.dataset.prismSpectralBeams = String(
      SPECTRAL_WAVELENGTHS.length,
    )
    host.dataset.prismSpectralDust = String(
      SPECTRAL_WAVELENGTHS.length * SPECTRAL_DUST_PER_BEAM,
    )
    host.dataset.prismReceiverScreen = 'curved'
    host.dataset.prismTir = totalInternalReflection
      ? 'true'
      : 'false'
    host.dataset.prismCriticalAngle =
      criticalAngleDegrees.toFixed(1)
    host.dataset.prismDispersion = dispersion.toFixed(2)
    host.dataset.prismIncidence = incidence.toFixed(1)

    return () => {
      delete host.dataset.prismCaustics
      delete host.dataset.prismShape
      delete host.dataset.prismSpectralBeams
      delete host.dataset.prismSpectralDust
      delete host.dataset.prismReceiverScreen
      delete host.dataset.prismTir
      delete host.dataset.prismCriticalAngle
      delete host.dataset.prismDispersion
      delete host.dataset.prismIncidence
    }
  }, [
    criticalAngleDegrees,
    dispersion,
    gl,
    incidence,
    shape,
    totalInternalReflection,
  ])

  useFrame((state) => {
    const timeScale = getEffectiveGalleryTimeScale(
      useGalleryStore.getState().timeScale,
    )
    const time = state.clock.elapsedTime * timeScale
    const pointer = pointerRef.current
    const crystal = crystalRef.current

    if (crystal) {
      crystal.rotation.x =
        Math.sin(time * 0.23) * 0.23 +
        pointer.v * (mode === 'darkroom' ? 0.42 : 0.55)
      crystal.rotation.y =
        time * 0.26 +
        pointer.u * (mode === 'darkroom' ? 0.38 : 0.5)
      crystal.rotation.z =
        Math.sin(time * 0.17) * 0.16 +
        (pointer.dragging ? 0.08 : 0)
      crystal.position.y =
        0.09 + Math.sin(time * 0.72) * 0.045
      const burst = totalInternalReflection ? 1 : 0
      crystal.scale.setScalar(
        1 +
          Math.sin(time * 1.8) * 0.012 +
          burst * (0.025 + Math.sin(time * 7.2) * 0.018),
      )
    }

    if (fanRef.current) {
      fanRef.current.rotation.x = THREE.MathUtils.lerp(
        fanRef.current.rotation.x,
        -pointer.v * 0.055,
        0.08,
      )
      fanRef.current.rotation.z = THREE.MathUtils.lerp(
        fanRef.current.rotation.z,
        pointer.u * 0.045,
        0.08,
      )
    }

    if (causticsMaterialRef.current) {
      const uniforms = causticsMaterialRef.current.uniforms
      uniforms.uTime.value = time
      uniforms.uDispersion.value = dispersion
      uniforms.uIncidence.value = incidence
      uniforms.uPower.value =
        beamPower *
        (mode === 'darkroom' ? 1.35 : 1) *
        (totalInternalReflection ? 2.5 : 1)
      if (crystal) {
        const rotationUniform =
          uniforms.uRotation.value as THREE.Vector3
        rotationUniform.copy(crystal.rotation)
      }
    }

    if (plasmaLightRef.current) {
      plasmaLightRef.current.intensity =
        (mode === 'darkroom' ? 14 : 9) *
        beamPower *
        (0.78 + Math.sin(time * 3.7) * 0.16) *
        (totalInternalReflection ? 2.8 : 1)
    }
    if (emitterLightRef.current) {
      emitterLightRef.current.intensity =
        7.5 * beamPower * (0.9 + Math.sin(time * 5.2) * 0.08)
    }
    if (spectralLightsRef.current) {
      spectralLightsRef.current.children.forEach(
        (child, index) => {
          if (child instanceof THREE.PointLight) {
            child.intensity =
              (3.5 + index * 0.18) *
              beamPower *
              (0.86 + Math.sin(time * 2.4 + index) * 0.12) *
              (totalInternalReflection ? 0.18 : 1)
          }
        },
      )
    }
    if (crystalWireMaterialRef.current) {
      crystalWireMaterialRef.current.opacity = THREE.MathUtils.lerp(
        crystalWireMaterialRef.current.opacity,
        totalInternalReflection ? 0.88 : 0.2,
        0.18,
      )
    }
    if (tirShellMaterialRef.current) {
      tirShellMaterialRef.current.opacity =
        totalInternalReflection
          ? 0.13 + Math.sin(time * 6.4) * 0.055
          : 0
    }
    if (tirBurstRef.current) {
      tirBurstRef.current.visible = totalInternalReflection
      tirBurstRef.current.rotation.x = time * 0.62
      tirBurstRef.current.rotation.y = -time * 0.88
      tirBurstRef.current.scale.setScalar(
        1 + Math.sin(time * 4.8) * 0.055,
      )
    }
  })

  return (
    <group scale={displayScale}>
      <mesh
        position={[0, -0.715, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={-1}
      >
        <planeGeometry args={[2.9, 1.68]} />
        <shaderMaterial
          ref={causticsMaterialRef}
          uniforms={causticsUniforms}
          vertexShader={causticsVertexShader}
          fragmentShader={causticsFragmentShader}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <group ref={crystalRef} position={[0, 0.09, 0]}>
        <mesh geometry={crystalGeometry}>
          <MeshTransmissionMaterial
            color={new THREE.Color(palette.primary).lerp(
              new THREE.Color('#ffffff'),
              0.72,
            )}
            ior={refractiveIndex}
            chromaticAberration={CRYSTAL_CHROMATIC_ABERRATION}
            anisotropicBlur={0.36 + dispersion * 0.12}
            anisotropy={0.32}
            distortion={0.18 + dispersion * 0.06}
            distortionScale={0.24}
            temporalDistortion={0.035}
            thickness={0.82}
            roughness={0.035}
            transmission={1}
            transparent
            opacity={0.96}
            attenuationColor={palette.secondary}
            attenuationDistance={0.62}
            backside
            backsideThickness={0.22}
            samples={performanceTier === 'high' ? 6 : 2}
            resolution={performanceTier === 'high' ? 512 : 128}
            backsideResolution={
              performanceTier === 'high' ? 256 : 64
            }
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh geometry={crystalGeometry} scale={1.018}>
          <meshBasicMaterial
            ref={crystalWireMaterialRef}
            color={palette.tertiary}
            wireframe
            transparent
            opacity={0.2}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh geometry={crystalGeometry} scale={1.032}>
          <meshBasicMaterial
            ref={tirShellMaterialRef}
            color="#f2ffff"
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh scale={0.76}>
          <icosahedronGeometry args={[0.52, 1]} />
          <meshBasicMaterial
            color={palette.secondary}
            wireframe
            transparent
            opacity={0.12}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>

      <group ref={tirBurstRef} visible={false} position={[0, 0.09, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.82, 0.012, 8, 96]} />
          <meshBasicMaterial
            color="#f4ffff"
            transparent
            opacity={0.72}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh rotation={[Math.PI / 3, 0.4, 0.2]}>
          <torusGeometry args={[1.02, 0.007, 6, 96]} />
          <meshBasicMaterial
            color={palette.tertiary}
            transparent
            opacity={0.48}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>

      <group
        position={emitter}
        rotation={[0, 0, emitterAngle]}
      >
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.11, 0.14, 0.5, 16]} />
          <meshStandardMaterial
            color="#071116"
            metalness={0.82}
            roughness={0.22}
          />
        </mesh>
        <mesh position={[0.27, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.055, 0.075, 0.1, 16]} />
          <meshBasicMaterial
            color="#efffff"
            toneMapped={false}
          />
        </mesh>
        <pointLight
          ref={emitterLightRef}
          color="#eaffff"
          intensity={7}
          distance={2.4}
          decay={2}
        />
      </group>

      <BeamSegment
        start={emitter}
        end={entry}
        width={mode === 'darkroom' ? 0.07 : 0.055}
        color="#f2ffff"
        opacity={0.92}
      />
      {totalInternalReflection ? (
        <TotalInternalReflectionPath
          entry={entry}
          entryY={entryY}
          power={beamPower}
        />
      ) : (
        <>
          <BeamSegment
            start={entry}
            end={[-0.08, entryY * 0.45 + 0.04, 0.025]}
            width={0.048}
            color="#dffcff"
            opacity={0.72}
          />
          <BeamSegment
            start={[-0.08, entryY * 0.45 + 0.04, 0.025]}
            end={exit}
            width={0.052}
            color={palette.tertiary}
            opacity={0.82}
          />
        </>
      )}
      <pointLight
        ref={plasmaLightRef}
        position={[0, 0.08, 0.12]}
        color={palette.tertiary}
        intensity={9}
        distance={2.3}
        decay={2}
      />

      <SpectralFan
        groupRef={fanRef}
        exit={exit}
        beams={spectralGeometry.beams}
        beamLength={spectralGeometry.beamLength}
        mode={mode}
        totalInternalReflection={totalInternalReflection}
      />
      <SpectralDust
        exit={exit}
        beams={spectralGeometry.beams}
        totalInternalReflection={totalInternalReflection}
      />

      <group ref={spectralLightsRef}>
        <pointLight
          position={[1.38, 0.46, 0.12]}
          color={SPECTRAL_COLORS[0]}
          intensity={3.5}
          distance={2.1}
          decay={2}
        />
        <pointLight
          position={[1.58, 0.02, 0.04]}
          color={SPECTRAL_COLORS[3]}
          intensity={4}
          distance={2.2}
          decay={2}
        />
        <pointLight
          position={[1.38, -0.42, -0.08]}
          color={SPECTRAL_COLORS[6]}
          intensity={4.5}
          distance={2.1}
          decay={2}
        />
      </group>

      <pointLight
        position={[0, 0.72, 0.86]}
        color={palette.secondary}
        intensity={mode === 'darkroom' ? 7 : 4.2}
        distance={3.4}
        decay={2}
      />
      <spotLight
        position={[0.2, 2.1, 1.2]}
        color="#f5ffff"
        intensity={mode === 'darkroom' ? 13 : 8}
        angle={0.38}
        penumbra={0.88}
        distance={5.4}
        decay={2}
      />
    </group>
  )
}
