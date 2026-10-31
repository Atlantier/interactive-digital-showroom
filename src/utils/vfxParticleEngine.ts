export type VfxSpace = '2d' | '3d'
export type VfxRenderMode = 'dot' | 'streak' | 'plasma'

export type VfxColor =
  | string
  | readonly [number, number, number]
  | readonly [number, number, number, number]

export type VfxRange = number | readonly [number, number]

export interface VfxPoint {
  x: number
  y: number
  z?: number
}

export interface VfxBounds {
  left?: number
  right?: number
  top?: number
  floorY: number
}

export interface VfxPoolOptions {
  capacity?: number
  space?: VfxSpace
  bounds?: Partial<VfxBounds>
  collisionAxis?: 'y' | 'z'
  projectionCenter?: VfxPoint
  focalLength?: number
}

export interface VfxEmitOptions {
  origin: VfxPoint
  count?: number
  originJitter?: VfxPoint
  direction?: VfxPoint
  spread?: number
  speed?: VfxRange
  life?: VfxRange
  size?: VfxRange
  color?: readonly [VfxColor, VfxColor]
  alpha?: readonly [number, number]
  gravity?: VfxPoint
  drag?: number
  turbulence?: number
  turbulenceFrequency?: number
  bounce?: number
  splitChance?: number
  maxSplitDepth?: number
  renderMode?: VfxRenderMode
  stretch?: number
  glow?: number
  fadeIn?: number
  floorCollision?: boolean
}

export interface VfxParticleStats {
  active: number
  capacity: number
  emitted: number
  recycled: number
  wallImpacts: number
  floorImpacts: number
  splits: number
}

export interface VfxIllumination {
  x: number
  y: number
  z: number
  energy: number
  intensity: number
  r: number
  g: number
  b: number
  count: number
}

export function createVfxIllumination(): VfxIllumination {
  return {
    x: 0,
    y: 0,
    z: 0,
    energy: 0,
    intensity: 0,
    r: 114,
    g: 230,
    b: 255,
    count: 0,
  }
}

export interface VfxLightningOptions {
  start: VfxPoint
  end: VfxPoint
  duration?: number
  color?: VfxColor
  branches?: number
  amplitude?: number
  width?: number
  seed?: number
  flashRadius?: number
}

interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

interface LightningArc {
  active: boolean
  startX: number
  startY: number
  endX: number
  endY: number
  life: number
  duration: number
  color: RgbaColor
  branches: number
  amplitude: number
  width: number
  seed: number
  flashRadius: number
}

const TAU = Math.PI * 2
const MODE_DOT = 0
const MODE_STREAK = 1
const MODE_PLASMA = 2
const MAX_CAPACITY = 16_384

const DEFAULT_COLOR_START: RgbaColor = {
  r: 230,
  g: 250,
  b: 255,
  a: 1,
}
const DEFAULT_COLOR_END: RgbaColor = {
  r: 114,
  g: 230,
  b: 255,
  a: 0,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function randomRange(range: VfxRange | undefined, fallback: number) {
  if (range === undefined) return fallback
  if (typeof range === 'number') return range
  return range[0] + Math.random() * (range[1] - range[0])
}

function parseColor(color: VfxColor): RgbaColor {
  if (typeof color !== 'string') {
    return {
      r: clamp(color[0], 0, 255),
      g: clamp(color[1], 0, 255),
      b: clamp(color[2], 0, 255),
      a: clamp(color[3] ?? 1, 0, 1),
    }
  }

  const hex = color.trim()
  if (hex.startsWith('#')) {
    const value = hex.slice(1)
    if (value.length === 3 || value.length === 4) {
      return {
        r: Number.parseInt(value[0] + value[0], 16),
        g: Number.parseInt(value[1] + value[1], 16),
        b: Number.parseInt(value[2] + value[2], 16),
        a:
          value.length === 4
            ? Number.parseInt(value[3] + value[3], 16) / 255
            : 1,
      }
    }
    if (value.length === 6 || value.length === 8) {
      return {
        r: Number.parseInt(value.slice(0, 2), 16),
        g: Number.parseInt(value.slice(2, 4), 16),
        b: Number.parseInt(value.slice(4, 6), 16),
        a:
          value.length === 8
            ? Number.parseInt(value.slice(6, 8), 16) / 255
            : 1,
      }
    }
  }

  const rgbMatch = hex.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i,
  )
  if (rgbMatch) {
    return {
      r: clamp(Number(rgbMatch[1]), 0, 255),
      g: clamp(Number(rgbMatch[2]), 0, 255),
      b: clamp(Number(rgbMatch[3]), 0, 255),
      a: clamp(rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]), 0, 1),
    }
  }

  return { ...DEFAULT_COLOR_START }
}

