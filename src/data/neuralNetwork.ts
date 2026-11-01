export const NEURAL_INPUT_COUNT = 8
export const NEURAL_ATTENTION_HEADS = 4
export const NEURAL_HIDDEN_COUNT = 16
export const NEURAL_OUTPUT_COUNT = 8
export const NEURAL_PHOTON_COUNT = 600

export const NEURAL_TRAINING_MODES = [
  'inference',
  'backprop',
] as const

export type NeuralTrainingMode =
  (typeof NEURAL_TRAINING_MODES)[number]

export const NEURAL_TOKEN_LABELS = [
  'CLS',
  'REACT',
  'CORE',
  'LIGHT',
  'WAVE',
  'SYNC',
  'NEURAL',
  'EOS',
] as const

export const NEURAL_HEAD_COLORS = [
  '#00d8ff',
  '#9a4dff',
  '#ffbf38',
  '#34ff9e',
] as const

export const NEURAL_OUTPUT_WINNERS = [
  5,
  2,
  7,
  4,
  1,
  6,
  3,
  0,
] as const

export function getNeuralWinner(tokenIndex: number) {
  return (
    NEURAL_OUTPUT_WINNERS[
      Math.max(
        0,
        Math.min(
          NEURAL_INPUT_COUNT - 1,
          Math.round(tokenIndex),
        ),
      )
    ] ?? 0
  )
}
