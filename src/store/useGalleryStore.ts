import { create } from 'zustand'
import {
  AUDIO_STAGE_PAD_COUNT,
  type AudioStageMode,
} from '../data/audioStage'
import {
  NEURAL_INPUT_COUNT,
  type NeuralTrainingMode,
} from '../data/neuralNetwork'
import {
  GPU_WORKLOAD_MAX,
  GPU_WORKLOAD_MIN,
  type GpuComputeMode,
} from '../data/gpuCompute'
import { SPECTRUM_RANGE } from '../utils/optics'

export const GALLERY_EXHIBIT_IDS = [
  'prism-caustics',
  'laser-scan-hologram',
  'particle-morph',
  'plasma-reactor',
  'photonic-mesh',
  'orbital-lens',
  'quantum-lattice',
  'phase-torus',
] as const

export type GalleryExhibitId = (typeof GALLERY_EXHIBIT_IDS)[number]
export type OpticalTourMode = 'gallery' | 'darkroom'
export type PrismShape = 'octahedron' | 'prism' | 'icosahedron'
export type HologramModel =
  | 'gyro-core'
  | 'cyber-skull'
  | 'turbine-rotor'
export type ParticleManifold =
  | 'mobius-ring'
  | 'double-helix'
  | 'trefoil-knot'
  | 'fibonacci-sphere'
  | 'wafer-city'

export const OPTICAL_TOUR_STEP_MS = 6_000
export const OPTICAL_TOUR_CLIMAX_MS = 2_000

const PARTICLE_MANIFOLD_ORDER: readonly ParticleManifold[] = [
  'mobius-ring',
  'double-helix',
  'trefoil-knot',
  'fibonacci-sphere',
  'wafer-city',
]

export type GalleryControlKey =
  | 'wavelength'
  | 'slitGap'
  | 'coherence'
  | 'exposure'
  | 'ior'
  | 'dispersion'
  | 'incidence'
  | 'beamPower'
  | 'curvature'
  | 'focus'
  | 'gain'
  | 'aberration'
  | 'angle'
  | 'magneticField'
  | 'temperature'
  | 'turbulence'
  | 'arcCount'
  | 'verdet'
  | 'contrast'
  | 'phase'
  | 'coupling'
  | 'focal'
  | 'aperture'
  | 'mass'
  | 'excitation'
  | 'lifetime'
  | 'yield'
  | 'lattice'
  | 'winding'
  | 'twist'
  | 'flow'
  | 'pressure'
  | 'scanRate'
  | 'scanWidth'
  | 'tempo'
  | 'drive'
  | 'spectrumBias'
  | 'waveDensity'
  | 'attention'
  | 'pulseRate'
  | 'depth'
  | 'tensorLoad'
  | 'clock'
  | 'rayBias'
  | 'bvhDepth'

export interface ExhibitControlSpec {
  key: GalleryControlKey
  symbol: string
  min: number
  max: number
  step: number
  unit?: string
}

export interface ExhibitMeta {
  id: GalleryExhibitId
  formula: string
  params: Record<string, number>
  controls: readonly ExhibitControlSpec[]
}

export type GalleryPresetId =
  | 'standard'
  | 'overdrive'
  | 'analysis'

export const GALLERY_PRESETS = [
  {
    id: 'standard',
  },
  {
    id: 'overdrive',
  },
  {
    id: 'analysis',
  },
] as const satisfies readonly {
  id: GalleryPresetId
}[]

