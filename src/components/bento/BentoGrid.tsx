import {
  Activity,
  Box,
  CircleDot,
  Pause,
  Play,
  Radio,
  Waypoints,
} from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from 'react'
import { useInViewAnimation } from '../../hooks/useInViewAnimation'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import {
  formatTranslation,
  useI18n,
} from '../../i18n/useI18n'
import { cn } from '../../lib/cn'
import { BentoDataPulse } from './BentoDataPulse'
import { SpotlightCard } from './SpotlightCard'

const GLOW_RANGE = 180

type TopologyMode = 'edge' | 'vector' | 'agent'

const topologyModes: Record<
  TopologyMode,
  {
    nodes: Array<[number, number]>
    links: Array<[number, number]>
  }
> = {
  edge: {
    nodes: [
      [34, 83],
      [96, 36],
      [96, 130],
      [176, 83],
      [238, 36],
      [238, 130],
    ],
    links: [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
      [3, 4],
      [3, 5],
    ],
  },
  vector: {
    nodes: [
      [34, 83],
      [104, 40],
      [104, 126],
      [170, 83],
      [242, 53],
      [242, 113],
    ],
    links: [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
      [3, 4],
      [3, 5],
      [4, 5],
    ],
  },
  agent: {
    nodes: [
      [30, 42],
      [30, 122],
      [102, 82],
      [176, 42],
      [176, 122],
      [246, 82],
    ],
    links: [
      [0, 2],
      [1, 2],
      [2, 3],
      [2, 4],
      [3, 5],
      [4, 5],
    ],
  },
}

type TerminalCommand = 'help' | 'skills' | 'matrix' | 'clear'

interface TerminalResponse {
  art: string
  gradient: string
}

const terminalArtwork: Record<TerminalCommand, TerminalResponse> = {
  help: {
    art: String.raw`
 _   _ ______ _      ____
| | | |  ____| |    |  _ \
| |_| | |__  | |    | |_) |
|  _  |  __| | |    |  __/
|_| |_|_|    |_____ |_|
`,
    gradient:
      'linear-gradient(120deg, var(--vfx-primary), var(--vfx-tertiary) 52%, var(--vfx-secondary))',
  },
  skills: {
    art: String.raw`
 ____  _  _____ _     _     ____
/ ___|| |/ /_ _| |   | |   / ___|
\___ \| ' / | || |   | |   \___ \
 ___) | . \ | || |___| |___ ___) |
|____/|_|\_\___|_____|_____|____/
`,
    gradient:
      'linear-gradient(120deg, var(--vfx-primary), var(--vfx-tertiary) 72%)',
  },
  matrix: {
    art: String.raw`
 __  __    _    _____ _____ ____ __   __
|  \/  |  / \  |_   _| ____|  _ \\ \ / /
| |\/| | / _ \   | | |  _| | |_) |\ V /
| |  | |/ ___ \  | | | |___|  _ <  | |
|_|  |_/_/   \_\ |_| |_____|_| \_\ |_|
`,
    gradient:
      'linear-gradient(120deg, var(--vfx-primary), var(--vfx-tertiary) 48%, var(--vfx-secondary))',
  },
  clear: {
    art: String.raw`
  ____ _     _____    _    ____
 / ___| |   | ____|  / \  |  _ \
| |   | |   |  _|   / _ \ | |_) |
| |___| |___| |___ / ___ \|  _ <
 \____|_____|_____/_/   \_\_| \_\
`,
    gradient:
      'linear-gradient(120deg, var(--vfx-primary), var(--vfx-secondary) 52%, var(--vfx-tertiary))',
  },
}

interface TerminalHistoryItem {
  id: number
  command: string
  response: TerminalCommand | null
}

function CardHeader({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Activity
  title: string
  detail: string
}) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center gap-2 font-mono text-[11px] text-signal">
        <Icon size={13} strokeWidth={1.7} />
        <span data-localized-motion className="min-w-0 truncate">
          {detail}
        </span>
      </div>
      <h3 className="break-words text-xl text-frost sm:text-2xl">
        {title}
      </h3>
    </div>
  )
}

