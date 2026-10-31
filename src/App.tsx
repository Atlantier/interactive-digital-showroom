import {
  ArrowDown,
  ArrowUpRight,
  Mail,
} from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  useEffect,
  useRef,
  type MouseEvent,
  type RefObject,
  type ReactNode,
} from 'react'
import { Navbar } from './components/layout/Navbar'
import { CommandPalette } from './components/command/CommandPalette'
import { PerformanceQualityNotice } from './components/layout/PerformanceQualityNotice'
import { PerformanceTelemetryHud } from './components/layout/PerformanceTelemetryHud'
import { VfxPresetSweep } from './components/layout/VfxPresetSweep'
import { BentoGrid } from './components/bento/BentoGrid'
import {
  SmoothScroll,
  useSmoothScroll,
} from './components/layout/SmoothScroll'
import { SceneCanvas } from './components/canvas/SceneCanvas'
import { ScrollArchitecture3D } from './components/canvas/ScrollArchitecture3D'
import { FabrikCreature } from './components/sandbox/FabrikCreature'
import { VerletLanyard } from './components/sandbox/VerletLanyard'
import { SHOWROOM_SECTIONS, type SectionId } from './data/sections'
import { getAccentTheme } from './data/preferences'
import { getVfxPreset } from './data/vfxPresets'
import { useInterfaceSound } from './hooks/useInterfaceSound'
import { usePerformanceTelemetry } from './hooks/usePerformanceTelemetry'
import { useAppStore } from './store/useAppStore'

const capabilities = [
  {
    index: '01',
    title: '视觉工程',
    description: 'WebGL、着色器、实时合成与性能预算。',
  },
  {
    index: '02',
    title: '交互设计',
    description: '空间反馈、动效系统与清晰的操作路径。',
  },
  {
    index: '03',
    title: '前端架构',
    description: 'React、TypeScript 与可持续演进的组件边界。',
  },
] as const

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
          initial={reducedMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-[850px]"
        >
          <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[11px] text-mist">
            <span className="flex items-center gap-2 text-signal">
              <span className="status-pulse size-1.5 bg-signal" />
              系统在线
            </span>
            <span className="text-white/15">/</span>
            <span>个人数字展厅</span>
            <span className="text-white/15">/</span>
            <span className="text-mist/65">实时观测中</span>
          </div>

          <h1 className="max-w-[800px] text-[50px] font-medium leading-[0.98] text-frost sm:text-7xl md:text-8xl xl:text-[108px]">
            让作品，
            <br />
            在深空中显形。
          </h1>

          <div className="mt-8 max-w-xl border-l border-signal/35 pl-5 sm:mt-10">
            <p className="text-base leading-7 text-mist sm:text-lg sm:leading-8">
              一个持续生长的个人数字展厅，收录交互实验、视觉系统与实时图形作品。
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-5 sm:mt-10">
            <ScrollLink
              target="works"
              className="group inline-flex h-11 items-center gap-8 border border-signal/45 bg-signal/[0.06] px-5 text-sm text-frost transition-colors hover:border-signal hover:bg-signal/[0.11]"
            >
              进入作品轨道
              <ArrowDown
                size={15}
                className="text-signal transition-transform duration-300 group-hover:translate-y-0.5"
              />
            </ScrollLink>
            <ScrollLink
              target="archive"
              className="group inline-flex items-center gap-2 text-sm text-mist transition-colors hover:text-frost"
            >
              查看能力档案
              <ArrowUpRight
                size={14}
                className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </ScrollLink>
          </div>
        </motion.div>

        <div className="pointer-events-none absolute bottom-16 right-12 hidden w-60 border-t border-white/10 pt-3 font-mono text-[10px] text-mist/65 xl:block">
          <div className="mb-2 flex items-center justify-between">
            <span>观测对象</span>
            <span className="text-frost">记忆核心 / 01</span>
          </div>
          <div className="flex items-center justify-between">
            <span>渲染管线</span>
            <span className="text-frost">WebGL / R3F</span>
          </div>
        </div>

        <div className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 font-mono text-[9px] text-mist/50 sm:flex">
          <span>向下探索</span>
          <span className="h-8 w-px overflow-hidden bg-white/10">
            <span className="scroll-cue block h-3 w-px bg-signal" />
          </span>
        </div>
      </div>
    </section>
  )
}

