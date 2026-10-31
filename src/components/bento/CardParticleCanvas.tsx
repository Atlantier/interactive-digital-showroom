import { useEffect, useId, useRef } from 'react'
import { getVfxPreset } from '../../data/vfxPresets'
import { setParticleSourceCount } from '../../store/performanceTelemetry'
import { useAppStore } from '../../store/useAppStore'

export const CARD_EMBER_POOL_SIZE = 96
export const CARD_BURST_POOL_SIZE = 64

const ACTION_SELECTOR = 'button, a, [data-card-action]'
const SPAWN_RATE = 28
const MAX_DEVICE_PIXEL_RATIO = 2
const TAU = Math.PI * 2
type ParticleMode = 'idle' | 'rise' | 'attract' | 'burst'

interface EmberParticle {
  active: boolean
  age: number
  lifetime: number
  x0: number
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  phase: number
  amplitude: number
  angularVelocity: number
  colorIndex: number
  wasAttracted: boolean
}

interface BurstParticle {
  active: boolean
  age: number
  lifetime: number
  x: number
  y: number
  previousX: number
  previousY: number
  vx: number
  vy: number
  colorIndex: number
}

interface RendererState {
  visible: boolean
  hovered: boolean
  focusWithin: boolean
  running: boolean
  animationFrame: number
  lastTimestamp: number
  width: number
  height: number
  spawnAccumulator: number
  spawnCursor: number
  attractX: number
  attractY: number
  attractActive: boolean
  actionElement: HTMLElement | null
  burstActive: boolean
  burstStartedAt: number
  burstX: number
  burstY: number
}

function createEmberParticle(): EmberParticle {
  return {
    active: false,
    age: 0,
    lifetime: 1,
    x0: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 1,
    phase: 0,
    amplitude: 1,
    angularVelocity: 1,
    colorIndex: 0,
    wasAttracted: false,
  }
}

function createBurstParticle(): BurstParticle {
  return {
    active: false,
    age: 0,
    lifetime: 1,
    x: 0,
    y: 0,
    previousX: 0,
    previousY: 0,
    vx: 0,
    vy: 0,
    colorIndex: 0,
  }
}

function findActionElement(
  target: EventTarget | null,
  card: HTMLElement,
) {
  if (!(target instanceof Element)) return null

  const action = target.closest<HTMLElement>(ACTION_SELECTOR)
  return action && card.contains(action) ? action : null
}

function measureActionCenter(
  card: HTMLElement,
  action: HTMLElement,
) {
  const cardBounds = card.getBoundingClientRect()
  const actionBounds = action.getBoundingClientRect()

  return {
    x: actionBounds.left + actionBounds.width / 2 - cardBounds.left,
    y: actionBounds.top + actionBounds.height / 2 - cardBounds.top,
  }
}