function buildLinePath(values: number[], width: number, height: number) {
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = Math.max(1, max - min)

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width
      const y = height - ((value - min) / range) * (height - 24) - 12
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function TokenThroughputCard({ active }: { active: boolean }) {
  const { t } = useI18n()
  const [series, setSeries] = useState(() =>
    Array.from({ length: 28 }, (_, index) =>
      Math.round(11200 + Math.sin(index * 0.62) * 1350 + Math.random() * 900),
    ),
  )

  useEffect(() => {
    if (!active) return
    const interval = window.setInterval(() => {
      setSeries((current) => {
        const latest = current[current.length - 1]
        const next = Math.max(
          8200,
          Math.min(16200, latest + (Math.random() - 0.44) * 1250),
        )
        return [...current.slice(1), Math.round(next)]
      })
    }, 1100)

    return () => window.clearInterval(interval)
  }, [active])

  const current = series[series.length - 1]
  const previous = series[series.length - 2]
  const delta = ((current - previous) / previous) * 100
  const linePath = useMemo(() => buildLinePath(series, 480, 150), [series])
  const areaPath = `${linePath} L 480 150 L 0 150 Z`

  return (
    <SpotlightCard className="h-[430px] max-[359px]:h-[440px] md:col-span-2 md:h-auto md:min-h-0 xl:col-span-2 xl:row-span-2">
      <div className="flex h-full flex-col p-5 sm:p-6">
        <CardHeader
          icon={Activity}
          title={t.bento.tokenThroughput.title}
          detail={t.bento.tokenThroughput.detail}
        />

        <div className="mt-7 flex items-end justify-between gap-4">
          <div>
            <p
              data-token-throughput
              className="font-mono text-4xl text-frost sm:text-5xl"
            >
              {current.toLocaleString('en-US')}
            </p>
            <p className="mt-2 font-mono text-[11px] text-[var(--text-secondary)]">
              {t.bento.tokenThroughput.tokensPerSecond}
            </p>
          </div>
          <span
            className={cn(
              'mb-1 font-mono text-[11px]',
              delta >= 0 ? 'text-signal' : 'text-amber',
            )}
          >
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
        </div>

        <div className="relative mt-5 min-h-[150px] flex-1 overflow-hidden border-y border-white/[0.07]">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(255,255,255,0.035)_25%,transparent_26%,transparent_49%,rgba(255,255,255,0.035)_50%,transparent_51%,transparent_74%,rgba(255,255,255,0.035)_75%,transparent_76%)]" />
          <svg
            viewBox="0 0 480 150"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-label={t.bento.tokenThroughput.chartAria}
            role="img"
          >
            <defs>
              <linearGradient id="token-area" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-signal)"
                  stopOpacity="0.3"
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-signal)"
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#token-area)" />
            <path
              d={linePath}
              fill="none"
              stroke="var(--color-signal)"
              strokeWidth="1.8"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="absolute bottom-2 left-0 flex w-full justify-between font-mono text-[11px] text-[var(--text-secondary)]">
            <span>{t.bento.tokenThroughput.timelinePast}</span>
            <span>{t.bento.tokenThroughput.timelineMid}</span>
            <span>{t.bento.tokenThroughput.timelineNow}</span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {t.bento.tokenThroughput.metrics.map(({ label, value }) => (
            <div
              key={label}
              className="border-l border-white/10 pl-3 font-mono"
            >
              <p className="text-[11px] text-[var(--text-secondary)]">{label}</p>
              <p className="mt-1 text-[12px] text-frost">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </SpotlightCard>
  )
}

function TopologyCard() {
  const { t } = useI18n()
  const [mode, setMode] = useState<TopologyMode>('edge')
  const topology = topologyModes[mode]
  const topologyCopy = t.bento.topology.modes[mode]

  return (
    <SpotlightCard className="max-md:min-h-[247px]">
      <div className="flex h-full flex-col p-5">
        <CardHeader
          icon={Waypoints}
          title={t.bento.topology.title}
          detail={t.bento.topology.detail}
        />

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-sm border border-white/[0.07] bg-black/20 p-1">
          {(Object.keys(topologyModes) as TopologyMode[]).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
              className={cn(
                'h-9 rounded-[3px] font-mono text-[11px] transition-colors',
                mode === item
                  ? 'bg-signal/10 text-signal'
                  : 'text-[var(--text-secondary)] hover:text-frost',
              )}
            >
              {t.bento.topology.modes[item].label}
            </button>
          ))}
        </div>

        <div className="relative mt-3 min-h-0 flex-1">
          <svg
            viewBox="0 0 280 168"
            className="absolute inset-0 h-full w-full"
            aria-label={formatTranslation(
              t.bento.topology.chartAria,
              {
                mode: topologyCopy.label,
                detail: topologyCopy.detail,
              },
            )}
            role="img"
          >
            {topology.links.map(([from, to]) => {
              const [x1, y1] = topology.nodes[from]
              const [x2, y2] = topology.nodes[to]
              return (
                <motion.line
                  key={`${mode}-${from}-${to}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="var(--color-signal)"
                  strokeOpacity="0.32"
                  strokeWidth="0.8"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.45 }}
                />
              )
            })}
            {topology.nodes.map(([x, y], index) => (
              <g key={`${mode}-${x}-${y}`}>
                <motion.circle
                  cx={x}
                  cy={y}
                  r="12"
                  fill="var(--color-signal)"
                  fillOpacity="0.05"
                  stroke="var(--color-signal)"
                  strokeOpacity={index === topology.nodes.length - 1 ? 0.8 : 0.25}
                  initial={{ scale: 0.75, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.05, duration: 0.3 }}
                />
                <circle
                  cx={x}
                  cy={y}
                  r="2"
                  fill="var(--color-signal)"
                />
              </g>
            ))}
          </svg>
          <div className="absolute bottom-0 right-0 flex items-center gap-2 font-mono text-[11px] text-[var(--text-secondary)]">
            <span className="size-1 bg-signal" />
            {topologyCopy.detail}
          </div>
        </div>
      </div>
    </SpotlightCard>
  )
}

function TerminalCard() {
  const { t } = useI18n()
  const reducedMotion = useReducedMotion()
  const playSound = useInterfaceSound()
  const terminalCopy = t.bento.terminal
  const terminalLines = terminalCopy.bootLines
  const outputRef = useRef<HTMLDivElement>(null)
  const commandIdRef = useRef(0)
  const [running, setRunning] = useState(true)
  const [lineIndex, setLineIndex] = useState(0)
  const [characterIndex, setCharacterIndex] = useState(0)
  const [commandInput, setCommandInput] = useState('')
  const [history, setHistory] = useState<TerminalHistoryItem[]>([])
  const [bootCleared, setBootCleared] = useState(false)
  const bootComplete =
    reducedMotion ||
    (lineIndex === terminalLines.length - 1 &&
      characterIndex >= terminalLines[terminalLines.length - 1].length)

  useEffect(() => {
    if (!running || reducedMotion) return
    const line = terminalLines[lineIndex]

    if (characterIndex < line.length) {
      const timer = window.setTimeout(
        () => setCharacterIndex((value) => value + 1),
        30,
      )
      return () => window.clearTimeout(timer)
    }

    if (lineIndex === terminalLines.length - 1) {
      setRunning(false)
      return
    }

    const timer = window.setTimeout(() => {
      setLineIndex((value) => value + 1)
      setCharacterIndex(0)
    }, 520)
    return () => window.clearTimeout(timer)
  }, [
    characterIndex,
    lineIndex,
    reducedMotion,
    running,
    terminalLines,
  ])

  useEffect(() => {
    const output = outputRef.current
    if (!output) return
    output.scrollTop = output.scrollHeight
  }, [bootCleared, characterIndex, history, lineIndex])

  const handleCommand = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const command = commandInput.trim().toLowerCase()
    if (!command) return

    setCommandInput('')
    setBootCleared(true)

    if (command === 'clear') {
      setHistory([
        {
          id: commandIdRef.current++,
          command,
          response: 'clear',
        },
      ])
      playSound('toggle')
      return
    }

    const response = command in terminalArtwork
      ? (command as TerminalCommand)
      : null

    setHistory((current) =>
      [
        ...current,
        {
          id: commandIdRef.current++,
          command,
          response,
        },
      ].slice(-6),
    )
    playSound(response ? 'navigate' : 'toggle')
  }

  const toggleAnimation = () => {
    if (bootComplete) {
      setBootCleared(false)
      setLineIndex(0)
      setCharacterIndex(0)
      setRunning(true)
      return
    }
    setRunning((value) => !value)
  }

  return (
    <SpotlightCard className="max-md:h-[265px]">
      <div className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <CardHeader
            icon={CircleDot}
            title={terminalCopy.title}
            detail={terminalCopy.detail}
          />
          <button
            type="button"
            aria-label={
              bootComplete
                ? terminalCopy.replay
                : running
                  ? terminalCopy.pause
                  : terminalCopy.resume
            }
            aria-pressed={!running}
            onClick={toggleAnimation}
            className="grid size-7 shrink-0 place-items-center rounded-sm border border-white/10 text-[var(--text-secondary)] transition-colors hover:border-white/20 hover:text-frost"
          >
            {running && !bootComplete ? (
              <Pause size={12} strokeWidth={1.8} />
            ) : (
              <Play size={12} strokeWidth={1.8} />
            )}
          </button>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-white/[0.07] bg-black/40 font-mono text-[11px]">
          <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-2">
            <span className="size-1.5 rounded-full bg-[#ff6b6b]/70" />
            <span className="size-1.5 rounded-full bg-amber/70" />
            <span className="size-1.5 rounded-full bg-signal/70" />
            <span className="ml-auto text-[11px] text-[var(--text-secondary)]">
              {terminalCopy.fileName}
            </span>
          </div>

          <div
            ref={outputRef}
            className="terminal-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-2 leading-4"
          >
            {!bootCleared && (
              <div className="space-y-0.5 text-[var(--text-secondary)]">
                {terminalLines.map((line, index) => {
                  if (!reducedMotion && index > lineIndex) return null

                  const content =
                    reducedMotion || index < lineIndex
                      ? line
                      : line.slice(0, characterIndex)

                  return (
                    <p key={line} className={cn(index === 0 && 'text-signal')}>
                      {content}
                      {!reducedMotion &&
                        index === lineIndex &&
                        running &&
                        characterIndex < line.length && (
                          <span className="terminal-cursor ml-0.5 inline-block h-2.5 w-1 bg-signal align-middle" />
                        )}
                    </p>
                  )
                })}
              </div>
            )}

            {history.length > 0 && (
              <div
                className="mt-2 space-y-2"
                aria-live="polite"
                aria-label={terminalCopy.outputAria}
              >
                {history.slice(-1).map((entry) => {
                  const response = entry.response
                    ? {
                        ...terminalArtwork[entry.response],
                        ...terminalCopy.responses[entry.response],
                      }
                    : null

                  return (
                    <div key={entry.id}>
                      <p className="text-signal">$ {entry.command}</p>
                      {response ? (
                        <>
                          <pre
                            aria-hidden="true"
                            className="terminal-ascii terminal-scrollbar mt-1 overflow-x-auto pb-1 text-[8px] leading-[1.1]"
                            style={{
                              backgroundImage: response.gradient,
                              backgroundClip: 'text',
                              WebkitBackgroundClip: 'text',
                              color: 'transparent',
                            }}
                          >
                            {response.art.trim()}
                          </pre>
                          <p className="mt-1 text-[12px] text-[var(--text-primary)]">
                            {response.description}
                          </p>
                          <p className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">
                            {response.notes.join(' / ')}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1 text-[11px] text-red-300">
                          {terminalCopy.unknownCommand}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <form
            onSubmit={handleCommand}
            className="flex h-8 shrink-0 items-center gap-1.5 border-t border-white/[0.07] bg-white/[0.018] px-3"
          >
            <span className="text-signal">$</span>
            <input
              value={commandInput}
              onChange={(event) => setCommandInput(event.target.value)}
              aria-label={terminalCopy.inputAria}
              placeholder={terminalCopy.commandPlaceholder}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-[11px] text-frost outline-none placeholder:text-[var(--text-tertiary)]"
            />
          </form>
        </div>
      </div>
    </SpotlightCard>
  )
}

function TelemetryCard({ active }: { active: boolean }) {
  const { t } = useI18n()
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    if (!active) return
    const interval = window.setInterval(() => {
      setPulse((value) => (value + 1) % 4)
    }, 1400)
    return () => window.clearInterval(interval)
  }, [active])

  const bars = [42, 68, 54, 86, 61, 76, 48, 92, 58, 72]

  return (
    <SpotlightCard className="max-md:min-h-[247px]">
      <div className="flex h-full flex-col p-5">
        <CardHeader
          icon={Radio}
          title={t.bento.telemetry.title}
          detail={t.bento.telemetry.detail}
        />

        <div className="mt-5 flex flex-1 items-end gap-1.5">
          {bars.map((height, index) => (
            <motion.span
              key={`${height}-${index}`}
              className={cn(
                'min-h-2 flex-1 rounded-t-[1px]',
                index === pulse ? 'bg-signal' : 'bg-signal/20',
              )}
              animate={{
                height: `${index === pulse ? Math.max(28, height) : height * 0.55}%`,
              }}
              transition={{ type: 'spring', stiffness: 220, damping: 22 }}
            />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-3 font-mono">
          {t.bento.telemetry.metrics.map(({ label, value }) => (
            <div key={label}>
              <p className="text-[11px] text-[var(--text-secondary)]">{label}</p>
              <p className="mt-1 text-[12px] text-frost">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </SpotlightCard>
  )
}

function ArchiveCard({ active }: { active: boolean }) {
  const { t } = useI18n()

  return (
    <SpotlightCard className="max-md:min-h-[247px]">
      <div className="flex h-full flex-col p-5">
        <CardHeader
          icon={Box}
          title={t.bento.archive.title}
          detail={t.bento.archive.detail}
        />

        <div className="relative mt-5 flex flex-1 items-center justify-center">
          <div className="absolute size-24 rounded-full border border-white/[0.07]" />
          <div className="absolute size-16 rounded-full border border-signal/15" />
          <motion.div
            className="absolute size-24"
            animate={{ rotate: active ? 360 : 0 }}
            transition={
              active
                ? {
                    duration: 18,
                    ease: 'linear',
                    repeat: Infinity,
                  }
                : { duration: 0 }
            }
          >
            <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rounded-full bg-signal shadow-[0_0_12px_rgba(114,230,255,0.8)]" />
            <span className="absolute bottom-2 right-1 size-1 rounded-full bg-amber/80" />
          </motion.div>
          <span className="font-mono text-2xl text-frost">12</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {t.bento.archive.tags.map((tag) => (
            <span
              key={tag}
              className="border border-white/[0.08] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </SpotlightCard>
  )
}

export function BentoGrid() {
  const playSound = useInterfaceSound()
  const gridRef = useRef<HTMLDivElement>(null)
  const gridInView = useInViewAnimation(gridRef, {
    rootMargin: '160px',
  })
  const pointerRef = useRef({ x: 0, y: 0 })
  const frameRef = useRef(0)
  const hoveredCardRef = useRef<Element | null>(null)
  const [pulseEvent, setPulseEvent] = useState({
    id: 0,
    sourceIndex: -1,
  })

  const updateSpotlights = () => {
    frameRef.current = 0
    const grid = gridRef.current
    if (!grid) return

    const cards = grid.querySelectorAll<HTMLElement>('[data-spotlight-card]')
    for (const card of cards) {
      const bounds = card.getBoundingClientRect()
      const distanceX = Math.max(
        bounds.left - pointerRef.current.x,
        0,
        pointerRef.current.x - bounds.right,
      )
      const distanceY = Math.max(
        bounds.top - pointerRef.current.y,
        0,
        pointerRef.current.y - bounds.bottom,
      )
      const distance = Math.hypot(distanceX, distanceY)
      const proximity = Math.max(0, 1 - distance / GLOW_RANGE)
      const isInside =
        pointerRef.current.x >= bounds.left &&
        pointerRef.current.x <= bounds.right &&
        pointerRef.current.y >= bounds.top &&
        pointerRef.current.y <= bounds.bottom

      card.style.setProperty(
        '--mouse-x',
        `${pointerRef.current.x - bounds.left}px`,
      )
      card.style.setProperty(
        '--mouse-y',
        `${pointerRef.current.y - bounds.top}px`,
      )
      card.style.setProperty(
        '--border-glow-opacity',
        String(proximity * 0.92),
      )
      card.style.setProperty(
        '--surface-glare-opacity',
        String(isInside ? 0.5 : proximity * 0.08),
      )
    }
  }

  const scheduleSpotlight = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return
    pointerRef.current.x = event.clientX
    pointerRef.current.y = event.clientY
    const hoveredCard =
      event.target instanceof Element
        ? event.target.closest('[data-spotlight-card]')
        : null
    if (hoveredCard !== hoveredCardRef.current) {
      hoveredCardRef.current = hoveredCard
      if (hoveredCard) playSound('hover')
    }
    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(updateSpotlights)
    }
  }

  const clearSpotlights = () => {
    hoveredCardRef.current = null
    const grid = gridRef.current
    if (!grid) return
    grid
      .querySelectorAll<HTMLElement>('[data-spotlight-card]')
      .forEach((card) => {
        card.style.setProperty('--border-glow-opacity', '0')
        card.style.setProperty('--surface-glare-opacity', '0')
      })
  }

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!gridInView) return

    const timer = window.setInterval(() => {
      setPulseEvent((current) => ({
        id: current.id + 1,
        sourceIndex: -1,
      }))
    }, 4_000)

    return () => window.clearInterval(timer)
  }, [gridInView])

  return (
    <div
      ref={gridRef}
      data-bento-grid
      data-bento-in-view={gridInView ? 'true' : 'false'}
      onPointerMove={scheduleSpotlight}
      onPointerLeave={clearSpotlights}
      onClick={(event) => {
        if (event.target instanceof Element) {
          const card = event.target.closest<HTMLElement>(
            '[data-spotlight-card]',
          )
          if (!card) return

          const cards = Array.from(
            gridRef.current?.querySelectorAll<HTMLElement>(
              '[data-spotlight-card]',
            ) ?? [],
          )
          const sourceIndex = cards.indexOf(card)
          setPulseEvent((current) => ({
            id: current.id + 1,
            sourceIndex,
          }))
          playSound('navigate')
        }
      }}
      className="relative isolate mt-10 grid auto-rows-[minmax(240px,auto)] grid-cols-1 gap-3 max-md:auto-rows-auto max-md:gap-4 md:grid-cols-2 md:auto-rows-[250px] xl:mt-14 xl:auto-rows-[250px] xl:grid-cols-4"
    >
      <TokenThroughputCard active={gridInView} />
      <TopologyCard />
      <TerminalCard />
      <TelemetryCard active={gridInView} />
      <ArchiveCard active={gridInView} />
      <BentoDataPulse
        gridRef={gridRef}
        pulseId={pulseEvent.id}
        sourceIndex={pulseEvent.sourceIndex}
      />
    </div>
  )
}
