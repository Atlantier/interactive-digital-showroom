import { useEffect, useState, type RefObject } from 'react'

interface UseInViewAnimationOptions {
  rootMargin?: string
  threshold?: number
  enabled?: boolean
}

export function useInViewAnimation<T extends HTMLElement>(
  ref: RefObject<T | null>,
  {
    rootMargin = '0px',
    threshold = 0.01,
    enabled = true,
  }: UseInViewAnimationOptions = {},
) {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setInView(false)
      return
    }
    const element = ref.current
    if (!element) return

    element.dataset.inViewAnimation = 'false'
    const observer = new IntersectionObserver(
      ([entry]) => {
        const nextInView = entry.isIntersecting
        element.dataset.inViewAnimation = String(nextInView)
        setInView((current) =>
          current === nextInView ? current : nextInView,
        )
      },
      {
        threshold,
        rootMargin,
      },
    )

    observer.observe(element)
    return () => {
      observer.disconnect()
      delete element.dataset.inViewAnimation
    }
  }, [enabled, ref, rootMargin, threshold])

  return inView
}
