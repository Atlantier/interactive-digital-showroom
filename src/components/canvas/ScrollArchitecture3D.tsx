import { MeshTransmissionMaterial } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import { Box, Cpu, Network, X, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import { useInViewAnimation } from '../../hooks/useInViewAnimation'
import {
  formatTranslation,
  useI18n,
} from '../../i18n/useI18n'
import { getVfxPreset } from '../../data/vfxPresets'
import {
  setParticleSourceCount,
  setShaderPassSourceCount,
} from '../../store/performanceTelemetry'
import { useAppStore } from '../../store/useAppStore'
import { soundEngine } from '../../utils/soundEngine'
import {
  CAUSTICS_LAYER_COUNT,
  ChromaticDispersionRim,
  PRISM_CHROMATIC_IOR,
  ProceduralFloorCaustics,
} from './ArchitecturalOptics'
import { VolumetricStageLights } from './VolumetricStageLights'

type Progress = MotionValue<number>
type LayerId = 'infrastructure' | 'orchestration' | 'spatial'

interface LayerTechMeta {
  index: string
  icon: LucideIcon
  accent: string
}

const LAYER_TECH_META: Record<LayerId, LayerTechMeta> = {
  infrastructure: {
    index: '01',
    icon: Cpu,
    accent: '#10b981',
  },
  orchestration: {
    index: '02',
    icon: Network,
    accent: '#f2b35e',
  },
  spatial: {
    index: '03',
    icon: Box,
    accent: '#72e6ff',
  },
}

const flowVertexShader = /* glsl */ `
  varying vec2 vFlowUv;

  void main() {
    vFlowUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const flowFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uFrequency;
  uniform float uIntensity;
  uniform float uPhaseOffset;
  uniform float uAudioEnergy;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  varying vec2 vFlowUv;

  void main() {
    float audioDrive = clamp(uAudioEnergy, 0.0, 1.0);
    float phase =
      vFlowUv.x * uFrequency * 6.28318 -
      uTime * uSpeed * 6.28318 * (1.0 + audioDrive * 0.34) +
      uPhaseOffset;
    float wave = 0.5 + 0.5 * sin(phase);
    float pulse = pow(wave, 24.0);
    float halo = pow(wave, 9.0);
    float tail = pow(wave, 4.0) * 0.18;
    float core =
      0.08 +
      tail +
      halo * 0.34 +
      pulse * 1.8 +
      audioDrive * 0.16;
    vec3 color = mix(uColorA, uColorB, vFlowUv.x);
    color = mix(color, vec3(0.82, 0.96, 1.0), pulse * 0.82);

    gl_FragColor = vec4(
      color *
        (0.72 + halo * 1.2 + pulse * 3.4 + audioDrive * 0.62),
      min(0.98, core * uIntensity * (1.0 + audioDrive * 0.4))
    );
  }
`

const AGENT_NODES: ReadonlyArray<readonly [number, number, number]> = [
  [-1.18, 0.08, 0],
  [1.08, -0.06, 0.16],
  [-0.42, 0.38, -0.72],
  [0.5, -0.34, -0.68],
  [-0.22, -0.22, 0.76],
  [0.94, 0.44, 0.58],
  [-0.88, -0.34, 0.52],
]

const AGENT_LINKS: ReadonlyArray<readonly [number, number]> = [
  [0, 2],
  [0, 3],
  [0, 6],
  [1, 3],
  [1, 5],
  [2, 4],
  [2, 5],
  [3, 4],
  [4, 6],
  [5, 6],
]

const laserVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uPixelRatio;
  uniform float uAudioEnergy;

  attribute float aPhase;
  attribute float aSpeed;
  attribute float aScale;

  varying float vAlpha;

  void main() {
    float travel = fract(
      aPhase + uTime * aSpeed * (1.0 + uAudioEnergy * 0.45)
    );
    vec3 transformed = position;
    transformed.y = mix(-1.9, 1.9, travel);
    transformed.x += sin(uTime * 0.85 + aPhase * 11.0) * 0.035;
    transformed.z += cos(uTime * 0.72 + aPhase * 9.0) * 0.035;

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize =
      (2.2 + aScale * 6.2) *
      (0.3 + uIntensity) *
      uPixelRatio *
      (1.0 + uAudioEnergy * 0.5);
    vAlpha =
      uIntensity *
      (1.0 - abs(travel - 0.5) * 1.32) *
      (0.3 + aScale * 0.7) *
      (1.0 + uAudioEnergy * 0.65);
  }
`

const laserFragmentShader = /* glsl */ `
  uniform float uAudioEnergy;
  varying float vAlpha;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    point.x *= 4.5;
    float core = 1.0 - smoothstep(0.03, 0.5, length(point));
    if (core < 0.01) discard;

    vec3 color = mix(
      vec3(0.063, 0.725, 0.506),
      vec3(0.545, 0.361, 0.965),
      gl_PointCoord.y
    );
    color = mix(color, vec3(0.78, 0.94, 1.0), 0.3);
    gl_FragColor = vec4(
      color * (1.0 + uAudioEnergy * 0.45),
      core * vAlpha
    );
  }
