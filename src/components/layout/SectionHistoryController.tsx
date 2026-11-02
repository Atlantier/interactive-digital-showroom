import { useEffect } from 'react'
import {
  getSectionIdFromHash,
  navigateToSection,
} from '../../utils/sectionNavigation'
import { useSmoothScroll } from './SmoothScroll'

export function SectionHistoryController() {
  const lenis = useSmoothScroll()

  useEffect(() => {
    if (!lenis) return

    let scheduledFrame = 0
    const syncFromLocation = () => {
      const sectionId = getSectionIdFromHash(
        window.location.hash,
      )
      if (!sectionId) return

      window.cancelAnimationFrame(scheduledFrame)
      scheduledFrame = window.requestAnimationFrame(() => {
        navigateToSection(sectionId, {
          history: 'none',
          lenis,
        })
      })
    }

    syncFromLocation()
    window.addEventListener('popstate', syncFromLocation)
    window.addEventListener('hashchange', syncFromLocation)
    return () => {
      window.cancelAnimationFrame(scheduledFrame)
      window.removeEventListener('popstate', syncFromLocation)
      window.removeEventListener('hashchange', syncFromLocation)
    }
  }, [lenis])

  return null
}
