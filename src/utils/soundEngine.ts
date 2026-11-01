import { AUDIO_STAGE_PAD_FREQUENCIES } from '../data/audioStage'

export type SoundEvent =
  | 'hoverTick'
  | 'cardActivate'
  | 'localeConfirm'
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
  audioEnergy: number
  audioPeak: number
  arpeggiatorRunning: boolean
  stageAnalyserReady: boolean
  stageAnalyserFftSize: number
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
  private stageAnalyser: AnalyserNode | null = null
  private stageSynthBus: GainNode | null = null
  private stageMuteGain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private frequencyData: Uint8Array<ArrayBuffer> | null = null
  private waveformData: Uint8Array<ArrayBuffer> | null = null
  private stageFrequencyData: Uint8Array<ArrayBuffer> | null = null
  private stageWaveformData: Uint8Array<ArrayBuffer> | null = null
  private arpeggiatorTimer: number | null = null
  private transientTimers = new Set<number>()
  private arpeggiatorRunning = false
  private arpeggiatorMuted = true
  private arpeggiatorBpm = 104
  private arpeggiatorStep = 0
  private arpeggiatorNextNoteTime = 0
  private audioEnergy = 0
  private audioPeak = 0
  private lastEnergySampleAt = Number.NEGATIVE_INFINITY
  private masterVolume = 0.62
  private lastTriggered: Record<SoundEvent, number> = {
    hoverTick: Number.NEGATIVE_INFINITY,
    cardActivate: Number.NEGATIVE_INFINITY,
    localeConfirm: Number.NEGATIVE_INFINITY,
    physicsCollision: Number.NEGATIVE_INFINITY,
    ropeSnap: Number.NEGATIVE_INFINITY,
    laserPulse: Number.NEGATIVE_INFINITY,
  }
  private triggerCounts: Record<SoundEvent, number> = {
    hoverTick: 0,
    cardActivate: 0,
    localeConfirm: 0,
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
      audioEnergy: this.audioEnergy,
      audioPeak: this.audioPeak,
      arpeggiatorRunning: this.arpeggiatorRunning,
      stageAnalyserReady: this.stageAnalyser !== null,
      stageAnalyserFftSize: this.stageAnalyser?.fftSize ?? 0,
    }
  }

  readEnergyEnvelope(now = performance.now()) {
    const elapsed =
      this.lastEnergySampleAt > 0
        ? Math.max(0, now - this.lastEnergySampleAt) / 1_000
        : 1 / 60

    if (
      this.lastEnergySampleAt > 0 &&
      now - this.lastEnergySampleAt < 3
    ) {
      return this.audioEnergy
    }

    const analyser = this.analyser
    const context = this.context
    const waveformData = this.waveformData
    let rawEnergy = 0
    let rawPeak = 0

    if (
      analyser &&
      context?.state === 'running' &&
      waveformData
    ) {
      analyser.getByteTimeDomainData(waveformData)
      let sumSquares = 0
      for (let index = 0; index < waveformData.length; index += 1) {
        const sample = (waveformData[index] - 128) / 128
        const absolute = Math.abs(sample)
        sumSquares += sample * sample
        rawPeak = Math.max(rawPeak, absolute)
      }
      const rms = Math.sqrt(sumSquares / waveformData.length)
      rawEnergy = Math.min(1, rms * 17 + rawPeak * 1.5)
    }

    const safeDelta = Math.min(0.05, Math.max(0.001, elapsed))
    const attack = 1 - Math.exp(-safeDelta * 42)
    const release = Math.exp(-safeDelta * 8.5)
    this.audioEnergy =
      rawEnergy >= this.audioEnergy
        ? this.audioEnergy + (rawEnergy - this.audioEnergy) * attack
        : Math.max(rawEnergy, this.audioEnergy * release)
    this.audioPeak = Math.max(rawPeak, this.audioPeak * release)

    if (this.audioEnergy < 0.001) this.audioEnergy = 0
    if (this.audioPeak < 0.001) this.audioPeak = 0
    this.lastEnergySampleAt = now
    return this.audioEnergy
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

  readStageSpectrum(
    frequencyTarget: Uint8Array<ArrayBuffer>,
    waveformTarget: Uint8Array<ArrayBuffer>,
  ) {
    const analyser = this.stageAnalyser
    const context = this.context
    const frequencyData = this.stageFrequencyData
    const waveformData = this.stageWaveformData
    if (
      !analyser ||
      !context ||
      !frequencyData ||
      !waveformData
    ) {
      return false
    }
    analyser.getByteFrequencyData(frequencyData)
    analyser.getByteTimeDomainData(waveformData)
    frequencyTarget.set(frequencyData.subarray(0, frequencyTarget.length))
    waveformTarget.set(waveformData.subarray(0, waveformTarget.length))
    return context.state === 'running'
  }

  async startArpeggiator(muted = true, bpm = 104) {
    const context = this.ensureContext()
    if (!context) return false
    if (context.state === 'suspended') {
      try {
        await context.resume()
      } catch {
        return false
      }
    }
    this.setArpeggiatorTempo(bpm)
    this.setArpeggiatorMuted(muted)
    if (this.arpeggiatorRunning) return true
    if (!this.stageSynthBus || !this.stageAnalyser) return false

    this.arpeggiatorRunning = true
    this.arpeggiatorStep = 0
    this.arpeggiatorNextNoteTime = context.currentTime + 0.045
    this.stageSynthBus.gain.setTargetAtTime(
      0.24,
      context.currentTime,
      0.03,
    )
    this.scheduleArpeggiator()
    if (typeof window !== 'undefined') {
      this.arpeggiatorTimer = window.setInterval(
        () => this.scheduleArpeggiator(),
        45,
      )
    }
    return true
  }

  stopArpeggiator() {
    this.arpeggiatorRunning = false
    if (
      this.arpeggiatorTimer !== null &&
      typeof window !== 'undefined'
    ) {
      window.clearInterval(this.arpeggiatorTimer)
      this.arpeggiatorTimer = null
    } else {
      this.arpeggiatorTimer = null
    }
    if (this.stageSynthBus && this.context) {
      this.stageSynthBus.gain.setTargetAtTime(
        0.0001,
        this.context.currentTime,
        0.035,
      )
    }
  }

  dispose() {
    this.stopArpeggiator()
    if (typeof window !== 'undefined') {
      this.transientTimers.forEach((timer) =>
        window.clearTimeout(timer),
      )
    }
    this.transientTimers.clear()

    const nodes: Array<AudioNode | null> = [
      this.stageSynthBus,
      this.stageAnalyser,
      this.stageMuteGain,
      this.compressor,
      this.analyser,
      this.masterGain,
    ]
    for (const node of nodes) {
      if (!node) continue
      try {
        node.disconnect()
      } catch {
        // AudioNode.disconnect is idempotent but may throw in older engines.
      }
    }

    const context = this.context
    this.context = null
    this.compressor = null
    this.masterGain = null
    this.analyser = null
    this.stageAnalyser = null
    this.stageSynthBus = null
    this.stageMuteGain = null
    this.noiseBuffer = null
    this.frequencyData = null
    this.waveformData = null
    this.stageFrequencyData = null
    this.stageWaveformData = null
    this.audioEnergy = 0
    this.audioPeak = 0
    this.lastEnergySampleAt = Number.NEGATIVE_INFINITY

    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined)
    }
  }

  async playStagePad(padIndex: number, muted = true) {
    const context = this.ensureContext()
    if (!context) return false
    if (context.state === 'suspended') {
      try {
        await context.resume()
      } catch {
        return false
      }
    }
    if (context.state !== 'running') return false

    const bus = this.stageSynthBus
    if (!bus) return false
    const normalizedPad = Math.max(
      0,
      Math.min(
        AUDIO_STAGE_PAD_FREQUENCIES.length - 1,
        Math.round(padIndex),
      ),
    )
    const root =
      AUDIO_STAGE_PAD_FREQUENCIES[normalizedPad] ?? 261.63
    const start = context.currentTime + 0.01
    const duration = 0.72 + normalizedPad * 0.018

    this.setArpeggiatorMuted(muted)
    if (!this.arpeggiatorRunning) {
      bus.gain.cancelScheduledValues(context.currentTime)
      bus.gain.setTargetAtTime(
        0.26,
        context.currentTime,
        0.012,
      )
    }

    const padGain = context.createGain()
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(
      4_200 + normalizedPad * 320,
      start,
    )
    filter.frequency.exponentialRampToValueAtTime(
      1_200 + normalizedPad * 110,
      start + duration,
    )
    filter.Q.setValueAtTime(0.82, start)
    padGain.gain.setValueAtTime(0.0001, start)
    padGain.gain.exponentialRampToValueAtTime(
      0.13,
      start + 0.006,
    )
    padGain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + duration,
    )
    padGain.connect(filter)
    filter.connect(bus)

    const intervals = [0.5, 1, 1.25, 1.5, 2] as const
    const oscillators: OscillatorNode[] = []
    const voiceGains: GainNode[] = []
    for (
      let voiceIndex = 0;
      voiceIndex < intervals.length;
      voiceIndex += 1
    ) {
      const interval = intervals[voiceIndex]
      const oscillator = context.createOscillator()
      const voiceGain = context.createGain()
      oscillator.type =
        voiceIndex === 1 || voiceIndex === 4
          ? 'triangle'
          : 'sine'
      oscillator.frequency.setValueAtTime(
        root * interval,
        start,
      )
      oscillator.detune.setValueAtTime(
        (voiceIndex - 2) * 2.4,
        start,
      )
      voiceGain.gain.setValueAtTime(
        voiceIndex === 0 ? 0.26 : 0.2,
        start,
      )
      oscillator.connect(voiceGain)
      voiceGain.connect(padGain)
      oscillator.start(start)
      oscillator.stop(start + duration + 0.03)
      oscillators.push(oscillator)
      voiceGains.push(voiceGain)
    }

    const finalOscillator =
      oscillators[oscillators.length - 1]
    if (finalOscillator) {
      this.disconnectWhenEnded(finalOscillator, [
        ...oscillators,
        ...voiceGains,
        padGain,
        filter,
      ])
    }

    if (typeof window !== 'undefined') {
      this.scheduleTransient(() => {
        if (
          !this.arpeggiatorRunning &&
          this.stageSynthBus === bus &&
          this.context
        ) {
          bus.gain.setTargetAtTime(
            0.0001,
            this.context.currentTime,
            0.055,
          )
        }
      }, Math.ceil((duration + 0.18) * 1_000))
    }
    return true
  }

  setArpeggiatorMuted(muted: boolean) {
    this.arpeggiatorMuted = muted
    if (!this.stageMuteGain || !this.context) return
    this.stageMuteGain.gain.setTargetAtTime(
      muted ? 0.0001 : 0.92,
      this.context.currentTime,
      0.02,
    )
  }

  setArpeggiatorTempo(bpm: number) {
    this.arpeggiatorBpm = Math.min(
      160,
      Math.max(56, Number.isFinite(bpm) ? bpm : 104),
    )
  }

  isArpeggiatorRunning() {
    return this.arpeggiatorRunning
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
    this.disconnectWhenEnded(tick, [
      noise,
      bandpass,
      noiseGain,
      tick,
      tickGain,
    ])
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
    const oscillators: OscillatorNode[] = []

    for (let index = 0; index < voices.length; index += 1) {
      const voice = voices[index]
      const oscillator = context.createOscillator()
      oscillator.type = voice.type
      oscillator.frequency.setValueAtTime(voice.frequency, start)
      oscillator.detune.setValueAtTime(voice.detune, start)
      oscillator.connect(bus)
      oscillator.start(start)
      oscillator.stop(start + duration + 0.02)
      oscillators.push(oscillator)
    }
    const finalOscillator =
      oscillators[oscillators.length - 1]
    if (finalOscillator) {
      this.disconnectWhenEnded(finalOscillator, [
        bus,
        ...oscillators,
      ])
    }
    return true
  }

  playLocaleConfirm() {
    if (!this.canTrigger('localeConfirm')) return false
    const context = this.ensureContext()
    if (!context) return false
    this.resumeContext(context)

    const start = context.currentTime
    const compressor = this.compressor
    if (!compressor) return false
    const bus = context.createGain()
    const duration = 0.22
    bus.gain.setValueAtTime(0.0001, start)
    bus.gain.exponentialRampToValueAtTime(0.042, start + 0.008)
    bus.gain.exponentialRampToValueAtTime(0.018, start + 0.09)
    bus.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    bus.connect(compressor)

    const notes = [
      { frequency: 880, start: 0, duration: 0.105 },
      { frequency: 1_318.51, start: 0.072, duration: 0.14 },
    ]
    const oscillators: OscillatorNode[] = []
    const gains: GainNode[] = []
    for (const note of notes) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const noteStart = start + note.start
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(note.frequency, noteStart)
      oscillator.detune.setValueAtTime(-2, noteStart)
      gain.gain.setValueAtTime(0.0001, noteStart)
      gain.gain.exponentialRampToValueAtTime(
        0.74,
        noteStart + 0.004,
      )
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        noteStart + note.duration,
      )
      oscillator.connect(gain)
      gain.connect(bus)
      oscillator.start(noteStart)
      oscillator.stop(noteStart + note.duration + 0.02)
      oscillators.push(oscillator)
      gains.push(gain)
    }
    const finalOscillator =
      oscillators[oscillators.length - 1]
    if (finalOscillator) {
      this.disconnectWhenEnded(finalOscillator, [
        bus,
        ...oscillators,
        ...gains,
      ])
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
    this.disconnectWhenEnded(body, [
      body,
      bodyGain,
      click,
      clickFilter,
      clickGain,
    ])
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
    this.disconnectWhenEnded(impact, [
      snap,
      snapFilter,
      snapGain,
      impact,
      impactGain,
    ])
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
    this.disconnectWhenEnded(laser, [
      laser,
      filter,
      laserGain,
    ])
    return true
  }

  private scheduleArpeggiator() {
    const context = this.context
    const bus = this.stageSynthBus
    if (
      !this.arpeggiatorRunning ||
      !context ||
      !bus ||
      context.state !== 'running'
    ) {
      return
    }

    const stepDuration = 60 / this.arpeggiatorBpm / 4
    const scheduleAhead = 0.18
    while (
      this.arpeggiatorNextNoteTime <
      context.currentTime + scheduleAhead
    ) {
      this.scheduleArpeggiatorStep(
        this.arpeggiatorStep,
        this.arpeggiatorNextNoteTime,
        bus,
      )
      this.arpeggiatorStep =
        (this.arpeggiatorStep + 1) % 16
      this.arpeggiatorNextNoteTime += stepDuration
    }
  }

  private scheduleArpeggiatorStep(
    step: number,
    start: number,
    bus: GainNode,
  ) {
    const context = this.context
    if (!context) return
    const sequence = [
      261.63, 329.63, 392, 493.88,
      523.25, 659.25, 783.99, 987.77,
      659.25, 523.25, 493.88, 392,
      329.63, 392, 493.88, 659.25,
    ] as const
    const bassRoots = [65.41, 55, 43.65, 49] as const
    const accentPattern = [1, 0.72, 0.88, 0.64] as const
    const frequency = sequence[step] ?? 261.63
    const accent = accentPattern[step % 4] ?? 1
    const noteDuration = 0.34

    const electricPianoGain = context.createGain()
    const electricPianoFilter = context.createBiquadFilter()
    electricPianoFilter.type = 'lowpass'
    electricPianoFilter.frequency.setValueAtTime(4_600, start)
    electricPianoFilter.Q.setValueAtTime(0.72, start)
    electricPianoGain.gain.setValueAtTime(0.0001, start)
    electricPianoGain.gain.exponentialRampToValueAtTime(
      0.095 * accent,
      start + 0.006,
    )
    electricPianoGain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + noteDuration,
    )
    electricPianoGain.connect(electricPianoFilter)
    electricPianoFilter.connect(bus)

    const bodyOscillator = context.createOscillator()
    bodyOscillator.type = 'sine'
    bodyOscillator.frequency.setValueAtTime(frequency, start)
    bodyOscillator.detune.setValueAtTime(-3, start)
    bodyOscillator.connect(electricPianoGain)
    bodyOscillator.start(start)
    bodyOscillator.stop(start + noteDuration + 0.02)

    const tineOscillator = context.createOscillator()
    const tineGain = context.createGain()
    tineOscillator.type = 'triangle'
    tineOscillator.frequency.setValueAtTime(
      frequency * 2.005,
      start,
    )
    tineOscillator.detune.setValueAtTime(4, start)
    tineGain.gain.setValueAtTime(0.0001, start)
    tineGain.gain.exponentialRampToValueAtTime(
      0.025 * accent,
      start + 0.004,
    )
    tineGain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + 0.18,
    )
    tineOscillator.connect(tineGain)
    tineGain.connect(electricPianoFilter)
    tineOscillator.start(start)
    tineOscillator.stop(start + 0.2)
    this.disconnectWhenEnded(bodyOscillator, [
      bodyOscillator,
      tineOscillator,
      electricPianoGain,
      electricPianoFilter,
      tineGain,
    ])

    if (step % 4 !== 0) return
    const bassFrequency =
      bassRoots[Math.floor(step / 4) % bassRoots.length] ?? 65.41
    const bassDuration = 0.62
    const bassGain = context.createGain()
    const bassFilter = context.createBiquadFilter()
    bassFilter.type = 'lowpass'
    bassFilter.frequency.setValueAtTime(460, start)
    bassFilter.frequency.exponentialRampToValueAtTime(
      210,
      start + bassDuration,
    )
    bassFilter.Q.setValueAtTime(1.4, start)
    bassGain.gain.setValueAtTime(0.0001, start)
    bassGain.gain.exponentialRampToValueAtTime(
      0.11,
      start + 0.018,
    )
    bassGain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + bassDuration,
    )
    bassGain.connect(bassFilter)
    bassFilter.connect(bus)

    const bassOscillator = context.createOscillator()
    const bassSubOscillator = context.createOscillator()
    bassOscillator.type = 'triangle'
    bassSubOscillator.type = 'sine'
    bassOscillator.frequency.setValueAtTime(bassFrequency * 2, start)
    bassSubOscillator.frequency.setValueAtTime(
      bassFrequency,
      start,
    )
    bassOscillator.connect(bassGain)
    bassSubOscillator.connect(bassGain)
    bassOscillator.start(start)
    bassSubOscillator.start(start)
    bassOscillator.stop(start + bassDuration + 0.02)
    bassSubOscillator.stop(start + bassDuration + 0.02)
    this.disconnectWhenEnded(bassSubOscillator, [
      bassGain,
      bassFilter,
      bassOscillator,
      bassSubOscillator,
    ])
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

    const stageSynthBus = context.createGain()
    stageSynthBus.gain.setValueAtTime(
      0.0001,
      context.currentTime,
    )
    const stageAnalyser = context.createAnalyser()
    stageAnalyser.fftSize = 512
    stageAnalyser.minDecibels = -92
    stageAnalyser.maxDecibels = -12
    stageAnalyser.smoothingTimeConstant = 0.76
    const stageMuteGain = context.createGain()
    stageMuteGain.gain.setValueAtTime(
      this.arpeggiatorMuted ? 0.0001 : 0.92,
      context.currentTime,
    )
    stageSynthBus.connect(stageAnalyser)
    stageAnalyser.connect(stageMuteGain)
    stageMuteGain.connect(compressor)

    this.context = context
    this.compressor = compressor
    this.analyser = analyser
    this.stageAnalyser = stageAnalyser
    this.stageSynthBus = stageSynthBus
    this.stageMuteGain = stageMuteGain
    this.frequencyData = new Uint8Array(analyser.frequencyBinCount)
    this.waveformData = new Uint8Array(analyser.fftSize)
    this.stageFrequencyData = new Uint8Array(
      stageAnalyser.frequencyBinCount,
    )
    this.stageWaveformData = new Uint8Array(stageAnalyser.fftSize)
    this.masterGain = masterGain
    return context
  }

  private disconnectWhenEnded(
    source: AudioScheduledSourceNode,
    nodes: readonly AudioNode[],
  ) {
    source.addEventListener(
      'ended',
      () => {
        for (const node of nodes) {
          try {
            node.disconnect()
          } catch {
            // A shared upstream node may already have been disconnected.
          }
        }
      },
      { once: true },
    )
  }

  private scheduleTransient(callback: () => void, delayMs: number) {
    if (typeof window === 'undefined') return
    const timer = window.setTimeout(() => {
      this.transientTimers.delete(timer)
      callback()
    }, delayMs)
    this.transientTimers.add(timer)
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
