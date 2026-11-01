export const AUDIO_STAGE_MODES = [
  'matrix',
  'sunburst',
  'waterfall',
] as const

export type AudioStageMode =
  (typeof AUDIO_STAGE_MODES)[number]

export const AUDIO_STAGE_PAD_COUNT = 8

export const AUDIO_STAGE_PAD_COLORS = [
  '#ff5aca',
  '#ff79e7',
  '#bd78ff',
  '#59ffd2',
  '#35e8bd',
  '#82e8ff',
  '#ffd36f',
  '#fff1bd',
] as const

export const AUDIO_STAGE_PAD_NOTES = [
  'C4',
  'D4',
  'E4',
  'G4',
  'A4',
  'C5',
  'D5',
  'E5',
] as const

export const AUDIO_STAGE_PAD_FREQUENCIES = [
  261.63,
  293.66,
  329.63,
  392,
  440,
  523.25,
  587.33,
  659.25,
] as const

export function getAudioStagePadColor(index: number) {
  return (
    AUDIO_STAGE_PAD_COLORS[
      Math.max(
        0,
        Math.min(
          AUDIO_STAGE_PAD_COUNT - 1,
          Math.round(index),
        ),
      )
    ] ?? AUDIO_STAGE_PAD_COLORS[0]
  )
}
