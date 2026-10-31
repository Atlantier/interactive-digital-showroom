import Lenis from 'lenis'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAppStore } from '../../store/useAppStore'

let activeLenis: Lenis | null = null

const LenisContext = createContext<Lenis | null>(null)

export function useSmoothScroll() {
  return useContext(LenisContext)
}

interface SmoothScrollProps {
  children: ReactNode
}

export function SmoothScroll({ children }: SmoothScrollProps) {
  const [lenis, setLenis] = useState<Lenis | null>(null)

  useEffect(() => {
    const instance = new Lenis({
      autoRaf: false,
      duration: 1.15,
      easing: (time) => Math.min(1, 1.001 - 2 ** (-10 * time)),
      smoothWheel: true,
      syncTouch: false,
      touchMultiplier: 1.15,
      wheelMultiplier: 0.9,
      anchors: { offset: -76 },
      autoResize: true,
      respectReducedMotion: true,
    })

    const updatePointerFromViewport = (clientX: number, clientY: number) => {
      const visualViewport = window.visualViewport
      const fallbackWidth =
        document.documentElement.clientWidth || window.innerWidth
      const fallbackHeight =
        document.documentElement.clientHeight || window.innerHeight
      const viewportWidth = visualViewport?.width ?? fallbackWidth
      const viewportHeight = visualViewport?.height ?? fallbackHeight
      const offsetLeft = visualViewport?.offsetLeft ?? 0
      const offsetTop = visualViewport?.offsetTop ?? 0
      const normalizedX = ((clientX - offsetLeft) / viewportWidth) * 2 - 1
      const normalizedY =
        1 - ((clientY - offsetTop) / viewportHeight) * 2

      useAppStore
        .getState()
        .updatePointer(
          normalizedX,
          normalizedY,
          clientX,
          clientY,
        )
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      updatePointerFromViewport(event.clientX, event.clientY)
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      updatePointerFromViewport(event.clientX, event.clientY)
    }

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches.item(0) ?? event.changedTouches.item(0)
      if (!touch) return
      updatePointerFromViewport(touch.clientX, touch.clientY)
    }

    const handlePointerLeave = () => {
      useAppStore.getState().setPointerActive(false)
    }

    const handleTouchEnd = () => {
      useAppStore.getState().setPointerActive(false)
    }

    const handleWindowBlur = () => {
      useAppStore.getState().setPointerActive(false)
    }

    const handleResize = () => instance.resize()

    activeLenis = instance
    setLenis(instance)

    let animationFrame = 0
    const driveLenis = (timestamp: number) => {
      if (activeLenis) {
        activeLenis.raf(timestamp)
        useAppStore
          .getState()
          .updateScroll(activeLenis.progress, activeLenis.velocity)
        document.documentElement.style.setProperty(
          '--scroll-progress',
          String(activeLenis.progress),
        )
        document.documentElement.style.setProperty(
          '--scroll-velocity',
          String(activeLenis.velocity),
        )
      }
      animationFrame = requestAnimationFrame(driveLenis)
    }

    animationFrame = requestAnimationFrame(driveLenis)
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerdown', handlePointerDown, {
      passive: true,
    })
    window.addEventListener('touchstart', handleTouchMove, {
      passive: true,
    })
    window.addEventListener('touchmove', handleTouchMove, {
      passive: true,
    })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
    window.addEventListener('blur', handleWindowBlur)
    document.documentElement.addEventListener(
      'pointerleave',
      handlePointerLeave,
    )
    window.addEventListener('resize', handleResize, { passive: true })

    return () => {
      cancelAnimationFrame(animationFrame)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('touchstart', handleTouchMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
      window.removeEventListener('blur', handleWindowBlur)
      document.documentElement.removeEventListener(
        'pointerleave',
        handlePointerLeave,
      )
      window.removeEventListener('resize', handleResize)
      instance.destroy()
      activeLenis = null
      setLenis(null)
    }
  }, [])

  return (
    <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
  )
}
