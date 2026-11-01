import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  Aperture,
  Gauge,
  Menu,
  Search,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'
import { SHOWROOM_SECTIONS, type SectionId } from '../../data/sections'
import { VFX_PRESETS } from '../../data/vfxPresets'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import {
  formatTranslation,
  useI18n,
} from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import { useAppStore } from '../../store/useAppStore'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { ScrollProgressRing } from './ScrollProgressRing'
import { SoundSpectrum } from './SoundSpectrum'
import { useSmoothScroll } from './SmoothScroll'

const NAV_ITEM_WIDTHS: Record<SectionId, string> = {
  home: 'min-w-[56px]',
  works: 'min-w-[57px]',
  gallery: 'min-w-[60px]',
  architecture: 'min-w-[102px]',
  sandbox: 'min-w-[76px]',
  kinetics: 'min-w-[71px]',
  archive: 'min-w-[66px]',
  contact: 'min-w-[71px]',
}

function NavItem({
  id,
  label,
  active,
  onNavigate,
}: {
  id: SectionId
  label: string
  active: boolean
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, id: SectionId) => void
}) {
  const playSound = useInterfaceSound()

  return (
    <a
      href={`#${id}`}
      aria-current={active ? 'location' : undefined}
      onClick={(event) => onNavigate(event, id)}
      onPointerEnter={() => playSound('hover')}
      className={cn(
        'relative flex h-9 items-center justify-center whitespace-nowrap px-2 text-sm transition-colors duration-300',
        NAV_ITEM_WIDTHS[id],
        active ? 'text-frost' : 'text-mist hover:text-frost',
      )}
    >
      {active && (
        <motion.span
          layoutId="active-nav-indicator"
          className="absolute inset-x-2 bottom-0 h-px bg-signal"
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        />
      )}
      {label}
    </a>
  )
}

function FpsToggle() {
  const { t } = useI18n()
  const enabled = useAppStore((state) => state.fpsMonitorEnabled)
  const toggleMonitor = useAppStore((state) => state.toggleFpsMonitor)
  const playSound = useInterfaceSound()

  return (
    <button
      type="button"
      title={enabled ? t.nav.fps.hide : t.nav.fps.show}
      aria-label={
        enabled ? t.nav.fps.disable : t.nav.fps.enable
      }
      aria-pressed={enabled}
      onClick={() => {
        toggleMonitor()
        playSound('toggle')
      }}
      className={cn(
        'hidden size-9 place-items-center border transition-colors duration-300 sm:grid xl:hidden 2xl:grid',
        enabled
          ? 'border-signal/45 bg-signal/10 text-signal'
          : 'border-white/10 bg-white/[0.025] text-mist hover:border-white/25 hover:text-frost',
      )}
    >
      <Activity size={15} strokeWidth={1.7} />
    </button>
  )
}

