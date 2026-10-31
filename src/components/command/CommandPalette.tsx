import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Command,
  Copy,
  Download,
  Gauge,
  Hash,
  Palette,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ACCENT_THEMES,
  GRAVITY_MODES,
} from '../../data/preferences'
import {
  SHOWROOM_SECTIONS,
  type SectionId,
} from '../../data/sections'
import { useInterfaceSound } from '../../hooks/useInterfaceSound'
import { cn } from '../../lib/cn'
import { useAppStore } from '../../store/useAppStore'
import { useSmoothScroll } from '../layout/SmoothScroll'

type CommandGroup = '章节跳转' | '物理环境' | '主题强调色' | '工具'

interface PaletteCommand {
  id: string
  group: CommandGroup
  title: string
  subtitle: string
  keywords: readonly string[]
  icon: LucideIcon
  swatch?: string
  active?: boolean
  run: () => void | Promise<void>
}

const EMAIL = 'hello@node01.design'
const GROUP_ORDER: readonly CommandGroup[] = [
  '章节跳转',
  '物理环境',
  '主题强调色',
  '工具',
]

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, '')
}

function fuzzyScore(query: string, command: PaletteCommand) {
  const needle = normalizeSearch(query)
  if (!needle) return 1

  const title = normalizeSearch(command.title)
  const haystack = normalizeSearch(
    [
      command.title,
      command.subtitle,
      command.group,
      ...command.keywords,
    ].join(' '),
  )

  if (title === needle) return 1_000
  if (title.startsWith(needle)) return 850 - title.length
  if (title.includes(needle)) return 720 - title.indexOf(needle)
  if (haystack.includes(needle)) return 560 - haystack.indexOf(needle)

  let queryIndex = 0
  let previousMatch = -1
  let gapPenalty = 0
  for (let index = 0; index < title.length; index += 1) {
    if (title[index] !== needle[queryIndex]) continue
    if (previousMatch >= 0) gapPenalty += index - previousMatch - 1
    previousMatch = index
    queryIndex += 1
    if (queryIndex === needle.length) {
      return Math.max(1, 420 - gapPenalty)
    }
  }

  return 0
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Fall through to the legacy selection path when permissions reject it.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Clipboard unavailable')
}

