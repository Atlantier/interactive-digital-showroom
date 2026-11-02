import { View } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import { useEffect } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../../store/useAppStore'
import { useGalleryStore } from '../../store/useGalleryStore'
import { getEffectiveGalleryTimeScale } from '../../utils/motionPreferences'

const CARD_CAMERA_POSITION = new THREE.Vector3(0, 0.16, 4.15)

export function GallerySharedCanvas() {
  const performanceTier = useAppStore((state) => state.performanceTier)
  const activeExhibitId = useGalleryStore(
    (state) => state.activeExhibitId,
  )
  const timeScale = useGalleryStore((state) => state.timeScale)
  const reducedMotion = Boolean(useReducedMotion())
  const effectiveTimeScale = getEffectiveGalleryTimeScale(timeScale)
  const stageMounted = activeExhibitId !== null
  const frameloop = stageMounted ? 'always' : 'never'
  const frameloopMode = stageMounted ? 'always' : 'unmounted'
  const galleryDpr: number | [number, number] =
    performanceTier === 'high' && !reducedMotion
      ? [1, 1.5]
      : 1

  useEffect(() => {
    document.documentElement.dataset.galleryCanvasMode =
      activeExhibitId === null ? 'gallery' : 'darkroom'
    return () => {
      delete document.documentElement.dataset.galleryCanvasMode
    }
  }, [activeExhibitId])

  return (
    <div
      aria-hidden="true"
      data-gallery-shared-canvas
      data-gallery-canvas-mode={
        activeExhibitId === null ? 'gallery' : 'darkroom'
      }
      data-gallery-stage-mounted={
        stageMounted ? 'true' : 'false'
      }
      data-gallery-view-count={stageMounted ? '1' : '0'}
      data-gallery-frameloop={frameloopMode}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-gallery-effective-timescale-value={effectiveTimeScale.toFixed(
        2,
      )}
      data-gallery-dpr={
        Array.isArray(galleryDpr)
          ? galleryDpr.join('-')
          : String(galleryDpr)
      }
      className={
        !stageMounted
          ? 'gallery-shared-canvas pointer-events-none fixed inset-0 z-20'
          : 'gallery-shared-canvas pointer-events-none fixed inset-0 z-[120]'
      }
    >
      {stageMounted ? (
        <Canvas
          style={{ pointerEvents: 'none' }}
          frameloop={frameloop}
          dpr={galleryDpr}
          camera={{
            position: CARD_CAMERA_POSITION.toArray(),
            fov: 38,
            near: 0.1,
            far: 40,
          }}
          gl={{
            alpha: true,
            antialias: true,
            powerPreference:
              performanceTier === 'high'
                ? 'high-performance'
                : 'default',
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0)
          }}
        >
          <View.Port />
        </Canvas>
      ) : null}
    </div>
  )
}
