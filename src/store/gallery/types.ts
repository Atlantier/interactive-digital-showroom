import type { StateCreator } from 'zustand'
import type { AudioStageMode } from '../../data/audioStage'
import type { GpuComputeMode } from '../../data/gpuCompute'
import type { NeuralTrainingMode } from '../../data/neuralNetwork'
import type {
  ExhibitMeta,
  GalleryControlKey,
  GalleryExhibitId,
  GalleryPresetId,
  HologramModel,
  OpticalTourMode,
  ParticleManifold,
  PrismShape,
} from './catalog'

export interface GalleryUiSlice {
  activeExhibitId: GalleryExhibitId | null
  isTourActive: boolean
  opticalTourIndex: number
  opticalTourPaused: boolean
  opticalTourMode: OpticalTourMode | null
  opticalTourClimaxExhibitId: GalleryExhibitId | null
  opticalTourClimaxPulse: number
  cinemaCleanView: boolean
  setActiveExhibitId: (
    exhibitId: GalleryExhibitId | null,
  ) => void
  setIsTourActive: (active: boolean) => void
  toggleTour: () => void
  startOpticalTour: (
    mode?: OpticalTourMode,
    initiallyPaused?: boolean,
  ) => void
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
  stepActiveExhibit: (direction: 1 | -1) => void
}

export interface ExhibitParamsSlice {
  exhibits: ExhibitMeta[]
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
  presetByExhibit: Record<
    GalleryExhibitId,
    GalleryPresetId | null
  >
  setTimeScale: (value: number) => void
  setLaserWavelength: (value: number) => void
  setPrismShape: (shape: PrismShape) => void
  setHologramModel: (model: HologramModel) => void
  triggerHologramGlitch: () => void
  setParticleManifold: (manifold: ParticleManifold) => void
  triggerReactorOverdrive: () => void
  shuffleRayMazeLayout: () => void
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
}

export interface AudioStageSlice {
  audioStagePlaying: boolean
  audioStageMode: AudioStageMode
  audioStagePulseTimes: number[]
  audioStageLastPad: number | null
  audioStagePadHits: number
  setAudioStagePlaying: (playing: boolean) => void
  toggleAudioStagePlaying: () => void
  setAudioStageMode: (mode: AudioStageMode) => void
  triggerAudioStagePulse: (padIndex: number) => void
}

export interface NeuralSlice {
  neuralSelectedToken: number
  neuralTrainingMode: NeuralTrainingMode
  neuralInferencePulse: number
  neuralInferenceStartedAt: number | null
  selectNeuralToken: (tokenIndex: number) => void
  setNeuralTrainingMode: (mode: NeuralTrainingMode) => void
  triggerNeuralInference: () => void
}

export interface GpuComputeSlice {
  gpuComputeMode: GpuComputeMode
  gpuComputeWorkload: number
  setGpuComputeMode: (mode: GpuComputeMode) => void
  setGpuComputeWorkload: (workload: number) => void
}

export type GalleryState = GalleryUiSlice &
  ExhibitParamsSlice &
  AudioStageSlice &
  NeuralSlice &
  GpuComputeSlice

export type GallerySliceCreator<T> = StateCreator<
  GalleryState,
  [],
  [],
  T
>
