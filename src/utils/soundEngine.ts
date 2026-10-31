export type SoundEvent =
  | 'hoverTick'
  | 'cardActivate'
  | 'physicsCollision'
  | 'ropeSnap'
  | 'laserPulse'

export interface SoundEngineDiagnostics {
  initialized: boolean
  state: AudioContextState | 'uninitialized'
  masterVolume: number
  compressorRatio: number
  throttleWindowMs: number
  triggerCounts: Record<SoundEvent, number>
  analyserReady: boolean
}

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

const THROTTLE_WINDOW_MS = 40
const SPECTRUM_BANDS: ReadonlyArray<readonly [number, number]> = [
  [45, 250],
  [250, 800],
  [800, 2_500],
  [2_500, 7_000],
  [7_000, 16_000],
]

export class SoundEngine {
  private static instance: SoundEngine | null = null

  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private analyser: AnalyserNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private frequencyData: Uint8Array<ArrayBuffer> | null = null
  private masterVolume = 0.62
  private lastTriggered: Record<SoundEvent, number> = {
    hoverTick: Number.NEGATIVE_INFINITY,
    cardActivate: Number.NEGATIVE_INFINITY,
    physicsCollision: Number.NEGATIVE_INFINITY,
    ropeSnap: Number.NEGATIVE_INFINITY,
    laserPulse: Number.NEGATIVE_INFINITY,
  }
  private triggerCounts: Record<SoundEvent, number> = {
    hoverTick: 0,
    cardActivate: 0,
    physicsCollision: 0,
    ropeSnap: 0,
    laserPulse: 0,
  }

  private constructor() {}

  static getInstance() {
    if (!SoundEngine.instance) {
      SoundEngine.instance = new SoundEngine()
    }
    return SoundEngine.instance
  }

  async unlock() {
    const context = this.ensureContext()
    if (!context) return false
    if (context.state === 'suspended') {
      try {
        await context.resume()
      } catch {
        return false
      }
    }
    return context.state === 'running'
  }

