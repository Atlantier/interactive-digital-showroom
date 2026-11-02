import {
  ArrowDown,
  ArrowUpRight,
  Mail,
} from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
  type ReactNode,
} from 'react'
import { Navbar } from './components/layout/Navbar'
import { CommandPalette } from './components/command/CommandPalette'
import { PerformanceQualityNotice } from './components/layout/PerformanceQualityNotice'
import { PerformanceTelemetryHud } from './components/layout/PerformanceTelemetryHud'
import { VfxPresetSweep } from './components/layout/VfxPresetSweep'
import { DeferredSection } from './components/layout/DeferredSection'
import { OpticalTourDirector } from './components/gallery/OpticalTourDirector'
import {
  SmoothScroll,
  useSmoothScroll,
} from './components/layout/SmoothScroll'
import { SceneCanvas } from './components/canvas/SceneCanvas'
import { LocalizedTextRoot } from './components/ui/LocalizedText'
import { SHOWROOM_SECTIONS, type SectionId } from './data/sections'
import { getAccentTheme } from './data/preferences'
import { getVfxPreset } from './data/vfxPresets'
import { useInterfaceSound } from './hooks/useInterfaceSound'
import { usePerformanceTelemetry } from './hooks/usePerformanceTelemetry'
import { useI18n } from './i18n/useI18n'
import { useAppStore } from './store/useAppStore'
import { useGalleryStore } from './store/useGalleryStore'
import { soundEngine } from './utils/soundEngine'

const BentoGrid = lazy(() =>
  import('./components/bento/BentoGrid').then((module) => ({
    default: module.BentoGrid,
  })),
)

const DarkroomInspectorModal = lazy(() =>
  import('./components/gallery/DarkroomInspectorModal').then(
    (module) => ({
      default: module.DarkroomInspectorModal,
    }),
  ),
)

const GallerySection = lazy(() =>
  import('./components/gallery/GallerySection').then((module) => ({
    default: module.GallerySection,
  })),
)

const GallerySharedCanvas = lazy(() =>
  import('./components/gallery/GallerySharedCanvas').then(
    (module) => ({
      default: module.GallerySharedCanvas,
    }),
  ),
)

const ScrollArchitecture3D = lazy(() =>
  import('./components/canvas/ScrollArchitecture3D').then(
    (module) => ({
      default: module.ScrollArchitecture3D,
    }),
  ),
)

const VerletLanyard = lazy(() =>
  import('./components/sandbox/VerletLanyard').then((module) => ({
    default: module.VerletLanyard,
  })),
)

const FabrikCreature = lazy(() =>
  import('./components/sandbox/FabrikCreature').then((module) => ({
    default: module.FabrikCreature,
  })),
)

function ScrollLink({
  target,
  className,
  children,
}: {
  target: SectionId
  className?: string
  children: ReactNode
}) {
  const lenis = useSmoothScroll()
  const playSound = useInterfaceSound()
  const reducedMotion = useReducedMotion()

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    playSound('navigate')

    if (lenis) {
      lenis.scrollTo(`#${target}`, { offset: -76, duration: 1.15 })
      return
    }

    document.getElementById(target)?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  return (
    <a href={`#${target}`} onClick={handleClick} className={className}>
      {children}
    </a>
  )
}

