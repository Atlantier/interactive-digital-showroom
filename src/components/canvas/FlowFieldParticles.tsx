import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getVfxPreset } from '../../data/vfxPresets'
import {
  readTransientState,
  useAppStore,
} from '../../store/useAppStore'
import { soundEngine } from '../../utils/soundEngine'

export const HIGH_PARTICLE_COUNT = 8000
export const MEDIUM_PARTICLE_COUNT = HIGH_PARTICLE_COUNT / 2
export const PARTICLE_COUNT = HIGH_PARTICLE_COUNT

const TORUS_PARTICLE_RATIO = 0.7
const MOUSE_RADIUS = 2.5
const MOUSE_RADIUS_SQUARED = MOUSE_RADIUS * MOUSE_RADIUS
const SPRING_STRENGTH = 10.5
const SPRING_DAMPING = 2.8

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec3 uMouseLocal;
  uniform float uMouseActivity;
  uniform float uScrollVelocity;
  uniform float uWarpAmount;
  uniform float uAudioEnergy;

  attribute vec3 aParticleColor;
  attribute float aParticleSize;
  attribute float aParticleSeed;

  varying vec3 vColor;
  varying float vGlow;
  varying float vWarp;

  vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec4 permute(vec4 x) {
    return mod289(((x * 34.0) + 10.0) * x);
  }

  vec4 taylorInvSqrt(vec4 value) {
    return 1.79284291400159 - 0.85373472095314 * value;
  }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(
      permute(
        permute(
          i.z + vec4(0.0, i1.z, i2.z, 1.0)
        ) + i.y + vec4(0.0, i1.y, i2.y, 1.0)
      ) + i.x + vec4(0.0, i1.x, i2.x, 1.0)
    );

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(
      vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3))
    );
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(
      0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)),
      0.0
    );
    m = m * m;

    return 42.0 * dot(
      m * m,
      vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3))
    );
  }

  vec3 curlNoise(vec3 point) {
    const float epsilon = 0.11;
    float x0 = snoise(point - vec3(epsilon, 0.0, 0.0));
    float x1 = snoise(point + vec3(epsilon, 0.0, 0.0));
    float y0 = snoise(point - vec3(0.0, epsilon, 0.0));
    float y1 = snoise(point + vec3(0.0, epsilon, 0.0));
    float z0 = snoise(point - vec3(0.0, 0.0, epsilon));
    float z1 = snoise(point + vec3(0.0, 0.0, epsilon));

    vec3 gradient = vec3(x1 - x0, y1 - y0, z1 - z0) / (2.0 * epsilon);
    return normalize(
      cross(gradient, vec3(0.37, 0.74, 0.56)) + vec3(0.00001)
    );
  }

  void main() {
    float seed = aParticleSeed;
    float warp = clamp(uWarpAmount, 0.0, 1.2);
    float audioEnergy = clamp(uAudioEnergy, 0.0, 1.0);
    float warpDirection = sign(uScrollVelocity);
    float pulse = sin(
      uTime * (0.62 + audioEnergy * 0.38) +
      seed * 6.28318 +
      length(position) * 0.72
    );
    vec3 flow = curlNoise(
      position * 0.16 +
      vec3(uTime * 0.035, uTime * -0.026, uTime * 0.019)
    );
    vec3 transformed = position + flow * (0.085 + pulse * 0.025);
    transformed.y +=
      warpDirection * warp * (0.08 + seed * 0.34);

    float mouseDistance = distance(transformed, uMouseLocal);
    float mouseHalo =
      (1.0 - smoothstep(0.0, 2.5, mouseDistance)) * uMouseActivity;

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float warpScale = 1.0 + warp * (2.2 + seed * 3.4);
    float maxPointSize = mix(13.0, 30.0, warp) * uPixelRatio;
    gl_PointSize = clamp(
      aParticleSize *
      uPixelRatio *
      (190.0 / max(1.0, -mvPosition.z)) *
      (1.0 + mouseHalo * 0.8) *
      warpScale *
      (1.0 + audioEnergy * 0.38),
      1.0,
      maxPointSize
    );

    vec3 warpColor = vec3(0.78, 0.92, 1.0);
    vColor =
      mix(aParticleColor, warpColor, warp * 0.62) *
      (
        1.0 +
        mouseHalo * 0.9 +
        pulse * 0.08 +
        warp * 0.22 +
        audioEnergy * 0.72
      );
    vGlow =
      0.45 +
      seed * 0.55 +
      mouseHalo * 0.85 +
      warp * 0.7 +
      audioEnergy * 1.35;
    vWarp = warp;
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vGlow;
  varying float vWarp;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    point.x *= mix(1.0, 5.2, clamp(vWarp, 0.0, 1.0));
    float distanceToCenter = length(point);
    float core = 1.0 - smoothstep(0.06, 0.5, distanceToCenter);
    if (core < 0.01) discard;

    float alpha =
      core * core * (0.44 + vGlow * 0.36) *
      mix(1.0, 0.78, clamp(vWarp, 0.0, 1.0));
    vec3 luminousColor = vColor * (1.18 + vGlow * 0.52);
    gl_FragColor = vec4(luminousColor, alpha);
  }