function modeToNumber(mode: VfxRenderMode | undefined) {
  if (mode === 'streak') return MODE_STREAK
  if (mode === 'plasma') return MODE_PLASMA
  return MODE_DOT
}

function normalize3d(x: number, y: number, z: number) {
  const length = Math.hypot(x, y, z)
  if (length < 0.0001) return { x: 0, y: 1, z: 0 }
  return { x: x / length, y: y / length, z: z / length }
}

function randomConeDirection(
  directionX: number,
  directionY: number,
  directionZ: number,
  spread: number,
) {
  const base = normalize3d(directionX, directionY, directionZ)
  if (spread <= 0) return base

  const helperX = Math.abs(base.y) < 0.92 ? 0 : 1
  const helperY = Math.abs(base.y) < 0.92 ? 1 : 0
  const tangent = normalize3d(
    helperY * base.z - 0 * base.y,
    0 * base.x - helperX * base.z,
    helperX * base.y - helperY * base.x,
  )
  const bitangent = normalize3d(
    base.y * tangent.z - base.z * tangent.y,
    base.z * tangent.x - base.x * tangent.z,
    base.x * tangent.y - base.y * tangent.x,
  )
  const cosTheta = 1 - Math.random() * (1 - Math.cos(spread))
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta))
  const phi = Math.random() * TAU
  const radial = Math.cos(phi) * sinTheta
  const vertical = Math.sin(phi) * sinTheta

  return normalize3d(
    base.x * cosTheta + tangent.x * radial + bitangent.x * vertical,
    base.y * cosTheta + tangent.y * radial + bitangent.y * vertical,
    base.z * cosTheta + tangent.z * radial + bitangent.z * vertical,
  )
}

function randomPlanarDirection(
  directionX: number,
  directionY: number,
  spread: number,
) {
  const baseAngle = Math.atan2(directionY, directionX)
  const angle =
    spread >= Math.PI * 1.9
      ? Math.random() * TAU
      : baseAngle + (Math.random() * 2 - 1) * spread
  return { x: Math.cos(angle), y: Math.sin(angle), z: 0 }
}

export class VfxParticlePool {
  readonly capacity: number
  readonly space: VfxSpace

  private readonly active: Uint8Array
  private readonly px: Float32Array
  private readonly py: Float32Array
  private readonly pz: Float32Array
  private readonly vx: Float32Array
  private readonly vy: Float32Array
  private readonly vz: Float32Array
  private readonly age: Float32Array
  private readonly life: Float32Array
  private readonly size: Float32Array
  private readonly startR: Float32Array
  private readonly startG: Float32Array
  private readonly startB: Float32Array
  private readonly startA: Float32Array
  private readonly endR: Float32Array
  private readonly endG: Float32Array
  private readonly endB: Float32Array
  private readonly endA: Float32Array
  private readonly gravityX: Float32Array
  private readonly gravityY: Float32Array
  private readonly gravityZ: Float32Array
  private readonly drag: Float32Array
  private readonly turbulence: Float32Array
  private readonly frequency: Float32Array
  private readonly phase: Float32Array
  private readonly bounce: Float32Array
  private readonly splitChance: Float32Array
  private readonly stretch: Float32Array
  private readonly glow: Float32Array
  private readonly fadeIn: Float32Array
  private readonly mode: Uint8Array
  private readonly splitDepth: Uint8Array
  private readonly maxSplitDepth: Uint8Array
  private readonly floorCollision: Uint8Array
  private readonly freeIndices: Int32Array

  private freeCount: number
  private activeCount = 0
  private stats = {
    emitted: 0,
    recycled: 0,
    wallImpacts: 0,
    floorImpacts: 0,
    splits: 0,
  }

  private left = 0
  private right = Number.POSITIVE_INFINITY
  private top = Number.NEGATIVE_INFINITY
  private floorY = Number.POSITIVE_INFINITY
  private collisionAxis: 'y' | 'z'
  private projectionCenterX = 0
  private projectionCenterY = 0
  private focalLength = 1_200

