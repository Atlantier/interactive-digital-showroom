import { create } from 'zustand'
import { createAudioStageSlice } from './gallery/slices/audioStageSlice'
import { createExhibitParamsSlice } from './gallery/slices/exhibitParamsSlice'
import { createGalleryUiSlice } from './gallery/slices/galleryUiSlice'
import { createGpuComputeSlice } from './gallery/slices/gpuComputeSlice'
import { createNeuralSlice } from './gallery/slices/neuralSlice'
import type { GalleryState } from './gallery/types'

export * from './gallery/catalog'
export type { GalleryState } from './gallery/types'

export const useGalleryStore = create<GalleryState>()((...args) => ({
  ...createGalleryUiSlice(...args),
  ...createExhibitParamsSlice(...args),
  ...createAudioStageSlice(...args),
  ...createNeuralSlice(...args),
  ...createGpuComputeSlice(...args),
}))
