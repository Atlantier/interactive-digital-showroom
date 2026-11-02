import {
  useEffect,
  useRef,
  type RefObject,
} from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    if (
      element.getAttribute('aria-hidden') === 'true' ||
      element.closest('[inert]')
    ) {
      return false
    }

    const style = window.getComputedStyle(element)
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      element.getClientRects().length > 0
    )
  })
}

interface FocusTrapOptions {
  enabled?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  {
    enabled = true,
    initialFocusRef,
  }: FocusTrapOptions = {},
) {
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    return () => {
      const previousFocus = previousFocusRef.current
      window.requestAnimationFrame(() => {
        if (previousFocus?.isConnected) {
          previousFocus.focus({ preventScroll: true })
        }
      })
    }
  }, [active])

  useEffect(() => {
    if (!active || !enabled) return

    const frame = window.requestAnimationFrame(() => {
      const container = containerRef.current
      if (!container) return

      const initialTarget =
        initialFocusRef?.current ??
        getFocusableElements(container)[0] ??
        container
      initialTarget.focus({ preventScroll: true })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [
    active,
    containerRef,
    enabled,
    initialFocusRef,
  ])

  useEffect(() => {
    if (!active || !enabled) return

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const container = containerRef.current
      if (!container) return

      const focusable = getFocusableElements(container)
      if (focusable.length === 0) {
        event.preventDefault()
        container.focus({ preventScroll: true })
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement

      if (!(current instanceof Node) || !container.contains(current)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }

      if (event.shiftKey && current === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleTab, true)
    return () => {
      document.removeEventListener('keydown', handleTab, true)
    }
  }, [active, containerRef, enabled])
}