  constructor({
    capacity = 1_200,
    space = '2d',
    bounds,
    collisionAxis = 'y',
    projectionCenter,
    focalLength = 1_200,
  }: VfxPoolOptions = {}) {
    this.capacity = clamp(Math.floor(capacity), 1, MAX_CAPACITY)
    this.space = space
    this.collisionAxis = collisionAxis
    this.focalLength = Math.max(1, focalLength)
    this.projectionCenterX = projectionCenter?.x ?? 0
    this.projectionCenterY = projectionCenter?.y ?? 0
    this.setBounds(bounds)

    this.active = new Uint8Array(this.capacity)
    this.px = new Float32Array(this.capacity)
    this.py = new Float32Array(this.capacity)
    this.pz = new Float32Array(this.capacity)
    this.vx = new Float32Array(this.capacity)
    this.vy = new Float32Array(this.capacity)
    this.vz = new Float32Array(this.capacity)
    this.age = new Float32Array(this.capacity)
    this.life = new Float32Array(this.capacity)
    this.size = new Float32Array(this.capacity)
    this.startR = new Float32Array(this.capacity)
    this.startG = new Float32Array(this.capacity)
    this.startB = new Float32Array(this.capacity)
    this.startA = new Float32Array(this.capacity)
    this.endR = new Float32Array(this.capacity)
    this.endG = new Float32Array(this.capacity)
    this.endB = new Float32Array(this.capacity)
    this.endA = new Float32Array(this.capacity)
    this.gravityX = new Float32Array(this.capacity)
    this.gravityY = new Float32Array(this.capacity)
    this.gravityZ = new Float32Array(this.capacity)
    this.drag = new Float32Array(this.capacity)
    this.turbulence = new Float32Array(this.capacity)
    this.frequency = new Float32Array(this.capacity)
    this.phase = new Float32Array(this.capacity)
    this.bounce = new Float32Array(this.capacity)
    this.splitChance = new Float32Array(this.capacity)
    this.stretch = new Float32Array(this.capacity)
    this.glow = new Float32Array(this.capacity)
    this.fadeIn = new Float32Array(this.capacity)
    this.mode = new Uint8Array(this.capacity)
    this.splitDepth = new Uint8Array(this.capacity)
    this.maxSplitDepth = new Uint8Array(this.capacity)
    this.floorCollision = new Uint8Array(this.capacity)
    this.freeIndices = new Int32Array(this.capacity)
    this.freeCount = this.capacity

    for (let index = 0; index < this.capacity; index += 1) {
      this.freeIndices[index] = this.capacity - index - 1
    }
  }

  setBounds(bounds: Partial<VfxBounds> | undefined) {
    if (!bounds) return
    if (bounds.left !== undefined) this.left = bounds.left
    if (bounds.right !== undefined) this.right = bounds.right
    if (bounds.top !== undefined) this.top = bounds.top
    if (bounds.floorY !== undefined) this.floorY = bounds.floorY
  }

  setProjection(centerX: number, centerY: number, focalLength?: number) {
    this.projectionCenterX = centerX
    this.projectionCenterY = centerY
    if (focalLength !== undefined) {
      this.focalLength = Math.max(1, focalLength)
    }
  }

  emit(options: VfxEmitOptions) {
    const count = clamp(Math.floor(options.count ?? 1), 0, this.capacity)
    if (count === 0) return 0

    const colorStart = options.color
      ? parseColor(options.color[0])
      : { ...DEFAULT_COLOR_START }
    const colorEnd = options.color
      ? parseColor(options.color[1])
      : { ...DEFAULT_COLOR_END }
    const alphaStart = options.alpha?.[0] ?? colorStart.a
    const alphaEnd = options.alpha?.[1] ?? colorEnd.a
    const originZ = options.origin.z ?? 0
    const jitterX = options.originJitter?.x ?? 0
    const jitterY = options.originJitter?.y ?? 0
    const jitterZ = options.originJitter?.z ?? 0
    const direction = normalize3d(
      options.direction?.x ?? 0,
      options.direction?.y ?? -1,
      options.direction?.z ?? 0,
    )
    const spread = Math.max(0, options.spread ?? 0)
    const gravity = options.gravity
    const splitDepth = 0
    const maxSplitDepth = clamp(
      Math.floor(options.maxSplitDepth ?? 0),
      0,
      4,
    )
    const renderMode = modeToNumber(options.renderMode)
    let emitted = 0

    for (let index = 0; index < count; index += 1) {
      const slot = this.acquire()
      if (slot < 0) break

      const directionRandom =
        this.space === '3d'
          ? randomConeDirection(
              direction.x,
              direction.y,
              direction.z,
              spread,
            )
          : randomPlanarDirection(direction.x, direction.y, spread)
      const speed = Math.max(0, randomRange(options.speed, 0))
      const life = Math.max(1 / 240, randomRange(options.life, 0.6))

      this.active[slot] = 1
      this.px[slot] = options.origin.x + (Math.random() * 2 - 1) * jitterX
      this.py[slot] = options.origin.y + (Math.random() * 2 - 1) * jitterY
      this.pz[slot] = originZ + (Math.random() * 2 - 1) * jitterZ
      this.vx[slot] = directionRandom.x * speed
      this.vy[slot] = directionRandom.y * speed
      this.vz[slot] = directionRandom.z * speed
      this.age[slot] = 0
      this.life[slot] = life
      this.size[slot] = Math.max(
        0.15,
        randomRange(options.size, 1.2),
      )
      this.startR[slot] = colorStart.r
      this.startG[slot] = colorStart.g
      this.startB[slot] = colorStart.b
      this.startA[slot] = alphaStart
      this.endR[slot] = colorEnd.r
      this.endG[slot] = colorEnd.g
      this.endB[slot] = colorEnd.b
      this.endA[slot] = alphaEnd
      this.gravityX[slot] = gravity?.x ?? 0
      this.gravityY[slot] = gravity?.y ?? 0
      this.gravityZ[slot] = gravity?.z ?? 0
      this.drag[slot] = Math.max(0, options.drag ?? 0)
      this.turbulence[slot] = Math.max(0, options.turbulence ?? 0)
      this.frequency[slot] = Math.max(
        0.01,
        options.turbulenceFrequency ?? 10,
      )
      this.phase[slot] = Math.random() * 1_000
      this.bounce[slot] = clamp(options.bounce ?? 0.6, 0, 1)
      this.splitChance[slot] = clamp(options.splitChance ?? 0, 0, 1)
      this.stretch[slot] = Math.max(0, options.stretch ?? 0.02)
      this.glow[slot] = Math.max(0, options.glow ?? 1)
      this.fadeIn[slot] = clamp(options.fadeIn ?? 0.04, 0, 1)
      this.mode[slot] = renderMode
      this.splitDepth[slot] = splitDepth
      this.maxSplitDepth[slot] = maxSplitDepth
      this.floorCollision[slot] = options.floorCollision ? 1 : 0
      this.activeCount += 1
      this.stats.emitted += 1
      emitted += 1
    }

    return emitted
  }

