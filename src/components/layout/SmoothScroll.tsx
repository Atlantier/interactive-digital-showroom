import Lenis from 'lenis'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAppStore } from '../../store/useAppStore'
import { subscribeFrame } from '../../utils/frameScheduler'

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
      smoothWheel: false,
      syncTouch: false,
      touchMultiplier: 1.15,
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
    document.documentElement.dataset.scrollMode = 'native-wheel'
    setLenis(instance)

    let progressLine: HTMLElement | null = null
    let scrollStateActive = false
    let scrollIdleTimer = 0

    const markScrollActivity = () => {
      if (!scrollStateActive) {
        scrollStateActive = true
        document.documentElement.dataset.scrolling = 'true'
      }
      window.clearTimeout(scrollIdleTimer)
      scrollIdleTimer = window.setTimeout(() => {
        scrollStateActive = false
        document.documentElement.dataset.scrolling = 'false'
      }, 140)
    }

    const unsubscribeFrame = subscribeFrame((timestamp) => {
      if (activeLenis) {
        activeLenis.raf(timestamp)
        const progress = activeLenis.progress
        useAppStore
          .getState()
          .updateScroll(progress, activeLenis.velocity)
        progressLine ??= document.querySelector<HTMLElement>(
          '[data-scroll-progress-line]',
        )
        if (progressLine) {
          progressLine.style.transform = `scaleX(${progress.toFixed(5)})`
        }
      }
    })

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
    window.addEventListener('scroll', markScrollActivity, {
      passive: true,
    })
    window.addEventListener('wheel', markScrollActivity, {
      passive: true,
    })
    window.addEventListener('blur', handleWindowBlur)
    document.documentElement.addEventListener(
      'pointerleave',
      handlePointerLeave,
    )
    window.addEventListener('resize', handleResize, { passive: true })

    return () => {
      unsubscribeFrame()
      window.clearTimeout(scrollIdleTimer)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('touchstart', handleTouchMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
      window.removeEventListener('scroll', markScrollActivity)
      window.removeEventListener('wheel', markScrollActivity)
      window.removeEventListener('blur', handleWindowBlur)
      document.documentElement.removeEventListener(
        'pointerleave',
        handlePointerLeave,
      )
      window.removeEventListener('resize', handleResize)
      instance.destroy()
      delete document.documentElement.dataset.scrolling
      delete document.documentElement.dataset.scrollMode
      activeLenis = null
      setLenis(null)
    }
  }, [])

  return (
    <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
  )
}