`

function createRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = Math.min(
    1,
    Math.max(0, (value - edge0) / (edge1 - edge0)),
  )
  return normalized * normalized * (3 - 2 * normalized)
}

function createParticleSystem(particleCount: number) {
  const random = createRandom(73)
  const torusParticleCount = Math.min(
    particleCount,
    Math.round(particleCount * TORUS_PARTICLE_RATIO),
  )
  const basePositions = new Float32Array(particleCount * 3)
  const positions = new Float32Array(particleCount * 3)
  const velocities = new Float32Array(particleCount * 3)
  const colors = new Float32Array(particleCount * 3)
  const sizes = new Float32Array(particleCount)
  const seeds = new Float32Array(particleCount)
  const primary = new THREE.Color('#10b981')
  const torusSource = new THREE.TorusKnotGeometry(
    1.92,
    0.34,
    560,
    24,
    2,
    3,
  )
  const torusPositions = torusSource.getAttribute('position')

  for (let index = 0; index < torusParticleCount; index += 1) {
    const sourceIndex = Math.floor(random() * torusPositions.count)
    const offset = index * 3
    basePositions[offset] =
      torusPositions.getX(sourceIndex) + (random() - 0.5) * 0.16
    basePositions[offset + 1] =
      torusPositions.getY(sourceIndex) + (random() - 0.5) * 0.16
    basePositions[offset + 2] =
      torusPositions.getZ(sourceIndex) + (random() - 0.5) * 0.16
  }

  for (
    let index = torusParticleCount;
    index < particleCount;
    index += 1
  ) {
    const offset = index * 3
    const angle = random() * Math.PI * 2
    const radius = Math.sqrt(random()) * 3.7
    const spiral = Math.sin(angle * 2.2 + radius * 1.35) * 0.34

    basePositions[offset] =
      Math.cos(angle + spiral) * radius + (random() - 0.5) * 0.42
    basePositions[offset + 1] =
      Math.sin(angle + spiral) * radius * 0.58 +
      (random() - 0.5) * 0.34
    basePositions[offset + 2] =
      (random() - 0.5) * 1.7 + Math.sin(angle * 3.0) * 0.22
  }

  torusSource.dispose()

  for (let index = 0; index < particleCount; index += 1) {
    const offset = index * 3
    positions[offset] = basePositions[offset]
    positions[offset + 1] = basePositions[offset + 1]
    positions[offset + 2] = basePositions[offset + 2]
    colors[offset] = primary.r
    colors[offset + 1] = primary.g
    colors[offset + 2] = primary.b
    sizes[index] = 0.06 + random() * 0.08
    seeds[index] = random()
  }

  const geometry = new THREE.BufferGeometry()
  const positionAttribute = new THREE.BufferAttribute(positions, 3)
  const colorAttribute = new THREE.BufferAttribute(colors, 3)
  positionAttribute.setUsage(THREE.DynamicDrawUsage)
  colorAttribute.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', positionAttribute)
  geometry.setAttribute('aParticleColor', colorAttribute)
  geometry.setAttribute(
    'aParticleSize',
    new THREE.BufferAttribute(sizes, 1),
  )
  geometry.setAttribute('aParticleSeed', new THREE.BufferAttribute(seeds, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uMouseLocal: {
        value: new THREE.Vector3(999, 999, 999),
      },
      uMouseActivity: { value: 0 },
      uScrollVelocity: { value: 0 },
      uWarpAmount: { value: 0 },
      uAudioEnergy: { value: 0 },
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
  points.frustumCulled = false
  points.renderOrder = 1
  points.name = 'FlowFieldParticles'

  return {
    points,
    particleCount,
    geometry,
    material,
    positionAttribute,
    colorAttribute,
    basePositions,
    positions,
    velocities,
    colors,
    scratch: {
      matrix: new THREE.Matrix4(),
      inverseMatrix: new THREE.Matrix4(),
      mouseWorld: new THREE.Vector3(999, 999, 999),
      mouseLocal: new THREE.Vector3(999, 999, 999),
      pointerNdc: new THREE.Vector2(),
      planeNormal: new THREE.Vector3(0, 0, 1),
      planePoint: new THREE.Vector3(),
      cameraDirection: new THREE.Vector3(0, 0, -1),
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      raycaster: new THREE.Raycaster(),
      primary,
      secondary: new THREE.Color('#72e6ff'),
      white: new THREE.Color('#ffffff'),
      color: new THREE.Color(),
    },
  }
}

export function FlowFieldParticles({
  particleCount = HIGH_PARTICLE_COUNT,
}: {
  particleCount?: number
}) {
  const groupRef = useRef<THREE.Group>(null)
  const simulationState = useRef({ needsSimulation: false })
  const warpState = useRef({ amount: 0, velocity: 0 })
  const canvasMetrics = useRef({
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  })
  const particleSystem = useMemo(
    () => createParticleSystem(Math.max(1, Math.floor(particleCount))),
    [particleCount],
  )
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const palette = useMemo(
    () => getVfxPreset(vfxPreset),
    [vfxPreset],
  )
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const viewportWidth = useThree((state) => state.size.width)
  const devicePixelRatio = useThree((state) => state.viewport.dpr)
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const {
    points,
    particleCount: activeParticleCount,
    geometry,
    material,
    positionAttribute,
    colorAttribute,
    basePositions,
    positions,
    velocities,
    colors,
    scratch,
  } = particleSystem

  useEffect(() => {
    return () => {
      points.removeFromParent()
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material, points])

  useEffect(() => {
    scratch.primary.set(palette.primary)
    scratch.secondary.set(palette.secondary)
    for (let index = 0; index < activeParticleCount; index += 1) {
      const offset = index * 3
      colors[offset] = scratch.primary.r
      colors[offset + 1] = scratch.primary.g
      colors[offset + 2] = scratch.primary.b
    }
    colorAttribute.needsUpdate = true
  }, [
    activeParticleCount,
    colorAttribute,
    colors,
    palette,
    scratch,
  ])

  useEffect(() => {
    const canvas = gl.domElement

    const measureCanvas = () => {
      const bounds = canvas.getBoundingClientRect()
      canvasMetrics.current.left = bounds.left
      canvasMetrics.current.top = bounds.top
      canvasMetrics.current.width = Math.max(1, bounds.width)
      canvasMetrics.current.height = Math.max(1, bounds.height)

      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = bounds.width / Math.max(1, bounds.height)
        camera.updateProjectionMatrix()
        camera.updateMatrixWorld()
      }
    }

    measureCanvas()
    const resizeObserver = new ResizeObserver(measureCanvas)
    resizeObserver.observe(canvas)
    window.addEventListener('resize', measureCanvas)
    window.addEventListener('orientationchange', measureCanvas)
    window.visualViewport?.addEventListener('resize', measureCanvas)
    window.visualViewport?.addEventListener('scroll', measureCanvas)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', measureCanvas)
      window.removeEventListener('orientationchange', measureCanvas)
      window.visualViewport?.removeEventListener('resize', measureCanvas)
      window.visualViewport?.removeEventListener('scroll', measureCanvas)
    }
  }, [camera, gl])

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return

    const transient = readTransientState()
    const time = state.clock.elapsedTime
    const motionScale = reducedMotion ? 0.12 : 1
    const dt = Math.min(delta, 1 / 30)
    const compact = viewportWidth < 768

    group.position.set(compact ? 0 : 0.55, compact ? 0.45 : 0, 0)
    group.scale.setScalar(compact ? 0.62 : 1)
    group.rotation.x = Math.sin(time * 0.08 * motionScale) * 0.12
    group.rotation.y =
      time * 0.035 * motionScale + transient.scrollProgress * 0.2
    group.rotation.z =
      Math.cos(time * 0.055 * motionScale) * 0.07 +
      transient.scrollProgress * 0.12
    group.updateMatrixWorld()

    scratch.matrix.copy(group.matrixWorld)
    scratch.inverseMatrix.copy(scratch.matrix).invert()
    let mouseActive = 0

    if (transient.pointerActive) {
      scratch.pointerNdc.set(
        ((transient.pointerPixels.x - canvasMetrics.current.left) /
          canvasMetrics.current.width) *
          2 -
          1,
        1 -
          ((transient.pointerPixels.y - canvasMetrics.current.top) /
            canvasMetrics.current.height) *
            2,
      )
      state.camera.updateMatrixWorld()
      scratch.raycaster.setFromCamera(scratch.pointerNdc, state.camera)
      state.camera.getWorldDirection(scratch.cameraDirection)
      group.getWorldPosition(scratch.planePoint)
      scratch.planeNormal.copy(scratch.cameraDirection)
      scratch.plane.setFromNormalAndCoplanarPoint(
        scratch.planeNormal,
        scratch.planePoint,
      )

      if (
        scratch.raycaster.ray.intersectPlane(
          scratch.plane,
          scratch.mouseWorld,
        )
      ) {
        scratch.mouseLocal
          .copy(scratch.mouseWorld)
          .applyMatrix4(scratch.inverseMatrix)
        mouseActive = 1
      }
    }

    const scrollSpeed = Math.abs(transient.scrollVelocity)
    const warpTarget =
      smoothstep(1.5, 16, scrollSpeed) *
      0.95 *
      (reducedMotion ? 0.16 : 1)
    const warpAcceleration =
      (warpTarget - warpState.current.amount) * 24 -
      warpState.current.velocity * 5.2
    warpState.current.velocity += warpAcceleration * dt
    warpState.current.amount = Math.min(
      1.15,
      Math.max(
        0,
        warpState.current.amount + warpState.current.velocity * dt,
      ),
    )

    material.uniforms.uTime.value = time * motionScale
    material.uniforms.uPixelRatio.value = devicePixelRatio
    material.uniforms.uMouseActivity.value = mouseActive
    material.uniforms.uMouseLocal.value.copy(scratch.mouseLocal)
    material.uniforms.uScrollVelocity.value = transient.scrollVelocity
    material.uniforms.uWarpAmount.value = warpState.current.amount
    material.uniforms.uAudioEnergy.value =
      soundEngine.readEnergyEnvelope()

    const shouldSimulate =
      mouseActive === 1 || simulationState.current.needsSimulation
    let maxSpeedSquared = 0
    let maxDisplacementSquared = 0

    if (shouldSimulate) {
      for (let index = 0; index < activeParticleCount; index += 1) {
        const offset = index * 3
        const baseX = basePositions[offset]
        const baseY = basePositions[offset + 1]
        const baseZ = basePositions[offset + 2]
        const positionX = positions[offset]
        const positionY = positions[offset + 1]
        const positionZ = positions[offset + 2]
        let velocityX = velocities[offset]
        let velocityY = velocities[offset + 1]
        let velocityZ = velocities[offset + 2]
        let mouseInfluence = 0

        if (mouseActive === 1) {
          const mouseDeltaX = positionX - scratch.mouseLocal.x
          const mouseDeltaY = positionY - scratch.mouseLocal.y
          const mouseDeltaZ = positionZ - scratch.mouseLocal.z
          const distanceSquared =
            mouseDeltaX * mouseDeltaX +
            mouseDeltaY * mouseDeltaY +
            mouseDeltaZ * mouseDeltaZ

          if (
            distanceSquared < MOUSE_RADIUS_SQUARED &&
            distanceSquared > 0.000001
          ) {
            const distance = Math.sqrt(distanceSquared)
            const inverseDistance = 1 / distance
            const inverseSquareForce = Math.min(
              34,
              8.5 / Math.max(distanceSquared, 0.16),
            )
            mouseInfluence = 1 - distance / MOUSE_RADIUS
            velocityX +=
              mouseDeltaX *
              inverseDistance *
              inverseSquareForce *
              dt
            velocityY +=
              mouseDeltaY *
              inverseDistance *
              inverseSquareForce *
              dt
            velocityZ +=
              mouseDeltaZ *
              inverseDistance *
              inverseSquareForce *
              dt
          }
        }

        const displacementX = positionX - baseX
        const displacementY = positionY - baseY
        const displacementZ = positionZ - baseZ

        velocityX +=
          (-SPRING_STRENGTH * displacementX -
            SPRING_DAMPING * velocityX) *
          dt
        velocityY +=
          (-SPRING_STRENGTH * displacementY -
            SPRING_DAMPING * velocityY) *
          dt
        velocityZ +=
          (-SPRING_STRENGTH * displacementZ -
            SPRING_DAMPING * velocityZ) *
          dt

        const nextX = positionX + velocityX * dt
        const nextY = positionY + velocityY * dt
        const nextZ = positionZ + velocityZ * dt
        const speedSquared =
          velocityX * velocityX +
          velocityY * velocityY +
          velocityZ * velocityZ
        const speed = Math.sqrt(speedSquared)
        const speed01 = Math.min(1, speed / 4.8)
        const purpleMix = smoothstep(0.08, 0.56, speed01)
        const whiteMix = smoothstep(0.68, 0.98, speed01)
        const nextDisplacementX = nextX - baseX
        const nextDisplacementY = nextY - baseY
        const nextDisplacementZ = nextZ - baseZ

        maxSpeedSquared = Math.max(maxSpeedSquared, speedSquared)
        maxDisplacementSquared = Math.max(
          maxDisplacementSquared,
          nextDisplacementX * nextDisplacementX +
            nextDisplacementY * nextDisplacementY +
            nextDisplacementZ * nextDisplacementZ,
        )

        positions[offset] = nextX
        positions[offset + 1] = nextY
        positions[offset + 2] = nextZ
        velocities[offset] = velocityX
        velocities[offset + 1] = velocityY
        velocities[offset + 2] = velocityZ

        scratch.color
          .copy(scratch.primary)
          .lerp(scratch.secondary, purpleMix)
          .lerp(
            scratch.white,
            Math.min(1, whiteMix * (0.55 + mouseInfluence * 0.45)),
          )

        colors[offset] = scratch.color.r
        colors[offset + 1] = scratch.color.g
        colors[offset + 2] = scratch.color.b
      }

      if (
        mouseActive === 0 &&
        maxSpeedSquared < 0.0004 &&
        maxDisplacementSquared < 0.0009
      ) {
        for (let index = 0; index < activeParticleCount; index += 1) {
          const offset = index * 3
          positions[offset] = basePositions[offset]
          positions[offset + 1] = basePositions[offset + 1]
          positions[offset + 2] = basePositions[offset + 2]
          velocities[offset] = 0
          velocities[offset + 1] = 0
          velocities[offset + 2] = 0
          colors[offset] = scratch.primary.r
          colors[offset + 1] = scratch.primary.g
          colors[offset + 2] = scratch.primary.b
        }
        simulationState.current.needsSimulation = false
      } else {
        simulationState.current.needsSimulation = true
      }

      positionAttribute.needsUpdate = true
      colorAttribute.needsUpdate = true
    }
  })

  return (
    <group ref={groupRef}>
      <primitive object={points} />
    </group>
  )
}
