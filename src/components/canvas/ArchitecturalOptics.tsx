import { useFrame } from '@react-three/fiber'
import type { MotionValue } from 'framer-motion'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

export const CAUSTICS_LAYER_COUNT = 2
export const PRISM_CHROMATIC_IOR = [1.12, 1.15, 1.18] as const

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
  uniform float uIntensity;
  uniform float uProgress;

  varying vec2 vUv;

  vec2 hash22(vec2 point) {
    vec3 hashed = fract(
      vec3(point.xyx) *
      vec3(0.1031, 0.103, 0.0973)
    );
    hashed += dot(hashed, hashed.yzx + 33.33);
    return fract((hashed.xx + hashed.yz) * hashed.zy);
  }

  float voronoiEdge(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    float nearest = 8.0;
    float secondNearest = 8.0;

    for (int y = -1; y <= 1; y += 1) {
      for (int x = -1; x <= 1; x += 1) {
        vec2 offset = vec2(float(x), float(y));
        vec2 randomOffset = hash22(cell + offset);
        vec2 delta = offset + randomOffset - local;
        float distanceSquared = dot(delta, delta);

        if (distanceSquared < nearest) {
          secondNearest = nearest;
          nearest = distanceSquared;
        } else if (distanceSquared < secondNearest) {
          secondNearest = distanceSquared;
        }
      }
    }

    return sqrt(secondNearest) - sqrt(nearest);
  }

  float causticLayer(vec2 point, float phase) {
    point +=
      vec2(
        sin(point.y * 1.7 + uTime * 0.18 + phase),
        cos(point.x * 1.4 - uTime * 0.15 + phase)
      ) *
      0.12;
    float edge = voronoiEdge(point);
    float filament =
      1.0 - smoothstep(0.0, 0.13, edge);
    float pool =
      1.0 - smoothstep(0.015, 0.34, edge);

    return
      pow(filament, 2.35) * 0.82 +
      pool * 0.18;
  }

  void main() {
    vec2 centered = vUv - 0.5;
    float radialDistance =
      length(centered * vec2(1.08, 1.28)) * 2.0;
    float centerGlow =
      1.0 - smoothstep(0.04, 0.78, radialDistance);
    float edgeFade =
      1.0 - smoothstep(0.5, 1.02, radialDistance);

    vec2 flowA =
      vUv * vec2(7.2, 5.6) +
      vec2(uTime * 0.075, -uTime * 0.052);
    vec2 flowB =
      vUv * vec2(5.1, 7.8) +
      vec2(-uTime * 0.043, uTime * 0.064);
    float layerA =
      causticLayer(flowA, 0.0);
    float layerB =
      causticLayer(flowB, 2.7);
    float phaseInterference =
      0.5 +
      0.5 *
      cos(
        (layerA - layerB) *
        12.566 +
        uTime * 0.42
      );
    float caustics =
      (layerA * 0.78 + layerB * 0.52) *
      (0.62 + phaseInterference * 0.56);
    float reveal =
      0.82 +
      smoothstep(0.28, 0.7, uProgress) * 0.18;

    vec3 cyan = vec3(0.16, 0.88, 1.0);
    vec3 violet = vec3(0.46, 0.16, 1.0);
    vec3 color = mix(
      cyan,
      violet,
      smoothstep(0.12, 0.92, layerB * 0.7 + layerA * 0.3)
    );
    color +=
      vec3(0.45, 0.9, 1.0) *
      pow(centerGlow, 4.0) *
      0.1;

    float alpha =
      caustics *
      edgeFade *
      (0.12 + centerGlow * 0.88) *
      uIntensity *
      reveal;
    if (alpha < 0.003) discard;

    gl_FragColor =
      vec4(color * (0.82 + caustics * 0.68), alpha);
  }
`

const dispersionVertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vLocalPosition = position;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const dispersionFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uRedIor;
  uniform float uGreenIor;
  uniform float uBlueIor;
  uniform vec3 uLightDirection;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;

  const float PI = 3.141592653589793;
  const float TAU = 6.283185307179586;

  vec3 fresnelForIor(vec3 ior, float facing) {
    vec3 f0 =
      pow((ior - 1.0) / (ior + 1.0), vec3(2.0));
    return
      f0 +
      (1.0 - f0) *
      pow(vec3(1.0 - facing), vec3(5.0));
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDirection =
      normalize(cameraPosition - vWorldPosition);
    float facing =
      clamp(abs(dot(normal, viewDirection)), 0.0, 1.0);
    vec3 ior =
      vec3(uRedIor, uGreenIor, uBlueIor);
    vec3 channelExponent =
      2.1 + (ior - 1.0) * 8.0;
    vec3 channelRim =
      pow(vec3(1.0 - facing), channelExponent);
    vec3 channelFresnel =
      fresnelForIor(ior, facing) * 0.22;
    float rim =
      smoothstep(0.14, 0.92, pow(1.0 - facing, 1.28));

    float angle =
      atan(vLocalPosition.z, vLocalPosition.x);
    float spectrumPhase =
      fract(
        angle / TAU +
        uTime * 0.018 +
        (1.0 - facing) * 0.42
      );
    vec3 rainbow =
      0.5 +
      0.5 *
      cos(
        TAU *
        (spectrumPhase + vec3(0.0, 0.33, 0.67))
      );
    float lightFacing =
      smoothstep(
        -0.2,
        0.92,
        dot(normal, normalize(uLightDirection))
      );
    vec3 dispersed =
      mix(
        channelRim + channelFresnel,
        rainbow,
        0.44
      );
    vec3 color =
      dispersed *
      rim *
      (0.72 + lightFacing * 0.55) *
      uIntensity;
    color +=
      vec3(0.62, 0.88, 1.0) *
      pow(rim, 4.0) *
      0.16 *
      uIntensity;
    float alpha =
      rim *
      (0.12 + lightFacing * 0.34) *
      uIntensity;

    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`

