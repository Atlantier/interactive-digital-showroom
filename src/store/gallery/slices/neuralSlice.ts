import {
  NEURAL_INPUT_COUNT,
  type NeuralTrainingMode,
} from '../../../data/neuralNetwork'
import type {
  GallerySliceCreator,
  NeuralSlice,
} from '../types'

export const createNeuralSlice: GallerySliceCreator<
  NeuralSlice
> = (set) => ({
  neuralSelectedToken: 0,
  neuralTrainingMode: 'inference',
  neuralInferencePulse: 0,
  neuralInferenceStartedAt: null,
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
  setNeuralTrainingMode: (
    neuralTrainingMode: NeuralTrainingMode,
  ) =>
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
})