  update(deltaSeconds: number, elapsedSeconds: number) {
    const delta = clamp(deltaSeconds, 0, 0.05)
    if (delta <= 0) return
    const collisionY = this.collisionAxis === 'y'

    for (let index = 0; index < this.capacity; index += 1) {
      if (!this.active[index]) continue

      this.age[index] += delta
      if (this.age[index] >= this.life[index]) {
        this.release(index)
        continue
      }

      const noise =
        this.turbulence[index] *
        delta *
        Math.sin(
          elapsedSeconds * this.frequency[index] +
            this.phase[index] +
            this.px[index] * 0.013 +
            this.py[index] * 0.009,
        )
      this.vx[index] +=
        this.gravityX[index] * delta +
        Math.cos(this.phase[index] + elapsedSeconds * 1.7) * noise
      this.vy[index] +=
        this.gravityY[index] * delta +
        Math.sin(this.phase[index] * 1.3 + elapsedSeconds * 2.1) * noise
      this.vz[index] +=
        this.gravityZ[index] * delta +
        Math.sin(this.phase[index] + elapsedSeconds * 2.6) * noise

      const dragFactor = Math.exp(-this.drag[index] * delta)
      this.vx[index] *= dragFactor
      this.vy[index] *= dragFactor
      this.vz[index] *= dragFactor

      this.px[index] += this.vx[index] * delta
      this.py[index] += this.vy[index] * delta
      this.pz[index] += this.vz[index] * delta

      if (this.px[index] < this.left) {
        this.px[index] = this.left
        if (this.vx[index] < 0) {
          this.vx[index] *= -this.bounce[index] * 0.78
          this.stats.wallImpacts += 1
        }
      } else if (this.px[index] > this.right) {
        this.px[index] = this.right
        if (this.vx[index] > 0) {
          this.vx[index] *= -this.bounce[index] * 0.78
          this.stats.wallImpacts += 1
        }
      }

      if (this.py[index] < this.top) {
        this.py[index] = this.top
        if (this.vy[index] < 0) {
          this.vy[index] *= -this.bounce[index] * 0.58
        }
      }

      if (!this.floorCollision[index]) continue

      const position = collisionY ? this.py[index] : this.pz[index]
      if (position <= this.floorY) continue
      const impactVelocity = collisionY
        ? this.vy[index]
        : this.vz[index]
      const impactSpeed = Math.abs(impactVelocity)

      if (collisionY) {
        this.py[index] = this.floorY
        if (impactVelocity > 0) {
          this.vy[index] = -impactVelocity * this.bounce[index]
        }
      } else {
        this.pz[index] = this.floorY
        if (impactVelocity > 0) {
          this.vz[index] = -impactVelocity * this.bounce[index]
        }
      }
      this.vx[index] *= 0.84
      this.stats.floorImpacts += 1

      if (
        impactSpeed > 46 &&
        this.splitDepth[index] < this.maxSplitDepth[index] &&
        Math.random() < this.splitChance[index]
      ) {
        const children = impactSpeed > 150 ? 2 : 1
        for (let child = 0; child < children; child += 1) {
          this.emit({
            origin: {
              x: this.px[index],
              y: this.py[index],
              z: this.pz[index],
            },
            count: 1,
            direction: {
              x: (Math.random() * 2 - 1) * 0.8,
              y: -1,
              z: this.space === '3d' ? (Math.random() * 2 - 1) * 0.35 : 0,
            },
            speed: 80 + Math.random() * 170,
            life: 0.16 + Math.random() * 0.2,
            size: 0.7 + Math.random() * 0.9,
            color: ['#fff2bd', '#ff5a1f'],
            alpha: [0.95, 0],
            gravity: { x: 0, y: 860, z: 0 },
            drag: 0.8,
            turbulence: 90,
            turbulenceFrequency: 22,
            bounce: 0.6,
            renderMode: 'streak',
            stretch: 0.026,
            glow: 1.4,
            floorCollision: true,
          })
        }
        this.stats.splits += children
      }
    }
  }

