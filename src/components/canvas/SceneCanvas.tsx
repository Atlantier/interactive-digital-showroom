import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  Vignette,
} from '@react-three/postprocessing'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import * as THREE from 'three'
import type { ChromaticAberrationEffect } from 'postprocessing'
import { useInViewAnimation } from '../../hooks/useInViewAnimation'
import { useI18n } from '../../i18n/useI18n'
import {
  setActiveParticleCount,
  setShaderPassSourceCount,
} from '../../store/performanceTelemetry'
import {
  readTransientState,
  useAppStore,
} from '../../store/useAppStore'
import { soundEngine } from '../../utils/soundEngine'
import {
  AURORA_VERTEX_COUNT,
  AuroraCurtain,
} from './AuroraCurtain'
import {
  FlowFieldParticles,
  HIGH_PARTICLE_COUNT,
  MEDIUM_PARTICLE_COUNT,
} from './FlowFieldParticles'
import {
  CursorStardustTrail,
  CURSOR_STARDUST_COUNT,
  LIGHT_RIBBON_HISTORY_SIZE,
  SHOCKWAVE_PARTICLE_COUNT,
} from './CursorStardustTrail'
import {
  VolumetricStageLights,
  VOLUMETRIC_BEAM_COUNT,
  VOLUMETRIC_DUST_COUNT,
} from './VolumetricStageLights'

function useCompactViewport() {
  const [compact, setCompact] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 767px)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const update = () => setCompact(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return compact
}

function AdaptivePerformanceMonitor() {
  const performanceTier = useAppStore((state) => state.performanceTier)
  const applyPerformanceDowngrade = useAppStore(
    (state) => state.applyPerformanceDowngrade,
  )

  if (performanceTier !== 'high') return null

  return (
    <PerformanceMonitor
      ms={500}
      iterations={4}
      threshold={0.99}
      bounds={() => [45, 60]}
      onDecline={applyPerformanceDowngrade}
    />
  )
}

function CinematicPostProcessing({
  performanceTier,
  reducedEffects,
}: {
  performanceTier: 'high' | 'medium'
  reducedEffects: boolean
}) {
  const chromaticRef = useRef<ChromaticAberrationEffect>(null)
  const chromaticOffset = useMemo(() => new THREE.Vector2(0, 0), [])
  const offsetState = useRef({ current: 0, target: 0 })
  const gl = useThree((state) => state.gl)

  useFrame((_, delta) => {
    const audioEnergy = soundEngine.readEnergyEnvelope()
    const stage = gl.domElement.closest<HTMLElement>(
      '[data-scene-canvas]',
    )

    if (reducedEffects) {
      offsetState.current.current = 0
      offsetState.current.target = 0
      chromaticOffset.set(0, 0)
      if (stage) {
        stage.dataset.chromaticOffset = '0.00000'
        stage.dataset.chromaticTarget = '0.00000'
        stage.dataset.audioEnergy = audioEnergy.toFixed(4)
      }
      return
    }

    const transient = readTransientState()
    const now = performance.now()
    const pointerFresh =
      transient.pointerActive &&
      now - transient.pointerUpdatedAt < 140
    const scrollOffset = Math.min(
      0.006,
      Math.abs(transient.vscroll) > 0.08
        ? Math.abs(transient.vscroll) * 0.00016
        : 0,
    )
    const pointerAcceleration = pointerFresh
      ? Math.hypot(
          transient.pointerAcceleration.x,
          transient.pointerAcceleration.y,
        )
      : 0
    const pointerOffset = Math.min(
      0.006,
      pointerAcceleration * 0.000018,
    )
    const targetOffset = Math.min(
      0.006,
      Math.max(scrollOffset, pointerOffset),
    )
    offsetState.current.target = targetOffset

    const safeDelta = Math.min(0.1, Math.max(delta, 1 / 240))
    const damping =
      targetOffset > offsetState.current.current ? 14 : 4.8
    offsetState.current.current +=
      (targetOffset - offsetState.current.current) *
      (1 - Math.exp(-safeDelta * damping))

    if (
      targetOffset === 0 &&
      offsetState.current.current < 0.00005
    ) {
      offsetState.current.current = 0
    }

    const current = offsetState.current.current
    chromaticOffset.set(current, current * 0.58)
    if (chromaticRef.current) {
      chromaticRef.current.offset.set(
        current,
        current * 0.58,
      )
    }
    if (stage) {
      stage.dataset.chromaticOffset = current.toFixed(5)
      stage.dataset.chromaticTarget = targetOffset.toFixed(5)
      stage.dataset.audioEnergy = audioEnergy.toFixed(4)
    }
  })

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom
        luminanceThreshold={0.15}
        luminanceSmoothing={0.12}
        intensity={performanceTier === 'high' ? 1.12 : 0.92}
        mipmapBlur
        radius={0.7}
        levels={performanceTier === 'high' ? 6 : 4}
        resolutionScale={performanceTier === 'high' ? 1 : 0.62}
      />
      {reducedEffects ? null : (
        <ChromaticAberration
          ref={chromaticRef}
          offset={chromaticOffset}
          radialModulation
          modulationOffset={0.18}
        />
      )}
      <Vignette offset={0.3} darkness={0.38} />
      {reducedEffects ? null : <Noise opacity={0.025} />}
    </EffectComposer>
  )
}

