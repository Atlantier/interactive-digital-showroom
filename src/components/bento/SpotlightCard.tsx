import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion'
import type { HTMLMotionProps } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { CardParticleCanvas } from './CardParticleCanvas'

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
      data-perimeter-comets="2"
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
        backfaceVisibility: 'hidden',
        transformOrigin: 'center center',
      }}
      className={cn(
        'bento-card group relative isolate min-h-[230px] min-w-0 overflow-hidden rounded-lg [transform-style:preserve-3d]',
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
        data-comet-beam="emerald"
        className="bento-comet bento-comet-emerald"
      />
      <div
        aria-hidden="true"
        data-comet-beam="cyan"
        className="bento-comet bento-comet-cyan"
      />
      <CardParticleCanvas />
      <div
        aria-hidden="true"
        className="bento-card-surface-glare pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
      />
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'linear-gradient(145deg, rgb(255 255 255 / 2.6%), transparent 34%, rgb(var(--vfx-primary-rgb) / 1.8%))',
        }}
      />
      <div
        data-spotlight-content
        className="relative z-10 flex h-full min-w-0 flex-col [transform:translateZ(30px)]"
      >
        {children}
      </div>
    </motion.article>
  )
}