  setMasterVolume(value: number) {
    this.masterVolume = Math.min(1, Math.max(0, value))
    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(
        this.masterVolume,
        this.context.currentTime,
        0.015,
      )
    }
  }

  getDiagnostics(): SoundEngineDiagnostics {
    return {
      initialized: this.context !== null,
      state: this.context?.state ?? 'uninitialized',
      masterVolume: this.masterVolume,
      compressorRatio: this.compressor?.ratio.value ?? 0,
      throttleWindowMs: THROTTLE_WINDOW_MS,
      triggerCounts: { ...this.triggerCounts },
      analyserReady: this.analyser !== null,
    }
  }

  readFrequencyBands(target: Float32Array) {
    target.fill(0)
    const analyser = this.analyser
    const context = this.context
    const frequencyData = this.frequencyData
    if (!analyser || !context || !frequencyData) return false

    analyser.getByteFrequencyData(frequencyData)
    const binWidth = context.sampleRate / analyser.fftSize

    for (let bandIndex = 0; bandIndex < SPECTRUM_BANDS.length; bandIndex += 1) {
      const band = SPECTRUM_BANDS[bandIndex]
      const startBin = Math.max(1, Math.floor(band[0] / binWidth))
      const endBin = Math.min(
        frequencyData.length - 1,
        Math.ceil(band[1] / binWidth),
      )
      let sum = 0
      let peak = 0

      for (let bin = startBin; bin <= endBin; bin += 1) {
        const value = frequencyData[bin]
        sum += value
        peak = Math.max(peak, value)
      }

      const count = Math.max(1, endBin - startBin + 1)
      const average = sum / count / 255
      target[bandIndex] = Math.min(
        1,
        average * 2.4 + (peak / 255) * 0.28,
      )
    }

    return true
  }

  playHoverTick() {
    if (!this.canTrigger('hoverTick')) return false
    const context = this.ensureContext()
    if (!context) return false
    this.resumeContext(context)

    const start = context.currentTime
    const compressor = this.compressor
    if (!compressor) return false

    const noise = context.createBufferSource()
    noise.buffer = this.getNoiseBuffer(context)
    const bandpass = context.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.setValueAtTime(3_600, start)
    bandpass.Q.setValueAtTime(1.8, start)
    const noiseGain = context.createGain()
    noiseGain.gain.setValueAtTime(0.0001, start)
    noiseGain.gain.exponentialRampToValueAtTime(0.032, start + 0.0012)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.014)
    noise.connect(bandpass)
    bandpass.connect(noiseGain)
    noiseGain.connect(compressor)
    noise.start(start)
    noise.stop(start + 0.015)

    const tick = context.createOscillator()
    const tickGain = context.createGain()
    tick.type = 'sine'
    tick.frequency.setValueAtTime(1_800, start)
    tick.frequency.exponentialRampToValueAtTime(1_180, start + 0.013)
    tickGain.gain.setValueAtTime(0.0001, start)
    tickGain.gain.exponentialRampToValueAtTime(0.026, start + 0.001)
    tickGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.015)
    tick.connect(tickGain)
    tickGain.connect(compressor)
    tick.start(start)
    tick.stop(start + 0.016)
    return true
  }

  playCardActivate() {
    if (!this.canTrigger('cardActivate')) return false
    const context = this.ensureContext()
    if (!context) return false
    this.resumeContext(context)

    const start = context.currentTime
    const compressor = this.compressor
    if (!compressor) return false
    const bus = context.createGain()
    const duration = 0.38
    bus.gain.setValueAtTime(0.0001, start)
    bus.gain.exponentialRampToValueAtTime(0.052, start + 0.035)
    bus.gain.setValueAtTime(0.052, start + 0.11)
    bus.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    bus.connect(compressor)

    const voices = [
      { frequency: 392, type: 'triangle' as OscillatorType, detune: -2 },
      { frequency: 587.33, type: 'triangle' as OscillatorType, detune: 2 },
      { frequency: 784, type: 'sine' as OscillatorType, detune: -1 },
    ]

    for (let index = 0; index < voices.length; index += 1) {
      const voice = voices[index]
      const oscillator = context.createOscillator()
      oscillator.type = voice.type
      oscillator.frequency.setValueAtTime(voice.frequency, start)
      oscillator.detune.setValueAtTime(voice.detune, start)
      oscillator.connect(bus)
      oscillator.start(start)
      oscillator.stop(start + duration + 0.02)
    }
    return true
  }

  playPhysicsCollision(impactVelocity: number) {
    const velocity = Math.abs(impactVelocity)
    if (velocity < 18) return false
    if (!this.canTrigger('physicsCollision')) return false
    const context = this.ensureContext()
    if (!context) return false
    this.resumeContext(context)

    const start = context.currentTime
    const compressor = this.compressor
    if (!compressor) return false
    const normalizedSpeed = Math.min(1, velocity / 1_100)
    const baseFrequency = 86 + normalizedSpeed * 180
    const duration = 0.12 + normalizedSpeed * 0.12
    const impactGain = 0.018 + normalizedSpeed * 0.07

    const body = context.createOscillator()
    const bodyGain = context.createGain()
    body.type = 'triangle'
    body.frequency.setValueAtTime(baseFrequency, start)
    body.frequency.exponentialRampToValueAtTime(
      Math.max(42, baseFrequency * 0.52),
      start + duration * 0.7,
    )
    bodyGain.gain.setValueAtTime(0.0001, start)
    bodyGain.gain.exponentialRampToValueAtTime(
      impactGain,
      start + 0.003,
    )
    bodyGain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + duration,
    )
    body.connect(bodyGain)
    bodyGain.connect(compressor)
    body.start(start)
    body.stop(start + duration + 0.02)

    const click = context.createBufferSource()
    click.buffer = this.getNoiseBuffer(context)
    const clickFilter = context.createBiquadFilter()
    clickFilter.type = 'bandpass'
    clickFilter.frequency.setValueAtTime(
      1_100 + normalizedSpeed * 2_200,
      start,
    )
    clickFilter.Q.setValueAtTime(1.15, start)
    const clickGain = context.createGain()
    clickGain.gain.setValueAtTime(0.0001, start)
    clickGain.gain.exponentialRampToValueAtTime(
      0.01 + normalizedSpeed * 0.026,
      start + 0.001,
    )
    clickGain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + 0.045,
    )
    click.connect(clickFilter)
    clickFilter.connect(clickGain)
    clickGain.connect(compressor)
    click.start(start)
    click.stop(start + 0.05)
    return true
  }

  playRopeSnap() {
    if (!this.canTrigger('ropeSnap')) return false
    const context = this.ensureContext()
    if (!context) return false
    this.resumeContext(context)

    const start = context.currentTime
    const compressor = this.compressor
    if (!compressor) return false

    const snap = context.createOscillator()
    const snapGain = context.createGain()
    snap.type = 'sawtooth'
    snap.frequency.setValueAtTime(2_400, start)
    snap.frequency.exponentialRampToValueAtTime(290, start + 0.18)
    snapGain.gain.setValueAtTime(0.0001, start)
    snapGain.gain.exponentialRampToValueAtTime(0.026, start + 0.004)
    snapGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22)
    const snapFilter = context.createBiquadFilter()
    snapFilter.type = 'highpass'
    snapFilter.frequency.setValueAtTime(460, start)
    snap.connect(snapFilter)
    snapFilter.connect(snapGain)
    snapGain.connect(compressor)
    snap.start(start)
    snap.stop(start + 0.23)

    const impact = context.createOscillator()
    const impactGain = context.createGain()
    impact.type = 'sine'
    impact.frequency.setValueAtTime(112, start)
    impact.frequency.exponentialRampToValueAtTime(38, start + 0.26)
    impactGain.gain.setValueAtTime(0.0001, start)
    impactGain.gain.exponentialRampToValueAtTime(0.09, start + 0.004)
    impactGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3)
    impact.connect(impactGain)
    impactGain.connect(compressor)
    impact.start(start)
    impact.stop(start + 0.31)
    return true
  }

  playLaserPulse() {
    if (!this.canTrigger('laserPulse')) return false
    const context = this.ensureContext()
    if (!context) return false
    this.resumeContext(context)

    const start = context.currentTime
    const compressor = this.compressor
    if (!compressor) return false
    const duration = 0.36
    const laser = context.createOscillator()
    const laserGain = context.createGain()
    const filter = context.createBiquadFilter()
    laser.type = 'sawtooth'
    laser.frequency.setValueAtTime(1_200, start)
    laser.frequency.exponentialRampToValueAtTime(
      80,
      start + duration,
    )
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(2_800, start)
    filter.frequency.exponentialRampToValueAtTime(
      420,
      start + duration,
    )
    filter.Q.setValueAtTime(4.5, start)
    laserGain.gain.setValueAtTime(0.0001, start)
    laserGain.gain.exponentialRampToValueAtTime(0.06, start + 0.006)
    laserGain.gain.setValueAtTime(0.046, start + 0.16)
    laserGain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + duration,
    )
    laser.connect(filter)
    filter.connect(laserGain)
    laserGain.connect(compressor)
    laser.start(start)
    laser.stop(start + duration + 0.02)
    return true
  }

  private ensureContext() {
    if (this.context) return this.context
    if (typeof window === 'undefined') return null

    const AudioContextClass =
      window.AudioContext ??
      (window as AudioWindow).webkitAudioContext
    if (!AudioContextClass) return null

    const context = new AudioContextClass()
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.setValueAtTime(-18, context.currentTime)
    compressor.knee.setValueAtTime(16, context.currentTime)
    compressor.ratio.setValueAtTime(4.5, context.currentTime)
    compressor.attack.setValueAtTime(0.003, context.currentTime)
    compressor.release.setValueAtTime(0.18, context.currentTime)

    const masterGain = context.createGain()
    masterGain.gain.setValueAtTime(
      this.masterVolume,
      context.currentTime,
    )
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    analyser.minDecibels = -92
    analyser.maxDecibels = -16
    analyser.smoothingTimeConstant = 0.72
    compressor.connect(analyser)
    analyser.connect(masterGain)
    masterGain.connect(context.destination)

    this.context = context
    this.compressor = compressor
    this.analyser = analyser
    this.frequencyData = new Uint8Array(analyser.frequencyBinCount)
    this.masterGain = masterGain
    return context
  }

  private getNoiseBuffer(context: AudioContext) {
    if (this.noiseBuffer) return this.noiseBuffer
    const frameCount = Math.ceil(context.sampleRate * 0.08)
    const buffer = context.createBuffer(
      1,
      frameCount,
      context.sampleRate,
    )
    const channel = buffer.getChannelData(0)
    for (let index = 0; index < frameCount; index += 1) {
      channel[index] = Math.random() * 2 - 1
    }
    this.noiseBuffer = buffer
    return buffer
  }

  private resumeContext(context: AudioContext) {
    if (context.state === 'suspended') {
      void context.resume()
    }
  }

  private canTrigger(event: SoundEvent) {
    if (typeof performance === 'undefined') return false
    const now = performance.now()
    if (now - this.lastTriggered[event] < THROTTLE_WINDOW_MS) {
      return false
    }
    this.lastTriggered[event] = now
    this.triggerCounts[event] += 1
    return true
  }
}

export const soundEngine = SoundEngine.getInstance()