export const GALLERY_EXHIBITS: readonly ExhibitMeta[] = [
  {
    id: 'prism-caustics',
    formula:
      'theta_out(lambda) = theta_in + asin(sin(theta_in) / n(lambda))',
    params: {
      ior: 2.4,
      dispersion: 1.6,
      incidence: 18,
      beamPower: 1.2,
    },
    controls: [
      {
        key: 'ior',
        symbol: 'n0',
        min: 1.4,
        max: 2.8,
        step: 0.01,
      },
      {
        key: 'dispersion',
        symbol: 'B',
        min: 0.2,
        max: 2.4,
        step: 0.01,
      },
      {
        key: 'incidence',
        symbol: 'theta',
        min: 10,
        max: 74,
        step: 0.5,
        unit: 'deg',
      },
      {
        key: 'beamPower',
        symbol: 'P',
        min: 0.1,
        max: 1.8,
        step: 0.01,
      },
    ],
  },
  {
    id: 'laser-scan-hologram',
    formula:
      'H(y,s) = reveal(y,s) + wire(y) + fringe(y-s) * 5.0',
    params: {
      scanRate: 0.72,
      scanWidth: 0.18,
      coherence: 0.88,
      gain: 1.24,
    },
    controls: [
      {
        key: 'scanRate',
        symbol: 'v_s',
        min: 0.15,
        max: 1.8,
        step: 0.01,
      },
      {
        key: 'scanWidth',
        symbol: 'delta',
        min: 0.03,
        max: 0.5,
        step: 0.01,
      },
      {
        key: 'coherence',
        symbol: 'gamma',
        min: 0.1,
        max: 1,
        step: 0.01,
      },
      {
        key: 'gain',
        symbol: 'G',
        min: 0.2,
        max: 2,
        step: 0.01,
      },
    ],
  },
  {
    id: 'particle-morph',
    formula:
      'M(u) = mix(A, B, u) + curl(A) * sin(pi * u)',
    params: {
      phase: 1.2,
      coupling: 0.64,
      flow: 0.82,
      gain: 1.24,
    },
    controls: [
      {
        key: 'phase',
        symbol: 'phi',
        min: 0,
        max: 6.28,
        step: 0.01,
        unit: 'rad',
      },
      {
        key: 'coupling',
        symbol: 'kappa',
        min: 0.05,
        max: 1,
        step: 0.01,
      },
      {
        key: 'flow',
        symbol: 'omega',
        min: 0.1,
        max: 1.6,
        step: 0.01,
      },
      {
        key: 'gain',
        symbol: 'G',
        min: 0.2,
        max: 2,
        step: 0.01,
      },
    ],
  },
  {
    id: 'plasma-reactor',
    formula:
      'beta = 2*mu0*p_plasma / B^2; T_core -> Planck(lambda, T)',
    params: {
      magneticField: 1.28,
      temperature: 92,
      turbulence: 0.72,
      arcCount: 10,
    },
    controls: [
      {
        key: 'magneticField',
        symbol: 'B',
        min: 0.4,
        max: 2.4,
        step: 0.01,
        unit: 'T',
      },
      {
        key: 'temperature',
        symbol: 'T',
        min: 18,
        max: 160,
        step: 1,
        unit: 'MK',
      },
      {
        key: 'turbulence',
        symbol: 'tau',
        min: 0.15,
        max: 1.5,
        step: 0.01,
      },
      {
        key: 'arcCount',
        symbol: 'N',
        min: 8,
        max: 12,
        step: 1,
      },
    ],
  },
  {
    id: 'photonic-mesh',
    formula:
      'r = d - 2(d dot n)n; I_out = I_in * product(rho)',
    params: {
      phase: 0.18,
      wavelength: 532,
      gain: 1.05,
    },
    controls: [
      {
        key: 'phase',
        symbol: 'phi',
        min: 0.04,
        max: 0.3,
        step: 0.005,
        unit: 'rad',
      },
      {
        key: 'wavelength',
        symbol: 'lambda',
        min: 420,
        max: 900,
        step: 1,
        unit: 'nm',
      },
      {
        key: 'gain',
        symbol: 'g',
        min: 0.1,
        max: 1.8,
        step: 0.01,
      },
    ],
  },
  {
    id: 'orbital-lens',
    formula:
      'h(i,j) = H0 + drive * FFT(bin) * radialGain(r)',
    params: {
      tempo: 104,
      drive: 1.05,
      spectrumBias: 0.55,
      waveDensity: 1,
    },
    controls: [
      {
        key: 'tempo',
        symbol: 'BPM',
        min: 72,
        max: 148,
        step: 1,
      },
      {
        key: 'drive',
        symbol: 'G',
        min: 0.5,
        max: 1.8,
        step: 0.01,
      },
      {
        key: 'spectrumBias',
        symbol: 'B',
        min: 0.15,
        max: 0.9,
        step: 0.01,
      },
      {
        key: 'waveDensity',
        symbol: 'N',
        min: 0.6,
        max: 1.8,
        step: 0.01,
      },
    ],
  },
  {
    id: 'quantum-lattice',
    formula:
      'Attention(Q,K,V) = softmax(QK^T / sqrt(d_k)) V',
    params: {
      attention: 0.82,
      coupling: 0.68,
      pulseRate: 1.15,
      depth: 0.72,
    },
    controls: [
      {
        key: 'attention',
        symbol: 'A',
        min: 0.2,
        max: 1,
        step: 0.01,
      },
      {
        key: 'coupling',
        symbol: 'C',
        min: 0.1,
        max: 1,
        step: 0.01,
      },
      {
        key: 'pulseRate',
        symbol: 'v',
        min: 0.4,
        max: 2,
        step: 0.01,
      },
      {
        key: 'depth',
        symbol: 'L',
        min: 0.3,
        max: 1.2,
        step: 0.01,
      },
    ],
  },
  {
    id: 'phase-torus',
    formula:
      'D = A x B + C; ray intersects BVH(root) -> leaf',
    params: {
      tensorLoad: 0.82,
      clock: 1.36,
      rayBias: 0.18,
      bvhDepth: 0.72,
    },
    controls: [
      {
        key: 'tensorLoad',
        symbol: 'A',
        min: 0.2,
        max: 1.4,
        step: 0.01,
      },
      {
        key: 'clock',
        symbol: 'f',
        min: 0.4,
        max: 2,
        step: 0.01,
      },
      {
        key: 'rayBias',
        symbol: 'e',
        min: 0.02,
        max: 0.5,
        step: 0.01,
      },
      {
        key: 'bvhDepth',
        symbol: 'L',
        min: 0.25,
        max: 1.25,
        step: 0.01,
      },
    ],
  },
]