  render(context: CanvasRenderingContext2D) {
    if (this.activeCount === 0) return
    context.save()
    context.globalCompositeOperation = 'lighter'

    for (let index = 0; index < this.capacity; index += 1) {
      if (!this.active[index]) continue

      const lifeRatio = clamp(
        1 - this.age[index] / this.life[index],
        0,
        1,
      )
      const progress = 1 - lifeRatio
      const fadeInDuration = Math.max(0.001, this.fadeIn[index])
      const fadeIn = clamp(progress / fadeInDuration, 0, 1)
      const alpha = clamp(
        lifeRatio *
          fadeIn *
          (this.startA[index] +
            (this.endA[index] - this.startA[index]) * progress),
        0,
        1,
      )
      if (alpha <= 0.001) continue

      const red = Math.round(
        this.startR[index] +
          (this.endR[index] - this.startR[index]) * progress,
      )
      const green = Math.round(
        this.startG[index] +
          (this.endG[index] - this.startG[index]) * progress,
      )
      const blue = Math.round(
        this.startB[index] +
          (this.endB[index] - this.startB[index]) * progress,
      )
      const color = `rgb(${red} ${green} ${blue})`
      const projection =
        this.space === '3d'
          ? this.focalLength /
            Math.max(40, this.focalLength + this.pz[index])
          : 1
      const x =
        this.space === '3d'
          ? this.projectionCenterX +
            (this.px[index] - this.projectionCenterX) * projection
          : this.px[index]
      const y =
        this.space === '3d'
          ? this.projectionCenterY +
            (this.py[index] - this.projectionCenterY) * projection
          : this.py[index]
      const size = Math.max(0.15, this.size[index] * projection)

      if (this.mode[index] === MODE_STREAK) {
        const speed = Math.hypot(
          this.vx[index],
          this.vy[index],
          this.vz[index],
        )
        const trail = clamp(speed * this.stretch[index], 0.6, 28)
        const inverseSpeed = speed > 0.001 ? 1 / speed : 0
        const tailX =
          x - this.vx[index] * inverseSpeed * trail * projection
        const tailY =
          y - this.vy[index] * inverseSpeed * trail * projection

        context.globalAlpha = alpha * 0.36 * this.glow[index]
        context.strokeStyle = color
        context.lineWidth = Math.max(1.8, size * 4.2)
        context.beginPath()
        context.moveTo(tailX, tailY)
        context.lineTo(x, y)
        context.stroke()

        context.globalAlpha = alpha
        context.lineWidth = Math.max(0.55, size)
        context.beginPath()
        context.moveTo(tailX, tailY)
        context.lineTo(x, y)
        context.stroke()
        continue
      }

      if (this.mode[index] === MODE_PLASMA) {
        const glowRadius = size * (3.2 + this.glow[index])
        const gradient = context.createRadialGradient(
          x,
          y,
          0,
          x,
          y,
          glowRadius,
        )
        gradient.addColorStop(
          0,
          `rgba(${red}, ${green}, ${blue}, ${alpha})`,
        )
        gradient.addColorStop(
          0.22,
          `rgba(${red}, ${green}, ${blue}, ${alpha * 0.72})`,
        )
        gradient.addColorStop(
          0.55,
          `rgba(${red}, ${green}, ${blue}, ${alpha * 0.18})`,
        )
        gradient.addColorStop(
          1,
          `rgba(${red}, ${green}, ${blue}, 0)`,
        )
        context.globalAlpha = 1
        context.fillStyle = gradient
        context.beginPath()
        context.arc(x, y, glowRadius, 0, TAU)
        context.fill()

        context.globalAlpha = alpha
        context.fillStyle = '#f7ffff'
        context.beginPath()
        context.arc(x, y, Math.max(0.3, size * 0.42), 0, TAU)
        context.fill()
        continue
      }

      context.globalAlpha = alpha * 0.16 * this.glow[index]
      context.fillStyle = color
      context.beginPath()
      context.arc(x, y, size * 3, 0, TAU)
      context.fill()

      context.globalAlpha = alpha
      context.beginPath()
      context.arc(x, y, size, 0, TAU)
      context.fill()
    }

    context.restore()
  }