function Hero({
  sectionRef,
}: {
  sectionRef: RefObject<HTMLElement | null>
}) {
  const reducedMotion = useReducedMotion()
  const { t } = useI18n()

  return (
    <section
      ref={sectionRef}
      id="home"
      className="relative flex min-h-[100svh] items-end overflow-hidden"
    >
      <div className="space-grid absolute inset-0 opacity-70" />
      <div className="scanline absolute inset-0 opacity-35" />
      <div className="relative mx-auto w-full max-w-[1600px] px-5 pb-12 pt-32 sm:px-8 sm:pb-16 md:px-12 lg:pb-20">
        <motion.div
          data-hero-content
          initial={reducedMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-[850px]"
        >
          <div
            data-hero-meta
            className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[11px] leading-[1.58] text-mist max-sm:h-[42px] max-sm:items-start max-sm:leading-[1.55] max-[359px]:h-[68px]"
          >
            <span className="flex items-center gap-2 text-signal">
              <span className="status-pulse size-1.5 bg-signal" />
              {t.hero.systemOnline}
            </span>
            <span className="text-white/15">/</span>
            <span>{t.hero.showroom}</span>
            <span className="text-white/15">/</span>
            <span className="text-[var(--text-secondary)]">
              {t.hero.observing}
            </span>
          </div>

          <h1 className="h-[197px] max-w-[800px] text-[50px] font-medium leading-[0.98] text-frost max-[359px]:h-[245px] sm:h-[213px] sm:text-7xl md:h-[377px] md:text-8xl lg:h-[284px] xl:h-[320px] xl:text-[108px]">
            {t.hero.titleLineOne}
            <br />
            {t.hero.titleLineTwo}
          </h1>

          <div
            data-hero-description
            className="mt-8 max-w-xl border-l border-signal/35 pl-5 max-sm:min-h-[112px] sm:mt-10"
          >
            <p className="text-base leading-7 text-mist sm:text-lg sm:leading-8">
              {t.hero.description}
            </p>
          </div>

          <div
            data-hero-actions
            className="mt-8 flex flex-wrap items-center gap-5 max-sm:min-h-[92px] max-sm:flex-col max-sm:items-start max-sm:gap-4 sm:mt-10"
          >
            <ScrollLink
              target="works"
              className="group inline-flex h-11 items-center gap-8 border border-signal/45 bg-signal/[0.06] px-5 text-[11px] text-frost transition-colors hover:border-signal hover:bg-signal/[0.11]"
            >
              {t.hero.primaryCta}
              <ArrowDown
                size={15}
                className="text-signal transition-transform duration-300 group-hover:translate-y-0.5"
              />
            </ScrollLink>
            <ScrollLink
              target="archive"
              className="group inline-flex items-center gap-2 text-[11px] text-[var(--text-secondary)] transition-colors hover:text-frost"
            >
              {t.hero.secondaryCta}
              <ArrowUpRight
                size={14}
                className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </ScrollLink>
          </div>
        </motion.div>

        <div className="pointer-events-none absolute bottom-16 right-12 hidden w-60 border-t border-white/10 pt-3 font-mono text-[11px] text-[var(--text-secondary)] xl:block">
          <div className="mb-2 flex items-center justify-between">
            <span>{t.hero.objectLabel}</span>
            <span className="text-frost">{t.hero.objectValue}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t.hero.pipelineLabel}</span>
            <span className="text-frost">{t.hero.pipelineValue}</span>
          </div>
        </div>

        <div className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 font-mono text-[11px] text-[var(--text-secondary)] sm:flex">
          <span>{t.hero.scrollCue}</span>
          <span className="h-8 w-px overflow-hidden bg-white/10">
            <span className="scroll-cue block h-3 w-px bg-signal" />
          </span>
        </div>
      </div>
    </section>
  )
}

function Works() {
  const { t } = useI18n()

  return (
    <section
      id="works"
      className="relative z-10 border-t border-white/[0.07] bg-void/96"
    >
      <div className="mx-auto max-w-[1600px] px-5 py-20 sm:px-8 sm:py-28 md:px-12 lg:py-32">
        <div className="grid h-[322px] gap-10 border-b border-white/[0.08] pb-14 max-[359px]:h-[388px] sm:h-[292px] md:h-[347px] md:grid-cols-[1fr_1.25fr] md:items-end lg:h-[284px] xl:h-[284px] min-[1440px]:h-[221px]">
          <div>
            <p className="mb-5 font-mono text-[11px] text-signal">
              {t.works.eyebrow}
            </p>
            <h2 className="text-4xl font-medium leading-[1.05] text-frost sm:text-5xl md:text-6xl">
              {t.works.titleLineOne}
              <br />
              {t.works.titleLineTwo}
            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-mist md:justify-self-end md:text-lg md:leading-8">
            {t.works.description}
          </p>
        </div>

        <DeferredSection
          rootMargin="180px 0px"
          minHeight="clamp(860px, 100svh, 1200px)"
          className="mt-10"
        >
          <BentoGrid />
        </DeferredSection>
      </div>
    </section>
  )
}