function downloadResumeJson() {
  const state = useAppStore.getState()
  const payload = {
    schema: 'node01.resume.v1',
    generatedAt: new Date().toISOString(),
    profile: {
      name: 'NODE/01',
      role: 'Creative Engineer / Interactive Systems',
      email: EMAIL,
      location: 'Shanghai, China',
    },
    capabilities: [
      'Realtime WebGL / R3F',
      'React architecture',
      'Creative interaction design',
      'Physics and procedural systems',
      'AI-native product engineering',
    ],
    preferences: {
      accentTheme: state.accentTheme,
      gravityMode: state.gravityMode,
    },
    links: {
      showroom: window.location.href,
    },
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'node01-resume.json'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function CommandPalette() {
  const open = useAppStore((state) => state.commandPaletteOpen)
  const setOpen = useAppStore((state) => state.setCommandPaletteOpen)
  const activeSection = useAppStore((state) => state.activeSection)
  const accentTheme = useAppStore((state) => state.accentTheme)
  const gravityMode = useAppStore((state) => state.gravityMode)
  const setActiveSection = useAppStore((state) => state.setActiveSection)
  const setAccentTheme = useAppStore((state) => state.setAccentTheme)
  const setGravityMode = useAppStore((state) => state.setGravityMode)
  const lenis = useSmoothScroll()
  const playSound = useInterfaceSound()
  const reducedMotion = useReducedMotion()
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const noticeTimerRef = useRef(0)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [activeIndex, setActiveIndex] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)

  const showNotice = useCallback((message: string) => {
    window.clearTimeout(noticeTimerRef.current)
    setNotice(message)
    noticeTimerRef.current = window.setTimeout(
      () => setNotice(null),
      2_600,
    )
  }, [])

  const navigateToSection = useCallback(
    (id: SectionId) => {
      setActiveSection(id)
      window.requestAnimationFrame(() => {
        if (lenis) {
          lenis.start()
          lenis.scrollTo(`#${id}`, { offset: -76, duration: 1.15 })
          return
        }
        document.getElementById(id)?.scrollIntoView({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'start',
        })
      })
    },
    [lenis, reducedMotion, setActiveSection],
  )

  const commands = useMemo<PaletteCommand[]>(() => {
    const sectionCommands = SHOWROOM_SECTIONS.map((section) => ({
      id: `section-${section.id}`,
      group: '章节跳转' as const,
      title: `前往：${section.label}`,
      subtitle: `#${section.id}`,
      keywords: [section.id, section.label, 'navigate', 'jump'],
      icon: Hash,
      active: activeSection === section.id,
      run: () => navigateToSection(section.id),
    }))

    const gravityCommands = GRAVITY_MODES.map((mode) => ({
      id: `gravity-${mode.id}`,
      group: '物理环境' as const,
      title: `物理环境：${mode.label}`,
      subtitle: mode.subtitle,
      keywords: ['gravity', mode.id, mode.description],
      icon: Gauge,
      active: gravityMode === mode.id,
      run: () => setGravityMode(mode.id),
    }))

    const accentCommands = ACCENT_THEMES.map((theme) => ({
      id: `accent-${theme.id}`,
      group: '主题强调色' as const,
      title: `切换强调色：${theme.label}`,
      subtitle: theme.subtitle,
      keywords: ['theme', 'accent', 'color', theme.id, theme.label],
      icon: Palette,
      swatch: theme.color,
      active: accentTheme === theme.id,
      run: () => setAccentTheme(theme.id),
    }))

    return [
      ...sectionCommands,
      ...gravityCommands,
      ...accentCommands,
      {
        id: 'copy-email',
        group: '工具',
        title: '复制联系邮箱',
        subtitle: EMAIL,
        keywords: ['copy', 'email', 'mail', 'contact', EMAIL],
        icon: Copy,
        run: () => copyText(EMAIL),
      },
      {
        id: 'download-resume',
        group: '工具',
        title: '下载简历 JSON',
        subtitle: 'node01-resume.json',
        keywords: ['download', 'resume', 'json', 'cv', '档案'],
        icon: Download,
        run: downloadResumeJson,
      },
    ]
  }, [
    accentTheme,
    activeSection,
    gravityMode,
    navigateToSection,
    setAccentTheme,
    setGravityMode,
  ])

  const filteredCommands = useMemo(() => {
    if (!deferredQuery.trim()) return commands

    return commands
      .map((command) => ({
        command,
        score: fuzzyScore(deferredQuery, command),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.command)
  }, [commands, deferredQuery])

  const groupedCommands = useMemo(() => {
    const groups = new Map<
      CommandGroup,
      Array<{ command: PaletteCommand; index: number }>
    >()
    filteredCommands.forEach((command, index) => {
      const group = groups.get(command.group) ?? []
      group.push({ command, index })
      groups.set(command.group, group)
    })

    return GROUP_ORDER.flatMap((groupName) => {
      const entries = groups.get(groupName)
      return entries ? [{ groupName, entries }] : []
    })
  }, [filteredCommands])

  const executeCommand = useCallback(
    (command: PaletteCommand) => {
      playSound('navigate')
      setOpen(false)
      void Promise.resolve(command.run())
        .then(() => {
          if (command.id.startsWith('copy-')) {
            showNotice('邮箱已复制到剪贴板')
          } else if (command.id.startsWith('download-')) {
            showNotice('简历 JSON 已生成')
          } else if (command.id.startsWith('gravity-')) {
            showNotice('物理重力环境已切换')
          } else if (command.id.startsWith('accent-')) {
            showNotice('主题强调色已切换')
          }
        })
        .catch(() => showNotice('操作未完成，请重试'))
    },
    [playSound, setOpen, showNotice],
  )

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const isCommandK =
        (event.metaKey || event.ctrlKey) &&
        event.key.toLocaleLowerCase() === 'k'
      if (!isCommandK) return
      event.preventDefault()
      useAppStore.getState().toggleCommandPalette()
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    if (!open) return

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setQuery('')
    setActiveIndex(0)
    const focusFrame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })

    return () => {
      window.cancelAnimationFrame(focusFrame)
      returnFocusRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!lenis) return
    if (open) {
      lenis.stop()
    } else {
      lenis.start()
    }
    return () => {
      if (open) lenis.start()
    }
  }, [lenis, open])

  useEffect(() => {
    if (!open) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, setOpen])

  useEffect(() => {
    setActiveIndex((current) =>
      Math.min(current, Math.max(0, filteredCommands.length - 1)),
    )
  }, [filteredCommands.length])

  useEffect(
    () => () => window.clearTimeout(noticeTimerRef.current),
    [],
  )

  const moveSelection = (direction: 1 | -1) => {
    if (filteredCommands.length === 0) return
    setActiveIndex(
      (current) =>
        (current + direction + filteredCommands.length) %
        filteredCommands.length,
    )
  }

  const handlePaletteKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveSelection(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelection(-1)
      return
    }
    if (event.key === 'Enter') {
      const command = filteredCommands[activeIndex]
      if (!command) return
      event.preventDefault()
      executeCommand(command)
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'input, button:not([disabled])',
      ),
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const activeCommand = filteredCommands[activeIndex]
  const shortcutLabel =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform)
      ? '⌘ K'
      : 'Ctrl K'

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {open ? (
            <motion.div
              key="command-palette"
              data-command-palette
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 z-[100] flex items-start justify-center bg-black/68 px-3 pt-[78px] backdrop-blur-[10px] sm:px-5 sm:pt-[12vh]"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) setOpen(false)
              }}
              onKeyDown={handlePaletteKeyDown}
            >
              <motion.div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="command-palette-title"
                initial={
                  reducedMotion
                    ? false
                    : { opacity: 0, y: -14, scale: 0.985 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.988 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="command-palette relative w-full max-w-[700px] overflow-hidden rounded-md border border-signal/22 bg-[#05080d]/96 shadow-[0_35px_120px_rgba(0,0,0,0.72),0_0_0_1px_rgba(255,255,255,0.025),inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 command-palette-grid opacity-35"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal/65 to-transparent"
                />
                <h2 id="command-palette-title" className="sr-only">
                  全局命令面板
                </h2>

                <div className="relative flex h-[64px] items-center gap-3 border-b border-white/[0.08] px-4 sm:px-5">
                  <Search
                    size={18}
                    strokeWidth={1.6}
                    className="shrink-0 text-signal"
                  />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setActiveIndex(0)
                    }}
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="command-palette-results"
                    aria-activedescendant={
                      activeCommand
                        ? `command-command-${activeCommand.id}`
                        : undefined
                    }
                    aria-autocomplete="list"
                    aria-label="搜索命令"
                    placeholder="搜索章节、物理环境、主题或工具"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-full min-w-0 flex-1 bg-transparent text-base text-frost outline-none placeholder:text-mist/32 sm:text-lg"
                  />
                  <button
                    type="button"
                    aria-label="关闭命令面板"
                    title="关闭命令面板"
                    onClick={() => setOpen(false)}
                    className="grid size-8 shrink-0 place-items-center border border-white/10 text-mist/55 transition-colors hover:border-white/25 hover:text-frost"
                  >
                    <X size={14} strokeWidth={1.7} />
                  </button>
                </div>

                <div className="relative flex items-center justify-between border-b border-white/[0.055] px-4 py-2 font-mono text-[8px] text-mist/38 sm:px-5">
                  <span>
                    {filteredCommands.length} ACTIONS / FUZZY INDEX
                  </span>
                  <span className="flex items-center gap-1.5 text-signal/65">
                    <Command size={9} strokeWidth={1.7} />
                    NODE/01
                  </span>
                </div>

                <div
                  id="command-palette-results"
                  role="listbox"
                  aria-label="命令搜索结果"
                  className="terminal-scrollbar relative max-h-[min(56svh,470px)] overflow-y-auto overscroll-contain p-2 sm:p-2.5"
                >
                  {groupedCommands.length > 0 ? (
                    groupedCommands.map(({ groupName, entries }) => (
                      <section
                        key={groupName}
                        aria-labelledby={`command-group-${groupName}`}
                        className="mb-2 last:mb-0"
                      >
                        <h2
                          id={`command-group-${groupName}`}
                          className="px-2 pb-1.5 pt-1 font-mono text-[8px] text-mist/34"
                        >
                          {groupName}
                        </h2>
                        <div className="grid gap-0.5">
                          {entries.map(({ command, index }) => {
                            const Icon = command.icon
                            const selected = index === activeIndex
                            return (
                              <button
                                key={command.id}
                                id={`command-command-${command.id}`}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                data-command-id={command.id}
                                onMouseMove={() => setActiveIndex(index)}
                                onClick={() => executeCommand(command)}
                                className={cn(
                                  'group/command relative flex min-h-12 w-full items-center gap-3 rounded-[3px] border border-transparent px-2.5 py-2 text-left transition-colors sm:px-3',
                                  selected
                                    ? 'border-signal/18 bg-signal/[0.075]'
                                    : 'hover:border-white/[0.06] hover:bg-white/[0.028]',
                                )}
                              >
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    'absolute inset-y-2 left-0 w-px transition-opacity',
                                    selected
                                      ? 'bg-signal opacity-100'
                                      : 'opacity-0',
                                  )}
                                />
                                <span
                                  className={cn(
                                    'grid size-8 shrink-0 place-items-center border transition-colors',
                                    selected
                                      ? 'border-signal/28 bg-signal/[0.08] text-signal'
                                      : 'border-white/[0.08] bg-white/[0.025] text-mist/55',
                                  )}
                                >
                                  <Icon size={14} strokeWidth={1.55} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-2">
                                    <span className="truncate text-[13px] text-frost/90">
                                      {command.title}
                                    </span>
                                    {command.swatch ? (
                                      <span
                                        aria-hidden="true"
                                        className="size-2 shrink-0 rounded-full border border-white/20"
                                        style={{
                                          backgroundColor: command.swatch,
                                          boxShadow: `0 0 10px ${command.swatch}55`,
                                        }}
                                      />
                                    ) : null}
                                  </span>
                                  <span className="mt-0.5 block truncate font-mono text-[8px] text-mist/35">
                                    {command.subtitle}
                                  </span>
                                </span>
                                {command.active ? (
                                  <span className="flex shrink-0 items-center gap-1 font-mono text-[8px] text-signal/75">
                                    <Check size={10} strokeWidth={2} />
                                    <span className="hidden sm:inline">
                                      CURRENT
                                    </span>
                                  </span>
                                ) : (
                                  <ChevronRight
                                    size={13}
                                    strokeWidth={1.5}
                                    className={cn(
                                      'shrink-0 transition-all',
                                      selected
                                        ? 'translate-x-0 text-signal/70'
                                        : '-translate-x-1 text-mist/18',
                                    )}
                                  />
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </section>
                    ))
                  ) : (
                    <div className="grid min-h-44 place-items-center px-6 text-center">
                      <div>
                        <Search
                          size={20}
                          strokeWidth={1.2}
                          className="mx-auto text-mist/28"
                        />
                        <p className="mt-3 text-sm text-mist/60">
                          没有匹配动作
                        </p>
                        <p className="mt-1 font-mono text-[8px] text-mist/30">
                          尝试“重力”、“紫色”或“email”
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <footer className="relative flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] bg-black/20 px-4 py-2.5 font-mono text-[8px] text-mist/35 sm:px-5">
                  <span className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <kbd className="command-key">
                        <ArrowUp size={8} />
                      </kbd>
                      <kbd className="command-key">
                        <ArrowDown size={8} />
                      </kbd>
                      选择
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="command-key">↵</kbd>
                      执行
                    </span>
                    <span className="hidden items-center gap-1 sm:flex">
                      <kbd className="command-key">ESC</kbd>
                      关闭
                    </span>
                  </span>
                  <span>{shortcutLabel}</span>
                </footer>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}

      <AnimatePresence>
        {notice ? (
          <motion.div
            data-command-feedback
            role="status"
            aria-live="polite"
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="fixed bottom-5 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-2 border border-signal/24 bg-[#05090f]/94 px-3.5 py-2.5 font-mono text-[9px] text-frost/80 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
          >
            <span className="size-1.5 bg-signal shadow-[0_0_10px_var(--color-signal)]" />
            {notice}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
