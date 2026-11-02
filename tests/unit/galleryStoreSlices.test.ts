import { describe, expect, it } from 'vitest'
import {
  GALLERY_EXHIBITS,
  type ExhibitMeta,
} from '../../src/store/gallery/catalog'
import { resetTourSession } from '../../src/store/gallery/tourSession'
import { useGalleryStore } from '../../src/store/useGalleryStore'

function createExhibits(): ExhibitMeta[] {
  return GALLERY_EXHIBITS.map((exhibit) => ({
    ...exhibit,
    params: { ...exhibit.params },
  }))
}

describe('gallery store slices', () => {
  it('resets the optical tour session through one shared transition', () => {
    const exhibits = createExhibits()
    const prism = exhibits.find(
      (exhibit) => exhibit.id === 'prism-caustics',
    )
    const particle = exhibits.find(
      (exhibit) => exhibit.id === 'particle-morph',
    )
    if (!prism || !particle) {
      throw new Error('Expected gallery exhibits')
    }

    prism.params.ior = 2.64
    prism.params.dispersion = 2.2
    particle.params.noise = 0.91

    const reset = resetTourSession({ exhibits })
    const resetPrism = reset.exhibits.find(
      (exhibit) => exhibit.id === 'prism-caustics',
    )
    const resetParticle = reset.exhibits.find(
      (exhibit) => exhibit.id === 'particle-morph',
    )
    const initialPrism = GALLERY_EXHIBITS.find(
      (exhibit) => exhibit.id === 'prism-caustics',
    )

    expect(reset.isTourActive).toBe(false)
    expect(reset.opticalTourPaused).toBe(false)
    expect(reset.opticalTourMode).toBeNull()
    expect(reset.audioStagePlaying).toBe(false)
    expect(reset.neuralTrainingMode).toBe('inference')
    expect(reset.gpuComputeWorkload).toBe(0.68)
    expect(resetPrism?.params).toEqual(initialPrism?.params)
    expect(resetParticle?.params.noise).toBe(0.91)
    expect(resetParticle).toBe(particle)
  })

  it('composes domain actions into one atomic store snapshot', () => {
    const store = useGalleryStore.getState()

    store.setPrismShape('prism')
    store.setAudioStageMode('waterfall')
    store.selectNeuralToken(3)
    store.setGpuComputeWorkload(1)

    const state = useGalleryStore.getState()
    expect(state.prismShape).toBe('prism')
    expect(state.audioStageMode).toBe('waterfall')
    expect(state.neuralSelectedToken).toBe(3)
    expect(state.gpuComputeWorkload).toBe(1)

    useGalleryStore.setState({
      prismShape: 'icosahedron',
      audioStageMode: 'matrix',
      neuralSelectedToken: 0,
      neuralInferencePulse: 0,
      neuralInferenceStartedAt: null,
      gpuComputeWorkload: 0.68,
    })
  })
})
