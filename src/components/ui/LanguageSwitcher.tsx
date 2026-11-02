import { motion, useReducedMotion } from 'framer-motion'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import { cn } from '../../lib/cn'
import { useI18n, type Locale } from '../../i18n/useI18n'

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()
  const playSound = useInterfaceSound()
  const reducedMotion = useReducedMotion()
  const options: ReadonlyArray<{
    id: Locale
    label: string
    ariaLabel: string
  }> = [
    {
      id: 'en',
      label: t.language.english,
      ariaLabel: t.language.switchToEnglish,
    },
    {
      id: 'zh',
      label: t.language.chinese,
      ariaLabel: t.language.switchToChinese,
    },
  ]

  const selectLocale = (nextLocale: Locale) => {
    if (locale === nextLocale) return
    playSound('localeConfirm')
    setLocale(nextLocale)
  }

  return (
    <div
      role="group"
      aria-label={t.language.switcherLabel}
      data-language-switcher
      data-locale-active={locale}
      className="relative flex h-9 shrink-0 items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.035] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl"
    >
      {options.map((option) => {
        const active = locale === option.id
        return (
          <button
            key={option.id}
            type="button"
            data-language-option={option.id}
            aria-label={option.ariaLabel}
            aria-pressed={active}
            title={option.ariaLabel}
            onClick={() => selectLocale(option.id)}
            className={cn(
              'relative grid h-7 min-w-8 place-items-center rounded-full px-2 font-mono text-[11px] transition-colors duration-300 sm:min-w-9',
              active
                ? 'text-frost'
                : 'text-[var(--text-secondary)] hover:text-frost',
            )}
          >
            {active ? (
              <motion.span
                layoutId="language-switcher-active"
                data-language-highlight
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : {
                        type: 'spring',
                        stiffness: 420,
                        damping: 34,
                        mass: 0.72,
                      }
                }
                className="absolute inset-0 rounded-full border border-signal/30 bg-signal/[0.12] shadow-[0_0_18px_rgb(var(--theme-accent-rgb)/0.16)]"
              />
            ) : null}
            <span className="relative z-10">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