export function CardParticleCanvas() {
  const telemetrySourceId = useId()
  const telemetrySource = `bento-card-${telemetrySourceId}`
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const preset = getVfxPreset(vfxPreset)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const embersRef = useRef<EmberParticle[] | null>(null)
  const burstsRef = useRef<BurstParticle[] | null>(null)
  const stateRef = useRef<RendererState>({
    visible: false,
    hovered: false,
    focusWithin: false,
    running: false,
    animationFrame: 0,
    lastTimestamp: 0,
    width: 1,
    height: 1,
    spawnAccumulator: 0,
    spawnCursor: 0,
    attractX: 0,
    attractY: 0,
    attractActive: false,
    actionElement: null,
    burstActive: false,
    burstStartedAt: 0,
    burstX: 0,
    burstY: 0,
  })

  if (!embersRef.current) {
    embersRef.current = Array.from(
      { length: CARD_EMBER_POOL_SIZE },
      createEmberParticle,
    )
  }
  if (!burstsRef.current) {
    burstsRef.current = Array.from(
      { length: CARD_BURST_POOL_SIZE },
      createBurstParticle,
    )
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const card = canvas.closest('[data-spotlight-card]')
    const context = canvas.getContext('2d')
    if (!(card instanceof HTMLElement) || !context) return

    const embers = embersRef.current
    const bursts = burstsRef.current
    if (!embers || !bursts) return

    const state = stateRef.current
    const emberColors = [
      preset.primary,
      preset.secondary,
      preset.tertiary,
    ] as const
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const devicePixelRatio = Math.min(
      window.devicePixelRatio || 1,
      MAX_DEVICE_PIXEL_RATIO,
    )

    const setMode = (mode: ParticleMode) => {
      if (card.dataset.cardParticleMode !== mode) {
        card.dataset.cardParticleMode = mode
      }
    }

    const resizeCanvas = () => {
      state.width = Math.max(1, card.clientWidth)
      state.height = Math.max(1, card.clientHeight)
      const pixelWidth = Math.max(
        1,
        Math.round(state.width * devicePixelRatio),
      )
      const pixelHeight = Math.max(
        1,
        Math.round(state.height * devicePixelRatio),
      )

      if (
        canvas.width !== pixelWidth ||
        canvas.height !== pixelHeight
      ) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
      }
      context.setTransform(
        devicePixelRatio,
        0,
        0,
        devicePixelRatio,
        0,
        0,
      )
    }

    const resetParticles = () => {
      for (const particle of embers) {
        particle.active = false
      }
      for (const particle of bursts) {
        particle.active = false
      }
      state.spawnAccumulator = 0
      state.burstActive = false
      state.attractActive = false
      state.actionElement = null
    }

    const clearCanvas = () => {
      context.clearRect(0, 0, state.width, state.height)
    }

    const spawnEmber = (
      particle: EmberParticle,
      seedInField: boolean,
    ) => {
      particle.active = true
      particle.age = 0
      particle.lifetime = 3.4 + Math.random() * 3.1
      particle.x0 = Math.random() * state.width
      particle.x = particle.x0
      particle.y = seedInField
        ? state.height * (0.28 + Math.random() * 0.72)
        : state.height + 4 + Math.random() * 10
      particle.vx = (Math.random() - 0.5) * 5
      particle.vy = -(7 + Math.random() * 12)
      particle.radius = 1 + Math.random() * 2
      particle.phase = Math.random() * TAU
      particle.amplitude = 4 + Math.random() * 11
      particle.angularVelocity = 0.75 + Math.random() * 1.65
      particle.colorIndex = Math.floor(
        Math.random() * emberColors.length,
      )
      particle.wasAttracted = false
    }

    const seedParticles = () => {
      const seedCount = Math.min(30, embers.length)

      for (let index = 0; index < seedCount; index += 1) {
        spawnEmber(embers[index], true)
      }
      state.spawnCursor = seedCount % embers.length
    }

    const spawnNextEmber = () => {
      for (let offset = 0; offset < embers.length; offset += 1) {
        const index = (state.spawnCursor + offset) % embers.length
        const particle = embers[index]
        if (!particle.active) {
          state.spawnCursor = (index + 1) % embers.length
          spawnEmber(particle, false)
          return
        }
      }

      const particle = embers[state.spawnCursor]
      state.spawnCursor = (state.spawnCursor + 1) % embers.length
      spawnEmber(particle, false)
    }

    const triggerBurst = (
      x: number,
      y: number,
      timestamp: number,
    ) => {
      state.burstActive = true
      state.burstStartedAt = timestamp
      state.burstX = x
      state.burstY = y
      setMode('burst')

      for (const ember of embers) {
        ember.active = false
      }

      for (let index = 0; index < bursts.length; index += 1) {
        const particle = bursts[index]
        const angle =
          (index / bursts.length) * TAU +
          (Math.random() - 0.5) * 0.12
        const speed = 105 + Math.random() * 210

        particle.active = true
        particle.age = 0
        particle.lifetime = 0.52 + Math.random() * 0.58
        particle.x = x
        particle.y = y
        particle.previousX = x
        particle.previousY = y
        particle.vx = Math.cos(angle) * speed
        particle.vy = Math.sin(angle) * speed
        particle.colorIndex = index % emberColors.length
      }
    }

    const drawEmber = (particle: EmberParticle) => {
      const lifeRatio = particle.age / particle.lifetime
      const opacity = Math.max(0, 1 - lifeRatio)
      const speed = Math.hypot(particle.vx, particle.vy)
      const tailLength = state.attractActive
        ? Math.min(22, 4 + speed * 0.035)
        : 3 + particle.radius * 3.4
      const color = emberColors[particle.colorIndex]

      context.strokeStyle = color
      context.lineWidth = particle.radius * 0.72
      context.globalAlpha = opacity * 0.24
      context.beginPath()
      context.moveTo(particle.x, particle.y + tailLength)
      context.lineTo(particle.x, particle.y)
      context.stroke()

      context.fillStyle = color
      context.globalAlpha = opacity * 0.1
      context.beginPath()
      context.arc(
        particle.x,
        particle.y,
        particle.radius * 2.8,
        0,
        TAU,
      )
      context.fill()

      context.globalAlpha = opacity * 0.82
      context.beginPath()
      context.arc(
        particle.x,
        particle.y,
        particle.radius * 0.72,
        0,
        TAU,
      )
      context.fill()
    }

    const drawBurstParticle = (particle: BurstParticle) => {
      const lifeRatio = particle.age / particle.lifetime
      const opacity = Math.max(0, 1 - lifeRatio)

      context.strokeStyle = emberColors[particle.colorIndex]
      context.lineWidth = 1.2
      context.globalAlpha = opacity * 0.72
      context.beginPath()
      context.moveTo(particle.previousX, particle.previousY)
      context.lineTo(particle.x, particle.y)
      context.stroke()

      context.fillStyle = emberColors[particle.colorIndex]
      context.globalAlpha = opacity * 0.92
      context.beginPath()
      context.arc(
        particle.x,
        particle.y,
        1.1 + opacity * 1.4,
        0,
        TAU,
      )
      context.fill()
    }

    const updateParticles = (delta: number, timestamp: number) => {
      const attractionX = state.attractX
      const attractionY = state.attractY

      for (const particle of embers) {
        if (!particle.active) continue

        particle.age += delta
        if (particle.age >= particle.lifetime) {
          particle.active = false
          continue
        }

        if (state.attractActive) {
          const deltaX = attractionX - particle.x
          const deltaY = attractionY - particle.y
          const distance = Math.max(1, Math.hypot(deltaX, deltaY))
          const force = 980 + Math.min(900, distance * 3.8)

          particle.vx += (deltaX / distance) * force * delta
          particle.vy += (deltaY / distance) * force * delta
          particle.vx *= Math.exp(-2.15 * delta)
          particle.vy *= Math.exp(-2.15 * delta)
          particle.x += particle.vx * delta
          particle.y += particle.vy * delta
          particle.wasAttracted = true
        } else {
          if (particle.wasAttracted) {
            particle.x0 =
              particle.x -
              Math.sin(
                particle.age * particle.angularVelocity +
                  particle.phase,
              ) *
                particle.amplitude
            particle.wasAttracted = false
          }

          particle.vy -= 7.5 * delta
          particle.y += particle.vy * delta
          particle.x =
            particle.x0 +
            Math.sin(
              particle.age * particle.angularVelocity +
                particle.phase,
            ) *
              particle.amplitude
        }

        if (particle.y < -24) {
          particle.active = false
        }
      }

      for (const particle of bursts) {
        if (!particle.active) continue

        particle.age += delta
        if (particle.age >= particle.lifetime) {
          particle.active = false
          continue
        }

        particle.previousX = particle.x
        particle.previousY = particle.y
        const damping = Math.exp(-2.35 * delta)
        particle.vx *= damping
        particle.vy = particle.vy * damping + 50 * delta
        particle.x += particle.vx * delta
        particle.y += particle.vy * delta
      }

      if (
        state.burstActive &&
        timestamp - state.burstStartedAt > 1050
      ) {
        state.burstActive = false
        setMode(state.attractActive ? 'attract' : 'rise')
      }
    }

    const drawFrame = (timestamp: number) => {
      if (!state.running) return

      const delta = Math.min(
        0.05,
        Math.max(0.001, (timestamp - state.lastTimestamp) / 1000),
      )
      state.lastTimestamp = timestamp
      context.clearRect(0, 0, state.width, state.height)
      context.save()
      context.globalCompositeOperation = 'lighter'
      context.lineCap = 'round'

      if (!state.burstActive) {
        const spawnRate = state.attractActive
          ? SPAWN_RATE * 0.18
          : SPAWN_RATE
        state.spawnAccumulator += delta * spawnRate

        while (state.spawnAccumulator >= 1) {
          state.spawnAccumulator -= 1
          spawnNextEmber()
        }
      }

      updateParticles(delta, timestamp)

      for (const particle of embers) {
        if (particle.active) drawEmber(particle)
      }
      for (const particle of bursts) {
        if (particle.active) drawBurstParticle(particle)
      }

      let activeParticleCount = 0
      for (const particle of embers) {
        if (particle.active) activeParticleCount += 1
      }
      for (const particle of bursts) {
        if (particle.active) activeParticleCount += 1
      }
      setParticleSourceCount(
        telemetrySource,
        activeParticleCount,
      )

      if (state.burstActive) {
        const burstAge =
          (timestamp - state.burstStartedAt) / 1000
        if (burstAge < 0.72) {
          const progress = burstAge / 0.72
          context.strokeStyle = emberColors[1]
          context.lineWidth = 1.4 * (1 - progress) + 0.4
          context.globalAlpha = (1 - progress) ** 1.6 * 0.72
          context.beginPath()
          context.arc(
            state.burstX,
            state.burstY,
            10 + progress * 150,
            0,
            TAU,
          )
          context.stroke()
        }
      }

      context.globalAlpha = 1
      context.restore()
      state.animationFrame = requestAnimationFrame(drawFrame)
    }

    const startRendering = () => {
      if (state.running || reducedMotion) return
      resizeCanvas()
      state.running = true
      state.lastTimestamp = performance.now()
      state.animationFrame = requestAnimationFrame(drawFrame)
    }

    const stopRendering = () => {
      state.running = false
      if (state.animationFrame) {
        cancelAnimationFrame(state.animationFrame)
        state.animationFrame = 0
      }
      resetParticles()
      clearCanvas()
      setMode('idle')
      setParticleSourceCount(telemetrySource, 0)
    }

    const syncRenderer = () => {
      if (state.visible && (state.hovered || state.focusWithin)) {
        startRendering()
      } else {
        stopRendering()
      }
    }

    const beginInteraction = (mode: ParticleMode) => {
      if (!state.running) {
        seedParticles()
      }
      setMode(mode)
      syncRenderer()
    }

    const handlePointerEnter = () => {
      state.hovered = true
      beginInteraction('rise')
    }

    const handlePointerLeave = () => {
      state.hovered = false
      state.attractActive = false
      state.actionElement = null
      syncRenderer()
    }

    const handleFocusIn = (event: FocusEvent) => {
      state.focusWithin = true
      const action = findActionElement(event.target, card)
      if (action) {
        const center = measureActionCenter(card, action)
        state.actionElement = action
        state.attractX = center.x
        state.attractY = center.y
        state.attractActive = true
      }
      beginInteraction(
        state.burstActive
          ? 'burst'
          : state.attractActive
            ? 'attract'
            : 'rise',
      )
    }

    const handleFocusOut = (event: FocusEvent) => {
      if (
        event.relatedTarget instanceof Node &&
        card.contains(event.relatedTarget)
      ) {
        return
      }
      state.focusWithin = false
      syncRenderer()
    }

    const handlePointerOver = (event: PointerEvent) => {
      const action = findActionElement(event.target, card)
      if (!action || action === state.actionElement) return

      const center = measureActionCenter(card, action)
      state.actionElement = action
      state.attractX = center.x
      state.attractY = center.y
      state.attractActive = true
      setMode('attract')
    }

    const handlePointerOut = (event: PointerEvent) => {
      if (!state.actionElement) return
      if (
        event.relatedTarget instanceof Node &&
        state.actionElement.contains(event.relatedTarget)
      ) {
        return
      }

      state.actionElement = null
      state.attractActive = false
      setMode(state.burstActive ? 'burst' : 'rise')
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const action = findActionElement(event.target, card)
      if (!action) return

      const center = measureActionCenter(card, action)
      state.attractX = center.x
      state.attractY = center.y
      state.attractActive = true
      triggerBurst(center.x, center.y, performance.now())
      syncRenderer()
    }

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas()
      if (state.running) clearCanvas()
    })
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        state.visible = entry.isIntersecting
        syncRenderer()
      },
      {
        rootMargin: '100px 0px',
        threshold: 0.08,
      },
    )

    resizeCanvas()
    setMode('idle')
    resizeObserver.observe(card)
    intersectionObserver.observe(card)
    card.addEventListener('pointerenter', handlePointerEnter)
    card.addEventListener('pointerleave', handlePointerLeave)
    card.addEventListener('pointerover', handlePointerOver)
    card.addEventListener('pointerout', handlePointerOut)
    card.addEventListener('pointerdown', handlePointerDown, {
      capture: true,
    })
    card.addEventListener('focusin', handleFocusIn)
    card.addEventListener('focusout', handleFocusOut)

    return () => {
      stopRendering()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      card.removeEventListener('pointerenter', handlePointerEnter)
      card.removeEventListener('pointerleave', handlePointerLeave)
      card.removeEventListener('pointerover', handlePointerOver)
      card.removeEventListener('pointerout', handlePointerOut)
      card.removeEventListener('pointerdown', handlePointerDown, {
        capture: true,
      })
      card.removeEventListener('focusin', handleFocusIn)
      card.removeEventListener('focusout', handleFocusOut)
      delete card.dataset.cardParticleMode
      setParticleSourceCount(telemetrySource, 0)
      canvas.width = 0
      canvas.height = 0
    }
  }, [preset, telemetrySource, vfxPreset])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-card-particle-canvas
      data-card-ember-pool={CARD_EMBER_POOL_SIZE}
      data-card-burst-pool={CARD_BURST_POOL_SIZE}
      data-vfx-preset={vfxPreset}
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full rounded-[inherit]"
    />
  )
}