const TIME_SCALE_MIN = 0.05
const TIME_SCALE_MAX = 2
const SPECTRUM_MIN = SPECTRUM_RANGE.min
const SPECTRUM_MAX = SPECTRUM_RANGE.max

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function createExhibitInstances(): ExhibitMeta[] {
  return GALLERY_EXHIBITS.map((exhibit) => ({
    ...exhibit,
    params: { ...exhibit.params },
  }))
}

function createInitialPresetState() {
  return Object.fromEntries(
    GALLERY_EXHIBITS.map((exhibit) => [exhibit.id, 'standard']),
  ) as Record<GalleryExhibitId, GalleryPresetId | null>
}

function createPresetParams(
  exhibit: ExhibitMeta,
  presetId: GalleryPresetId,
) {
  if (presetId === 'standard') {
    const initial = GALLERY_EXHIBITS.find(
      (candidate) => candidate.id === exhibit.id,
    )
    return { ...(initial?.params ?? exhibit.params) }
  }

  const ratio = presetId === 'overdrive' ? 0.9 : 0.28
  return Object.fromEntries(
    exhibit.controls.map((control) => {
      const rawValue =
        control.key === 'wavelength'
          ? presetId === 'overdrive'
            ? 680
            : 450
          : control.min +
            (control.max - control.min) * ratio
      const value =
        control.min +
        Math.round(
          (rawValue - control.min) /
            Math.max(control.step, Number.EPSILON),
        ) *
          control.step
      return [
        control.key,
        clamp(value, control.min, control.max),
      ]
    }),
  )
}

