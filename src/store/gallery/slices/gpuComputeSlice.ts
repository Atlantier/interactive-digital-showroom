import {
  GPU_WORKLOAD_MAX,
  GPU_WORKLOAD_MIN,
} from '../../../data/gpuCompute'
import { clamp } from '../stateUtils'
import type {
  GallerySliceCreator,
  GpuComputeSlice,
} from '../types'

export const createGpuComputeSlice: GallerySliceCreator<
  GpuComputeSlice
> = (set) => ({
  gpuComputeMode: 'tensor',
  gpuComputeWorkload: 0.68,
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
})
