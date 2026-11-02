import { useGalleryStore } from '../useGalleryStore'
import type {
  AudioStageSlice,
  ExhibitParamsSlice,
  GalleryUiSlice,
  GpuComputeSlice,
  NeuralSlice,
} from './types'

export function useGalleryUiStore<T>(
  selector: (state: GalleryUiSlice) => T,
) {
  return useGalleryStore(selector)
}

export function useExhibitParamsStore<T>(
  selector: (state: ExhibitParamsSlice) => T,
) {
  return useGalleryStore(selector)
}

export function useAudioStageStore<T>(
  selector: (state: AudioStageSlice) => T,
) {
  return useGalleryStore(selector)
}

export function useNeuralStore<T>(
  selector: (state: NeuralSlice) => T,
) {
  return useGalleryStore(selector)
}

export function useGpuStore<T>(
  selector: (state: GpuComputeSlice) => T,
) {
  return useGalleryStore(selector)
}
