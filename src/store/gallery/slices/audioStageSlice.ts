import {
  AUDIO_STAGE_PAD_COUNT,
} from '../../../data/audioStage'
import type {
  AudioStageSlice,
  GallerySliceCreator,
} from '../types'

export const createAudioStageSlice: GallerySliceCreator<
  AudioStageSlice
> = (set) => ({
  audioStagePlaying: false,
  audioStageMode: 'matrix',
  audioStagePulseTimes: Array.from(
    { length: AUDIO_STAGE_PAD_COUNT },
    () => 0,
  ),
  audioStageLastPad: null,
  audioStagePadHits: 0,
  setAudioStagePlaying: (audioStagePlaying) =>
    set({ audioStagePlaying }),
  toggleAudioStagePlaying: () =>
    set((state) => ({
      audioStagePlaying: !state.audioStagePlaying,
    })),
  setAudioStageMode: (audioStageMode) =>
    set({ audioStageMode }),
  triggerAudioStagePulse: (padIndex) =>
    set((state) => {
      const normalizedPad = Math.max(
        0,
        Math.min(
          AUDIO_STAGE_PAD_COUNT - 1,
          Math.round(padIndex),
        ),
      )
      const triggeredAt = performance.now()
      return {
        audioStagePulseTimes: state.audioStagePulseTimes.map(
          (time, index) =>
            index === normalizedPad ? triggeredAt : time,
        ),
        audioStageLastPad: normalizedPad,
        audioStagePadHits: state.audioStagePadHits + 1,
      }
    }),
})
