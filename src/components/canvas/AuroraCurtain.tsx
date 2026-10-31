import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  getVfxPreset,
  type VfxPreset,
} from '../../data/vfxPresets'
import { useAppStore } from '../../store/useAppStore'
import { soundEngine } from '../../utils/soundEngine'

const AURORA_COLUMNS = 72
const AURORA_ROWS = 28
export const AURORA_VERTEX_COUNT =
  (AURORA_COLUMNS + 1) * (AURORA_ROWS + 1)

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uMotionScale;
  uniform float uAudioEnergy;

  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vUv = uv;
    vDepth = smoothstep(0.0, 1.0, uv.y);

    vec3 transformed = position;
    float audioDrive = clamp(uAudioEnergy, 0.0, 1.0);
    float danceTime =
      uTime * (1.0 + audioDrive * 0.62) +
      audioDrive * 1.4;
    float broadDrift =
      sin(uv.x * 7.0 + danceTime * 0.085) *
      sin(uv.y * 3.2 - danceTime * 0.052);
    float fineDrift =
      sin(uv.x * 17.0 - danceTime * 0.11 + uv.y * 4.0) * 0.35;
    transformed.z +=
      (broadDrift + fineDrift) *
      0.16 *
      uMotionScale *
      (1.0 + audioDrive * 0.42);
    transformed.y +=
      sin(uv.x * 4.3 + danceTime * 0.045) *
      0.05 *
      uMotionScale *
      uv.y *
      (1.0 + audioDrive * 0.2);

    gl_Position =
      projectionMatrix *
      modelViewMatrix *
      vec4(transformed, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uAudioEnergy;
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uTertiary;

  varying vec2 vUv;
  varying float vDepth;

  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float noise2(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);

    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));

    return mix(
      mix(a, b, local.x),
      mix(c, d, local.x),
      local.y
    );
  }

  float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotation = mat2(
      0.82, 0.57,
      -0.57, 0.82
    );

    for (int octave = 0; octave < 5; octave++) {
      value += amplitude * noise2(point);
      point = rotation * point * 2.03 + 7.17;
      amplitude *= 0.5;
    }

    return value;
  }

  void main() {
    vec2 uv = vUv;
    float audioDrive = clamp(uAudioEnergy, 0.0, 1.0);
    float danceTime =
      uTime * (1.0 + audioDrive * 0.76) +
      audioDrive * 1.8;
    float sideFade =
      smoothstep(0.015, 0.2, uv.x) *
      (1.0 - smoothstep(0.8, 0.985, uv.x));
    float verticalFade =
      smoothstep(0.015, 0.14, uv.y) *
      (1.0 - smoothstep(0.76, 1.0, uv.y));

    float flowNoise = fbm(
      vec2(
        uv.x * 2.15 + danceTime * 0.018,
        uv.y * 2.7 - danceTime * 0.012
      )
    );
    float detailNoise = fbm(
      vec2(
        uv.x * 5.4 - danceTime * 0.026,
        uv.y * 3.8 + flowNoise * 1.7
      )
    );
    float warpedX =
      uv.x +
      (flowNoise - 0.5) * 0.16 +
      sin(uv.y * 7.2 + danceTime * 0.08) * 0.024;

    float primaryWave =
      sin(
        warpedX * 27.0 -
        uv.y * 4.8 +
        danceTime * 0.19 +
        detailNoise * 3.2
      );
    float secondaryWave =
      sin(
        warpedX * 43.0 +
        uv.y * 8.1 +
        danceTime * 0.13 -
        flowNoise * 4.4
      );
    float interference =
      primaryWave * 0.62 + secondaryWave * 0.38;
    float silkBand =
      smoothstep(0.38, 0.94, interference * 0.5 + 0.5);
    silkBand = pow(silkBand, 2.65);

    float verticalShear =
      smoothstep(
        0.08,
        0.72,
        fbm(vec2(warpedX * 1.6 + danceTime * 0.01, uv.y * 0.82))
      );
    float curtainEnergy =
      silkBand *
      mix(0.34, 1.0, verticalShear) *
      mix(0.4, 1.0, detailNoise);
    float horizonGlow =
      exp(-pow((uv.y - 0.34) * 5.2, 2.0)) *
      0.16;
    float alpha =
      (curtainEnergy * 0.105 + horizonGlow * 0.028) *
      sideFade *
      verticalFade *
      uIntensity *
      (1.0 + audioDrive * 0.4);

    if (alpha < 0.002) discard;

    vec3 color = mix(
      uPrimary * 0.56,
      uSecondary,
      clamp(detailNoise * 0.68 + vDepth * 0.16, 0.0, 1.0)
    );
    color = mix(
      color,
      uTertiary,
      pow(silkBand, 4.0) * 0.24
    );
    color *=
      (0.68 + horizonGlow * 1.05 + curtainEnergy * 0.3) *
      (1.0 + audioDrive * 0.42);

    gl_FragColor = vec4(color, alpha);
  }
