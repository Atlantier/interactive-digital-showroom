import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion'
import type { HTMLMotionProps } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

const SPRING_CONFIG = {
  stiffness: 260,
  damping: 20,
  mass: 0.8,
}

interface SpotlightCardProps extends Omit<HTMLMotionProps<'article'>, 'children'> {
  children: ReactNode
  className?: string
}

export function SpotlightCard({
  className,
  children,
  onPointerMove,
  onPointerLeave,
  onPointerCancel,
  ...props
}: SpotlightCardProps) {
  const reducedMotion = useReducedMotion()
  const rotateXTarget = useMotionValue(0)
  const rotateYTarget = useMotionValue(0)
  const rotateX = useSpring(rotateXTarget, SPRING_CONFIG)
  const rotateY = useSpring(rotateYTarget, SPRING_CONFIG)

  const resetTilt = () => {
    rotateXTarget.set(0)
    rotateYTarget.set(0)
  }

  return (
    <motion.article
      {...props}
      data-spotlight-card
      onPointerMove={(event) => {
        onPointerMove?.(event)
        if (reducedMotion || event.pointerType !== 'mouse') return

        const bounds = event.currentTarget.getBoundingClientRect()
        const normalizedX = Math.min(
          0.5,
          Math.max(
            -0.5,
            (event.clientX - bounds.left) / bounds.width - 0.5,
          ),
        )
        const normalizedY = Math.min(
          0.5,
          Math.max(
            -0.5,
            (event.clientY - bounds.top) / bounds.height - 0.5,
          ),
        )

        rotateXTarget.set(normalizedY * -16)
        rotateYTarget.set(normalizedX * 16)
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event)
        resetTilt()
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event)
        resetTilt()
      }}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1200,
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        transformOrigin: 'center center',
      }}
      className={cn(
        'bento-card group relative isolate min-h-[230px] overflow-hidden rounded-lg [transform-style:preserve-3d] [will-change:transform]',
        'border border-white/[0.09] bg-carbon/85',
        'shadow-[0_18px_60px_rgba(0,0,0,0.24)]',
        'focus-within:border-signal/35',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="bento-card-border-glow pointer-events-none absolute -inset-px z-0 rounded-[inherit]"
      />
      <div
        aria-hidden="true"
        className="bento-card-surface-glare pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
      />
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.026),transparent_34%,rgba(16,185,129,0.018))]" />
      <div
        data-spotlight-content
        className="relative z-10 flex h-full flex-col [transform:translateZ(30px)]"
      >
        {children}
      </div>
    </motion.article>
  )
}
