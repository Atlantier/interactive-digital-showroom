import type Lenis from 'lenis'
import { useEffect } from 'react'

let lockCount = 0
let previousBodyOverflow = ''
let lockedLenis: Lenis | null = null

export function useScrollLock(active: boolean, lenis: Lenis | null) {
  useEffect(() => {
    if (!active) return

    if (lockCount === 0) {
      previousBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      lockedLenis = lenis
      lockedLenis?.stop()
    } else if (!lockedLenis && lenis) {
      lockedLenis = lenis
      lockedLenis.stop()
    }

    lockCount += 1

    return () => {
      lockCount = Math.max(0, lockCount - 1)
      if (lockCount > 0) return

      document.body.style.overflow = previousBodyOverflow
      lockedLenis?.start()
      lockedLenis = null
    }
  }, [active, lenis])
}