interface GalleryState {
  exhibits: ExhibitMeta[]
  activeExhibitId: GalleryExhibitId | null
  isTourActive: boolean
  opticalTourIndex: number
  opticalTourPaused: boolean
  opticalTourMode: OpticalTourMode | null
  opticalTourClimaxExhibitId: GalleryExhibitId | null
  opticalTourClimaxPulse: number
  cinemaCleanView: boolean
  timeScale: number
  laserWavelength: number
  prismShape: PrismShape
  hologramModel: HologramModel
  hologramGlitchPulse: number
  particleManifold: ParticleManifold
  reactorOverdrivePulse: number
  reactorOverdriveStartedAt: number | null
  rayMazeLayoutIndex: number
  rayMazeShufflePulse: number
  audioStagePlaying: boolean
  audioStageMode: AudioStageMode
  audioStagePulseTimes: number[]
  audioStageLastPad: number | null
  audioStagePadHits: number
  neuralSelectedToken: number
  neuralTrainingMode: NeuralTrainingMode
  neuralInferencePulse: number
  neuralInferenceStartedAt: number | null
  gpuComputeMode: GpuComputeMode
  gpuComputeWorkload: number
  presetByExhibit: Record<
    GalleryExhibitId,
    GalleryPresetId | null
  >
  setActiveExhibitId: (
    exhibitId: GalleryExhibitId | null,
  ) => void
  setIsTourActive: (active: boolean) => void
  toggleTour: () => void
  startOpticalTour: (mode?: OpticalTourMode) => void
  stopOpticalTour: () => void
  setOpticalTourPaused: (paused: boolean) => void
  toggleOpticalTourPaused: () => void
  setOpticalTourIndex: (index: number) => void
  advanceOpticalTour: () => void
  triggerOpticalTourClimax: (
    exhibitId: GalleryExhibitId,
  ) => void
  setCinemaCleanView: (clean: boolean) => void
  toggleCinemaCleanView: () => void
  setTimeScale: (value: number) => void
  setLaserWavelength: (value: number) => void
  setPrismShape: (shape: PrismShape) => void
  setHologramModel: (model: HologramModel) => void
  triggerHologramGlitch: () => void
  setParticleManifold: (manifold: ParticleManifold) => void
  triggerReactorOverdrive: () => void
  shuffleRayMazeLayout: () => void
  setAudioStagePlaying: (playing: boolean) => void
  toggleAudioStagePlaying: () => void
  setAudioStageMode: (mode: AudioStageMode) => void
  triggerAudioStagePulse: (padIndex: number) => void
  selectNeuralToken: (tokenIndex: number) => void
  setNeuralTrainingMode: (mode: NeuralTrainingMode) => void
  triggerNeuralInference: () => void
  setGpuComputeMode: (mode: GpuComputeMode) => void
  setGpuComputeWorkload: (workload: number) => void
  applyExhibitPreset: (
    exhibitId: GalleryExhibitId,
    presetId: GalleryPresetId,
  ) => void
  updateExhibitParam: (
    exhibitId: GalleryExhibitId,
    key: GalleryControlKey,
    value: number,
  ) => void
  resetExhibitParams: (exhibitId: GalleryExhibitId) => void
  stepActiveExhibit: (direction: 1 | -1) => void
}

