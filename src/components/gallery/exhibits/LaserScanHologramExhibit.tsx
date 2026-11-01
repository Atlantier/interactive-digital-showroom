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
  type HologramModel,
} from '../../../store/useGalleryStore'
import type { GalleryPointerState } from '../OpticalExhibitScene'

const MAX_SPARKS_HIGH = 180
const MAX_SPARKS_MEDIUM = 110
const SCANNER_CORNERS = [
  [-0.9, 0, -0.62],
  [0.9, 0, -0.62],
  [-0.9, 0, 0.62],
  [0.9, 0, 0.62],
] as const

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const hologramVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uScanY;
  uniform float uScanDelta;
  uniform float uScanDirection;
  uniform float uGlitch;
  uniform float uGlitchSeed;

  attribute vec3 aBarycentric;

  varying vec3 vBarycentric;
  varying vec3 vLocalPosition;
  varying vec3 vNormalDirection;
  varying vec3 vViewDirection;
  varying float vFrontier;

  void main() {
    vec3 transformed = position;
    float frontierDistance =
      abs(position.y - uScanY);
    float frontier =
      1.0 -
      smoothstep(
        0.0,
        uScanDelta * 1.55,
        frontierDistance
      );
    float electromagneticJitter =
      sin(position.x * 94.0 + uTime * 37.0) *
      sin(position.z * 83.0 - uTime * 29.0) *
      sin(position.y * 61.0 + uTime * 43.0);
    transformed +=
      normal *
      electromagneticJitter *
      frontier *
      uScanDirection *
      0.014;
    float glitchBand =
      step(
        0.52,
        fract(
          position.y * 4.37 +
          uGlitchSeed * 13.0 +
          sin(position.z * 7.0) * 0.2
        )
      );
    transformed.x +=
      glitchBand *
      uGlitch *
      (
        0.055 +
        0.035 *
        sin(position.y * 81.0 + uTime * 57.0)
      );

    vec4 worldPosition =
      modelMatrix * vec4(transformed, 1.0);
    vBarycentric = aBarycentric;
    vLocalPosition = transformed;
    vNormalDirection = normalize(
      mat3(modelMatrix) * normal
    );
    vViewDirection = normalize(
      cameraPosition - worldPosition.xyz
    );
    vFrontier = frontier;

    gl_Position =
      projectionMatrix *
      viewMatrix *
      worldPosition;
  }