function SceneContent({
  particleCount,
  reducedEffects,
}: {
  particleCount: number
  reducedEffects: boolean
}) {
  const performanceTier = useAppStore((state) => state.performanceTier)

  return (
    <>
      <color attach="background" args={['#030507']} />
      <AuroraCurtain />
      <VolumetricStageLights variant="hero" />
      <FlowFieldParticles particleCount={particleCount} />
      <CursorStardustTrail />
      <AdaptivePerformanceMonitor />
      <CinematicPostProcessing
        performanceTier={performanceTier}
        reducedEffects={reducedEffects}
      />
    </>
  )
}

export function SceneCanvas({
  visibilityRef,
}: {
  visibilityRef: RefObject<HTMLElement | null>
}) {
  const { t } = useI18n()
  const performanceTier = useAppStore((state) => state.performanceTier)
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const compactViewport = useCompactViewport()
  const inView = useInViewAnimation(visibilityRef, {
    rootMargin: '-10% 0px -10% 0px',
    threshold: 0.08,
  })
  const reducedEffects =
    performanceTier !== 'high' || compactViewport
  const particleCount =
    reducedEffects ? MEDIUM_PARTICLE_COUNT : HIGH_PARTICLE_COUNT
  const cursorParticleCount = reducedEffects
    ? CURSOR_STARDUST_COUNT / 2
    : CURSOR_STARDUST_COUNT
  const volumetricDustCount = reducedEffects
    ? VOLUMETRIC_DUST_COUNT / 2
    : VOLUMETRIC_DUST_COUNT
  const shaderPassCount = reducedEffects ? 2 : 4
  const postProcessingMode = reducedEffects
    ? 'bloom-vignette'
    : 'bloom-chromatic-vignette-noise'

  useEffect(() => {
    setActiveParticleCount(inView ? particleCount : 0)
    return () => setActiveParticleCount(0)
  }, [inView, particleCount])

  useEffect(() => {
    setShaderPassSourceCount(
      'scene-postprocessing',
      shaderPassCount,
    )
    return () => setShaderPassSourceCount('scene-postprocessing', 0)
  }, [shaderPassCount])

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
      data-scene-canvas
      data-particle-count={particleCount}
      data-cursor-stardust-count={cursorParticleCount}
      data-shockwave-particle-count={SHOCKWAVE_PARTICLE_COUNT}
      data-light-ribbon-history={LIGHT_RIBBON_HISTORY_SIZE}
      data-volumetric-beam-count={VOLUMETRIC_BEAM_COUNT}
      data-volumetric-dust-count={volumetricDustCount}
      data-aurora-vertex-count={AURORA_VERTEX_COUNT}
      data-vfx-preset={vfxPreset}
      data-bloom-threshold="0.15"
      data-chromatic-offset="0"
      data-chromatic-target="0"
      data-audio-energy="0"
      data-postprocessing={postProcessingMode}
      data-shader-pass-count={shaderPassCount}
      data-audio-reactive="stardust-aurora-volume"
      data-performance-tier={performanceTier}
      data-frameloop={inView ? 'always' : 'demand'}
    >
      <Canvas
        frameloop={inView ? 'always' : 'demand'}
        dpr={performanceTier === 'high' ? [1, 1.5] : 1}
        camera={{
          position: [0, 0, 7.2],
          fov: 47,
          near: 0.1,
          far: 30,
        }}
        gl={{
          antialias: false,
          powerPreference:
            performanceTier === 'high' ? 'high-performance' : 'default',
          alpha: false,
        }}
        fallback={
          <div className="grid h-full place-items-center bg-void px-6 font-mono text-sm text-mist">
            {t.fallback.webgl}
          </div>
        }
      >
        <SceneContent
          particleCount={particleCount}
          reducedEffects={reducedEffects}
        />
      </Canvas>
    </div>
  )
}
