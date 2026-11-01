import { useReducedMotion } from 'framer-motion'
import {
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react'
import { useI18nStore } from '../../i18n/useI18n'

export const LOCALE_TEXT_TRANSITION_MS = 220

const MOTION_TARGETS = [
  'main h1',
  'main h2',
  'main h3',
  'main h4',
  'main p',
  'main button',
  'main label',
  'main output',
  'header nav a',
  'header button',
  '[data-localized-motion]',
  '[data-locale-canvas]',
].join(',')

const PORTAL_MOTION_TARGETS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'p',
  'button',
  'label',
  'output',
  '[data-localized-motion]',
].join(',')

export function LocalizedTextRoot({
  children,
}: {
  children: ReactNode
}) {
  const locale = useI18nStore((state) => state.locale)
  const reducedMotion = Boolean(useReducedMotion())
  const rootRef = useRef<HTMLDivElement>(null)
  const previousLocaleRef = useRef(locale)

  useLayoutEffect(() => {
    if (previousLocaleRef.current === locale) return
    previousLocaleRef.current = locale

    const root = rootRef.current
    if (!root) return

    root.dataset.localeMotion = reducedMotion ? 'settled' : 'running'
    if (reducedMotion) return

    const targets = new Set<HTMLElement>(
      root.querySelectorAll<HTMLElement>(MOTION_TARGETS),
    )
    document
      .querySelectorAll<HTMLElement>('[data-localized-portal]')
      .forEach((portal) => {
        portal
          .querySelectorAll<HTMLElement>(PORTAL_MOTION_TARGETS)
          .forEach((element) => targets.add(element))
      })
    const animations: Animation[] = []

    targets.forEach((element) => {
      if (element.getClientRects().length === 0) return

      const compactTarget = element.matches(
        'button, label, output, [data-localized-motion]',
      )
      const initialBlur = element.matches('[data-locale-canvas]')
        ? 2
        : compactTarget
          ? 2
          : 4
      animations.push(
        element.animate(
          [
            {
              filter: `blur(${initialBlur}px)`,
              opacity: 0.48,
              transform: 'translate3d(0, 1px, 0)',
            },
            {
              filter: 'blur(1.15px)',
              opacity: 0.82,
              transform: 'translate3d(0, 0.35px, 0)',
              offset: 0.46,
            },
            {
              filter: 'blur(0px)',
              opacity: 1,
              transform: 'translate3d(0, 0, 0)',
            },
          ],
          {
            duration: LOCALE_TEXT_TRANSITION_MS,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'both',
          },
        ),
      )
    })

    const settleTimer = window.setTimeout(() => {
      root.dataset.localeMotion = 'settled'
      for (const animation of animations) {
        animation.cancel()
      }
    }, LOCALE_TEXT_TRANSITION_MS)

    return () => {
      window.clearTimeout(settleTimer)
      for (const animation of animations) {
        animation.cancel()
      }
    }
  }, [locale, reducedMotion])

  return (
    <div
      ref={rootRef}
      data-localized-text-root
      data-locale-motion="settled"
      className="contents"
    >
      {children}
    </div>
  )
}