`

const hologramFragmentShader = /* glsl */ `
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uTertiary;
  uniform float uTime;
  uniform float uScanY;
  uniform float uScanDelta;
  uniform float uGain;
  uniform float uCoherence;
  uniform float uGlitch;
  uniform float uGlitchSeed;

  varying vec3 vBarycentric;
  varying vec3 vLocalPosition;
  varying vec3 vNormalDirection;
  varying vec3 vViewDirection;
  varying float vFrontier;

  float hash11(float value) {
    return fract(sin(value * 91.3458) * 47453.5453);
  }

  void main() {
    float signedY = vLocalPosition.y - uScanY;
    float unscanned =
      smoothstep(
        uScanDelta * 1.02,
        uScanDelta * 1.45,
        signedY
      );
    if (unscanned > 0.995) discard;

    float reveal =
      1.0 -
      smoothstep(
        -uScanDelta * 0.82,
        uScanDelta * 1.18,
        signedY
      );
    float frontier =
      1.0 -
      smoothstep(
        0.0,
        uScanDelta * 1.4,
        abs(signedY)
      );
    float transitionBand =
      1.0 -
      smoothstep(
        0.0,
        uScanDelta * 10.0,
        max(0.0, -signedY)
      );

    float edgeDistance =
      min(
        min(vBarycentric.x, vBarycentric.y),
        vBarycentric.z
      );
    float derivativeWidth =
      max(fwidth(edgeDistance) * 1.35, 0.005);
    float wire =
      1.0 -
      smoothstep(
        0.0,
        derivativeWidth,
        edgeDistance
      );

    float facing =
      abs(
        dot(
          normalize(vNormalDirection),
          normalize(vViewDirection)
        )
      );
    float fresnel = pow(1.0 - facing, 2.35);
    float brushedMetal =
      0.5 +
      0.5 *
      sin(
        vLocalPosition.y * 84.0 +
        sin(vLocalPosition.x * 23.0) * 2.4 +
        uTime * 1.9
      );
    float energyFlow =
      0.5 +
      0.5 *
      sin(
        vLocalPosition.y * 17.0 -
        uTime * 3.2 +
        vLocalPosition.x * 8.0
      );

    vec3 formedColor = mix(
      uPrimary,
      uSecondary,
      brushedMetal * 0.42 + fresnel * 0.38
    );
    formedColor = mix(
      formedColor,
      uTertiary,
      energyFlow * 0.14
    );
    float formedAlpha =
      reveal *
      (0.13 + fresnel * 0.48 + brushedMetal * 0.08);
    float wireAlpha =
      wire *
      transitionBand *
      (0.28 + uCoherence * 0.52);
    float frontierAlpha =
      frontier *
      (0.52 + uCoherence * 0.48);

    vec3 color =
      formedColor * (0.85 + fresnel * 1.4) +
      uSecondary * wire * transitionBand * 2.1 +
      vec3(1.0, 5.0, 2.75) *
        frontier *
        5.0 *
        uGain;
    float alpha =
      formedAlpha +
      wireAlpha +
      frontierAlpha;
    float glitchBand =
      step(
        0.48,
        fract(
          vLocalPosition.y * 9.0 +
          uGlitchSeed * 17.0 +
          uTime * 0.61
        )
      );
    float channelNoise = hash11(
      floor(vLocalPosition.y * 36.0) +
      uGlitchSeed * 23.0
    );
    vec3 splitColor = vec3(
      color.r * (1.3 + channelNoise * 0.8),
      color.g * (0.72 + channelNoise * 0.24),
      color.b * (1.45 + (1.0 - channelNoise) * 0.9)
    );
    color = mix(color, splitColor, uGlitch * 0.76);
    color +=
      glitchBand *
      uGlitch *
      vec3(0.36, 0.06, 0.28);
    alpha += uGlitch * glitchBand * 0.14;

    if (alpha < 0.004) discard;
    gl_FragColor = vec4(
      color * (0.82 + uGain * 0.28),
      clamp(alpha, 0.0, 1.0)
    );
  }