  clear() {
    for (let index = 0; index < this.capacity; index += 1) {
      if (this.active[index]) this.release(index)
    }
    this.activeCount = 0
  }

  get activeParticles() {
    return this.activeCount
  }

  getStats(): VfxParticleStats {
    return {
      active: this.activeCount,
      capacity: this.capacity,
      emitted: this.stats.emitted,
      recycled: this.stats.recycled,
      wallImpacts: this.stats.wallImpacts,
      floorImpacts: this.stats.floorImpacts,
      splits: this.stats.splits,
    }
  }

  getIllumination(
    target: VfxIllumination = createVfxIllumination(),
  ): VfxIllumination {
    let totalWeight = 0
    let weightedX = 0
    let weightedY = 0
    let weightedZ = 0
    let weightedRed = 0
    let weightedGreen = 0
    let weightedBlue = 0
    let count = 0

    for (let index = 0; index < this.capacity; index += 1) {
      if (!this.active[index]) continue

      const progress = clamp(
        this.age[index] / this.life[index],
        0,
        1,
      )
      const lifeRatio = 1 - progress
      const fadeInDuration = Math.max(0.001, this.fadeIn[index])
      const fadeIn = clamp(progress / fadeInDuration, 0, 1)
      const alpha = clamp(
        lifeRatio *
          fadeIn *
          (this.startA[index] +
            (this.endA[index] - this.startA[index]) * progress),
        0,
        1,
      )
      if (alpha <= 0.001) continue

      const red =
        this.startR[index] +
        (this.endR[index] - this.startR[index]) * progress
      const green =
        this.startG[index] +
        (this.endG[index] - this.startG[index]) * progress
      const blue =
        this.startB[index] +
        (this.endB[index] - this.startB[index]) * progress
      const luminance =
        (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255
      const speed = Math.hypot(
        this.vx[index],
        this.vy[index],
        this.vz[index],
      )
      const projection =
        this.space === '3d'
          ? this.focalLength /
            Math.max(40, this.focalLength + this.pz[index])
          : 1
      const x =
        this.space === '3d'
          ? this.projectionCenterX +
            (this.px[index] - this.projectionCenterX) * projection
          : this.px[index]
      const y =
        this.space === '3d'
          ? this.projectionCenterY +
            (this.py[index] - this.projectionCenterY) * projection
          : this.py[index]
      const weight =
        alpha *
        Math.max(0.15, this.size[index] * projection) *
        (0.45 + luminance * 1.15) *
        (1 + Math.min(800, speed) / 1_700)

      totalWeight += weight
      weightedX += x * weight
      weightedY += y * weight
      weightedZ += this.pz[index] * weight
      weightedRed += red * weight
      weightedGreen += green * weight
      weightedBlue += blue * weight
      count += 1
    }

    if (totalWeight <= 0.0001) {
      target.x = 0
      target.y = 0
      target.z = 0
      target.energy = 0
      target.intensity = 0
      target.r = 114
      target.g = 230
      target.b = 255
      target.count = 0
      return target
    }

    target.x = weightedX / totalWeight
    target.y = weightedY / totalWeight
    target.z = weightedZ / totalWeight
    target.energy = totalWeight
    target.intensity = clamp(totalWeight / 62, 0, 1)
    target.r = Math.round(weightedRed / totalWeight)
    target.g = Math.round(weightedGreen / totalWeight)
    target.b = Math.round(weightedBlue / totalWeight)
    target.count = count
    return target
  }

  private acquire() {
    if (this.freeCount === 0) return -1
    this.freeCount -= 1
    return this.freeIndices[this.freeCount]
  }

  private release(index: number) {
    if (!this.active[index]) return
    this.active[index] = 0
    this.freeIndices[this.freeCount] = index
    this.freeCount += 1
    this.activeCount = Math.max(0, this.activeCount - 1)
    this.stats.recycled += 1
  }
}

export class VfxLightningArcPool {
  readonly capacity: number
  private readonly arcs: LightningArc[]
  private activeCount = 0

