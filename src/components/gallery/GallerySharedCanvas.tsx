import { View } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../../store/useAppStore'
import { useGalleryStore } from '../../store/useGalleryStore'

const CARD_CAMERA_POSITION = new THREE.Vector3(0, 0.16, 4.15)
const CARD_CAMERA_TARGET = new THREE.Vector3(0, -0.02, 0)

function RestoreCardCamera() {
  const camera = useThree((state) => state.camera)

  useFrame(() => {
    if (useGalleryStore.getState().activeExhibitId !== null) return

    camera.position.copy(CARD_CAMERA_POSITION)
    camera.lookAt(CARD_CAMERA_TARGET)
    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== 38) {
      camera.fov = 38
      camera.updateProjectionMatrix()
    }
  })

  return null
}

export function GallerySharedCanvas() {
  const performanceTier = useAppStore((state) => state.performanceTier)
  const activeExhibitId = useGalleryStore(
    (state) => state.activeExhibitId,
  )
  const [galleryInView, setGalleryInView] = useState(false)
  const frameloop =
    galleryInView || activeExhibitId !== null ? 'always' : 'demand'

  useEffect(() => {
    const section = document.getElementById('gallery')
    if (!section) return
    const observer = new IntersectionObserver(
      ([entry]) => setGalleryInView(entry.isIntersecting),
      { rootMargin: '240px 0px', threshold: 0.01 },
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

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
      data-gallery-view-count="8"
      data-gallery-frameloop={frameloop}
      className={
        activeExhibitId === null
          ? 'gallery-shared-canvas pointer-events-none fixed inset-0 z-20'
          : 'gallery-shared-canvas pointer-events-none fixed inset-0 z-[120]'
      }
    >
      <Canvas
        style={{ pointerEvents: 'none' }}
        frameloop={frameloop}
        dpr={performanceTier === 'high' ? [1, 1.75] : 1}
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
            performanceTier === 'high' ? 'high-performance' : 'default',
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0)
        }}
      >
        <RestoreCardCamera />
        <View.Port />
      </Canvas>
    </div>
  )
}
