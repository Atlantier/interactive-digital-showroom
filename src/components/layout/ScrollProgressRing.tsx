import { memo, useEffect, useRef } from 'react'
import { readTransientState } from '../../store/useAppStore'

export const ScrollProgressRing = memo(function ScrollProgressRing() {
  const hostRef = useRef<HTMLDivElement>(null)
  const arcRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    let animationFrame = 0
    let lastProgress = -1
    let lastAriaValue = -1

    const updateProgress = () => {
      const progress = Math.min(
        1,
        Math.max(0, readTransientState().scrollProgress),
      )

      if (Math.abs(progress - lastProgress) > 0.00005) {
        lastProgress = progress
        if (arcRef.current) {
          arcRef.current.style.strokeDashoffset = String(
            (1 - progress) * 100,
          )
        }
      }

      const ariaValue = Math.round(progress * 100)
      if (ariaValue !== lastAriaValue) {
        lastAriaValue = ariaValue
        hostRef.current?.setAttribute('aria-valuenow', String(ariaValue))
        hostRef.current?.setAttribute(
          'aria-valuetext',
          `页面已滚动 ${ariaValue}%`,
        )
      }

      animationFrame = requestAnimationFrame(updateProgress)
    }

    animationFrame = requestAnimationFrame(updateProgress)
    return () => cancelAnimationFrame(animationFrame)
  }, [])

  return (
    <div
      ref={hostRef}
      role="progressbar"
      aria-label="页面滚动进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      title="页面滚动进度"
      className="scroll-progress-ring relative grid size-9 place-items-center border border-white/10 bg-white/[0.025]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-[23px] overflow-visible"
        fill="none"
      >
        <circle
          cx="12"
          cy="12"
          r="8.4"
          stroke="currentColor"
          strokeWidth="1"
          className="text-white/15"
        />
        <path
          d="M12 1.8v2.1M12 20.1v2.1M1.8 12h2.1M20.1 12h2.1"
          stroke="currentColor"
          strokeWidth="0.8"
          className="text-white/25"
        />
        <circle
          ref={arcRef}
          data-scroll-progress-arc
          cx="12"
          cy="12"
          r="8.4"
          pathLength="100"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeDasharray="100"
          strokeDashoffset="100"
          strokeLinecap="round"
          transform="rotate(-90 12 12)"
          className="scroll-progress-ring-arc text-signal"
        />
        <circle cx="12" cy="12" r="0.85" className="fill-amber/80" />
      </svg>
    </div>
  )
})
