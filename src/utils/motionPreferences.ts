const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const REDUCED_GALLERY_TIME_SCALE_LIMIT = 0.12

let reducedMotionQuery: MediaQueryList | null = null

function getReducedMotionQuery() {
  if (typeof window === 'undefined') return null
  reducedMotionQuery ??= window.matchMedia(REDUCED_MOTION_QUERY)
  return reducedMotionQuery
}

export function prefersReducedMotion() {
  return getReducedMotionQuery()?.matches ?? false
}

export function getEffectiveGalleryTimeScale(timeScale: number) {
  if (!prefersReducedMotion()) return timeScale
  return Math.min(timeScale, REDUCED_GALLERY_TIME_SCALE_LIMIT)
}