function Works() {
  return (
    <section
      id="works"
      className="relative z-10 border-t border-white/[0.07] bg-void/88 backdrop-blur-[2px]"
    >
      <div className="mx-auto max-w-[1600px] px-5 py-20 sm:px-8 sm:py-28 md:px-12 lg:py-32">
        <div className="grid gap-10 border-b border-white/[0.08] pb-14 md:grid-cols-[1fr_1.25fr] md:items-end">
          <div>
            <p className="mb-5 font-mono text-[11px] text-signal">项目预览</p>
            <h2 className="text-4xl font-medium leading-[1.05] text-frost sm:text-5xl md:text-6xl">
              作品是
              <br />
              接口的一种。
            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-mist md:justify-self-end md:text-lg md:leading-8">
            这里保留正在发生的研究与实验。每个项目都是一次对媒介边界的探测，也是进入展厅的下一层入口。
          </p>
        </div>

        <BentoGrid />
      </div>
    </section>
  )
}

function Archive() {
  return (
    <section
      id="archive"
      className="relative z-10 overflow-hidden border-t border-white/[0.07] bg-[#05080c]/88 backdrop-blur-[2px]"
    >
      <div className="mx-auto grid max-w-[1600px] gap-14 px-5 py-20 sm:px-8 sm:py-28 md:px-12 lg:grid-cols-[1.15fr_1fr] lg:gap-24 lg:py-36">
        <div>
          <p className="mb-5 font-mono text-[11px] text-amber">能力档案</p>
          <h2 className="max-w-3xl text-4xl font-medium leading-[1.06] text-frost sm:text-5xl md:text-7xl">
            从界面到空间，
            <br />
            保持同一种清晰。
          </h2>
          <p className="mt-8 max-w-lg text-base leading-7 text-mist sm:text-lg sm:leading-8">
            技术负责想象力落地，设计负责让每一次移动都有理由。两者在同一个系统里工作。
          </p>
        </div>

        <div className="lg:pt-14">
          {capabilities.map((capability) => (
            <div
              key={capability.index}
              className="grid grid-cols-[36px_1fr] gap-4 border-t border-white/10 py-6 sm:grid-cols-[52px_1fr] sm:gap-6"
            >
              <span className="font-mono text-[10px] text-amber/70">
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
          <div className="mt-4 flex items-center gap-3 font-mono text-[10px] text-mist/55">
            <span className="size-1 bg-signal" />
            持续扩展中
          </div>
        </div>
      </div>
    </section>
  )
}

function Contact() {
  return (
    <section
      id="contact"
      className="relative z-10 min-h-[78svh] border-t border-white/[0.07] bg-[#030507]/91 backdrop-blur-[1px]"
    >
      <div className="mx-auto flex min-h-[78svh] max-w-[1600px] flex-col justify-between px-5 pb-8 pt-20 sm:px-8 sm:pb-10 sm:pt-28 md:px-12 lg:pt-36">
        <div className="grid gap-14 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="mb-5 font-mono text-[11px] text-signal">连接通道</p>
            <h2 className="max-w-5xl text-5xl font-medium leading-[0.98] text-frost sm:text-7xl md:text-8xl xl:text-[112px]">
              下一种可能，
              <br />
              从这里开始。
            </h2>
            <p className="mt-8 max-w-lg text-base leading-7 text-mist sm:text-lg sm:leading-8">
              如果你正在构建新的数字体验、空间叙事或实时视觉系统，欢迎发来信号。
            </p>
          </div>

          <a
            href="mailto:hello@node01.design"
            className="group inline-flex h-12 w-fit items-center gap-10 border border-amber/40 bg-amber/[0.055] px-5 text-sm text-frost transition-colors hover:border-amber hover:bg-amber/[0.1]"
          >
            <Mail size={15} className="text-amber" />
            hello@node01.design
            <ArrowUpRight
              size={15}
              className="text-amber transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </a>
        </div>

        <footer className="mt-24 flex flex-col gap-5 border-t border-white/[0.08] pt-5 font-mono text-[10px] text-mist/45 sm:flex-row sm:items-center sm:justify-between">
          <span>NODE/01 个人数字展厅</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>Vite + React 19</span>
            <span>WebGL / R3F</span>
            <span>2026</span>
          </div>
        </footer>
      </div>
    </section>
  )
}

function App() {
  const heroRef = useRef<HTMLElement>(null)
  const setActiveSection = useAppStore((state) => state.setActiveSection)
  const accentTheme = useAppStore((state) => state.accentTheme)
  const vfxPreset = useAppStore((state) => state.vfxPreset)

  usePerformanceTelemetry()

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
    <SmoothScroll>
      <SceneCanvas visibilityRef={heroRef} />
      <div className="film-grain pointer-events-none fixed inset-0 z-[5]" />
      <VfxPresetSweep />
      <Navbar />
      <CommandPalette />
      <PerformanceQualityNotice />
      <PerformanceTelemetryHud />
      <main className="relative z-10">
        <Hero sectionRef={heroRef} />
        <Works />
        <ScrollArchitecture3D />
        <VerletLanyard />
        <FabrikCreature />
        <Archive />
        <Contact />
      </main>
    </SmoothScroll>
  )
}

export default App
