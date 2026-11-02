import {
  GALLERY_EXHIBITS,
  PARTICLE_MANIFOLD_ORDER,
} from '../catalog'
import { clamp } from '../stateUtils'
import { resetTourSession } from '../tourSession'
import type {
  GallerySliceCreator,
  GalleryUiSlice,
} from '../types'

export const createGalleryUiSlice: GallerySliceCreator<
  GalleryUiSlice
> = (set) => ({
  activeExhibitId: null,
  isTourActive: false,
  opticalTourIndex: 0,
  opticalTourPaused: false,
  opticalTourMode: null,
  opticalTourClimaxExhibitId: null,
  opticalTourClimaxPulse: 0,
  cinemaCleanView: false,
  setActiveExhibitId: (activeExhibitId) =>
    set((state) => ({
      activeExhibitId:
        activeExhibitId === null ||
        state.exhibits.some(
          (exhibit) => exhibit.id === activeExhibitId,
        )
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
  startOpticalTour: (
    requestedMode,
    initiallyPaused = false,
  ) =>
    set((state) => {
      const opticalTourMode =
        requestedMode ??
        (state.activeExhibitId === null
          ? 'gallery'
          : 'darkroom')
      return {
        isTourActive: true,
        opticalTourIndex: 0,
        opticalTourPaused: initiallyPaused,
        opticalTourMode,
        opticalTourClimaxExhibitId: null,
        activeExhibitId:
          opticalTourMode === 'darkroom'
            ? GALLERY_EXHIBITS[0].id
            : null,
      }
    }),
  stopOpticalTour: () =>
    set((state) =>
      state.isTourActive ? resetTourSession(state) : {},
    ),
  setOpticalTourPaused: (opticalTourPaused) =>
    set((state) =>
      state.isTourActive
        ? { opticalTourPaused }
        : { opticalTourPaused: false },
    ),
  toggleOpticalTourPaused: () =>
    set((state) =>
      state.isTourActive
        ? {
            opticalTourPaused: !state.opticalTourPaused,
          }
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
      if (
        state.opticalTourIndex >=
        GALLERY_EXHIBITS.length - 1
      ) {
        return resetTourSession(state)
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
            audioStagePadHits:
              state.audioStagePadHits + 1,
            audioStagePulseTimes:
              state.audioStagePulseTimes.map(
                (time, index) =>
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
  stepActiveExhibit: (direction) =>
    set((state) => {
      const currentIndex = state.exhibits.findIndex(
        (exhibit) =>
          exhibit.id === state.activeExhibitId,
      )
      const nextIndex =
        (Math.max(0, currentIndex) +
          direction +
          state.exhibits.length) %
        state.exhibits.length
      return { activeExhibitId: state.exhibits[nextIndex].id }
    }),
})
