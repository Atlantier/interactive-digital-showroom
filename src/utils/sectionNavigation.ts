import type Lenis from 'lenis'
import {
  SHOWROOM_SECTIONS,
  type SectionId,
} from '../data/sections'
import { useAppStore } from '../store/useAppStore'
import { prefersReducedMotion } from './motionPreferences'

type SectionHistoryMode = 'push' | 'replace' | 'none'

interface NavigateToSectionOptions {
  history?: SectionHistoryMode
  lenis?: Lenis | null
}

const SECTION_IDS = new Set<string>(
  SHOWROOM_SECTIONS.map((section) => section.id),
)

export function getSectionIdFromHash(
  hash: string,
): SectionId | null {
  const candidate = hash.replace(/^#/, '').split('?')[0]
  if (!SECTION_IDS.has(candidate)) return null
  return candidate as SectionId
}

function syncSectionHistory(
  sectionId: SectionId,
  mode: SectionHistoryMode,
) {
  if (mode === 'none') return

  const url = new URL(window.location.href)
  url.hash = sectionId
  if (url.href === window.location.href) return

  const state = {
    ...(window.history.state ?? {}),
    sectionId,
  }
  const method =
    mode === 'replace' ? 'replaceState' : 'pushState'
  window.history[method](state, '', url)
}

export function navigateToSection(
  sectionId: SectionId,
  {
    history = 'push',
    lenis = null,
  }: NavigateToSectionOptions = {},
) {
  useAppStore.getState().setActiveSection(sectionId)
  syncSectionHistory(sectionId, history)

  window.requestAnimationFrame(() => {
    const reducedMotion = prefersReducedMotion()
    if (lenis) {
      lenis.start()
      lenis.scrollTo(`#${sectionId}`, {
        duration: reducedMotion ? 0 : 1.15,
        immediate: reducedMotion,
        offset: -76,
      })
      return
    }

    document.getElementById(sectionId)?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  })
}
