import {
  GALLERY_EXHIBITS,
  type ExhibitMeta,
} from './catalog'

export interface TourResetSource {
  exhibits: ExhibitMeta[]
}

export interface TourResetState {
  isTourActive: false
  opticalTourPaused: false
  opticalTourMode: null
  opticalTourClimaxExhibitId: null
  audioStagePlaying: false
  neuralTrainingMode: 'inference'
  gpuComputeWorkload: number
  exhibits: ExhibitMeta[]
}

export function resetTourSession({
  exhibits,
}: TourResetSource): TourResetState {
  return {
    isTourActive: false,
    opticalTourPaused: false,
    opticalTourMode: null,
    opticalTourClimaxExhibitId: null,
    audioStagePlaying: false,
    neuralTrainingMode: 'inference',
    gpuComputeWorkload: 0.68,
    exhibits: exhibits.map((exhibit) => {
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
