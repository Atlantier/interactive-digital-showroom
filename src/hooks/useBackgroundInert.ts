import { useEffect } from 'react'

let inertCount = 0
let previousAriaHidden: string | null = null
let inertRoot: HTMLElement | null = null

function acquireBackgroundInert() {
  const root = document.getElementById('root')
  if (!root) return false

  if (inertCount === 0) {
    inertRoot = root
    previousAriaHidden = root.getAttribute('aria-hidden')
    root.inert = true
    root.setAttribute('aria-hidden', 'true')
  }
  inertCount += 1
  return true
}

function releaseBackgroundInert() {
  inertCount = Math.max(0, inertCount - 1)
  if (inertCount > 0 || !inertRoot) return

  inertRoot.inert = false
  if (previousAriaHidden === null) {
    inertRoot.removeAttribute('aria-hidden')
  } else {
    inertRoot.setAttribute('aria-hidden', previousAriaHidden)
  }
  inertRoot = null
  previousAriaHidden = null
}

export function useBackgroundInert(active: boolean) {
  useEffect(() => {
    if (!active) return

    let acquired = false
    const frame = window.requestAnimationFrame(() => {
      acquired = acquireBackgroundInert()
    })

    return () => {
      window.cancelAnimationFrame(frame)
      if (acquired) releaseBackgroundInert()
    }
  }, [active])
}
