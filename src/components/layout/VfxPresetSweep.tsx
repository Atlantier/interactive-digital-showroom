import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  getVfxPreset,
  type VfxPreset,
} from '../../data/vfxPresets'
import { useAppStore } from '../../store/useAppStore'

interface SweepState {
  key: number
  preset: VfxPreset
}

export function VfxPresetSweep() {
  const preset = useAppStore((state) => state.vfxPreset)
  const reducedMotion = useReducedMotion()
  const previousPreset = useRef(preset)
  const timer = useRef(0)
  const [sweep, setSweep] = useState<SweepState | null>(null)

  useEffect(() => {
    if (previousPreset.current === preset) return
    previousPreset.current = preset
    setSweep((current) => ({
      key: (current?.key ?? 0) + 1,
      preset,
    }))
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(
      () => setSweep(null),
      reducedMotion ? 280 : 1_250,
    )
  }, [preset, reducedMotion])

  useEffect(
    () => () => window.clearTimeout(timer.current),
    [],
  )

  if (!sweep) return null
  const config = getVfxPreset(sweep.preset)
  const style = {
    '--sweep-primary': config.primary,
    '--sweep-secondary': config.secondary,
    '--sweep-tertiary': config.tertiary,
  } as CSSProperties

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={sweep.key}
        data-vfx-preset-sweep={config.id}
        aria-hidden="true"
        style={style}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reducedMotion ? 0.12 : 0.18 }}
        className="pointer-events-none fixed inset-0 z-[90] overflow-hidden"
      >
        <motion.div
          initial={{ x: '-135%' }}
          animate={{ x: '145%' }}
          transition={{
            duration: reducedMotion ? 0.2 : 0.82,
            ease: [0.16, 0.78, 0.2, 1],
          }}
          className="absolute inset-y-[-28%] left-0 w-[72%] -skew-x-12 opacity-55 blur-[38px]"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, var(--sweep-primary) 34%, var(--sweep-tertiary) 49%, var(--sweep-secondary) 62%, transparent 100%)',
            mixBlendMode: 'screen',
          }}
        />
        <motion.div
          initial={{ x: '-125%' }}
          animate={{ x: '150%' }}
          transition={{
            duration: reducedMotion ? 0.18 : 0.66,
            ease: [0.2, 0.72, 0.18, 1],
          }}
          className="absolute inset-y-0 left-0 w-px bg-white/80 shadow-[0_0_38px_9px_var(--sweep-secondary)]"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.2, 0] }}
          transition={{
            duration: reducedMotion ? 0.18 : 0.88,
            times: [0, 0.38, 1],
          }}
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 50%, color-mix(in srgb, var(--sweep-primary) 13%, transparent), transparent 58%)',
            mixBlendMode: 'screen',
          }}
        />
      </motion.div>
    </AnimatePresence>
  )
}