function Archive() {
  const { t } = useI18n()

  return (
    <section
      id="archive"
      className="relative z-10 overflow-hidden border-t border-white/[0.07] bg-[#05080c]/96"
    >
      <div className="mx-auto grid max-w-[1600px] gap-14 px-5 py-20 sm:px-8 sm:py-28 md:px-12 lg:grid-cols-[1.15fr_1fr] lg:gap-24 lg:py-36">
        <div>
          <p className="mb-5 font-mono text-[11px] text-amber">
            {t.capabilities.eyebrow}
          </p>
          <h2 className="max-w-3xl text-4xl font-medium leading-[1.06] text-frost sm:text-5xl md:text-7xl">
            {t.capabilities.titleLineOne}
            <br />
            {t.capabilities.titleLineTwo}
          </h2>
          <p className="mt-8 max-w-lg text-base leading-7 text-mist sm:text-lg sm:leading-8">
            {t.capabilities.description}
          </p>
        </div>

        <div className="lg:pt-14">
          {t.capabilities.items.map((capability) => (
            <div
              key={capability.index}
              className="grid grid-cols-[36px_1fr] gap-4 border-t border-white/10 py-6 sm:grid-cols-[52px_1fr] sm:gap-6"
            >
              <span className="font-mono text-[11px] text-amber">
                {capability.index}
              </span>
              <div>
                <h3 className="text-lg text-frost sm:text-xl">
                  {capability.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-mist">
                  {capability.description}
                </p>
              </div>
            </div>
          ))}
          <div className="mt-4 flex items-center gap-3 font-mono text-[11px] text-[var(--text-secondary)]">
            <span className="size-1 bg-signal" />
            {t.capabilities.expanding}
          </div>
        </div>
      </div>
    </section>
  )
}

function Contact() {
  const { t } = useI18n()

  return (
    <section
      id="contact"
      className="relative z-10 min-h-[78svh] border-t border-white/[0.07] bg-[#030507]/96"
    >
      <div className="mx-auto flex min-h-[78svh] max-w-[1600px] flex-col justify-between px-5 pb-8 pt-20 sm:px-8 sm:pb-10 sm:pt-28 md:px-12 lg:pt-36">
        <div className="grid min-w-0 gap-14 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0">
            <p className="mb-5 font-mono text-[11px] text-signal">
              {t.contact.eyebrow}
            </p>
            <h2 className="max-w-5xl text-5xl font-medium leading-[0.98] text-frost sm:text-7xl md:text-8xl xl:text-[112px]">
              {t.contact.titleLineOne}
              <br />
              {t.contact.titleLineTwo}
            </h2>
            <p className="mt-8 max-w-lg text-base leading-7 text-mist sm:text-lg sm:leading-8">
              {t.contact.description}
            </p>
          </div>

          <a
            href="mailto:hello@node01.design"
            className="group inline-flex h-12 max-w-full min-w-0 items-center gap-4 border border-amber/40 bg-amber/[0.055] px-4 text-sm text-frost transition-colors hover:border-amber hover:bg-amber/[0.1] sm:gap-10 sm:px-5"
          >
            <Mail size={15} className="text-amber" />
            hello@node01.design
            <ArrowUpRight
              size={15}
              className="text-amber transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </a>
        </div>

        <footer className="mt-24 flex flex-col gap-5 border-t border-white/[0.08] pt-5 font-mono text-[11px] text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between">
          <span>{t.footer.showroomName}</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>{t.footer.framework}</span>
            <span>{t.footer.renderer}</span>
            <span>{t.footer.year}</span>
          </div>
        </footer>
      </div>
    </section>
  )
}

function App() {
  const heroRef = useRef<HTMLElement>(null)
  const [galleryRuntimeReady, setGalleryRuntimeReady] = useState(false)
  const setActiveSection = useAppStore((state) => state.setActiveSection)
  const accentTheme = useAppStore((state) => state.accentTheme)
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const activeExhibitId = useGalleryStore(
    (state) => state.activeExhibitId,
  )

  usePerformanceTelemetry()

  useEffect(
    () => () => {
      soundEngine.dispose()
    },
    [],
  )

  useEffect(() => {
    const theme = getAccentTheme(accentTheme)
    const root = document.documentElement
    root.dataset.accentTheme = accentTheme
    root.style.setProperty('--color-signal', theme.color)
    root.style.setProperty('--theme-accent-rgb', theme.rgb)
  }, [accentTheme])

  useEffect(() => {
    const preset = getVfxPreset(vfxPreset)
    const root = document.documentElement
    root.dataset.vfxPreset = vfxPreset
    root.style.setProperty('--vfx-primary', preset.primary)
    root.style.setProperty('--vfx-secondary', preset.secondary)
    root.style.setProperty('--vfx-tertiary', preset.tertiary)
    root.style.setProperty('--vfx-primary-rgb', preset.primaryRgb)
    root.style.setProperty('--vfx-secondary-rgb', preset.secondaryRgb)
    root.style.setProperty('--vfx-tertiary-rgb', preset.tertiaryRgb)
  }, [vfxPreset])

  useEffect(() => {
    const sectionVisibility = new Map<string, number>()
    const sections = SHOWROOM_SECTIONS.map((section) =>
      document.getElementById(section.id),
    ).filter((section): section is HTMLElement => section !== null)

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          sectionVisibility.set(
            entry.target.id,
            entry.isIntersecting ? entry.intersectionRatio : 0,
          )
        }

        let currentId = ''
        let currentRatio = 0

        for (const [id, ratio] of sectionVisibility) {
          if (ratio > currentRatio) {
            currentId = id
            currentRatio = ratio
          }
        }

        if (currentId) setActiveSection(currentId)
      },
      {
        threshold: [0, 0.15, 0.3, 0.45, 0.6, 0.75],
        rootMargin: '-8% 0px -28% 0px',
      },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [setActiveSection])

  return (
    <LocalizedTextRoot>
      <SmoothScroll>
        <SceneCanvas visibilityRef={heroRef} />
        <OpticalTourDirector />
        <div className="film-grain pointer-events-none fixed inset-0 z-[5]" />
        <VfxPresetSweep />
        <Navbar />
        <CommandPalette />
        <PerformanceQualityNotice />
        <PerformanceTelemetryHud />
        <main className="relative z-10">
          <Hero sectionRef={heroRef} />
          <Works />
          <DeferredSection
            sectionId="gallery"
            rootMargin="500px 0px"
            minHeight="clamp(2600px, 360svh, 4600px)"
            onReady={() => setGalleryRuntimeReady(true)}
          >
            <GallerySection sectionId={null} />
          </DeferredSection>
          <DeferredSection
            sectionId="architecture"
            rootMargin="600px 0px"
            minHeight="300svh"
          >
            <ScrollArchitecture3D sectionId={null} />
          </DeferredSection>
          <DeferredSection
            sectionId="sandbox"
            rootMargin="600px 0px"
            minHeight="clamp(980px, 125svh, 1320px)"
          >
            <VerletLanyard sectionId={null} />
          </DeferredSection>
          <DeferredSection
            sectionId="kinetics"
            rootMargin="600px 0px"
            minHeight="clamp(1040px, 135svh, 1400px)"
          >
            <FabrikCreature sectionId={null} />
          </DeferredSection>
          <Archive />
          <Contact />
        </main>
        {galleryRuntimeReady ? (
          <>
            <Suspense fallback={null}>
              <GallerySharedCanvas />
            </Suspense>
            {activeExhibitId ? (
              <Suspense fallback={null}>
                <DarkroomInspectorModal />
              </Suspense>
            ) : null}
          </>
        ) : null}
      </SmoothScroll>
    </LocalizedTextRoot>
  )
}

export default App