  constructor(capacity = 8) {
    this.capacity = clamp(Math.floor(capacity), 1, 64)
    this.arcs = Array.from({ length: this.capacity }, () => ({
      active: false,
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      life: 0,
      duration: 0.25,
      color: { ...DEFAULT_COLOR_START },
      branches: 3,
      amplitude: 18,
      width: 1.2,
      seed: 0,
      flashRadius: 52,
    }))
  }

  spawn({
    start,
    end,
    duration = 0.25,
    color = '#d8fbff',
    branches = 3,
    amplitude = 18,
    width = 1.2,
    seed = Math.random() * 10_000,
    flashRadius = 52,
  }: VfxLightningOptions) {
    const index = this.findSlot()
    if (index < 0) return false
    const arc = this.arcs[index]
    if (!arc.active) this.activeCount += 1
    arc.active = true
    arc.startX = start.x
    arc.startY = start.y
    arc.endX = end.x
    arc.endY = end.y
    arc.life = Math.max(0.05, duration)
    arc.duration = Math.max(0.05, duration)
    arc.color = parseColor(color)
    arc.branches = clamp(Math.floor(branches), 0, 8)
    arc.amplitude = Math.max(0, amplitude)
    arc.width = Math.max(0.2, width)
    arc.seed = seed
    arc.flashRadius = Math.max(0, flashRadius)
    return true
  }

  update(deltaSeconds: number) {
    const delta = clamp(deltaSeconds, 0, 0.25)
    for (let index = 0; index < this.arcs.length; index += 1) {
      const arc = this.arcs[index]
      if (!arc.active) continue
      arc.life -= delta
      if (arc.life <= 0) {
        arc.life = 0
        arc.active = false
        this.activeCount = Math.max(0, this.activeCount - 1)
      }
    }
  }

  render(context: CanvasRenderingContext2D) {
    if (this.activeCount === 0) return
    context.save()
    context.globalCompositeOperation = 'lighter'
    context.lineCap = 'round'
    context.lineJoin = 'round'

    for (let index = 0; index < this.arcs.length; index += 1) {
      const arc = this.arcs[index]
      if (!arc.active) continue
      const lifeRatio = clamp(arc.life / arc.duration, 0, 1)
      const progress = 1 - lifeRatio
      const flicker =
        0.76 +
        Math.sin(arc.seed + progress * 113) * 0.13 +
        Math.sin(arc.seed * 1.7 + progress * 271) * 0.11
      const alpha = clamp(lifeRatio * flicker, 0, 1)
      const { r, g, b } = arc.color

      const flash = clamp(1 - progress * 3.6, 0, 1)
      if (flash > 0) {
        const radius = arc.flashRadius * (0.6 + progress * 0.75)
        const gradient = context.createRadialGradient(
          arc.endX,
          arc.endY,
          0,
          arc.endX,
          arc.endY,
          Math.max(1, radius),
        )
        gradient.addColorStop(
          0,
          `rgba(255, 255, 255, ${flash * 0.95})`,
        )
        gradient.addColorStop(
          0.2,
          `rgba(${r}, ${g}, ${b}, ${flash * 0.6})`,
        )
        gradient.addColorStop(
          0.55,
          `rgba(92, 197, 255, ${flash * 0.18})`,
        )
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
        context.globalAlpha = 1
        context.fillStyle = gradient
        context.beginPath()
        context.arc(arc.endX, arc.endY, radius, 0, TAU)
        context.fill()
      }

      this.drawBolt(
        context,
        arc,
        arc.startX,
        arc.startY,
        arc.endX,
        arc.endY,
        alpha,
        0,
        progress,
      )

      for (let branch = 0; branch < arc.branches; branch += 1) {
        const branchSeed = arc.seed + branch * 91.7
        const branchT = 0.24 + this.hash(branchSeed) * 0.56
        const branchAngle =
          Math.atan2(
            arc.endY - arc.startY,
            arc.endX - arc.startX,
          ) +
          Math.PI +
          (this.hash(branchSeed + 4.3) * 2 - 1) * 0.72
        const branchLength =
          arc.amplitude * (0.85 + this.hash(branchSeed + 8.7) * 1.25)
        const branchX = arc.startX + (arc.endX - arc.startX) * branchT
        const branchY = arc.startY + (arc.endY - arc.startY) * branchT
        this.drawBolt(
          context,
          arc,
          branchX,
          branchY,
          branchX + Math.cos(branchAngle) * branchLength,
          branchY + Math.sin(branchAngle) * branchLength,
          alpha * (0.35 + this.hash(branchSeed + 3.1) * 0.3),
          1,
          progress,
        )
      }
    }

    context.restore()
  }

  clear() {
    for (let index = 0; index < this.arcs.length; index += 1) {
      this.arcs[index].active = false
      this.arcs[index].life = 0
    }
    this.activeCount = 0
  }