`

function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = Math.min(
    1,
    Math.max(0, (value - edge0) / (edge1 - edge0)),
  )
  return normalized * normalized * (3 - 2 * normalized)
}

function createRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function InfrastructureLayer() {
  const lightRef = useRef<THREE.PointLight>(null)
  const matrixData = useMemo(() => {
    const columns = 15
    const count = columns * columns
    const geometry = new THREE.BoxGeometry(0.054, 0.054, 0.054)
    const material = new THREE.MeshBasicMaterial({
      color: '#10b981',
      wireframe: true,
      transparent: true,
      opacity: 0.36,
      toneMapped: false,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    const matrix = new THREE.Matrix4()
    const spacing = 0.115

    for (let row = 0; row < columns; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column
        const x = (column - (columns - 1) / 2) * spacing
        const z = (row - (columns - 1) / 2) * spacing
        const y =
          ((column + row) % 4) * 0.012 +
          Math.sin(column * 1.7 + row * 0.9) * 0.02
        matrix.makeTranslation(x, y, z)
        mesh.setMatrixAt(index, matrix)
      }
    }

    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = false

    return { mesh, geometry, material }
  }, [])

  useEffect(() => {
    return () => {
      matrixData.mesh.removeFromParent()
      matrixData.geometry.dispose()
      matrixData.material.dispose()
      matrixData.mesh.dispose()
    }
  }, [matrixData])

  useFrame((state) => {
    const audioEnergy = soundEngine.readEnergyEnvelope()
    matrixData.material.opacity = 0.3 + audioEnergy * 0.5
    matrixData.mesh.scale.setScalar(1 + audioEnergy * 0.028)
    matrixData.mesh.rotation.y =
      Math.sin(state.clock.elapsedTime * 0.24) *
      audioEnergy *
      0.08
    if (lightRef.current) {
      lightRef.current.intensity = 8 + audioEnergy * 18
    }
  })

  return (
    <group>
      <primitive object={matrixData.mesh} />
      <mesh position={[0, -0.08, 0]}>
        <boxGeometry args={[2.15, 0.16, 2.15]} />
        <meshBasicMaterial
          color="#72e6ff"
          wireframe
          transparent
          opacity={0.23}
          toneMapped={false}
        />
      </mesh>
      <gridHelper
        args={[2.8, 20, '#10b981', '#0b2b26']}
        position={[0, -0.15, 0]}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.16, 0]}>
        <planeGeometry args={[2.8, 2.8]} />
        <meshBasicMaterial
          color="#10b981"
          transparent
          opacity={0.035}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        color="#10b981"
        intensity={8}
        distance={3}
        decay={2}
        position={[0, 0.3, 0]}
      />
    </group>
  )
}

function AgentPulse({
  from,
  to,
  offset,
}: {
  from: readonly [number, number, number]
  to: readonly [number, number, number]
  offset: number
}) {
  const pulseRef = useRef<THREE.Mesh>(null)
  const start = useMemo(() => new THREE.Vector3(...from), [from])
  const end = useMemo(() => new THREE.Vector3(...to), [to])
  const position = useMemo(() => new THREE.Vector3(), [])

  useFrame((state) => {
    if (!pulseRef.current) return
    const travel = (state.clock.elapsedTime * 0.34 + offset) % 1
    position.lerpVectors(start, end, travel)
    pulseRef.current.position.copy(position)
    const pulse = 0.7 + Math.sin(travel * Math.PI) * 0.6
    pulseRef.current.scale.setScalar(pulse)
  })

  return (
    <mesh ref={pulseRef}>
      <sphereGeometry args={[0.032, 8, 8]} />
      <meshBasicMaterial color="#d9fbff" toneMapped={false} />
    </mesh>
  )
}

function OrchestrationLayer() {
  const contentRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const linkMaterialRef = useRef<THREE.LineBasicMaterial>(null)
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const linkGeometry = useMemo(() => {
    const positions: number[] = []

    for (const [from, to] of AGENT_LINKS) {
      positions.push(...AGENT_NODES[from], ...AGENT_NODES[to])
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    )
    return geometry
  }, [])

  useEffect(() => () => linkGeometry.dispose(), [linkGeometry])

  useFrame((_, delta) => {
    const audioEnergy = soundEngine.readEnergyEnvelope()
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * (0.09 + audioEnergy * 0.16)
      ringRef.current.rotation.x += delta * (0.035 + audioEnergy * 0.08)
      ringRef.current.scale.setScalar(1 + audioEnergy * 0.08)
    }
    if (contentRef.current) {
      contentRef.current.scale.setScalar(1 + audioEnergy * 0.025)
    }
    if (linkMaterialRef.current) {
      linkMaterialRef.current.opacity = 0.24 + audioEnergy * 0.44
    }
    if (ringMaterialRef.current) {
      ringMaterialRef.current.opacity = 0.46 + audioEnergy * 0.4
    }
    if (lightRef.current) {
      lightRef.current.intensity = 10 + audioEnergy * 16
    }
  })

  return (
    <group ref={contentRef}>
      <lineSegments geometry={linkGeometry}>
        <lineBasicMaterial
          ref={linkMaterialRef}
          color="#72e6ff"
          transparent
          opacity={0.3}
          toneMapped={false}
        />
      </lineSegments>
      {AGENT_LINKS.slice(0, 7).map(([from, to], index) => (
        <AgentPulse
          key={`${from}-${to}`}
          from={AGENT_NODES[from]}
          to={AGENT_NODES[to]}
          offset={index / 7}
        />
      ))}
      {AGENT_NODES.map(([x, y, z], index) => {
        const color = index % 3 === 0 ? '#8b5cf6' : '#72e6ff'
        return (
          <group key={`${x}-${y}-${z}`} position={[x, y, z]}>
            <mesh>
              <octahedronGeometry args={[0.2, 0]} />
              <meshBasicMaterial
                color={color}
                wireframe
                transparent
                opacity={0.74}
                toneMapped={false}
              />
            </mesh>
            <mesh scale={0.34}>
              <octahedronGeometry args={[0.2, 0]} />
              <meshBasicMaterial color="#d9fbff" toneMapped={false} />
            </mesh>
          </group>
        )
      })}
      <mesh ref={ringRef} rotation={[1.1, 0.2, 0]}>
        <torusGeometry args={[1.35, 0.008, 8, 180]} />
        <meshBasicMaterial
          ref={ringMaterialRef}
          color="#10b981"
          transparent
          opacity={0.55}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        color="#72e6ff"
        intensity={10}
        distance={4}
        decay={2}
      />
    </group>
  )
}

function SpatialLayer() {
  const groupRef = useRef<THREE.Group>(null)
  const wireMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const planeGroupRef = useRef<THREE.Group>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const performanceTier = useAppStore((state) => state.performanceTier)

  useFrame((state) => {
    if (!groupRef.current) return
    const audioEnergy = soundEngine.readEnergyEnvelope()
    groupRef.current.rotation.y =
      state.clock.elapsedTime * (0.12 + audioEnergy * 0.07)
    groupRef.current.rotation.z =
      Math.sin(state.clock.elapsedTime * 0.22) * 0.04
    groupRef.current.scale.setScalar(1 + audioEnergy * 0.04)
    if (wireMaterialRef.current) {
      wireMaterialRef.current.opacity = 0.2 + audioEnergy * 0.42
    }
    if (planeGroupRef.current) {
      for (const child of planeGroupRef.current.children) {
        if (
          child instanceof THREE.Mesh &&
          child.material instanceof THREE.MeshBasicMaterial
        ) {
          child.material.opacity = 0.11 + audioEnergy * 0.2
        }
      }
    }
    if (lightRef.current) {
      lightRef.current.intensity = 12 + audioEnergy * 22
    }
  })

  return (
    <group ref={groupRef}>
      <mesh scale={[1.15, 0.62, 1.15]}>
        <octahedronGeometry args={[1.04, 0]} />
        <MeshTransmissionMaterial
          transmission={1}
          thickness={0.7}
          roughness={0.12}
          ior={1.15}
          chromaticAberration={
            performanceTier === 'high' ? 0.078 : 0.025
          }
          anisotropy={0.12}
          distortion={0.18}
          distortionScale={0.24}
          temporalDistortion={0.06}
          samples={performanceTier === 'high' ? 2 : 1}
          resolution={performanceTier === 'high' ? 192 : 96}
          color="#c2f5ff"
          attenuationColor="#8b5cf6"
          attenuationDistance={0.92}
          side={THREE.DoubleSide}
          transparent
        />
      </mesh>
      <ChromaticDispersionRim
        intensity={performanceTier === 'high' ? 0.82 : 0.58}
      />
      <mesh scale={[1.16, 0.63, 1.16]}>
        <octahedronGeometry args={[1.04, 0]} />
        <meshBasicMaterial
          ref={wireMaterialRef}
          color="#72e6ff"
          wireframe
          transparent
          opacity={0.26}
          toneMapped={false}
        />
      </mesh>
      <group ref={planeGroupRef} position={[0, 0.05, 0]}>
        {[
          [-0.4, 0.16, 0.06, -0.24, 0.62, 0.34],
          [0.38, -0.03, -0.02, 0.2, 0.46, 0.28],
          [0.05, 0.32, 0.13, 0.05, 0.52, 0.22],
        ].map(([x, y, z, rotation, width, height], index) => (
          <mesh
            key={`${x}-${y}-${z}`}
            position={[x, y, z]}
            rotation={[0, rotation, index === 0 ? -0.08 : 0.04]}
          >
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial
              color={index === 0 ? '#72e6ff' : '#8b5cf6'}
              transparent
              opacity={0.14}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
      <pointLight
        ref={lightRef}
        color="#8b5cf6"
        intensity={12}
        distance={4.5}
        decay={2}
        position={[0.5, 0.8, 1]}
      />
    </group>
  )
}

function FlowPipe({ index, progress }: { index: number; progress: Progress }) {
  const curve = useMemo(() => {
    const angle = (index / 4) * Math.PI * 2
    return new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(
          Math.cos(angle) * 1.3,
          -1.45,
          Math.sin(angle) * 1.3,
        ),
        new THREE.Vector3(
          Math.cos(angle + 0.3) * 1.58,
          -0.62,
          Math.sin(angle + 0.3) * 1.58,
        ),
        new THREE.Vector3(
          Math.cos(angle - 0.24) * 1.42,
          0.62,
          Math.sin(angle - 0.24) * 1.42,
        ),
        new THREE.Vector3(
          Math.cos(angle) * 1.08,
          1.55,
          Math.sin(angle) * 1.08,
        ),
      ],
      false,
      'catmullrom',
      0.45,
    )
  }, [index])
  const tubeGeometry = useMemo(
    () => new THREE.TubeGeometry(curve, 96, 0.014, 6, false),
    [curve],
  )
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: 1.2 + index * 0.08 },
          uFrequency: { value: 1.25 + index * 0.18 },
          uIntensity: { value: 0.6 },
          uPhaseOffset: { value: index * 1.37 },
          uAudioEnergy: { value: 0 },
          uColorA: {
            value: new THREE.Color(index % 2 === 0 ? '#10b981' : '#72e6ff'),
          },
          uColorB: {
            value: new THREE.Color(index % 2 === 0 ? '#8b5cf6' : '#d9fbff'),
          },
        },
        vertexShader: flowVertexShader,
        fragmentShader: flowFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [index],
  )

  useEffect(
    () => () => {
      tubeGeometry.dispose()
      material.dispose()
    },
    [material, tubeGeometry],
  )

  useFrame((state) => {
    const audioEnergy = soundEngine.readEnergyEnvelope()
    const progressValue = progress.get()
    const explode =
      smoothstep(0.3, 0.7, progressValue) *
      (1 - smoothstep(0.7, 0.84, progressValue))

    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uSpeed.value = 1.2 + explode * 1.6 + index * 0.08
    material.uniforms.uIntensity.value = 0.55 + explode * 0.9
    material.uniforms.uAudioEnergy.value = audioEnergy
  })

  return (
    <mesh geometry={tubeGeometry}>
      <primitive object={material} attach="material" />
    </mesh>
  )
}

function FlowPipes({ progress }: { progress: Progress }) {
  return (
    <group>
      {[0, 1, 2, 3].map((index) => (
        <FlowPipe key={index} index={index} progress={progress} />
      ))}
    </group>
  )
}

function LaserStreams({ progress }: { progress: Progress }) {
  const performanceTier = useAppStore((state) => state.performanceTier)
  const particleCount = performanceTier === 'high' ? 560 : 280
  const { geometry, material } = useMemo(() => {
    const count = particleCount
    const random = createRandom(211)
    const positions = new Float32Array(count * 3)
    const phases = new Float32Array(count)
    const speeds = new Float32Array(count)
    const scales = new Float32Array(count)

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3
      const angle = random() * Math.PI * 2
      const radius = 0.28 + random() * 1.42
      positions[offset] = Math.cos(angle) * radius
      positions[offset + 1] = 0
      positions[offset + 2] = Math.sin(angle) * radius
      phases[index] = random()
      speeds[index] = 0.13 + random() * 0.22
      scales[index] = random()
    }

    const streamGeometry = new THREE.BufferGeometry()
    streamGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    )
    streamGeometry.setAttribute(
      'aPhase',
      new THREE.BufferAttribute(phases, 1),
    )
    streamGeometry.setAttribute(
      'aSpeed',
      new THREE.BufferAttribute(speeds, 1),
    )
    streamGeometry.setAttribute(
      'aScale',
      new THREE.BufferAttribute(scales, 1),
    )

    const streamMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uPixelRatio: { value: 1 },
        uAudioEnergy: { value: 0 },
      },
      vertexShader: laserVertexShader,
      fragmentShader: laserFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })

    return { geometry: streamGeometry, material: streamMaterial }
  }, [particleCount])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useEffect(() => {
    setParticleSourceCount('architecture-laser-stream', particleCount)
    return () =>
      setParticleSourceCount('architecture-laser-stream', 0)
  }, [particleCount])

  useFrame((state) => {
    const audioEnergy = soundEngine.readEnergyEnvelope()
    const progressValue = progress.get()
    const intensity =
      smoothstep(0.28, 0.36, progressValue) *
      (1 - smoothstep(0.68, 0.74, progressValue))

    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uIntensity.value = intensity
    material.uniforms.uPixelRatio.value = state.viewport.dpr
    material.uniforms.uAudioEnergy.value = audioEnergy
  })

  return (
    <points geometry={geometry} frustumCulled={false}>
      <primitive object={material} attach="material" />
    </points>
  )
}

function LayerHitbox({
  layer,
  size,
  selected,
  accent,
  onSelect,
}: {
  layer: LayerId
  size: readonly [number, number, number]
  selected: boolean
  accent: string
  onSelect: (layer: LayerId) => void
}) {
  const [hovered, setHovered] = useState(false)
  const playSound = useInterfaceSound()

  useEffect(() => {
    if (!hovered) return
    const previousCursor = document.body.style.cursor
    document.body.style.cursor = 'pointer'

    return () => {
      document.body.style.cursor = previousCursor
    }
  }, [hovered])

  return (
    <>
      <mesh
        onClick={(event) => {
          event.stopPropagation()
          playSound('navigate')
          onSelect(layer)
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          if (!hovered) playSound('hover')
          setHovered(true)
        }}
        onPointerOut={(event) => {
          event.stopPropagation()
          setHovered(false)
        }}
      >
        <boxGeometry args={size} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {selected ? (
        <mesh scale={[1.035, 1.07, 1.035]}>
          <boxGeometry args={size} />
          <meshBasicMaterial
            color={accent}
            wireframe
            transparent
            opacity={0.3}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ) : null}
    </>
  )
}

function ArchitectureModel({
  progress,
  selectedLayer,
  onSelectLayer,
  palette,
}: {
  progress: Progress
  selectedLayer: LayerId | null
  onSelectLayer: (layer: LayerId) => void
  palette: readonly [string, string, string]
}) {
  const rootRef = useRef<THREE.Group>(null)
  const bottomRef = useRef<THREE.Group>(null)
  const middleRef = useRef<THREE.Group>(null)
  const topRef = useRef<THREE.Group>(null)
  const pipeRef = useRef<THREE.Group>(null)
  const reducedMotion = Boolean(useReducedMotion())

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const audioEnergy = soundEngine.readEnergyEnvelope()
    const progressValue = progress.get()
    const explode =
      smoothstep(0.3, 0.7, progressValue) *
      (1 - smoothstep(0.7, 0.84, progressValue))
    const reassembly = smoothstep(0.74, 0.97, progressValue)
    const motionScale = reducedMotion ? 0.14 : 1
    const stage = state.gl.domElement.closest<HTMLElement>(
      '[data-architecture-section]',
    )
    if (stage) {
      stage.dataset.audioEnergy = audioEnergy.toFixed(4)
    }

    if (rootRef.current) {
      rootRef.current.rotation.y =
        time * 0.075 * motionScale + progressValue * 0.28
      rootRef.current.rotation.x =
        Math.sin(time * 0.18 * motionScale) * 0.055
      rootRef.current.rotation.z =
        Math.cos(time * 0.14 * motionScale) * 0.025
      rootRef.current.scale.setScalar(
        (1 - reassembly * 0.12) * (1 + audioEnergy * 0.032),
      )
    }
    if (bottomRef.current) {
      bottomRef.current.position.y = -1.28 - explode * 0.78
    }
    if (middleRef.current) {
      middleRef.current.position.y = explode * 0.16
      middleRef.current.rotation.y =
        Math.sin(time * 0.16) * 0.22 * motionScale
    }
    if (topRef.current) {
      topRef.current.position.y = 1.38 + explode * 0.8
    }
    if (pipeRef.current) {
      pipeRef.current.scale.y =
        1 + explode * 0.58 + audioEnergy * 0.035
    }
  })

  return (
    <group ref={rootRef}>
      <group ref={bottomRef} position={[0, -1.28, 0]}>
        <InfrastructureLayer />
        <LayerHitbox
          layer="infrastructure"
          size={[2.8, 0.78, 2.8]}
          selected={selectedLayer === 'infrastructure'}
          accent={palette[0]}
          onSelect={onSelectLayer}
        />
      </group>
      <group ref={middleRef}>
        <OrchestrationLayer />
        <LayerHitbox
          layer="orchestration"
          size={[3.25, 1.36, 2.65]}
          selected={selectedLayer === 'orchestration'}
          accent={palette[1]}
          onSelect={onSelectLayer}
        />
      </group>
      <group ref={topRef} position={[0, 1.38, 0]}>
        <SpatialLayer />
        <LayerHitbox
          layer="spatial"
          size={[2.7, 1.36, 2.7]}
          selected={selectedLayer === 'spatial'}
          accent={palette[2]}
          onSelect={onSelectLayer}
        />
      </group>
      <group ref={pipeRef}>
        <FlowPipes progress={progress} />
      </group>
      <LaserStreams progress={progress} />
    </group>
  )
}

function CameraRig({
  progress,
  selectedLayer,
}: {
  progress: Progress
  selectedLayer: LayerId | null
}) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(0, 0.25, 9.2),
          new THREE.Vector3(1.55, 1.05, 8.6),
          new THREE.Vector3(2.25, 0.72, 7.35),
          new THREE.Vector3(2.55, 0.25, 6.55),
          new THREE.Vector3(1.25, 0.7, 7.45),
        ],
        false,
        'catmullrom',
        0.4,
      ),
    [],
  )
  const targetPosition = useMemo(() => new THREE.Vector3(), [])
  const defaultTarget = useMemo(() => new THREE.Vector3(0, 0.15, 0), [])
  const middleTarget = useMemo(() => new THREE.Vector3(0.08, 0.08, 0), [])
  const lookTarget = useMemo(() => new THREE.Vector3(0, 0.15, 0), [])
  const focusCameraPositions = useMemo<Record<LayerId, THREE.Vector3>>(
    () => ({
      infrastructure: new THREE.Vector3(),
      orchestration: new THREE.Vector3(),
      spatial: new THREE.Vector3(),
    }),
    [],
  )
  const focusLookTargets = useMemo<Record<LayerId, THREE.Vector3>>(
    () => ({
      infrastructure: new THREE.Vector3(),
      orchestration: new THREE.Vector3(),
      spatial: new THREE.Vector3(),
    }),
    [],
  )

  useFrame((state, delta) => {
    const progressValue = progress.get()
    const explode =
      smoothstep(0.3, 0.7, progressValue) *
      (1 - smoothstep(0.7, 0.84, progressValue))
    const travel = smoothstep(0.16, 0.82, progressValue)
    const focus = smoothstep(0.26, 0.6, progressValue)
    curve.getPointAt(travel, targetPosition)
    const damping = 1 - Math.exp(-delta * 3.2)
    lookTarget.lerpVectors(defaultTarget, middleTarget, focus)

    if (selectedLayer) {
      const bottomY = -1.28 - explode * 0.78
      const middleY = explode * 0.16
      const topY = 1.38 + explode * 0.8

      if (selectedLayer === 'infrastructure') {
        focusCameraPositions.infrastructure.set(2.45, bottomY + 1.1, 5.15)
        focusLookTargets.infrastructure.set(0, bottomY + 0.02, 0)
      } else if (selectedLayer === 'orchestration') {
        focusCameraPositions.orchestration.set(2.8, middleY + 0.34, 4.7)
        focusLookTargets.orchestration.set(0, middleY + 0.03, 0)
      } else {
        focusCameraPositions.spatial.set(2.25, topY + 0.28, 4.95)
        focusLookTargets.spatial.set(0, topY, 0)
      }

      const focusDamping = 1 - Math.exp(-delta * 4.8)
      targetPosition.lerp(
        focusCameraPositions[selectedLayer],
        focusDamping,
      )
      lookTarget.lerp(focusLookTargets[selectedLayer], focusDamping)
    }

    state.camera.position.lerp(targetPosition, damping)
    state.camera.lookAt(lookTarget)

    if (state.camera instanceof THREE.PerspectiveCamera) {
      const targetFov = selectedLayer ? 33 : 48
      const nextFov = THREE.MathUtils.damp(
        state.camera.fov,
        targetFov,
        4.2,
        delta,
      )
      if (Math.abs(nextFov - state.camera.fov) > 0.001) {
        state.camera.fov = nextFov
        state.camera.updateProjectionMatrix()
      }
    }
  })

  return null
}

function ArchitectureScene({
  progress,
  selectedLayer,
  onSelectLayer,
}: {
  progress: Progress
  selectedLayer: LayerId | null
  onSelectLayer: (layer: LayerId) => void
}) {
  const performanceTier = useAppStore((state) => state.performanceTier)
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const preset = getVfxPreset(vfxPreset)

  return (
    <>
      <color attach="background" args={['#030507']} />
      <fogExp2 attach="fog" args={['#030507', 0.075]} />
      <ambientLight intensity={0.48} color="#9ccbd4" />
      <directionalLight
        position={[-4, 5, 4]}
        intensity={2.1}
        color={preset.secondary}
      />
      <directionalLight
        position={[4, -2, 3]}
        intensity={1.2}
        color={preset.tertiary}
      />
      <VolumetricStageLights variant="architecture" />
      <ProceduralFloorCaustics progress={progress} />
      <CameraRig progress={progress} selectedLayer={selectedLayer} />
      <ArchitectureModel
        progress={progress}
        selectedLayer={selectedLayer}
        onSelectLayer={onSelectLayer}
        palette={[
          preset.primary,
          preset.secondary,
          preset.tertiary,
        ]}
      />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          intensity={performanceTier === 'high' ? 1 : 0.82}
          luminanceThreshold={0.15}
          luminanceSmoothing={0.2}
          mipmapBlur
          radius={0.7}
          resolutionScale={performanceTier === 'high' ? 0.9 : 0.5}
        />
      </EffectComposer>
    </>
  )
}

function LayerFocusHud({
  selectedLayer,
  onClose,
}: {
  selectedLayer: LayerId | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const meta = selectedLayer ? LAYER_TECH_META[selectedLayer] : null
  const details = selectedLayer
    ? t.architecture.layers[selectedLayer]
    : null
  const Icon = meta?.icon

  return (
    <AnimatePresence mode="wait">
      {details && meta && Icon ? (
        <motion.aside
          key={selectedLayer}
          data-architecture-hud
          data-layer={selectedLayer}
          aria-live="polite"
          initial={{ opacity: 0, x: 28, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 22, scale: 0.97 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto absolute right-4 top-[16%] z-40 max-h-[58svh] w-[calc(100%-2rem)] max-w-[390px] overflow-y-auto rounded-md border bg-carbon/90 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-5 md:right-10 md:top-[18%] lg:right-14 lg:w-[380px]"
          style={{
            borderColor: `${meta.accent}38`,
            boxShadow: `0 24px 90px rgba(0, 0, 0, 0.55), inset 0 1px 0 ${meta.accent}20`,
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${meta.accent}aa, transparent)`,
            }}
          />

          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-md border"
                style={{
                  color: meta.accent,
                  borderColor: `${meta.accent}38`,
                  backgroundColor: `${meta.accent}14`,
                }}
              >
                <Icon size={18} strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  {formatTranslation(t.architecture.layerLabel, {
                    index: meta.index,
                  })}
                </p>
                <p className="mt-1 truncate text-lg text-frost">
                  {details.title}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.architecture.closeDetails}
              className="grid size-8 shrink-0 place-items-center rounded-md border border-white/10 text-mist/55 transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-frost focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              <X size={15} strokeWidth={1.6} />
            </button>
          </div>

          <div className="mt-5 border-t border-white/[0.08] pt-4">
            <p
              className="font-mono text-[11px] uppercase tracking-[0.18em]"
              style={{ color: meta.accent }}
            >
              {details.eyebrow} / {details.subtitle}
            </p>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              {details.description}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {details.stack.map((item) => (
              <span
                key={item}
                className="rounded border border-white/[0.08] bg-white/[0.035] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]"
              >
                {item}
              </span>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {details.metrics.map(({ label, value }) => (
              <div
                key={label}
                className="rounded border border-white/[0.08] bg-black/20 px-3 py-2.5"
              >
                <p className="font-mono text-[11px] text-[var(--text-secondary)]">{label}</p>
                <p className="mt-1 text-base text-frost">{value}</p>
              </div>
            ))}
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}

function ArchitectureNarrativeOverlay({
  progress,
  selectedLayer,
  onCloseLayer,
}: {
  progress: Progress
  selectedLayer: LayerId | null
  onCloseLayer: () => void
}) {
  const { t } = useI18n()
  const phaseOneOpacity = useTransform(
    progress,
    [0, 0.22, 0.31],
    [1, 1, 0],
  )
  const phaseTwoOpacity = useTransform(
    progress,
    [0.24, 0.34, 0.62, 0.72],
    [0, 1, 1, 0],
  )
  const phaseThreeOpacity = useTransform(
    progress,
    [0.66, 0.76, 0.98, 1],
    [0, 1, 1, 0.72],
  )
  const phaseOneY = useTransform(progress, [0, 0.3], [0, -22])
  const phaseTwoY = useTransform(progress, [0.24, 0.4], [24, 0])
  const phaseThreeY = useTransform(progress, [0.66, 0.8], [24, 0])
  const metricsOpacity = useTransform(progress, [0.68, 0.8], [0, 1])
  const metricsX = useTransform(progress, [0.68, 0.84], [36, 0])
  const metricTwoOpacity = useTransform(progress, [0.71, 0.83], [0, 1])
  const metricThreeOpacity = useTransform(progress, [0.74, 0.86], [0, 1])
  const sceneFade = useTransform(
    progress,
    [0.72, 0.84, 0.97],
    [0, 0.2, 0.92],
  )

  return (
    <>
      <motion.div
        aria-hidden="true"
        style={{ opacity: sceneFade }}
        className="pointer-events-none absolute inset-0 z-10 bg-void"
      />
      <div className="pointer-events-none absolute inset-0 z-20">
        <div
          aria-hidden="true"
          className="architecture-scrim absolute inset-0"
        />
        <div
          aria-hidden="true"
          className="architecture-grid absolute inset-0 opacity-50"
        />

        <div className="relative mx-auto flex h-full max-w-[1600px] flex-col px-5 pb-8 pt-24 sm:px-8 sm:pb-10 sm:pt-28 md:px-12">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="font-mono text-[11px] text-signal">
                {t.architecture.headerTitle}
              </p>
              <p className="mt-2 max-w-xs text-sm leading-6 text-[var(--text-secondary)]">
                {t.architecture.headerDescription}
              </p>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                {t.architecture.expanding}
              </span>
              <div className="h-px w-24 overflow-hidden bg-white/10">
                <motion.div
                  style={{ scaleX: progress }}
                  className="h-full w-full origin-left bg-signal"
                />
              </div>
            </div>
          </div>

          <div className="relative mt-auto min-h-[330px] sm:min-h-[300px] lg:min-h-[340px]">
            <motion.div
              data-architecture-phase="assembled"
              style={{ opacity: phaseOneOpacity, y: phaseOneY }}
              className="absolute inset-x-0 bottom-8 max-w-[720px]"
            >
              <h3 className="text-4xl font-medium leading-[1.02] text-frost sm:text-5xl md:text-6xl xl:text-7xl">
                {t.architecture.phaseOne.titleLineOne}
                <br />
                {t.architecture.phaseOne.titleLineTwo}
              </h3>
              <p className="mt-5 max-w-lg text-sm leading-6 text-mist sm:text-base sm:leading-7">
                {t.architecture.phaseOne.description}
              </p>
            </motion.div>

            <motion.div
              data-architecture-phase="exploded"
              style={{ opacity: phaseTwoOpacity, y: phaseTwoY }}
              className="absolute inset-x-0 bottom-8 max-w-[720px]"
            >
              <h3 className="text-4xl font-medium leading-[1.02] text-frost sm:text-5xl md:text-6xl xl:text-7xl">
                {t.architecture.phaseTwo.titleLineOne}
                <br />
                {t.architecture.phaseTwo.titleLineTwo}
              </h3>
              <p className="mt-5 max-w-lg text-sm leading-6 text-mist sm:text-base sm:leading-7">
                {t.architecture.phaseTwo.description}
              </p>
            </motion.div>

            <motion.div
              data-architecture-phase="assembled-final"
              style={{ opacity: phaseThreeOpacity, y: phaseThreeY }}
              className="absolute inset-x-0 bottom-8 max-w-[720px]"
            >
              <h3 className="text-4xl font-medium leading-[1.02] text-frost sm:text-5xl md:text-6xl xl:text-7xl">
                {t.architecture.phaseThree.titleLineOne}
                <br />
                {t.architecture.phaseThree.titleLineTwo}
              </h3>
              <p className="mt-5 max-w-lg text-sm leading-6 text-mist sm:text-base sm:leading-7">
                {t.architecture.phaseThree.description}
              </p>
            </motion.div>
          </div>

          <div className="hidden items-end justify-between gap-8 border-t border-white/[0.08] pt-4 md:flex">
            <div className="flex flex-wrap gap-x-8 gap-y-3 font-mono text-[11px] text-[var(--text-secondary)]">
              <span className="flex items-center gap-2">
                <span className="size-1.5 bg-signal" />
                {t.architecture.legend.spatial}
              </span>
              <span className="flex items-center gap-2">
                <span className="size-1.5 bg-amber" />
                {t.architecture.legend.orchestration}
              </span>
              <span className="flex items-center gap-2">
                <span className="size-1.5 bg-emerald-400" />
                {t.architecture.legend.infrastructure}
              </span>
            </div>
            <span className="font-mono text-[11px] text-[var(--text-secondary)]">
              {t.architecture.coreLabel}
            </span>
          </div>
        </div>

        <motion.div
          data-architecture-metrics
          style={{
            opacity: selectedLayer ? 0 : metricsOpacity,
            x: metricsX,
          }}
          className="pointer-events-none absolute right-4 top-[27%] z-30 flex w-[190px] flex-col gap-2 sm:right-6 sm:top-[29%] sm:w-[260px] md:right-10 lg:right-14"
        >
          {[
            {
              ...t.architecture.metrics.latency,
              opacity: metricsOpacity,
            },
            {
              ...t.architecture.metrics.agents,
              opacity: metricTwoOpacity,
            },
            {
              ...t.architecture.metrics.throughput,
              opacity: metricThreeOpacity,
            },
          ].map((metric, index) => (
            <motion.div
              key={metric.label}
              style={{
                opacity: metric.opacity,
                y: index * 4,
              }}
              className="rounded-md border border-white/10 bg-carbon/75 px-4 py-3 backdrop-blur-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[11px] text-[var(--text-secondary)]">
                    {metric.label}
                  </p>
                  <p className="mt-1 text-xl text-frost">{metric.value}</p>
                </div>
                <span className="mt-1 size-1.5 bg-signal shadow-[0_0_8px_rgba(114,230,255,0.7)]" />
              </div>
              <p className="mt-2 font-mono text-[11px] text-[var(--text-secondary)]">
                {metric.note}
              </p>
            </motion.div>
          ))}
        </motion.div>

        <LayerFocusHud
          selectedLayer={selectedLayer}
          onClose={onCloseLayer}
        />
      </div>
    </>
  )
}

export function ScrollArchitecture3D() {
  const { t } = useI18n()
  const sectionRef = useRef<HTMLElement>(null)
  const [selectedLayer, setSelectedLayer] = useState<LayerId | null>(null)
  const [sceneReady, setSceneReady] = useState(false)
  const performanceTier = useAppStore((state) => state.performanceTier)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  })
  const inView = useInViewAnimation(sectionRef)

  useEffect(() => {
    const section = sectionRef.current
    if (!section || sceneReady) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setSceneReady(true)
        observer.disconnect()
      },
      { rootMargin: '600px 0px', threshold: 0.01 },
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [sceneReady])

  useEffect(() => {
    setShaderPassSourceCount('architecture-bloom', inView ? 1 : 0)
    return () => setShaderPassSourceCount('architecture-bloom', 0)
  }, [inView])

  return (
    <section
      ref={sectionRef}
      id="architecture"
      data-architecture-section
      data-audio-reactive="architecture-model"
      data-audio-energy="0"
      aria-labelledby="architecture-title"
      className="relative z-10 h-[300vh] bg-void"
    >
      <h2 id="architecture-title" className="sr-only">
        {t.architecture.srTitle}
      </h2>
      <div
        data-architecture-sticky
        data-caustics-layers={CAUSTICS_LAYER_COUNT}
        data-prism-ior={PRISM_CHROMATIC_IOR.join(',')}
        data-performance-tier={performanceTier}
        data-frameloop={inView ? 'always' : 'demand'}
        data-scene-ready={sceneReady ? 'true' : 'false'}
        className="sticky top-0 h-[100svh] overflow-hidden"
      >
        <div className="absolute inset-0 z-0" aria-hidden="true">
          {sceneReady ? (
            <Canvas
              frameloop={inView ? 'always' : 'demand'}
              dpr={performanceTier === 'high' ? [1, 1.5] : 1}
              onPointerMissed={() => setSelectedLayer(null)}
              camera={{
                position: [0, 0.25, 9.2],
                fov: 48,
                near: 0.1,
                far: 35,
              }}
              gl={{
                antialias: false,
                alpha: false,
                powerPreference:
                  performanceTier === 'high'
                    ? 'high-performance'
                    : 'default',
              }}
              fallback={
                <div className="grid h-full place-items-center bg-void font-mono text-sm text-mist">
                  {t.architecture.fallback}
                </div>
              }
            >
              <ArchitectureScene
                progress={scrollYProgress}
                selectedLayer={selectedLayer}
                onSelectLayer={(layer) =>
                  setSelectedLayer((current) =>
                    current === layer ? null : layer,
                  )
                }
              />
            </Canvas>
          ) : (
            <div className="grid h-full place-items-center bg-void font-mono text-sm text-mist">
              {t.architecture.fallback}
            </div>
          )}
        </div>
        <ArchitectureNarrativeOverlay
          progress={scrollYProgress}
          selectedLayer={selectedLayer}
          onCloseLayer={() => setSelectedLayer(null)}
        />
      </div>
    </section>
  )
}
