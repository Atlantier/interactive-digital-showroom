import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
} from '@react-three/postprocessing'
import { useEffect, useRef, type RefObject } from 'react'
import { useInViewAnimation } from '../../hooks/useInViewAnimation'
import { setActiveParticleCount } from '../../store/performanceTelemetry'
import { useAppStore } from '../../store/useAppStore'
import {
  FlowFieldParticles,
  HIGH_PARTICLE_COUNT,
  MEDIUM_PARTICLE_COUNT,
} from './FlowFieldParticles'

function PerformanceProbe() {
  const enabled = useAppStore((state) => state.fpsMonitorEnabled)
  const setFps = useAppStore((state) => state.setFps)
  const metrics = useRef({ frames: 0, elapsed: 0 })

  useFrame((_, delta) => {
    if (!enabled) {
      metrics.current.frames = 0
      metrics.current.elapsed = 0
      return
    }

    metrics.current.frames += 1
    metrics.current.elapsed += delta

    if (metrics.current.elapsed >= 0.5) {
      setFps(
        Math.round(metrics.current.frames / metrics.current.elapsed),
      )
      metrics.current.frames = 0
      metrics.current.elapsed = 0
    }
  })

  return null
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

function SceneContent({ particleCount }: { particleCount: number }) {
  const performanceTier = useAppStore((state) => state.performanceTier)

  return (
    <>
      <color attach="background" args={['#030507']} />
      <FlowFieldParticles particleCount={particleCount} />
      <AdaptivePerformanceMonitor />
      <PerformanceProbe />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          luminanceThreshold={0.2}
          luminanceSmoothing={0.16}
          intensity={1.2}
          mipmapBlur
          radius={0.72}
          resolutionScale={performanceTier === 'high' ? 1 : 0.55}
        />
        {performanceTier === 'high' ? (
          <ChromaticAberration
            offset={[0.00045, 0.00022]}
            radialModulation
            modulationOffset={0.15}
          />
        ) : null}
      </EffectComposer>
    </>
  )
}

export function SceneCanvas({
  visibilityRef,
}: {
  visibilityRef: RefObject<HTMLElement | null>
}) {
  const performanceTier = useAppStore((state) => state.performanceTier)
  const inView = useInViewAnimation(visibilityRef)
  const particleCount =
    performanceTier === 'high'
      ? HIGH_PARTICLE_COUNT
      : MEDIUM_PARTICLE_COUNT

  useEffect(() => {
    setActiveParticleCount(inView ? particleCount : 0)
    return () => setActiveParticleCount(0)
  }, [inView, particleCount])

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
      data-scene-canvas
      data-particle-count={particleCount}
      data-performance-tier={performanceTier}
      data-frameloop={inView ? 'always' : 'demand'}
    >
      <Canvas
        frameloop={inView ? 'always' : 'demand'}
        dpr={performanceTier === 'high' ? [1, 2] : 1}
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
            当前浏览器无法启动 WebGL 展厅。
          </div>
        }
      >
        <SceneContent particleCount={particleCount} />
      </Canvas>
    </div>
  )
}