function createCausticsSystem() {
  const geometry = new THREE.PlaneGeometry(7.4, 6.1, 1, 1)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.72 },
      uProgress: { value: 0 },
    },
    vertexShader: causticsVertexShader,
    fragmentShader: causticsFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'ProceduralFloorCaustics'
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(0, -1.55, 0)
  mesh.renderOrder = -1
  mesh.frustumCulled = false
  mesh.userData.layerCount = CAUSTICS_LAYER_COUNT

  return { geometry, material, mesh }
}

function createDispersionSystem() {
  const geometry = new THREE.OctahedronGeometry(1.04, 3)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.72 },
      uRedIor: { value: PRISM_CHROMATIC_IOR[0] },
      uGreenIor: { value: PRISM_CHROMATIC_IOR[1] },
      uBlueIor: { value: PRISM_CHROMATIC_IOR[2] },
      uLightDirection: {
        value: new THREE.Vector3(-0.35, 0.82, 0.45).normalize(),
      },
    },
    vertexShader: dispersionVertexShader,
    fragmentShader: dispersionFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'ChromaticDispersionRim'
  mesh.scale.set(1.17, 0.635, 1.17)
  mesh.renderOrder = 3
  mesh.frustumCulled = false
  mesh.userData.ior = [...PRISM_CHROMATIC_IOR]

  return { geometry, material, mesh }
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = Math.min(
    1,
    Math.max(0, (value - edge0) / (edge1 - edge0)),
  )
  return normalized * normalized * (3 - 2 * normalized)
}

export function ProceduralFloorCaustics({
  progress,
}: {
  progress: MotionValue<number>
}) {
  const system = useMemo(() => createCausticsSystem(), [])
  const disposalTimer = useRef<number | null>(null)
  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const { geometry, material, mesh } = system

  useEffect(() => {
    if (disposalTimer.current !== null) {
      window.clearTimeout(disposalTimer.current)
      disposalTimer.current = null
    }

    return () => {
      disposalTimer.current = window.setTimeout(() => {
        mesh.removeFromParent()
        geometry.dispose()
        material.dispose()
        disposalTimer.current = null
      }, 0)
    }
  }, [geometry, material, mesh])

  useFrame((state, delta) => {
    const progressValue = progress.get()
    const explode =
      smoothstep(0.3, 0.7, progressValue) *
      (1 - smoothstep(0.7, 0.84, progressValue))
    const targetY = -1.55 - explode * 0.78

    mesh.position.y = THREE.MathUtils.damp(
      mesh.position.y,
      targetY,
      5.2,
      delta,
    )
    material.uniforms.uTime.value =
      state.clock.elapsedTime * (reducedMotion ? 0.2 : 1)
    material.uniforms.uProgress.value = progressValue
    material.uniforms.uIntensity.value =
      (reducedMotion ? 0.46 : 0.72) +
      explode * 0.08
  })

  return <primitive object={mesh} />
}

export function ChromaticDispersionRim({
  intensity = 0.72,
}: {
  intensity?: number
}) {
  const system = useMemo(() => createDispersionSystem(), [])
  const disposalTimer = useRef<number | null>(null)
  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const { geometry, material, mesh } = system

  useEffect(() => {
    if (disposalTimer.current !== null) {
      window.clearTimeout(disposalTimer.current)
      disposalTimer.current = null
    }

    return () => {
      disposalTimer.current = window.setTimeout(() => {
        mesh.removeFromParent()
        geometry.dispose()
        material.dispose()
        disposalTimer.current = null
      }, 0)
    }
  }, [geometry, material, mesh])

  useFrame((state) => {
    material.uniforms.uTime.value =
      state.clock.elapsedTime * (reducedMotion ? 0.2 : 1)
    material.uniforms.uIntensity.value = reducedMotion
      ? intensity * 0.68
      : intensity
  })

  return <primitive object={mesh} />
}
