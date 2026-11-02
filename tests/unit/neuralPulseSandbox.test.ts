import { describe, expect, it } from 'vitest'
import { NEURAL_PHOTON_COUNT } from '../../src/data/neuralNetwork'
import {
  NETWORK_NODE_COUNT,
  createNeuralLayout,
  createPhotonState,
  createSynapticNetwork,
} from '../../src/components/gallery/exhibits/neuralPulseSandboxModel'

describe('neural pulse sandbox model', () => {
  it('builds the five-layer topology and recursive photon state', () => {
    const layout = createNeuralLayout()
    const network = createSynapticNetwork(layout)
    const photons = createPhotonState(network)

    try {
      expect(layout.nodePositions).toHaveLength(NETWORK_NODE_COUNT)
      expect(layout.inputPositions).toHaveLength(8)
      expect(layout.attentionPositions).toHaveLength(4)
      expect(layout.hiddenAPositions).toHaveLength(16)
      expect(layout.hiddenBPositions).toHaveLength(16)
      expect(layout.outputPositions).toHaveLength(8)

      expect(
        network.pathsByStage.map((paths) => paths.length),
      ).toEqual([32, 64, 64, 64])
      expect(network.pathList).toHaveLength(224)
      expect(network.attentionBeams).toHaveLength(32)
      expect(network.gradientFibers.count).toBe(224 * 6)

      expect(photons.pathIndices).toHaveLength(
        NEURAL_PHOTON_COUNT,
      )
      for (
        let index = 0;
        index < NEURAL_PHOTON_COUNT;
        index += 1
      ) {
        const pathIndex = photons.pathIndices[index] ?? -1
        expect(network.pathList[pathIndex]).toBeDefined()
        expect(photons.stages[index]).toBe(
          network.pathList[pathIndex]?.stage,
        )
      }
    } finally {
      layout.layerRailGeometry.dispose()
      network.fiberGeometry.dispose()
      network.attentionBeams.forEach((beam) =>
        beam.geometry.dispose(),
      )
    }
  })
})
