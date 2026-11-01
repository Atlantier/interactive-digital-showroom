import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Gauge, X } from 'lucide-react'
import { useEffect } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useAppStore } from '../../store/useAppStore'
import { useGalleryStore } from '../../store/useGalleryStore'

export function PerformanceQualityNotice() {
  const { t } = useI18n()
  const visible = useAppStore((state) => state.qualityNoticeVisible)
  const tourActive = useGalleryStore((state) => state.isTourActive)
  const cinemaCleanView = useGalleryStore(
    (state) => state.cinemaCleanView,
  )
  const dismiss = useAppStore((state) => state.dismissQualityNotice)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!visible) return
    const timeout = window.setTimeout(dismiss, 5_500)
    return () => window.clearTimeout(timeout)
  }, [dismiss, visible])

  return (
    <AnimatePresence>
      {visible && !tourActive && !cinemaCleanView ? (
        <motion.aside
          data-performance-quality-notice
          role="status"
          aria-live="polite"
          initial={reducedMotion ? false : { opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 14 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="fixed right-3 top-[84px] z-[55] flex max-w-[360px] items-start gap-3 border border-amber/25 bg-[#080c11]/94 p-3.5 font-mono shadow-[0_20px_60px_rgba(0,0,0,0.52)] backdrop-blur-xl sm:right-5"
        >
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center border border-amber/25 bg-amber/[0.08] text-amber">
            <Gauge size={14} strokeWidth={1.6} />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] tracking-[0.15em] text-amber">
              {t.qualityNotice.eyebrow}
            </p>
            <p className="mt-1.5 text-[11px] leading-5 text-frost/85">
              {t.qualityNotice.message}
            </p>
            <p className="mt-1 text-[8px] leading-4 text-mist/40">
              {t.qualityNotice.details}
            </p>
          </div>
          <button
            type="button"
            aria-label={t.qualityNotice.close}
            title={t.qualityNotice.close}
            onClick={dismiss}
            className="ml-1 grid size-6 shrink-0 place-items-center text-mist/40 transition-colors hover:text-frost"
          >
            <X size={12} strokeWidth={1.7} />
          </button>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}