export const useGalleryStore = create<GalleryState>((set) => ({
  exhibits: createExhibitInstances(),
  activeExhibitId: null,
  isTourActive: false,
  opticalTourIndex: 0,
  opticalTourPaused: false,
  opticalTourMode: null,
  opticalTourClimaxExhibitId: null,
  opticalTourClimaxPulse: 0,
  cinemaCleanView: false,
  timeScale: 1,
  laserWavelength: 532,
  prismShape: 'icosahedron',
  hologramModel: 'gyro-core',
  hologramGlitchPulse: 0,
  particleManifold: 'mobius-ring',
  reactorOverdrivePulse: 0,
  reactorOverdriveStartedAt: null,
  rayMazeLayoutIndex: 0,
  rayMazeShufflePulse: 0,
  audioStagePlaying: false,
  audioStageMode: 'matrix',
  audioStagePulseTimes: Array.from(
    { length: AUDIO_STAGE_PAD_COUNT },
    () => 0,
  ),
  audioStageLastPad: null,
  audioStagePadHits: 0,
  neuralSelectedToken: 0,
  neuralTrainingMode: 'inference',
  neuralInferencePulse: 0,
  neuralInferenceStartedAt: null,
  gpuComputeMode: 'tensor',
  gpuComputeWorkload: 0.68,
  presetByExhibit: createInitialPresetState(),
  setActiveExhibitId: (activeExhibitId) =>
    set((state) => ({
      activeExhibitId:
        activeExhibitId === null ||
        state.exhibits.some((exhibit) => exhibit.id === activeExhibitId)
          ? activeExhibitId
          : null,
      cinemaCleanView:
        activeExhibitId === null
          ? false
          : state.cinemaCleanView,
    })),
  setIsTourActive: (isTourActive) =>
    set((state) =>
      isTourActive
        ? {
            isTourActive: true,
            opticalTourMode:
              state.activeExhibitId === null
                ? 'gallery'
                : 'darkroom',
            opticalTourPaused: false,
          }
        : {
            isTourActive: false,
            opticalTourPaused: false,
            opticalTourMode: null,
            opticalTourClimaxExhibitId: null,
          },
    ),
  toggleTour: () =>
    set((state) =>
      state.isTourActive
        ? {
            opticalTourPaused: !state.opticalTourPaused,
          }
        : {
            isTourActive: true,
            opticalTourIndex: 0,
            opticalTourPaused: false,
            opticalTourMode:
              state.activeExhibitId === null
                ? 'gallery'
                : 'darkroom',
            opticalTourClimaxExhibitId: null,
          },
    ),
  startOpticalTour: (requestedMode) =>
    set((state) => {
      const opticalTourMode =
        requestedMode ??
        (state.activeExhibitId === null ? 'gallery' : 'darkroom')
      return {
        isTourActive: true,
        opticalTourIndex: 0,
        opticalTourPaused: false,
        opticalTourMode,
        opticalTourClimaxExhibitId: null,
        activeExhibitId:
          opticalTourMode === 'darkroom'
            ? GALLERY_EXHIBITS[0].id
            : null,
      }
    }),
  stopOpticalTour: () =>
    set((state) => {
      if (!state.isTourActive) return {}
      return {
        isTourActive: false,
        opticalTourPaused: false,
        opticalTourMode: null,
        opticalTourClimaxExhibitId: null,
        audioStagePlaying: false,
        neuralTrainingMode: 'inference',
        gpuComputeWorkload: 0.68,
        exhibits: state.exhibits.map((exhibit) => {
          if (exhibit.id !== 'prism-caustics') return exhibit
          const initial = GALLERY_EXHIBITS.find(
            (candidate) => candidate.id === 'prism-caustics',
          )
          return initial
            ? { ...exhibit, params: { ...initial.params } }
            : exhibit
        }),
      }
    }),
  setOpticalTourPaused: (opticalTourPaused) =>
    set((state) =>
      state.isTourActive
        ? { opticalTourPaused }
        : { opticalTourPaused: false },
    ),
  toggleOpticalTourPaused: () =>
    set((state) =>
      state.isTourActive
        ? { opticalTourPaused: !state.opticalTourPaused }
        : {},
    ),
  setOpticalTourIndex: (index) =>
    set((state) => {
      const opticalTourIndex = clamp(
        Math.round(index),
        0,
        GALLERY_EXHIBITS.length - 1,
      )
      return {
        opticalTourIndex,
        opticalTourClimaxExhibitId: null,
        activeExhibitId:
          state.opticalTourMode === 'darkroom'
            ? GALLERY_EXHIBITS[opticalTourIndex].id
            : state.activeExhibitId,
      }
    }),
  advanceOpticalTour: () =>
    set((state) => {
      if (!state.isTourActive) return {}
      if (state.opticalTourIndex >= GALLERY_EXHIBITS.length - 1) {
        return {
          isTourActive: false,
          opticalTourPaused: false,
          opticalTourMode: null,
          opticalTourClimaxExhibitId: null,
          audioStagePlaying: false,
          neuralTrainingMode: 'inference',
          gpuComputeWorkload: 0.68,
          exhibits: state.exhibits.map((exhibit) => {
            if (exhibit.id !== 'prism-caustics') return exhibit
            const initial = GALLERY_EXHIBITS.find(
              (candidate) => candidate.id === 'prism-caustics',
            )
            return initial
              ? { ...exhibit, params: { ...initial.params } }
              : exhibit
          }),
        }
      }
      const opticalTourIndex = state.opticalTourIndex + 1
      return {
        opticalTourIndex,
        opticalTourPaused: false,
        opticalTourClimaxExhibitId: null,
        activeExhibitId:
          state.opticalTourMode === 'darkroom'
            ? GALLERY_EXHIBITS[opticalTourIndex].id
            : state.activeExhibitId,
      }
    }),
  triggerOpticalTourClimax: (exhibitId) =>
    set((state) => {
      const triggeredAt = performance.now()
      const common = {
        opticalTourClimaxExhibitId: exhibitId,
        opticalTourClimaxPulse:
          state.opticalTourClimaxPulse + 1,
      }
      switch (exhibitId) {
        case 'prism-caustics':
          return {
            ...common,
            exhibits: state.exhibits.map((exhibit) =>
              exhibit.id === exhibitId
                ? {
                    ...exhibit,
                    params: {
                      ...exhibit.params,
                      ior: 2.64,
                      dispersion: 2.2,
                      incidence: 68,
                      beamPower: 1.8,
                    },
                  }
                : exhibit,
            ),
          }
        case 'laser-scan-hologram':
          return {
            ...common,
            hologramGlitchPulse:
              state.hologramGlitchPulse + 1,
          }
        case 'particle-morph': {
          const manifoldIndex = Math.max(
            0,
            PARTICLE_MANIFOLD_ORDER.indexOf(
              state.particleManifold,
            ),
          )
          return {
            ...common,
            particleManifold:
              PARTICLE_MANIFOLD_ORDER[
                (manifoldIndex + 1) %
                  PARTICLE_MANIFOLD_ORDER.length
              ],
          }
        }
        case 'plasma-reactor':
          return {
            ...common,
            reactorOverdrivePulse:
              state.reactorOverdrivePulse + 1,
            reactorOverdriveStartedAt: triggeredAt,
          }
        case 'photonic-mesh':
          return {
            ...common,
            rayMazeLayoutIndex: 0,
            rayMazeShufflePulse:
              state.rayMazeShufflePulse + 1,
          }
        case 'orbital-lens':
          return {
            ...common,
            audioStagePlaying: true,
            audioStageLastPad: 7,
            audioStagePadHits: state.audioStagePadHits + 1,
            audioStagePulseTimes:
              state.audioStagePulseTimes.map((time, index) =>
                index === 7 ? triggeredAt : time,
              ),
          }
        case 'quantum-lattice':
          return {
            ...common,
            neuralTrainingMode: 'backprop',
            neuralInferencePulse:
              state.neuralInferencePulse + 1,
            neuralInferenceStartedAt: triggeredAt,
          }
        case 'phase-torus':
          return {
            ...common,
            gpuComputeMode: 'tensor',
            gpuComputeWorkload: 1,
          }
        default:
          return common
      }
    }),
  setCinemaCleanView: (cinemaCleanView) =>
    set((state) => ({
      cinemaCleanView:
        state.activeExhibitId === null
          ? false
          : cinemaCleanView,
    })),
  toggleCinemaCleanView: () =>
    set((state) => ({
      cinemaCleanView:
        state.activeExhibitId === null
          ? false
          : !state.cinemaCleanView,
    })),
  setTimeScale: (value) =>
    set((state) => ({
      timeScale: clamp(
        Number.isFinite(value) ? value : 1,
        TIME_SCALE_MIN,
        TIME_SCALE_MAX,
      ),
      presetByExhibit: state.activeExhibitId
        ? {
            ...state.presetByExhibit,
            [state.activeExhibitId]: null,
          }
        : state.presetByExhibit,
    })),
  setLaserWavelength: (value) => {
    const wavelength = clamp(
      Number.isFinite(value) ? value : 532,
      SPECTRUM_MIN,
      SPECTRUM_MAX,
    )
    set((state) => ({
      laserWavelength: wavelength,
      presetByExhibit: state.activeExhibitId
        ? {
            ...state.presetByExhibit,
            [state.activeExhibitId]: null,
          }
        : state.presetByExhibit,
      exhibits: state.exhibits.map((exhibit) => {
        if (exhibit.id !== state.activeExhibitId) return exhibit
        const wavelengthControl = exhibit.controls.find(
          (control) => control.key === 'wavelength',
        )
        if (!wavelengthControl) return exhibit
        return {
          ...exhibit,
          params: {
            ...exhibit.params,
            wavelength: clamp(
              wavelength,
              wavelengthControl.min,
              wavelengthControl.max,
            ),
          },
        }
      }),
    }))
  },
  setPrismShape: (prismShape) => set({ prismShape }),
  setHologramModel: (hologramModel) => set({ hologramModel }),
  triggerHologramGlitch: () =>
    set((state) => ({
      hologramGlitchPulse: state.hologramGlitchPulse + 1,
    })),
  setParticleManifold: (particleManifold) =>
    set({ particleManifold }),
  triggerReactorOverdrive: () =>
    set((state) => ({
      reactorOverdrivePulse: state.reactorOverdrivePulse + 1,
      reactorOverdriveStartedAt: performance.now(),
    })),
  shuffleRayMazeLayout: () =>
    set((state) => ({
      rayMazeLayoutIndex:
        (state.rayMazeLayoutIndex + 1) % 3,
      rayMazeShufflePulse: state.rayMazeShufflePulse + 1,
    })),
  setAudioStagePlaying: (audioStagePlaying) =>
    set({ audioStagePlaying }),
  toggleAudioStagePlaying: () =>
    set((state) => ({
      audioStagePlaying: !state.audioStagePlaying,
    })),
  setAudioStageMode: (audioStageMode) =>
    set({ audioStageMode }),
  triggerAudioStagePulse: (padIndex) =>
    set((state) => {
      const normalizedPad = Math.max(
        0,
        Math.min(
          AUDIO_STAGE_PAD_COUNT - 1,
          Math.round(padIndex),
        ),
      )
      const triggeredAt = performance.now()
      return {
        audioStagePulseTimes: state.audioStagePulseTimes.map(
          (time, index) =>
            index === normalizedPad ? triggeredAt : time,
        ),
        audioStageLastPad: normalizedPad,
        audioStagePadHits: state.audioStagePadHits + 1,
      }
    }),
  selectNeuralToken: (tokenIndex) =>
    set((state) => ({
      neuralSelectedToken: Math.max(
        0,
        Math.min(
          NEURAL_INPUT_COUNT - 1,
          Math.round(tokenIndex),
        ),
      ),
      neuralInferencePulse: state.neuralInferencePulse + 1,
      neuralInferenceStartedAt: performance.now(),
    })),
  setNeuralTrainingMode: (neuralTrainingMode) =>
    set((state) => ({
      neuralTrainingMode,
      neuralInferencePulse: state.neuralInferencePulse + 1,
      neuralInferenceStartedAt: performance.now(),
    })),
  triggerNeuralInference: () =>
    set((state) => ({
      neuralInferencePulse: state.neuralInferencePulse + 1,
      neuralInferenceStartedAt: performance.now(),
    })),
  setGpuComputeMode: (gpuComputeMode) =>
    set({ gpuComputeMode }),
  setGpuComputeWorkload: (workload) =>
    set({
      gpuComputeWorkload: clamp(
        Number.isFinite(workload) ? workload : 0.68,
        GPU_WORKLOAD_MIN,
        GPU_WORKLOAD_MAX,
      ),
    }),
  applyExhibitPreset: (exhibitId, presetId) =>
    set((state) => {
      const exhibit = state.exhibits.find(
        (candidate) => candidate.id === exhibitId,
      )
      if (!exhibit) return {}
      return {
        exhibits: state.exhibits.map((candidate) =>
          candidate.id === exhibitId
            ? {
                ...candidate,
                params: createPresetParams(candidate, presetId),
              }
            : candidate,
        ),
        presetByExhibit: {
          ...state.presetByExhibit,
          [exhibitId]: presetId,
        },
        timeScale:
          presetId === 'overdrive'
            ? 1.65
            : presetId === 'analysis'
              ? 0.16
              : 1,
        laserWavelength:
          presetId === 'overdrive'
            ? 680
            : presetId === 'analysis'
              ? 450
              : 532,
      }
    }),
  updateExhibitParam: (exhibitId, key, value) =>
    set((state) => ({
      laserWavelength:
        key === 'wavelength' && Number.isFinite(value)
          ? clamp(value, SPECTRUM_MIN, SPECTRUM_MAX)
          : state.laserWavelength,
      presetByExhibit: {
        ...state.presetByExhibit,
        [exhibitId]: null,
      },
      exhibits: state.exhibits.map((exhibit) => {
        if (exhibit.id !== exhibitId) return exhibit
        const control = exhibit.controls.find(
          (candidate) => candidate.key === key,
        )
        if (!control || !Number.isFinite(value)) return exhibit
        return {
          ...exhibit,
          params: {
            ...exhibit.params,
            [key]: clamp(value, control.min, control.max),
          },
        }
      }),
    })),
  resetExhibitParams: (exhibitId) =>
    set((state) => ({
      laserWavelength: 532,
      timeScale: 1,
      presetByExhibit: {
        ...state.presetByExhibit,
        [exhibitId]: 'standard',
      },
      exhibits: state.exhibits.map((exhibit) => {
        if (exhibit.id !== exhibitId) return exhibit
        const initial = GALLERY_EXHIBITS.find(
          (candidate) => candidate.id === exhibitId,
        )
        return initial
          ? { ...exhibit, params: { ...initial.params } }
          : exhibit
      }),
    })),
  stepActiveExhibit: (direction) =>
    set((state) => {
      const currentIndex = state.exhibits.findIndex(
        (exhibit) => exhibit.id === state.activeExhibitId,
      )
      const nextIndex =
        (Math.max(0, currentIndex) + direction + state.exhibits.length) %
        state.exhibits.length
      return { activeExhibitId: state.exhibits[nextIndex].id }
    }),
}))