`

function createCurtainGeometry() {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let row = 0; row <= AURORA_ROWS; row += 1) {
    const v = row / AURORA_ROWS
    for (let column = 0; column <= AURORA_COLUMNS; column += 1) {
      const u = column / AURORA_COLUMNS
      const centered = u * 2 - 1
      positions.push(
        (u - 0.5) * 19.2,
        -3.1 + v * 8.25,
        -5.5 -
          centered * centered * 2.1 +
          Math.sin(v * Math.PI) * 0.22,
      )
      uvs.push(u, v)
    }
  }

  const rowLength = AURORA_COLUMNS + 1
  for (let row = 0; row < AURORA_ROWS; row += 1) {
    for (let column = 0; column < AURORA_COLUMNS; column += 1) {
      const topLeft = row * rowLength + column
      const topRight = topLeft + 1
      const bottomLeft = topLeft + rowLength
      const bottomRight = bottomLeft + 1
      indices.push(
        topLeft,
        bottomLeft,
        topRight,
        topRight,
        bottomLeft,
        bottomRight,
      )
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(uvs, 2),
  )
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

function presetColors(preset: VfxPreset) {
  const config = getVfxPreset(preset)
  return {
    primary: new THREE.Color(config.primary),
    secondary: new THREE.Color(config.secondary),
    tertiary: new THREE.Color(config.tertiary),
  }
}

export function AuroraCurtain() {
  const meshRef = useRef<THREE.Mesh>(null)
  const preset = useAppStore((state) => state.vfxPreset)
  const performanceTier = useAppStore((state) => state.performanceTier)
  const targetColors = useMemo(() => presetColors(preset), [preset])
  const geometry = useMemo(createCurtainGeometry, [])
  const material = useMemo(() => {
    const initial = presetColors(preset)
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMotionScale: { value: 1 },
        uAudioEnergy: { value: 0 },
        uIntensity: {
          value: performanceTier === 'high' ? 0.94 : 0.64,
        },
        uPrimary: { value: initial.primary },
        uSecondary: { value: initial.secondary },
        uTertiary: { value: initial.tertiary },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
  }, [performanceTier])
  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useFrame((state, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const elapsed = state.clock.elapsedTime
    const blend = 1 - Math.exp(-Math.min(delta, 0.1) * 3.5)
    const uniforms = material.uniforms
    uniforms.uTime.value = elapsed
    uniforms.uMotionScale.value = reducedMotion ? 0.18 : 1
    uniforms.uAudioEnergy.value = soundEngine.readEnergyEnvelope()
    uniforms.uIntensity.value =
      performanceTier === 'high' ? 0.94 : 0.64
    ;(uniforms.uPrimary.value as THREE.Color).lerp(
      targetColors.primary,
      blend,
    )
    ;(uniforms.uSecondary.value as THREE.Color).lerp(
      targetColors.secondary,
      blend,
    )
    ;(uniforms.uTertiary.value as THREE.Color).lerp(
      targetColors.tertiary,
      blend,
    )
    mesh.position.x =
      Math.sin(elapsed * 0.028) * 0.18 * (reducedMotion ? 0.2 : 1)
  })

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-20}
    />
  )
}
