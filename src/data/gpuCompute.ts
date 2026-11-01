export const GPU_COMPUTE_MODES = [
  'tensor',
  'bvh',
] as const

export type GpuComputeMode =
  (typeof GPU_COMPUTE_MODES)[number]

export const TENSOR_GRID_SIZE = 8
export const TENSOR_VOXEL_COUNT =
  TENSOR_GRID_SIZE * TENSOR_GRID_SIZE * TENSOR_GRID_SIZE
export const NV_LINK_PARTICLE_COUNT = 360
export const ACCUMULATOR_PARTICLE_COUNT = 128
export const GPU_WARP_SIZE = 32
export const GPU_WORKLOAD_MIN = 0.1
export const GPU_WORKLOAD_MAX = 1

export interface GpuComputeTelemetry {
  tflops: number
  memoryBandwidth: number
  heat: number
  scanMultiplier: number
}

export function getGpuComputeTelemetry(
  workload: number,
  timeSeconds: number,
): GpuComputeTelemetry {
  const normalized = Math.min(
    GPU_WORKLOAD_MAX,
    Math.max(
      GPU_WORKLOAD_MIN,
      Number.isFinite(workload) ? workload : 0.68,
    ),
  )
  const loadCurve = normalized * normalized
  const tflopsJitter =
    Math.sin(timeSeconds * 11.7) * (1.8 + normalized * 7.2) +
    Math.sin(timeSeconds * 27.3 + 1.2) *
      (0.8 + normalized * 3.4)
  const bandwidthJitter =
    Math.sin(timeSeconds * 8.9 + 0.8) *
      (0.018 + normalized * 0.075) +
    Math.cos(timeSeconds * 19.1) *
      (0.01 + normalized * 0.035)
  return {
    tflops: 84 + loadCurve * 846 + tflopsJitter,
    memoryBandwidth:
      0.72 + loadCurve * 7.18 + bandwidthJitter,
    heat:
      Math.min(
        1,
        Math.max(
          0,
          (normalized - GPU_WORKLOAD_MIN) /
            (GPU_WORKLOAD_MAX - GPU_WORKLOAD_MIN),
        ),
      ),
    scanMultiplier:
      0.42 + Math.pow(normalized, 1.72) * 4.85,
  }
}
