import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { cn } from '../../lib/cn'

interface DeferredSectionProps {
  children: ReactNode
  className?: string
  minHeight?: CSSProperties['minHeight']
  onReady?: () => void
  rootMargin?: string
  sectionId?: string
}

export function DeferredSection({
  children,
  className,
  minHeight = '720px',
  onReady,
  rootMargin = '600px 0px',
  sectionId,
}: DeferredSectionProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const readyRef = useRef(false)
  const [ready, setReady] = useState(false)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  const activate = useCallback(() => {
    if (readyRef.current) return
    readyRef.current = true
    setReady(true)
    window.requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent('showroom:section-ready', {
          detail: { sectionId },
        }),
      )
      onReadyRef.current?.()
    })
  }, [sectionId])

  useEffect(() => {
    if (ready) return
    const host = hostRef.current
    if (!host) return

    if (
      sectionId &&
      window.location.hash === `#${sectionId}`
    ) {
      activate()
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        activate()
        observer.disconnect()
      },
      {
        rootMargin,
        threshold: 0.01,
      },
    )
    observer.observe(host)

    const handleHashChange = () => {
      if (
        sectionId &&
        window.location.hash === `#${sectionId}`
      ) {
        activate()
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('popstate', handleHashChange)

    return () => {
      observer.disconnect()
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('popstate', handleHashChange)
    }
  }, [activate, ready, rootMargin, sectionId])

  return (
    <div
      ref={hostRef}
      id={sectionId}
      data-deferred-section={sectionId ?? 'content'}
      data-deferred-ready={ready ? 'true' : 'false'}
      style={{ minHeight }}
      className={cn(
        'relative',
        !ready && 'deferred-section-placeholder',
        className,
      )}
    >
      {ready ? <Suspense fallback={null}>{children}</Suspense> : null}
    </div>
  )
}