  get activeArcs() {
    return this.activeCount
  }

  getIllumination(
    target: VfxIllumination = createVfxIllumination(),
  ): VfxIllumination {
    let totalWeight = 0
    let weightedX = 0
    let weightedY = 0
    let weightedRed = 0
    let weightedGreen = 0
    let weightedBlue = 0
    let count = 0

    for (let index = 0; index < this.arcs.length; index += 1) {
      const arc = this.arcs[index]
      if (!arc.active) continue
      const lifeRatio = clamp(arc.life / arc.duration, 0, 1)
      const flicker =
        0.82 + Math.sin(arc.seed + performance.now() * 0.07) * 0.18
      const luminance =
        (arc.color.r * 0.2126 +
          arc.color.g * 0.7152 +
          arc.color.b * 0.0722) /
        255
      const weight =
        lifeRatio *
        flicker *
        (30 + arc.flashRadius * 0.58) *
        luminance

      totalWeight += weight
      weightedX += (arc.startX * 0.18 + arc.endX * 0.82) * weight
      weightedY += (arc.startY * 0.18 + arc.endY * 0.82) * weight
      weightedRed += arc.color.r * weight
      weightedGreen += arc.color.g * weight
      weightedBlue += arc.color.b * weight
      count += 1
    }

    if (totalWeight <= 0.0001) {
      target.x = 0
      target.y = 0
      target.z = 0
      target.energy = 0
      target.intensity = 0
      target.r = 114
      target.g = 230
      target.b = 255
      target.count = 0
      return target
    }

    target.x = weightedX / totalWeight
    target.y = weightedY / totalWeight
    target.z = 0
    target.energy = totalWeight
    target.intensity = clamp(totalWeight / 58, 0, 1)
    target.r = Math.round(weightedRed / totalWeight)
    target.g = Math.round(weightedGreen / totalWeight)
    target.b = Math.round(weightedBlue / totalWeight)
    target.count = count
    return target
  }

  private drawBolt(
    context: CanvasRenderingContext2D,
    arc: LightningArc,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    alpha: number,
    depth: number,
    progress: number,
  ) {
    const deltaX = endX - startX
    const deltaY = endY - startY
    const length = Math.hypot(deltaX, deltaY)
    if (length < 0.001) return
    const perpendicularX = -deltaY / length
    const perpendicularY = deltaX / length
    const segments = depth > 0 ? 7 : 17
    const amplitude = arc.amplitude * (depth > 0 ? 0.42 : 1)
    const timeSeed = Math.floor(progress * 18) * 0.73
    const points: Array<{ x: number; y: number }> = []

    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments
      const envelope = Math.sin(t * Math.PI)
      const noise =
        Math.sin(t * 39.7 + arc.seed + timeSeed) * 0.58 +
        Math.sin(t * 97.1 + arc.seed * 1.9 + timeSeed * 2.2) * 0.29 +
        Math.sin(t * 211.3 + arc.seed * 0.7 + timeSeed * 3.4) * 0.13
      const offset = noise * amplitude * envelope
      points.push({
        x: startX + deltaX * t + perpendicularX * offset,
        y: startY + deltaY * t + perpendicularY * offset,
      })
    }

    const { r, g, b } = arc.color
    context.globalAlpha = alpha * 0.13
    context.strokeStyle = `rgb(${r} ${g} ${b})`
    context.lineWidth = arc.width * (depth > 0 ? 3 : 8)
    this.tracePolyline(context, points)
    context.stroke()

    context.globalAlpha = alpha * 0.56
    context.lineWidth = arc.width * (depth > 0 ? 1.9 : 3.3)
    this.tracePolyline(context, points)
    context.stroke()

    context.globalAlpha = alpha
    context.strokeStyle = 'rgb(248 254 255)'
    context.lineWidth = arc.width * (depth > 0 ? 0.55 : 0.9)
    this.tracePolyline(context, points)
    context.stroke()
  }

  private tracePolyline(
    context: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
  ) {
    context.beginPath()
    context.moveTo(points[0].x, points[0].y)
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y)
    }
  }

  private hash(value: number) {
    const sine = Math.sin(value * 12.9898) * 43_758.5453
    return sine - Math.floor(sine)
  }

  private findSlot() {
    for (let index = 0; index < this.arcs.length; index += 1) {
      if (!this.arcs[index].active) return index
    }
    let oldestIndex = 0
    let lowestLife = Number.POSITIVE_INFINITY
    for (let index = 0; index < this.arcs.length; index += 1) {
      if (this.arcs[index].life < lowestLife) {
        lowestLife = this.arcs[index].life
        oldestIndex = index
      }
    }
    return oldestIndex
  }
}