function VfxPresetSwitcher({
  expanded = false,
}: {
  expanded?: boolean
}) {
  const { t } = useI18n()
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const setVfxPreset = useAppStore((state) => state.setVfxPreset)
  const playSound = useInterfaceSound()

  return (
    <div
      role="group"
      aria-label={t.nav.overdrive.title}
      data-vfx-preset-switcher
      data-vfx-preset-active={vfxPreset}
      className={
        expanded
          ? 'grid grid-cols-3 gap-1.5'
          : 'hidden items-center gap-1 border border-white/[0.08] bg-white/[0.025] p-1 xl:flex'
      }
    >
      {VFX_PRESETS.map((preset) => {
        const active = vfxPreset === preset.id
        const presetCopy = t.vfxPresets[preset.id]
        const switchLabel = formatTranslation(
          t.nav.overdrive.switchPreset,
          { preset: presetCopy.label },
        )
        return (
          <button
            key={preset.id}
            type="button"
            data-vfx-preset-option={preset.id}
            aria-label={switchLabel}
            aria-pressed={active}
            title={formatTranslation(
              t.nav.overdrive.presetTitle,
              { preset: presetCopy.label },
            )}
            onClick={() => {
              setVfxPreset(preset.id)
              playSound('toggle')
            }}
            className={cn(
              'group/preset relative flex items-center gap-2 border transition-colors',
              expanded
                ? 'min-w-0 flex-col items-start gap-1.5 px-2.5 py-2.5 text-left'
                : 'size-6 items-center justify-center',
              active
                ? 'border-white/28 bg-white/[0.08]'
                : 'border-transparent hover:border-white/15 hover:bg-white/[0.045]',
            )}
          >
            <span
              aria-hidden="true"
              className={
                expanded
                  ? 'relative h-1.5 w-full overflow-hidden rounded-full'
                  : 'size-3 rounded-full'
              }
              style={{
                background: `linear-gradient(110deg, ${preset.primary}, ${preset.secondary} 58%, ${preset.tertiary})`,
                boxShadow: active
                  ? `0 0 12px ${preset.primary}99`
                  : `0 0 7px ${preset.primary}44`,
              }}
            >
              {expanded ? (
                <span className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)] opacity-0 transition-opacity group-hover/preset:opacity-100" />
              ) : null}
            </span>
            {expanded ? (
              <span className="min-w-0">
                <span
                  className={cn(
                    'block truncate text-[10px]',
                    active ? 'text-frost' : 'text-mist/70',
                  )}
                >
                  {presetCopy.label}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[7px] text-mist/34">
                  {presetCopy.subtitle}
                </span>
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function CommandPaletteToggle() {
  const { t } = useI18n()
  const open = useAppStore((state) => state.commandPaletteOpen)
  const toggleCommandPalette = useAppStore(
    (state) => state.toggleCommandPalette,
  )
  const playSound = useInterfaceSound()

  return (
    <button
      type="button"
      title={
        open
          ? t.nav.command.close
          : t.nav.command.openWithShortcut
      }
      aria-label={
        open ? t.nav.command.close : t.nav.command.open
      }
      aria-pressed={open}
      onClick={() => {
        toggleCommandPalette()
        playSound('toggle')
      }}
      className={cn(
        'flex h-9 items-center gap-2 border px-2.5 transition-colors duration-300',
        open
          ? 'border-signal/45 bg-signal/10 text-signal'
          : 'border-white/10 bg-white/[0.025] text-mist hover:border-white/25 hover:text-frost',
      )}
    >
      <Search size={15} strokeWidth={1.7} />
      <span className="hidden font-mono text-[9px] md:inline">
        {t.common.keyboard.command}
      </span>
    </button>
  )
}

function TelemetryToggle() {
  const { t } = useI18n()
  const open = useAppStore((state) => state.telemetryOpen)
  const toggleTelemetry = useAppStore((state) => state.toggleTelemetry)
  const playSound = useInterfaceSound()

  return (
    <button
      type="button"
      title={
        open ? t.nav.telemetry.close : t.nav.telemetry.open
      }
      aria-label={
        open ? t.nav.telemetry.close : t.nav.telemetry.open
      }
      aria-pressed={open}
      onClick={() => {
        toggleTelemetry()
        playSound('toggle')
      }}
      className={cn(
        'grid size-9 place-items-center border transition-colors duration-300',
        open
          ? 'border-signal/45 bg-signal/10 text-signal'
          : 'border-white/10 bg-white/[0.025] text-mist hover:border-white/25 hover:text-frost',
      )}
    >
      <Gauge size={15} strokeWidth={1.7} />
    </button>
  )
}

function SoundToggle() {
  const { t } = useI18n()
  const enabled = useAppStore((state) => state.soundEnabled)
  const setSoundEnabled = useAppStore((state) => state.setSoundEnabled)
  const playSound = useInterfaceSound()
  const Icon = enabled ? Volume2 : VolumeX

  return (
    <button
      type="button"
      title={enabled ? t.nav.sound.disable : t.nav.sound.enable}
      aria-label={
        enabled ? t.nav.sound.disable : t.nav.sound.enable
      }
      aria-pressed={enabled}
      onClick={() => {
        const nextState = !enabled
        setSoundEnabled(nextState)
        playSound('toggle', nextState)
      }}
      className={cn(
        'grid size-9 place-items-center border transition-colors duration-300',
        enabled
          ? 'border-amber/45 bg-amber/10 text-amber'
          : 'border-white/10 bg-white/[0.025] text-mist hover:border-white/25 hover:text-frost',
      )}
    >
      <Icon size={16} strokeWidth={1.7} />
    </button>
  )
}

function FpsReadout() {
  const { t } = useI18n()
  const enabled = useAppStore((state) => state.fpsMonitorEnabled)
  const telemetryOpen = useAppStore((state) => state.telemetryOpen)
  const fps = useAppStore((state) => state.fps)
  const reducedMotion = useReducedMotion()
  const statusColor =
    fps >= 50 ? 'bg-signal' : fps >= 30 ? 'bg-amber' : 'bg-red-400'

  return (
    <AnimatePresence>
      {enabled && !telemetryOpen && (
        <motion.aside
          initial={reducedMotion ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          aria-label={t.nav.fps.liveTelemetry}
          className="fixed right-4 top-[84px] z-40 flex items-center gap-3 border border-white/10 bg-[#030507]/96 px-3 py-2 font-mono text-[11px] text-mist shadow-2xl shadow-black/30 sm:right-6 md:right-8"
        >
          <span className="flex h-4 items-end gap-0.5" aria-hidden="true">
            {[0.45, 0.7, 1].map((height, index) => (
              <motion.span
                key={height}
                className={cn('w-0.5 origin-bottom', statusColor)}
                style={{ height: 16 }}
                animate={{
                  scaleY:
                    fps > index * 20 ? height : Math.max(0.1, fps / 180),
                }}
                transition={{ duration: 0.18 }}
              />
            ))}
          </span>
          <span className="text-frost">{fps || '--'}</span>
          <span className="text-mist/70">{t.nav.fps.unit}</span>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function BrandMark({
  Icon,
}: {
  Icon: LucideIcon
}) {
  const { t } = useI18n()

  return (
    <a
      href="#home"
      aria-label={t.nav.brandHome}
      className="group flex items-center gap-3"
    >
      <span className="relative grid size-8 place-items-center border border-white/15 bg-white/[0.025] transition-colors group-hover:border-signal/40">
        <Icon
          size={16}
          strokeWidth={1.35}
          className="text-signal transition-transform duration-500 group-hover:rotate-90"
        />
        <span className="absolute -right-px -top-px size-1 bg-signal" />
      </span>
      <span className="leading-none">
        <span className="block font-mono text-[12px] font-medium text-frost">
          {t.common.brand}
        </span>
        <span className="mt-1.5 hidden text-[10px] text-mist/65 sm:block">
          {t.nav.brandSubtitle}
        </span>
      </span>
    </a>
  )
}

export function Navbar() {
  const { t } = useI18n()
  const activeSection = useAppStore((state) => state.activeSection)
  const setActiveSection = useAppStore((state) => state.setActiveSection)
  const toggleTelemetry = useAppStore((state) => state.toggleTelemetry)
  const lenis = useSmoothScroll()
  const playSound = useInterfaceSound()
  const [menuOpen, setMenuOpen] = useState(false)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!menuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  const handleNavigate = (
    event: MouseEvent<HTMLAnchorElement>,
    id: SectionId,
  ) => {
    event.preventDefault()
    setMenuOpen(false)
    setActiveSection(id)
    playSound('navigate')

    if (lenis) {
      lenis.scrollTo(`#${id}`, { offset: -76, duration: 1.15 })
      return
    }

    document.getElementById(id)?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.08] bg-[#030507]/95 shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
      <div
        data-scroll-progress-line
        className="pointer-events-none absolute inset-x-0 bottom-[-1px] h-px origin-left bg-signal/35"
        style={{ transform: 'scaleX(0)' }}
      />
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between px-4 max-[359px]:px-3 sm:px-6 md:px-8">
        <BrandMark Icon={Aperture} />

        <nav
          aria-label={t.nav.primaryNavigation}
          className="absolute left-1/2 hidden -translate-x-1/2 items-center min-[1366px]:flex"
        >
          {SHOWROOM_SECTIONS.map((section) => (
            <NavItem
              key={section.id}
              id={section.id}
              label={t.nav.sections[section.id]}
              active={activeSection === section.id}
              onNavigate={handleNavigate}
            />
          ))}
        </nav>

        <div className="flex items-center gap-1.5 max-[359px]:gap-1">
          <VfxPresetSwitcher />
          <CommandPaletteToggle />
          <FpsToggle />
          <div className="max-[359px]:hidden">
            <TelemetryToggle />
          </div>
          <SoundToggle />
          <LanguageSwitcher />
          <div className="hidden sm:block">
            <SoundSpectrum />
          </div>
          <div className="hidden sm:block xl:hidden 2xl:block">
            <ScrollProgressRing />
          </div>
          <button
            type="button"
            title={menuOpen ? t.nav.closeMenu : t.nav.openMenu}
            aria-label={menuOpen ? t.nav.closeMenu : t.nav.openMenu}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
            className="grid size-9 place-items-center border border-white/10 bg-white/[0.025] text-frost transition-colors hover:border-white/25 min-[1366px]:hidden"
          >
            {menuOpen ? (
              <X size={17} strokeWidth={1.7} />
            ) : (
              <Menu size={17} strokeWidth={1.7} />
            )}
          </button>
        </div>
      </div>

      <FpsReadout />

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            id="mobile-navigation"
            aria-label={t.nav.mobileNavigation}
            initial={reducedMotion ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-white/[0.07] bg-[#030507]/98 px-4 py-4 sm:px-6 min-[1366px]:hidden"
          >
            <div className="grid gap-1">
              {SHOWROOM_SECTIONS.map((section, index) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  aria-current={
                    activeSection === section.id ? 'location' : undefined
                  }
                  onClick={(event) => handleNavigate(event, section.id)}
                  className={cn(
                    'flex items-center justify-between border-b border-white/[0.06] py-3.5 text-base transition-colors',
                    activeSection === section.id
                      ? 'text-signal'
                      : 'text-mist hover:text-frost',
                  )}
                >
                  <span>{t.nav.sections[section.id]}</span>
                  <span className="font-mono text-[10px] text-mist/50">
                    0{index + 1}
                  </span>
                </a>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                toggleTelemetry()
                setMenuOpen(false)
              }}
              className="mt-4 hidden h-10 w-full items-center justify-between border border-white/[0.08] bg-white/[0.025] px-3 font-mono text-[10px] text-mist/60 max-[359px]:flex"
            >
              <span className="flex items-center gap-2">
                <Gauge size={12} strokeWidth={1.6} />
                {t.nav.telemetry.open}
              </span>
              <span className="size-1 bg-signal" />
            </button>
            <div className="mt-4 border-t border-white/[0.07] pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[8px] text-mist/45">
                  {t.nav.overdrive.label}
                </span>
                <span className="font-mono text-[8px] text-mist/30">
                  {t.nav.overdrive.title}
                </span>
              </div>
              <VfxPresetSwitcher expanded />
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
