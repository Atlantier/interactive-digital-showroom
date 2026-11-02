import { SPECTRUM_RANGE } from '../../../utils/optics'
import {
  GALLERY_EXHIBITS,
  type GalleryExhibitId,
} from '../catalog'
import {
  clamp,
  createExhibitInstances,
  createInitialPresetState,
  createPresetParams,
} from '../stateUtils'
import type {
  ExhibitParamsSlice,
  GallerySliceCreator,
} from '../types'

const TIME_SCALE_MIN = 0.05
const TIME_SCALE_MAX = 2
const SPECTRUM_MIN = SPECTRUM_RANGE.min
const SPECTRUM_MAX = SPECTRUM_RANGE.max

export const createExhibitParamsSlice: GallerySliceCreator<
  ExhibitParamsSlice
> = (set) => ({
  exhibits: createExhibitInstances(),
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
  presetByExhibit: createInitialPresetState(),
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
      reactorOverdrivePulse:
        state.reactorOverdrivePulse + 1,
      reactorOverdriveStartedAt: performance.now(),
    })),
  shuffleRayMazeLayout: () =>
    set((state) => ({
      rayMazeLayoutIndex:
        (state.rayMazeLayoutIndex + 1) % 3,
      rayMazeShufflePulse: state.rayMazeShufflePulse + 1,
    })),
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
  resetExhibitParams: (exhibitId: GalleryExhibitId) =>
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
})