`

type Vec3Tuple = readonly [number, number, number]

interface HologramPart {
  geometry: THREE.BufferGeometry
  position?: Vec3Tuple
  rotation?: Vec3Tuple
  scale?: Vec3Tuple
}

function addBarycentricCoordinates(
  source: THREE.BufferGeometry,
) {
  const geometry = source.index
    ? source.toNonIndexed()
    : source.clone()
  if (geometry !== source) source.dispose()

  const position = geometry.getAttribute('position')
  const barycentric = new Float32Array(position.count * 3)
  const trianglePattern = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  for (let index = 0; index < position.count; index += 1) {
    barycentric[index * 3] = trianglePattern[(index % 3) * 3]
    barycentric[index * 3 + 1] =
      trianglePattern[(index % 3) * 3 + 1]
    barycentric[index * 3 + 2] =
      trianglePattern[(index % 3) * 3 + 2]
  }
  geometry.setAttribute(
    'aBarycentric',
    new THREE.BufferAttribute(barycentric, 3),
  )
  geometry.computeVertexNormals()
  return geometry
}

function createModelParts(model: HologramModel) {
  const parts: HologramPart[] = []

  if (model === 'cyber-skull') {
    parts.push(
      {
        geometry: addBarycentricCoordinates(
          new THREE.IcosahedronGeometry(0.48, 2),
        ),
        position: [0, 0.16, 0],
        scale: [1, 0.9, 0.82],
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.DodecahedronGeometry(0.27, 1),
        ),
        position: [0, -0.34, 0.14],
        scale: [1.08, 0.56, 0.86],
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.ConeGeometry(0.14, 0.55, 4),
        ),
        position: [0, 0.61, -0.08],
        rotation: [0, Math.PI / 4, 0],
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.TorusGeometry(0.095, 0.018, 8, 28),
        ),
        position: [-0.17, 0.12, 0.4],
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.TorusGeometry(0.095, 0.018, 8, 28),
        ),
        position: [0.17, 0.12, 0.4],
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.BoxGeometry(0.15, 0.24, 0.12),
        ),
        position: [-0.42, -0.01, 0.12],
        rotation: [0, -0.2, -0.18],
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.BoxGeometry(0.15, 0.24, 0.12),
        ),
        position: [0.42, -0.01, 0.12],
        rotation: [0, 0.2, 0.18],
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.CylinderGeometry(
            0.014,
            0.025,
            0.35,
            8,
          ),
        ),
        position: [-0.33, 0.5, -0.03],
        rotation: [0, 0, -0.42],
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.CylinderGeometry(
            0.014,
            0.025,
            0.35,
            8,
          ),
        ),
        position: [0.33, 0.5, -0.03],
        rotation: [0, 0, 0.42],
      },
    )
  } else if (model === 'turbine-rotor') {
    const bladeGeometry = addBarycentricCoordinates(
      new THREE.BoxGeometry(0.45, 0.028, 0.15),
    )
    parts.push(
      {
        geometry: addBarycentricCoordinates(
          new THREE.TorusGeometry(0.64, 0.085, 12, 96),
        ),
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.TorusGeometry(0.43, 0.032, 10, 80),
        ),
        position: [0, 0, 0.025],
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.CylinderGeometry(0.18, 0.22, 0.44, 24),
        ),
        rotation: [Math.PI / 2, 0, 0],
      },
    )
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2
      parts.push({
        geometry: bladeGeometry,
        position: [
          Math.cos(angle) * 0.34,
          Math.sin(angle) * 0.34,
          0.04,
        ],
        rotation: [0, 0, angle + 0.13],
        scale: [1, 1, 1 + (index % 2) * 0.08],
      })
    }
  } else {
    parts.push(
      {
        geometry: addBarycentricCoordinates(
          new THREE.TorusGeometry(0.66, 0.035, 12, 96),
        ),
        rotation: [Math.PI / 2, 0, 0],
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.TorusGeometry(0.52, 0.028, 10, 88),
        ),
        rotation: [0, Math.PI / 2, 0],
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.TorusGeometry(0.39, 0.022, 8, 72),
        ),
        rotation: [Math.PI / 3, 0, Math.PI / 4],
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.IcosahedronGeometry(0.22, 2),
        ),
        scale: [1, 1.08, 1],
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.CylinderGeometry(0.065, 0.065, 0.96, 16),
        ),
        rotation: [0, 0, Math.PI / 2],
      },
      {
        geometry: addBarycentricCoordinates(
          new THREE.TorusGeometry(0.29, 0.012, 6, 64),
        ),
        position: [0, 0, 0.2],
        rotation: [0.42, 0.2, 0.15],
      },
    )
  }

  return parts
}

function LaserBeam({
  start,
  end,
  color,
  opacity,
}: {
  start: Vec3Tuple
  end: Vec3Tuple
  color: string
  opacity: number
}) {
  const segment = useMemo(() => {
    const from = new THREE.Vector3(...start)
    const to = new THREE.Vector3(...end)
    const direction = to.clone().sub(from)
    const length = Math.max(0.01, direction.length())
    const midpoint = from.add(to).multiplyScalar(0.5)
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    )
    return { length, midpoint, quaternion }
  }, [end, start])

  return (
    <group
      position={segment.midpoint}
      quaternion={segment.quaternion}
    >
      <mesh>
        <coneGeometry args={[0.09, segment.length, 16, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.16}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh>
        <cylinderGeometry
          args={[0.008, 0.012, segment.length, 6, 1, true]}
        />
        <meshBasicMaterial
          color="#eaffff"
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

function ScannerGantry({
  groupRef,
  coherence,
  gain,
}: {
  groupRef: RefObject<THREE.Group | null>
  coherence: number
  gain: number
}) {
  return (
    <group>
      <mesh position={[-1.08, 0.24, 0]}>
        <boxGeometry args={[0.035, 2.05, 0.035]} />
        <meshStandardMaterial
          color="#071216"
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>
      <mesh position={[1.08, 0.24, 0]}>
        <boxGeometry args={[0.035, 2.05, 0.035]} />
        <meshStandardMaterial
          color="#071216"
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>
      <mesh position={[0, 1.27, 0]}>
        <boxGeometry args={[2.2, 0.035, 0.035]} />
        <meshStandardMaterial
          color="#071216"
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>

      <group ref={groupRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.92, 0.018, 8, 96]} />
          <meshBasicMaterial
            color="#8affd1"
            transparent
            opacity={0.62 + coherence * 0.24}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        {SCANNER_CORNERS.map((corner, index) => (
          <group key={corner.join('-')}>
            <mesh position={corner}>
              <sphereGeometry args={[0.035, 10, 8]} />
              <meshBasicMaterial
                color="#dffff4"
                transparent
                opacity={0.9}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
            <LaserBeam
              start={corner}
              end={[
                corner[0] * 0.06,
                0,
                corner[2] * 0.06,
              ]}
              color={index % 2 === 0 ? '#42ffb2' : '#a5ffdf'}
              opacity={0.2 + coherence * 0.48 + gain * 0.08}
            />
          </group>
        ))}
        <pointLight
          color="#57ffc2"
          intensity={4.5 * gain}
          distance={1.8}
          decay={2}
        />
      </group>
    </group>
  )
}

function VoidMarkerCloud({
  pointerRef,
}: {
  pointerRef: RefObject<GalleryPointerState>
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const geometry = useMemo(() => {
    const count = 112
    const positions = new Float32Array(count * 3)
    for (let index = 0; index < count; index += 1) {
      const seed = (index * 73) % 101
      const angle = (seed / 101) * Math.PI * 2
      const radius = 0.72 + ((index * 31) % 47) / 100
      const y = ((index * 43) % 100) / 50 - 1
      const radial = Math.sqrt(Math.max(0, 1 - y * y))
      positions[index * 3] = Math.cos(angle) * radius * radial
      positions[index * 3 + 1] = y * 0.82
      positions[index * 3 + 2] =
        Math.sin(angle) * radius * radial
    }
    const buffer = new THREE.BufferGeometry()
    buffer.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    )
    return buffer
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((state) => {
    if (!pointsRef.current) return
    const time =
      state.clock.elapsedTime *
      useGalleryStore.getState().timeScale
    const pointer = pointerRef.current
    pointsRef.current.rotation.y =
      time * 0.045 + pointer.u * 0.08
    pointsRef.current.rotation.x =
      Math.sin(time * 0.19) * 0.08 + pointer.v * 0.04
  })

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color="#0b7774"
        size={0.016}
        sizeAttenuation
        transparent
        opacity={0.34}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
}

export function LaserScanHologramExhibit({
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
  const palette = useMemo(() => getVfxPreset(vfxPreset), [vfxPreset])
  const model = useGalleryStore((state) => state.hologramModel)
  const glitchPulse = useGalleryStore(
    (state) => state.hologramGlitchPulse,
  )
  const scanRate = exhibit.params.scanRate ?? 0.72
  const scanWidth = exhibit.params.scanWidth ?? 0.18
  const coherence = exhibit.params.coherence ?? 0.88
  const gain = exhibit.params.gain ?? 1.24
  const sparkCapacity =
    performanceTier === 'high'
      ? MAX_SPARKS_HIGH
      : MAX_SPARKS_MEDIUM
  const modelParts = useMemo(() => createModelParts(model), [model])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uPrimary: { value: new THREE.Color(palette.primary) },
          uSecondary: { value: new THREE.Color(palette.secondary) },
          uTertiary: { value: new THREE.Color(palette.tertiary) },
          uTime: { value: 0 },
          uScanY: { value: -0.8 },
          uScanDelta: { value: scanWidth },
          uScanDirection: { value: 1 },
          uGlitch: { value: 0 },
          uGlitchSeed: { value: 0 },
          uGain: { value: gain },
          uCoherence: { value: coherence },
        },
        vertexShader: hologramVertexShader,
        fragmentShader: hologramFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [
      palette.primary,
      palette.secondary,
      palette.tertiary,
    ],
  )
  const modelRef = useRef<THREE.Group>(null)
  const scannerRef = useRef<THREE.Group>(null)
  const hostRef = useRef<HTMLElement | null>(null)
  const dataUpdateRef = useRef(0)
  const modelEntranceRef = useRef(0)
  const manualBlendRef = useRef(0)
  const previousScanYRef = useRef(0)
  const glitchStartRef = useRef(Number.NEGATIVE_INFINITY)
  const glitchRequestRef = useRef(false)
  const nextGlitchAtRef = useRef(3.4)
  const lastGlitchPulseRef = useRef(glitchPulse)
  const sparkState = useSparkPool(sparkCapacity)
  const sparkGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(sparkState.positions, 3),
    )
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(sparkState.colors, 3),
    )
    geometry.setDrawRange(0, sparkCapacity)
    return geometry
  }, [sparkCapacity, sparkState])

  useEffect(() => {
    const uniqueGeometries = new Set(
      modelParts.map((part) => part.geometry),
    )
    return () => {
      uniqueGeometries.forEach((geometry) => geometry.dispose())
    }
  }, [modelParts])

  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    material.uniforms.uScanDelta.value = scanWidth
    material.uniforms.uGain.value = gain
    material.uniforms.uCoherence.value = coherence
  }, [coherence, gain, material, scanWidth])
  useEffect(() => () => sparkGeometry.dispose(), [sparkGeometry])

  useEffect(() => {
    modelEntranceRef.current = 0
  }, [model])

  useEffect(() => {
    if (glitchPulse === lastGlitchPulseRef.current) return
    lastGlitchPulseRef.current = glitchPulse
    glitchRequestRef.current = true
  }, [glitchPulse])

  useEffect(() => {
    const host = gl.domElement.closest<HTMLElement>(
      '[data-gallery-shared-canvas]',
    )
    if (!host) return
    hostRef.current = host
    host.dataset.laserScanHologram = 'quad-state'
    host.dataset.hologramModel = model
    host.dataset.hologramScanBeams = '4'
    host.dataset.hologramSparkCapacity = String(sparkCapacity)
    host.dataset.hologramShaderStates =
      'void,plasma,wireframe,formed'
    host.dataset.hologramGlitchPulse =
      String(glitchPulse)

    return () => {
      delete host.dataset.laserScanHologram
      delete host.dataset.hologramModel
      delete host.dataset.hologramScanBeams
      delete host.dataset.hologramSparkCapacity
      delete host.dataset.hologramShaderStates
      delete host.dataset.hologramScanY
      delete host.dataset.hologramScanMode
      delete host.dataset.hologramGlitch
      delete host.dataset.hologramGlitchPulse
      hostRef.current = null
    }
  }, [gl, glitchPulse, model, sparkCapacity])

  useFrame((state, delta) => {
    const timeScale = useGalleryStore.getState().timeScale
    const time = state.clock.elapsedTime * timeScale
    const pointer = pointerRef.current
    const manualScan = pointer.active || pointer.dragging
    manualBlendRef.current = THREE.MathUtils.damp(
      manualBlendRef.current,
      manualScan ? 1 : 0,
      manualScan ? 18 : 5,
      delta,
    )
    const automaticScanY =
      Math.sin(time * scanRate * 1.28) * 0.78
    const manualScanY = clamp(pointer.v, -1, 1) * 0.78
    const scanY = THREE.MathUtils.lerp(
      automaticScanY,
      manualScanY,
      manualBlendRef.current,
    )
    const scanDelta = scanY - previousScanYRef.current
    const scanDirection =
      Math.abs(scanDelta) > 0.00001
        ? Math.sign(scanDelta)
        : previousScanYRef.current >= 0
          ? -1
          : 1
    previousScanYRef.current = scanY

    if (time >= nextGlitchAtRef.current) {
      glitchRequestRef.current = true
      nextGlitchAtRef.current =
        time +
        3.1 +
        (Math.sin(time * 1.73) * 0.5 + 0.5) * 1.8
    }
    if (glitchRequestRef.current) {
      glitchStartRef.current = time
      glitchRequestRef.current = false
    }
    const glitchAge = time - glitchStartRef.current
    const glitchEnvelope =
      glitchAge >= 0 && glitchAge < 0.32
        ? 1 - glitchAge / 0.32
        : 0
    const glitchStrobe =
      Math.sin(time * 171.0) > -0.28 ? 1 : 0.34
    const glitch = glitchEnvelope * glitchStrobe
    const glitchSeed =
      ((Math.floor(time * 36) % 19) / 19 +
        glitchAge * 0.73) %
      1

    if (scannerRef.current) {
      scannerRef.current.position.y = scanY
      scannerRef.current.position.x =
        Math.sin(glitchSeed * 31.0) * glitch * 0.05
      scannerRef.current.position.z =
        Math.cos(glitchSeed * 19.0) * glitch * 0.025
      scannerRef.current.rotation.y =
        time * 0.18 +
        pointer.u * 0.12 +
        glitch * Math.sin(time * 83.0) * 0.22
    }

    if (modelRef.current) {
      modelEntranceRef.current = Math.min(
        1,
        modelEntranceRef.current + delta * 3.2,
      )
      const entrance = 1 - (1 - modelEntranceRef.current) ** 3
      modelRef.current.scale.setScalar(0.92 + entrance * 0.08)
      modelRef.current.rotation.y =
        time * 0.12 + pointer.u * 0.32
      modelRef.current.rotation.x =
        Math.sin(time * 0.24) * 0.08 + pointer.v * 0.16
      modelRef.current.position.x =
        glitch *
        Math.sin(glitchSeed * 47.0) *
        0.055
      modelRef.current.position.y =
        0.12 + Math.sin(time * 0.72) * 0.025
    }

    material.uniforms.uTime.value = time
    material.uniforms.uScanY.value = scanY
    material.uniforms.uScanDelta.value = scanWidth
    material.uniforms.uScanDirection.value = scanDirection
    material.uniforms.uGlitch.value = glitch
    material.uniforms.uGlitchSeed.value = glitchSeed
    material.uniforms.uGain.value = gain
    material.uniforms.uCoherence.value = coherence

    sparkState.update(
      delta,
      time,
      scanY,
      scanRate,
      coherence,
    )
    if (sparkState.dirty) {
      sparkGeometry.getAttribute('position').needsUpdate = true
      sparkGeometry.getAttribute('color').needsUpdate = true
      sparkState.dirty = false
    }

    dataUpdateRef.current += delta
    const host = hostRef.current
    const ownsLiveTelemetry =
      host !== null &&
      (mode === 'darkroom' ||
        host.dataset.galleryCanvasMode === 'gallery')
    if (host && ownsLiveTelemetry && dataUpdateRef.current > 0.1) {
      dataUpdateRef.current = 0
      host.dataset.hologramScanY = scanY.toFixed(3)
      host.dataset.hologramScanDirection = String(
        scanDirection,
      )
      host.dataset.hologramScanMode =
        manualBlendRef.current > 0.5 ? 'manual' : 'auto'
      host.dataset.hologramGlitch =
        glitch > 0.02 ? 'true' : 'false'
    }
  })

  const displayScale = mode === 'darkroom' ? 1.22 : 0.96

  return (
    <group scale={displayScale}>
      <ScannerGantry
        groupRef={scannerRef}
        coherence={coherence}
        gain={gain}
      />
      <VoidMarkerCloud pointerRef={pointerRef} />
      <group ref={modelRef} position={[0, 0.12, 0]}>
        {modelParts.map((part, index) => (
          <mesh
            key={`${model}-${index}`}
            geometry={part.geometry}
            material={material}
            position={part.position}
            rotation={part.rotation}
            scale={part.scale}
          />
        ))}
      </group>
      <points geometry={sparkGeometry} frustumCulled={false}>
        <pointsMaterial
          vertexColors
          size={0.034}
          sizeAttenuation
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
      <pointLight
        position={[0, 0.22, 0.66]}
        color={palette.tertiary}
        intensity={(mode === 'darkroom' ? 8 : 5.2) * gain}
        distance={3}
        decay={2}
      />
    </group>
  )
}

function useSparkPool(capacity: number) {
  return useMemo(() => {
    const positions = new Float32Array(capacity * 3)
    const colors = new Float32Array(capacity * 3)
    const velocities = new Float32Array(capacity * 3)
    const life = new Float32Array(capacity)
    positions.fill(9999)
    const state = {
      positions,
      colors,
      velocities,
      life,
      cursor: 0,
      accumulator: 0,
      dirty: true,
      update(
        delta: number,
        time: number,
        scanY: number,
        scanRate: number,
        coherence: number,
      ) {
        let changed = false
        state.accumulator +=
          delta *
          (18 + scanRate * 28 + coherence * 10)
        const spawnCount = Math.floor(state.accumulator)
        state.accumulator -= spawnCount

        if (Math.abs(scanY) < 0.72) {
          for (let spawn = 0; spawn < spawnCount; spawn += 1) {
            const index = state.cursor
            const offset = index * 3
            const angle =
              (index * 2.399963 + time * 0.73) %
              (Math.PI * 2)
            const radius = 0.32 + ((index * 17) % 31) / 90
            state.positions[offset] = Math.cos(angle) * radius
            state.positions[offset + 1] = scanY
            state.positions[offset + 2] =
              Math.sin(angle) * radius * 0.72
            state.velocities[offset] =
              Math.cos(angle) * (0.18 + (index % 5) * 0.025)
            state.velocities[offset + 1] =
              0.16 + ((index * 13) % 23) / 90
            state.velocities[offset + 2] =
              Math.sin(angle) * (0.18 + (index % 7) * 0.02)
            const white = index % 4 === 0
            state.colors[offset] = white ? 0.82 : 0.18
            state.colors[offset + 1] = white ? 1 : 1
            state.colors[offset + 2] = white ? 0.9 : 0.48
            state.life[index] = 0.58 + (index % 11) * 0.035
            state.cursor = (index + 1) % capacity
            changed = true
          }
        }

        for (let index = 0; index < capacity; index += 1) {
          if (state.life[index] <= 0) continue
          const offset = index * 3
          state.life[index] -= delta
          if (state.life[index] <= 0) {
            state.positions[offset] = 9999
            changed = true
            continue
          }
          state.positions[offset] +=
            state.velocities[offset] * delta
          state.positions[offset + 1] +=
            state.velocities[offset + 1] * delta
          state.positions[offset + 2] +=
            state.velocities[offset + 2] * delta
          state.velocities[offset + 1] -= delta * 0.18
          changed = true
        }

        state.dirty = changed
      },
    }
    return state
  }, [capacity])
}
