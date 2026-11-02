import { useFrame } from '@react-three/fiber'
import {
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react'
import * as THREE from 'three'
import {
  NEURAL_ATTENTION_HEADS,
  NEURAL_HEAD_COLORS,
  NEURAL_HIDDEN_COUNT,
  NEURAL_INPUT_COUNT,
  NEURAL_OUTPUT_COUNT,
  NEURAL_PHOTON_COUNT,
  getNeuralWinner,
} from '../../../data/neuralNetwork'
import { getVfxPreset } from '../../../data/vfxPresets'
import { useAppStore } from '../../../store/useAppStore'
import {
  useGalleryStore,
  type ExhibitMeta,
} from '../../../store/useGalleryStore'
import { getEffectiveGalleryTimeScale } from '../../../utils/motionPreferences'
import type { GalleryPointerState } from '../OpticalExhibitScene'
import {
  INPUT_OFFSET,
  ATTENTION_OFFSET,
  HIDDEN_A_OFFSET,
  HIDDEN_B_OFFSET,
  OUTPUT_OFFSET,
  NETWORK_NODE_COUNT,
  ATTENTION_CLUSTER_SIZE,
  BACKPROP_FORWARD_SECONDS,
  GRADIENT_DURATION_SECONDS,
  ISOLATION_PATH_SEGMENTS,
  MAX_ISOLATION_PATHS,
  INPUT_COLOR,
  HIDDEN_A_COLOR,
  HIDDEN_B_COLOR,
  HIDDEN_A_PEAK_COLOR,
  HIDDEN_B_PEAK_COLOR,
  OUTPUT_COLOR,
  WINNER_COLOR,
  GRADIENT_PURPLE,
  GRADIENT_GOLD,
  GRADIENT_EMBER,
  BASE_LOGITS,
  clamp01,
  smoothstep,
  deterministic,
  createNeuralLayout,
  createSynapticNetwork,
  createPhotonState,
  createIsolationHighlightGeometry,
  createNeuralInspectorPanel,
  drawNeuralInspectorPanel,
} from './neuralPulseSandboxModel'
import { NeuralPulseSandboxNetworkVisuals } from './neuralPulseSandboxVisuals'

export function NeuralPulseSandboxExhibit({
  exhibit,
  pointerRef,
  mode = 'pedestal',
}: {
  exhibit: ExhibitMeta
  pointerRef: RefObject<GalleryPointerState>
  mode?: 'pedestal' | 'darkroom'
}) {
  const performanceTier = useAppStore(
    (state) => state.performanceTier,
  )
  const vfxPreset = useAppStore((state) => state.vfxPreset)
  const activeExhibitId = useGalleryStore(
    (state) => state.activeExhibitId,
  )
  const selectedToken = useGalleryStore(
    (state) => state.neuralSelectedToken,
  )
  const palette = useMemo(() => getVfxPreset(vfxPreset), [vfxPreset])
  const highDetail = performanceTier === 'high'
  const active =
    mode === 'darkroom'
      ? activeExhibitId === 'quantum-lattice'
      : activeExhibitId === null
  const attentionSharpness = exhibit.params.attention ?? 0.82
  const coupling = exhibit.params.coupling ?? 0.68
  const pulseRate = exhibit.params.pulseRate ?? 1.15
  const networkDepth = exhibit.params.depth ?? 0.72
  const winner = getNeuralWinner(selectedToken)
  const layout = useMemo(createNeuralLayout, [])
  const network = useMemo(
    () => createSynapticNetwork(layout),
    [layout],
  )
  const photons = useMemo(
    () => createPhotonState(network),
    [network],
  )
  const isolationGeometry = useMemo(
    createIsolationHighlightGeometry,
    [],
  )
  const inspectorPanel = useMemo(
    createNeuralInspectorPanel,
    [],
  )
  const nodeActivation = useMemo(
    () => new Float32Array(NETWORK_NODE_COUNT),
    [],
  )
  const outputHeights = useMemo(
    () => new Float32Array(NEURAL_OUTPUT_COUNT),
    [],
  )
  const outputProbabilities = useMemo(
    () => new Float32Array(NEURAL_OUTPUT_COUNT),
    [],
  )
  const sceneGroupRef = useRef<THREE.Group>(null)
  const networkGroupRef = useRef<THREE.Group>(null)
  const inputLayerRef = useRef<THREE.Group>(null)
  const inputNodeRefs = useRef<Array<THREE.Mesh | null>>([])
  const attentionClusterRefs = useRef<
    Array<THREE.InstancedMesh | null>
  >([])
  const attentionRingRefs = useRef<Array<THREE.Mesh | null>>([])
  const hiddenAMeshRef = useRef<THREE.InstancedMesh>(null)
  const hiddenBMeshRef = useRef<THREE.InstancedMesh>(null)
  const photonMeshRef = useRef<THREE.InstancedMesh>(null)
  const photonGlowMeshRef = useRef<THREE.InstancedMesh>(null)
  const photonCoreMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const photonGlowMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const fiberMaterialRef =
    useRef<THREE.LineBasicMaterial>(null)
  const layerRailMaterialRef =
    useRef<THREE.LineBasicMaterial>(null)
  const gradientFiberMeshRef =
    useRef<THREE.InstancedMesh>(null)
  const gradientBurstRef = useRef<THREE.Mesh>(null)
  const gradientBurstMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const isolationLineRef = useRef<THREE.LineSegments>(null)
  const inspectorSpriteRef = useRef<THREE.Sprite>(null)
  const attentionBeamRefs = useRef<Array<THREE.Mesh | null>>([])
  const outputNodeRefs = useRef<Array<THREE.Mesh | null>>([])
  const outputColumnRefs = useRef<Array<THREE.Mesh | null>>([])
  const hostRef = useRef<HTMLElement | null>(null)
  const dataTimerRef = useRef(0)
  const lastPointerImpulseRef = useRef(pointerRef.current.impulse)
  const lastInferenceStartedAtRef = useRef<number | null>(null)
  const photonTransitionRef = useRef(0)
  const gradientStartedRef = useRef(false)
  const gradientEndedRef = useRef(false)
  const hoveredHiddenNodeRef = useRef<number | null>(null)
  const pinnedHiddenNodeRef = useRef<number | null>(null)
  const lastIsolatedNodeRef = useRef<number | null>(null)
  const inspectorDrawTimerRef = useRef(0)
  const inputNdcRef = useRef(
    Array.from(
      { length: NEURAL_INPUT_COUNT },
      () => '0,0',
    ),
  )
  const hiddenNdcRef = useRef(
    Array.from(
      { length: NEURAL_HIDDEN_COUNT * 2 },
      () => '0,0',
    ),
  )
  const temporary = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      scale: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      color: new THREE.Color(),
      peakColor: new THREE.Color(),
      pointer: new THREE.Vector2(),
      sampleStart: new THREE.Vector3(),
      sampleEnd: new THREE.Vector3(),
    }),
    [],
  )
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  useEffect(() => {
    if (!active) return
    const canvas = document.querySelector<HTMLElement>(
      '[data-gallery-shared-canvas]',
    )
    if (!canvas) return
    hostRef.current = canvas
    canvas.dataset.neuralPulseSandbox = 'five-layer-transformer'
    canvas.dataset.neuralLayers = '5'
    canvas.dataset.neuralInputNodes = String(NEURAL_INPUT_COUNT)
    canvas.dataset.neuralAttentionHeads = String(
      NEURAL_ATTENTION_HEADS,
    )
    canvas.dataset.neuralHiddenNodes = String(
      NEURAL_HIDDEN_COUNT * 2,
    )
    canvas.dataset.neuralOutputNodes = String(
      NEURAL_OUTPUT_COUNT,
    )
    canvas.dataset.neuralPhotons = String(NEURAL_PHOTON_COUNT)
    canvas.dataset.neuralSynapses = String(network.pathList.length)
    canvas.dataset.neuralAttentionBeams = String(
      network.attentionBeams.length,
    )
    canvas.dataset.neuralTrainingMode =
      useGalleryStore.getState().neuralTrainingMode
    canvas.dataset.neuralGradientActive = 'false'
    canvas.dataset.neuralIsolatedNode = 'none'
    canvas.dataset.neuralIsolationFunction = 'none'
    return () => {
      delete canvas.dataset.neuralPulseSandbox
      delete canvas.dataset.neuralLayers
      delete canvas.dataset.neuralInputNodes
      delete canvas.dataset.neuralAttentionHeads
      delete canvas.dataset.neuralHiddenNodes
      delete canvas.dataset.neuralOutputNodes
      delete canvas.dataset.neuralPhotons
      delete canvas.dataset.neuralSynapses
      delete canvas.dataset.neuralAttentionBeams
      delete canvas.dataset.neuralTrainingMode
      delete canvas.dataset.neuralGradientActive
      delete canvas.dataset.neuralGradientProgress
      delete canvas.dataset.neuralPhotonDirection
      delete canvas.dataset.neuralIsolatedNode
      delete canvas.dataset.neuralIsolationFunction
      delete canvas.dataset.neuralIsolationActivation
      delete canvas.dataset.neuralSelectedToken
      delete canvas.dataset.neuralWinner
      delete canvas.dataset.neuralInferencePhase
      delete canvas.dataset.neuralActiveFlashes
      delete canvas.dataset.neuralPhotonTransitions
      delete canvas.dataset.neuralMaxActivation
      delete canvas.dataset.neuralOutputProbability
      delete canvas.dataset.neuralInputNdc
      delete canvas.dataset.neuralHiddenNdc
      if (hostRef.current === canvas) hostRef.current = null
    }
  }, [active, network])

  useEffect(
    () => () => {
      layout.layerRailGeometry.dispose()
      network.fiberGeometry.dispose()
      isolationGeometry.geometry.dispose()
      inspectorPanel?.texture.dispose()
      network.attentionBeams.forEach((beam) =>
        beam.geometry.dispose(),
      )
      attentionClusterRefs.current.forEach((mesh) =>
        mesh?.dispose(),
      )
      hiddenAMeshRef.current?.dispose()
      hiddenBMeshRef.current?.dispose()
      photonMeshRef.current?.dispose()
      photonGlowMeshRef.current?.dispose()
      gradientFiberMeshRef.current?.dispose()
    },
    [inspectorPanel, isolationGeometry, layout, network],
  )

  useEffect(() => {
    const hiddenLayers = [
      {
        mesh: hiddenAMeshRef.current,
        color: HIDDEN_A_COLOR,
      },
      {
        mesh: hiddenBMeshRef.current,
        color: HIDDEN_B_COLOR,
      },
    ]
    for (const layer of hiddenLayers) {
      if (!layer.mesh) continue
      for (
        let index = 0;
        index < NEURAL_HIDDEN_COUNT;
        index += 1
      ) {
        layer.mesh.setColorAt(index, layer.color)
      }
      if (layer.mesh.instanceColor) {
        layer.mesh.instanceColor.needsUpdate = true
      }
    }
    const gradientMesh = gradientFiberMeshRef.current
    if (gradientMesh) {
      for (
        let index = 0;
        index < network.gradientFibers.count;
        index += 1
      ) {
        gradientMesh.setColorAt(index, GRADIENT_PURPLE)
      }
      if (gradientMesh.instanceColor) {
        gradientMesh.instanceColor.needsUpdate = true
      }
    }
    if (inspectorPanel) {
      drawNeuralInspectorPanel(
        inspectorPanel,
        0,
        'a',
        0,
        false,
      )
    }
  }, [])

  useFrame((state, delta) => {
    if (!active) return
    const safeDelta = Math.min(delta, 0.045)
    const timeScale = getEffectiveGalleryTimeScale(
      useGalleryStore.getState().timeScale,
    )
    const time = state.clock.elapsedTime * timeScale
    const pointer = pointerRef.current
    const galleryState = useGalleryStore.getState()
    const sceneGroup = sceneGroupRef.current
    const networkGroup = networkGroupRef.current
    if (!sceneGroup || !networkGroup) return

    sceneGroup.rotation.y = pointer.u * 0.12
    sceneGroup.rotation.z = Math.sin(time * 0.17) * 0.01
    networkGroup.rotation.y =
      Math.sin(time * 0.21) * 0.05 + pointer.u * 0.035
    networkGroup.rotation.x =
      0.18 + Math.sin(time * 0.29) * 0.018 + pointer.v * 0.025
    networkGroup.position.y =
      Math.sin(time * 0.72) * 0.018

    const inferenceStartedAt =
      galleryState.neuralInferenceStartedAt
    const inferenceAge =
      inferenceStartedAt === null
        ? Number.POSITIVE_INFINITY
        : (performance.now() - inferenceStartedAt) / 1_000
    const selected = galleryState.neuralSelectedToken
    const selectedWinner = getNeuralWinner(selected)
    const trainingMode = galleryState.neuralTrainingMode
    const gradientAge =
      trainingMode === 'backprop'
        ? inferenceAge - BACKPROP_FORWARD_SECONDS
        : Number.NEGATIVE_INFINITY
    const gradientProgress = clamp01(
      gradientAge / GRADIENT_DURATION_SECONDS,
    )
    const gradientActive =
      trainingMode === 'backprop' &&
      gradientAge >= 0 &&
      gradientAge < GRADIENT_DURATION_SECONDS

    networkGroup.updateWorldMatrix(true, true)
    let hoveredHiddenNode: number | null = null
    if (pointer.active) {
      let bestDistance = 0.072 * 0.072
      for (
        let index = 0;
        index < NEURAL_HIDDEN_COUNT;
        index += 1
      ) {
        const positionA = layout.hiddenAPositions[index]
        const positionB = layout.hiddenBPositions[index]
        if (positionA) {
          temporary.position
            .copy(positionA)
            .applyMatrix4(networkGroup.matrixWorld)
            .project(state.camera)
          if (
            temporary.position.z > -1 &&
            temporary.position.z < 1
          ) {
            const deltaX = temporary.position.x - pointer.u
            const deltaY = temporary.position.y - pointer.v
            const distance = deltaX * deltaX + deltaY * deltaY
            if (distance < bestDistance) {
              bestDistance = distance
              hoveredHiddenNode = HIDDEN_A_OFFSET + index
            }
          }
        }
        if (positionB) {
          temporary.position
            .copy(positionB)
            .applyMatrix4(networkGroup.matrixWorld)
            .project(state.camera)
          if (
            temporary.position.z > -1 &&
            temporary.position.z < 1
          ) {
            const deltaX = temporary.position.x - pointer.u
            const deltaY = temporary.position.y - pointer.v
            const distance = deltaX * deltaX + deltaY * deltaY
            if (distance < bestDistance) {
              bestDistance = distance
              hoveredHiddenNode = HIDDEN_B_OFFSET + index
            }
          }
        }
      }
    }
    hoveredHiddenNodeRef.current = hoveredHiddenNode
    const pointerClickTriggered =
      pointer.impulse !== lastPointerImpulseRef.current
    let pointerClickConsumed = false
    if (pointerClickTriggered) {
      lastPointerImpulseRef.current = pointer.impulse
      if (hoveredHiddenNode !== null) {
        pinnedHiddenNodeRef.current =
          pinnedHiddenNodeRef.current === hoveredHiddenNode
            ? null
            : hoveredHiddenNode
        pointerClickConsumed = true
      } else {
        pinnedHiddenNodeRef.current = null
      }
    }
    const isolatedNode =
      pinnedHiddenNodeRef.current ?? hoveredHiddenNode

    if (
      inferenceStartedAt !== null &&
      inferenceStartedAt !== lastInferenceStartedAtRef.current
    ) {
      lastInferenceStartedAtRef.current = inferenceStartedAt
      photonTransitionRef.current = 0
      gradientStartedRef.current = false
      gradientEndedRef.current = false
      const inputPaths = network.pathsByStage[0] ?? []
      for (let index = 0; index < NEURAL_PHOTON_COUNT; index += 1) {
        photons.pathIndices[index] =
          inputPaths[index % Math.max(1, inputPaths.length)] ?? 0
        photons.progress[index] =
          (index / NEURAL_PHOTON_COUNT) * 0.82 +
          photons.seeds[index] * 0.18
        photons.stages[index] = 0
        photons.directions[index] = 0
      }
    }

    if (
      trainingMode === 'backprop' &&
      gradientAge >= 0 &&
      !gradientStartedRef.current
    ) {
      gradientStartedRef.current = true
      gradientEndedRef.current = false
      const outputPaths = network.pathsByStage[3] ?? []
      for (let index = 0; index < NEURAL_PHOTON_COUNT; index += 1) {
        photons.pathIndices[index] =
          outputPaths[
            index % Math.max(1, outputPaths.length)
          ] ?? 0
        photons.progress[index] = Math.max(
          0.12,
          1 - (index / NEURAL_PHOTON_COUNT) * 0.84,
        )
        photons.stages[index] = 3
        photons.directions[index] = 1
      }
      nodeActivation[OUTPUT_OFFSET + selectedWinner] = 1
    }

    if (
      trainingMode === 'backprop' &&
      gradientAge >= GRADIENT_DURATION_SECONDS &&
      gradientStartedRef.current &&
      !gradientEndedRef.current
    ) {
      gradientEndedRef.current = true
      for (let index = 0; index < NEURAL_PHOTON_COUNT; index += 1) {
        const stage = index % 4
        const paths = network.pathsByStage[stage] ?? []
        photons.pathIndices[index] =
          paths[index % Math.max(1, paths.length)] ?? 0
        photons.progress[index] = photons.seeds[index] ?? 0.4
        photons.stages[index] = stage
        photons.directions[index] = 0
      }
    }

    const decay = Math.exp(
      -safeDelta * (2.7 + coupling * 2.1),
    )
    for (let index = 0; index < nodeActivation.length; index += 1) {
      nodeActivation[index] *= decay
    }
    nodeActivation[INPUT_OFFSET + selected] = Math.max(
      nodeActivation[INPUT_OFFSET + selected],
      0.38 + Math.sin(time * 3.2) * 0.08,
    )

    const outputGate =
      Number.isFinite(inferenceAge)
        ? smoothstep(0.9, 2.35, inferenceAge) *
          (1 - smoothstep(3.2, 4.6, inferenceAge) * 0.42)
        : 0
    let logitSum = 0
    const samplingTemperature =
      0.45 + (1 - attentionSharpness) * 1.15
    for (let index = 0; index < NEURAL_OUTPUT_COUNT; index += 1) {
      const baseLogit = BASE_LOGITS[index] ?? 0.3
      const winnerBoost =
        index === selectedWinner
          ? 0.8 + outputGate * 3.2
          : 0
      const score =
        (baseLogit + winnerBoost) / samplingTemperature
      const probability = Math.exp(score)
      outputProbabilities[index] = probability
      logitSum += probability
    }
    let maximumProbability = 0
    for (let index = 0; index < NEURAL_OUTPUT_COUNT; index += 1) {
      const probability =
        (outputProbabilities[index] ?? 0) /
        Math.max(0.0001, logitSum)
      const outputFlash =
        nodeActivation[OUTPUT_OFFSET + index]
      outputProbabilities[index] = probability
      maximumProbability = Math.max(
        maximumProbability,
        probability,
      )
      const targetHeight =
        0.16 +
        probability * (1.05 + networkDepth * 0.28) +
        (index === selectedWinner
          ? 0.12 + outputGate * 0.22
          : 0)
      outputHeights[index] +=
        (targetHeight - outputHeights[index]) *
        (1 - Math.exp(-safeDelta * 7.5))
      const column = outputColumnRefs.current[index]
      const node = outputNodeRefs.current[index]
      if (column) {
        const height = Math.max(0.12, outputHeights[index])
        column.position.y = height * 0.5
        column.scale.y = height
        if (column.material instanceof THREE.MeshBasicMaterial) {
          temporary.color
            .set(
              index === selectedWinner
                ? WINNER_COLOR
                : NEURAL_HEAD_COLORS[
                    index % NEURAL_ATTENTION_HEADS
                  ] ?? palette.secondary,
            )
            .multiplyScalar(
              0.44 +
                outputGate *
                  (index === selectedWinner ? 0.34 : 0.12),
            )
          column.material.color.copy(temporary.color)
          column.material.opacity =
            0.18 +
            probability * 0.3 +
            (index === selectedWinner ? outputGate * 0.08 : 0) +
            outputFlash * 0.08
        }
      }
      if (node) {
        node.position.y =
          Math.max(0.12, outputHeights[index]) + 0.055
        const nodeScale =
          0.025 +
          probability * 0.035 +
          (index === selectedWinner ? outputGate * 0.014 : 0) +
          outputFlash * 0.024
        node.scale.setScalar(nodeScale)
        if (node.material instanceof THREE.MeshBasicMaterial) {
          node.material.color.copy(
            index === selectedWinner
              ? WINNER_COLOR
              : OUTPUT_COLOR,
          )
          node.material.opacity =
            index === selectedWinner ? 1 : 0.72
        }
      }
    }

    const photonMesh = photonMeshRef.current
    const photonGlow = photonGlowMeshRef.current
    let activePhotonCount = 0
    if (photonCoreMaterialRef.current) {
      if (gradientActive) {
        temporary.color.lerpColors(
          GRADIENT_GOLD,
          GRADIENT_PURPLE,
          gradientProgress,
        )
        photonCoreMaterialRef.current.color
          .copy(temporary.color)
          .lerp(GRADIENT_EMBER, 0.2 + gradientProgress * 0.24)
      } else {
        photonCoreMaterialRef.current.color.set('#b9fff8')
      }
      photonCoreMaterialRef.current.opacity =
        isolatedNode === null ? 0.78 : 0.26
    }
    if (photonGlowMaterialRef.current) {
      if (gradientActive) {
        temporary.color.lerpColors(
          GRADIENT_GOLD,
          GRADIENT_PURPLE,
          gradientProgress,
        )
        photonGlowMaterialRef.current.color.copy(temporary.color)
      } else {
        photonGlowMaterialRef.current.color.copy(INPUT_COLOR)
      }
      photonGlowMaterialRef.current.opacity =
        isolatedNode === null
          ? gradientActive
            ? 0.085
            : 0.05
          : 0.02
    }
    if (photonMesh && photonGlow) {
      for (let index = 0; index < NEURAL_PHOTON_COUNT; index += 1) {
        const pathIndex = photons.pathIndices[index] ?? 0
        let path = network.pathList[pathIndex]
        if (!path) continue
        const pathDelta =
          safeDelta *
          timeScale *
          (photons.speeds[index] ?? 0.7) *
          pulseRate
        let nextProgress: number
        if ((photons.directions[index] ?? 0) === 1) {
          nextProgress = photons.progress[index] - pathDelta
          while (nextProgress <= 0) {
            nextProgress += 1
            nodeActivation[path.sourceNode] = 1
            photonTransitionRef.current += 1
            const incoming =
              network.incomingPathsByNode[path.sourceNode] ?? []
            const nextPathIndex =
              incoming.length > 0
                ? incoming[
                    (index + photonTransitionRef.current) %
                      incoming.length
                  ] ?? incoming[0] ?? 0
                : network.pathsByStage[3]?.[
                    index %
                      Math.max(
                        1,
                        network.pathsByStage[3]?.length ?? 1,
                      )
                  ] ?? 0
            photons.pathIndices[index] = nextPathIndex
            path = network.pathList[nextPathIndex] ?? path
            photons.stages[index] = path.stage
          }
        } else {
          nextProgress = photons.progress[index] + pathDelta
          while (nextProgress >= 1) {
            nextProgress -= 1
            nodeActivation[path.targetNode] = 1
            photonTransitionRef.current += 1
            const outgoing =
              network.outgoingPathsByNode[path.targetNode] ?? []
            const nextPathIndex =
              outgoing.length > 0
                ? outgoing[
                    (index + photonTransitionRef.current) %
                      outgoing.length
                  ] ?? outgoing[0] ?? 0
                : network.pathsByStage[0]?.[
                    index %
                      Math.max(
                        1,
                        network.pathsByStage[0]?.length ?? 1,
                      )
                  ] ?? 0
            photons.pathIndices[index] = nextPathIndex
            path = network.pathList[nextPathIndex] ?? path
            photons.stages[index] = path.stage
          }
        }
        photons.progress[index] = nextProgress
        path.curve.getPoint(nextProgress, temporary.position)
        const packetScale =
          0.005 +
          (path.stage === 3 ? 0.0025 : 0.0012) +
          (Number.isFinite(inferenceAge) && inferenceAge < 3.2
            ? 0.0012
            : 0) +
          (gradientActive ? 0.0018 : 0)
        temporary.scale.setScalar(packetScale)
        temporary.matrix.compose(
          temporary.position,
          temporary.quaternion.identity(),
          temporary.scale,
        )
        photonMesh.setMatrixAt(index, temporary.matrix)
        temporary.scale.multiplyScalar(2.5)
        temporary.matrix.compose(
          temporary.position,
          temporary.quaternion,
          temporary.scale,
        )
        photonGlow.setMatrixAt(index, temporary.matrix)
        activePhotonCount += 1
      }
      photonMesh.instanceMatrix.needsUpdate = true
      photonGlow.instanceMatrix.needsUpdate = true
    }

    if (inputLayerRef.current) {
      for (let index = 0; index < NEURAL_INPUT_COUNT; index += 1) {
        const mesh = inputNodeRefs.current[index]
        if (!mesh) continue
        const emission = nodeActivation[INPUT_OFFSET + index]
        const selected = index === galleryState.neuralSelectedToken
        mesh.scale.setScalar(
          0.04 +
            emission * 0.018 +
            (selected ? 0.018 : 0),
        )
        mesh.rotation.y = time * (0.44 + index * 0.035)
        mesh.rotation.x = Math.sin(time * 0.8 + index) * 0.22
        if (mesh.material instanceof THREE.MeshBasicMaterial) {
          temporary.color.copy(INPUT_COLOR)
          temporary.peakColor.copy(WINNER_COLOR)
          mesh.material.color.lerpColors(
            temporary.color,
            temporary.peakColor,
            clamp01(emission * 0.72 + (selected ? 0.38 : 0)),
          )
          mesh.material.opacity = selected ? 1 : 0.72
        }
      }
    }

    for (
      let head = 0;
      head < NEURAL_ATTENTION_HEADS;
      head += 1
    ) {
      const mesh = attentionClusterRefs.current[head]
      const positions = layout.clusterPositions[head]
      const hubActivation =
        nodeActivation[ATTENTION_OFFSET + head]
      const headColor =
        NEURAL_HEAD_COLORS[head] ?? palette.secondary
      if (mesh) {
        if (mesh.material instanceof THREE.MeshBasicMaterial) {
          mesh.material.color.set(headColor)
          mesh.material.opacity =
            0.55 + hubActivation * 0.25
        }
        if (positions) {
          for (
            let node = 0;
            node < ATTENTION_CLUSTER_SIZE;
            node += 1
          ) {
            const activation =
              node === 0
                ? hubActivation
                : hubActivation *
                  (0.52 +
                    deterministic(head * 7 + node) * 0.34)
            temporary.position.set(
              positions[node * 3] ?? 0,
              positions[node * 3 + 1] ?? 0,
              positions[node * 3 + 2] ?? 0,
            )
            const scale =
              (node === 0 ? 0.052 : 0.03) +
              activation * 0.022 +
              Math.sin(time * 2.4 + node + head) * 0.002
            temporary.scale.setScalar(Math.max(0.022, scale))
            temporary.matrix.compose(
              temporary.position,
              temporary.quaternion.identity(),
              temporary.scale,
            )
            mesh.setMatrixAt(node, temporary.matrix)
          }
          mesh.instanceMatrix.needsUpdate = true
        }
      }
      const ring = attentionRingRefs.current[head]
      if (ring) {
        ring.rotation.z =
          time * (0.24 + head * 0.045) * (head % 2 === 0 ? 1 : -1)
        ring.rotation.x = Math.PI / 2 + Math.sin(time * 0.6 + head) * 0.2
        ring.scale.setScalar(0.85 + hubActivation * 0.28)
      }
    }

    const updateHiddenLayer = (
      mesh: THREE.InstancedMesh | null,
      positions: THREE.Vector3[],
      offset: number,
      baseColor: THREE.Color,
      peakColor: THREE.Color,
      phase: number,
      isolated: number | null,
    ) => {
      if (!mesh) return
      for (let index = 0; index < positions.length; index += 1) {
        const position = positions[index]
        if (!position) continue
        const activation = nodeActivation[offset + index]
        const nodeIsolated = offset + index === isolated
        temporary.position.copy(position)
        const scale =
          0.038 +
          activation * 0.028 +
          Math.sin(time * 2.2 + index * 0.7 + phase) * 0.0025 +
          (nodeIsolated ? 0.024 : 0)
        temporary.scale.setScalar(Math.max(0.024, scale))
        temporary.matrix.compose(
          temporary.position,
          temporary.quaternion.identity(),
          temporary.scale,
        )
        mesh.setMatrixAt(index, temporary.matrix)
        temporary.color.copy(baseColor)
        temporary.peakColor.copy(peakColor)
        temporary.color.lerpColors(
          temporary.color,
          temporary.peakColor,
          clamp01(activation * 0.9 + (nodeIsolated ? 0.52 : 0)),
        )
        mesh.setColorAt(index, temporary.color)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    updateHiddenLayer(
      hiddenAMeshRef.current,
      layout.hiddenAPositions,
      HIDDEN_A_OFFSET,
      HIDDEN_A_COLOR,
      HIDDEN_A_PEAK_COLOR,
      0,
      isolatedNode,
    )
    updateHiddenLayer(
      hiddenBMeshRef.current,
      layout.hiddenBPositions,
      HIDDEN_B_OFFSET,
      HIDDEN_B_COLOR,
      HIDDEN_B_PEAK_COLOR,
      Math.PI,
      isolatedNode,
    )

    if (fiberMaterialRef.current) {
      fiberMaterialRef.current.opacity =
        isolatedNode === null ? 0.18 : 0.018
    }
    if (layerRailMaterialRef.current) {
      layerRailMaterialRef.current.opacity =
        isolatedNode === null ? 0.24 : 0.055
    }

    if (lastIsolatedNodeRef.current !== isolatedNode) {
      lastIsolatedNodeRef.current = isolatedNode
      inspectorDrawTimerRef.current = 0
      if (isolatedNode === null) {
        isolationGeometry.geometry.setDrawRange(0, 0)
        if (isolationLineRef.current) {
          isolationLineRef.current.visible = false
        }
      } else {
        let pathCount = 0
        let vertexCount = 0
        for (
          let pathIndex = 0;
          pathIndex < network.pathList.length &&
          pathCount < MAX_ISOLATION_PATHS;
          pathIndex += 1
        ) {
          const path = network.pathList[pathIndex]
          if (
            !path ||
            (path.sourceNode !== isolatedNode &&
              path.targetNode !== isolatedNode)
          ) {
            continue
          }
          temporary.color.set(
            NEURAL_HEAD_COLORS[path.headIndex] ??
              palette.secondary,
          )
          temporary.peakColor.copy(
            path.stage >= 3 ? WINNER_COLOR : OUTPUT_COLOR,
          )
          for (
            let segment = 0;
            segment < ISOLATION_PATH_SEGMENTS;
            segment += 1
          ) {
            const t0 = segment / ISOLATION_PATH_SEGMENTS
            const t1 =
              (segment + 1) / ISOLATION_PATH_SEGMENTS
            path.curve.getPoint(t0, temporary.sampleStart)
            path.curve.getPoint(t1, temporary.sampleEnd)
            const positionOffset = vertexCount * 3
            isolationGeometry.positionValues[
              positionOffset
            ] = temporary.sampleStart.x
            isolationGeometry.positionValues[
              positionOffset + 1
            ] = temporary.sampleStart.y
            isolationGeometry.positionValues[
              positionOffset + 2
            ] = temporary.sampleStart.z
            isolationGeometry.positionValues[
              positionOffset + 3
            ] = temporary.sampleEnd.x
            isolationGeometry.positionValues[
              positionOffset + 4
            ] = temporary.sampleEnd.y
            isolationGeometry.positionValues[
              positionOffset + 5
            ] = temporary.sampleEnd.z
            temporary.color.set(
              NEURAL_HEAD_COLORS[path.headIndex] ??
                palette.secondary,
            )
            temporary.color.lerp(
              temporary.peakColor,
              t0 * 0.55,
            )
            isolationGeometry.colorValues[
              positionOffset
            ] = temporary.color.r
            isolationGeometry.colorValues[
              positionOffset + 1
            ] = temporary.color.g
            isolationGeometry.colorValues[
              positionOffset + 2
            ] = temporary.color.b
            temporary.color.set(
              NEURAL_HEAD_COLORS[path.headIndex] ??
                palette.secondary,
            )
            temporary.color.lerp(
              temporary.peakColor,
              t1 * 0.55,
            )
            isolationGeometry.colorValues[
              positionOffset + 3
            ] = temporary.color.r
            isolationGeometry.colorValues[
              positionOffset + 4
            ] = temporary.color.g
            isolationGeometry.colorValues[
              positionOffset + 5
            ] = temporary.color.b
            vertexCount += 2
          }
          pathCount += 1
        }
        isolationGeometry.positionAttribute.needsUpdate = true
        isolationGeometry.colorAttribute.needsUpdate = true
        isolationGeometry.geometry.setDrawRange(
          0,
          vertexCount,
        )
        if (isolationLineRef.current) {
          isolationLineRef.current.visible = true
        }
      }
    }

    const isolatedLayer =
      isolatedNode === null
        ? null
        : isolatedNode >= HIDDEN_B_OFFSET
          ? 'b'
          : isolatedNode >= HIDDEN_A_OFFSET
            ? 'a'
            : null
    if (
      isolatedNode !== null &&
      isolatedLayer !== null &&
      inspectorSpriteRef.current
    ) {
      const nodeIndex =
        isolatedNode -
        (isolatedLayer === 'a'
          ? HIDDEN_A_OFFSET
          : HIDDEN_B_OFFSET)
      const nodePosition =
        (isolatedLayer === 'a'
          ? layout.hiddenAPositions[nodeIndex]
          : layout.hiddenBPositions[nodeIndex])
      if (nodePosition) {
        const sprite = inspectorSpriteRef.current
        sprite.visible = true
        sprite.position.copy(nodePosition)
        sprite.position.x += nodePosition.x > 0.42 ? -0.62 : 0.62
        sprite.position.y += 0.24
        sprite.position.z += 0.12
        inspectorDrawTimerRef.current += safeDelta
        if (
          inspectorPanel &&
          inspectorDrawTimerRef.current >= 0.1
        ) {
          inspectorDrawTimerRef.current = 0
          drawNeuralInspectorPanel(
            inspectorPanel,
            nodeIndex,
            isolatedLayer,
            nodeActivation[isolatedNode],
            trainingMode === 'backprop',
          )
        }
      }
    } else if (inspectorSpriteRef.current) {
      inspectorSpriteRef.current.visible = false
      inspectorDrawTimerRef.current = 0
    }

    const gradientMesh = gradientFiberMeshRef.current
    if (gradientMesh) {
      const showGradient =
        gradientActive && isolatedNode === null
      gradientMesh.visible = showGradient
      if (showGradient) {
        const head = 3.98 - gradientProgress * 4.3
        for (
          let index = 0;
          index < network.gradientFibers.count;
          index += 1
        ) {
          const coordinate =
            network.gradientFibers.coordinates[index] ?? 0
          const distance = coordinate - head
          const intensity = Math.exp(
            -(distance * distance) / 0.07,
          )
          temporary.position.set(
            network.gradientFibers.centers[index * 3] ?? 0,
            network.gradientFibers.centers[index * 3 + 1] ?? 0,
            network.gradientFibers.centers[index * 3 + 2] ?? 0,
          )
          const qx =
            network.gradientFibers.quaternions[index * 4] ?? 0
          const qy =
            network.gradientFibers.quaternions[
              index * 4 + 1
            ] ?? 0
          const qz =
            network.gradientFibers.quaternions[
              index * 4 + 2
            ] ?? 0
          const qw =
            network.gradientFibers.quaternions[
              index * 4 + 3
            ] ?? 1
          temporary.quaternion.set(qx, qy, qz, qw)
          const thickness = 0.0012 + intensity * 0.0105
          temporary.scale.set(
            thickness,
            network.gradientFibers.lengths[index] ?? 0.01,
            thickness,
          )
          temporary.matrix.compose(
            temporary.position,
            temporary.quaternion,
            temporary.scale,
          )
          gradientMesh.setMatrixAt(index, temporary.matrix)
          temporary.color.lerpColors(
            GRADIENT_PURPLE,
            GRADIENT_GOLD,
            clamp01(intensity * 1.25),
          )
          temporary.color.lerp(
            GRADIENT_EMBER,
            clamp01(intensity * 0.25),
          )
          gradientMesh.setColorAt(index, temporary.color)
        }
        gradientMesh.instanceMatrix.needsUpdate = true
        if (gradientMesh.instanceColor) {
          gradientMesh.instanceColor.needsUpdate = true
        }
      }
    }

    if (
      gradientBurstRef.current &&
      gradientBurstMaterialRef.current
    ) {
      const burstProgress = clamp01(gradientAge / 0.72)
      const burstVisible =
        gradientActive &&
        gradientAge >= 0 &&
        burstProgress < 1
      gradientBurstRef.current.visible = burstVisible
      if (burstVisible) {
        const burstScale = 0.45 + burstProgress * 2.6
        gradientBurstRef.current.scale.setScalar(burstScale)
        gradientBurstMaterialRef.current.opacity =
          (1 - burstProgress) * 0.82
        gradientBurstMaterialRef.current.color
          .copy(GRADIENT_GOLD)
          .lerp(GRADIENT_PURPLE, burstProgress * 0.68)
      }
    }

    const beamPulse =
      Number.isFinite(inferenceAge)
        ? Math.exp(-Math.max(0, inferenceAge - 0.25) * 0.9)
        : 0
    for (
      let index = 0;
      index < network.attentionBeams.length;
      index += 1
    ) {
      const beam = network.attentionBeams[index]
      const mesh = attentionBeamRefs.current[index]
      if (!beam || !mesh) continue
      const beamSelected = beam.sourceToken === selected
      mesh.visible = beamSelected && isolatedNode === null
      if (
        beamSelected &&
        mesh.material instanceof THREE.MeshBasicMaterial
      ) {
        mesh.material.color.set(
          NEURAL_HEAD_COLORS[beam.headIndex] ??
            palette.secondary,
        )
        mesh.material.opacity =
          0.1 +
          beam.weight * 0.4 +
          beamPulse * (0.06 + beam.weight * 0.16)
      }
    }

    if (
      pointerClickTriggered &&
      !pointerClickConsumed &&
      galleryState.activeExhibitId === 'quantum-lattice'
    ) {
      temporary.pointer.set(pointer.u, pointer.v)
      raycaster.setFromCamera(temporary.pointer, state.camera)
      const inputLayer = inputLayerRef.current
      if (inputLayer) {
        inputLayer.updateWorldMatrix(true, true)
        const hits = raycaster.intersectObject(inputLayer, true)
        const firstHit = hits[0]
        let object: THREE.Object3D | null = firstHit?.object ?? null
        while (object && typeof object.userData.tokenIndex !== 'number') {
          object = object.parent
        }
        const tokenIndex = object?.userData.tokenIndex
        if (typeof tokenIndex === 'number') {
          queueMicrotask(() => {
            useGalleryStore.getState().selectNeuralToken(tokenIndex)
          })
        }
      }
    } else if (pointer.impulse === lastPointerImpulseRef.current) {
      lastPointerImpulseRef.current = pointer.impulse
    }

    let activeFlashCount = 0
    let maximumActivation = 0
    for (let index = 0; index < nodeActivation.length; index += 1) {
      const activation = nodeActivation[index]
      maximumActivation = Math.max(maximumActivation, activation)
      if (activation > 0.16) activeFlashCount += 1
    }

    dataTimerRef.current += safeDelta
    const host = hostRef.current
    if (host && dataTimerRef.current >= 0.1) {
      dataTimerRef.current = 0
      const inferencePhase =
        trainingMode === 'backprop' && gradientActive
          ? 'backprop'
          : !Number.isFinite(inferenceAge)
          ? 'idle'
          : inferenceAge < 0.9
            ? 'input'
            : inferenceAge < 1.75
              ? 'attention'
              : inferenceAge < 2.7
                ? 'hidden'
                : inferenceAge < 3.7
                  ? 'logits'
                  : 'settled'
      host.dataset.neuralSelectedToken = String(selected)
      host.dataset.neuralWinner = String(selectedWinner)
      host.dataset.neuralTrainingMode = trainingMode
      host.dataset.neuralInferencePhase = inferencePhase
      host.dataset.neuralGradientActive = String(
        gradientActive,
      )
      host.dataset.neuralGradientProgress =
        gradientProgress.toFixed(3)
      host.dataset.neuralPhotonDirection = gradientActive
        ? 'reverse'
        : 'forward'
      host.dataset.neuralActiveFlashes = String(activeFlashCount)
      host.dataset.neuralPhotonTransitions = String(
        photonTransitionRef.current,
      )
      host.dataset.neuralMaxActivation =
        maximumActivation.toFixed(3)
      host.dataset.neuralOutputProbability =
        maximumProbability.toFixed(4)
      host.dataset.neuralActivePhotons = String(
        activePhotonCount,
      )
      for (let index = 0; index < NEURAL_INPUT_COUNT; index += 1) {
        const mesh = inputNodeRefs.current[index]
        if (!mesh) {
          inputNdcRef.current[index] = '0,0'
          continue
        }
        mesh.getWorldPosition(temporary.position)
        temporary.position.project(state.camera)
        inputNdcRef.current[index] =
          `${temporary.position.x.toFixed(4)},` +
          temporary.position.y.toFixed(4)
      }
      host.dataset.neuralInputNdc =
        inputNdcRef.current.join(';')
      for (
        let index = 0;
        index < NEURAL_HIDDEN_COUNT;
        index += 1
      ) {
        const positionA = layout.hiddenAPositions[index]
        const positionB = layout.hiddenBPositions[index]
        if (positionA) {
          temporary.position
            .copy(positionA)
            .applyMatrix4(networkGroup.matrixWorld)
            .project(state.camera)
          hiddenNdcRef.current[index] =
            `${temporary.position.x.toFixed(4)},` +
            temporary.position.y.toFixed(4)
        }
        if (positionB) {
          temporary.position
            .copy(positionB)
            .applyMatrix4(networkGroup.matrixWorld)
            .project(state.camera)
          hiddenNdcRef.current[
            NEURAL_HIDDEN_COUNT + index
          ] =
            `${temporary.position.x.toFixed(4)},` +
            temporary.position.y.toFixed(4)
        }
      }
      host.dataset.neuralHiddenNdc =
        hiddenNdcRef.current.join(';')
      if (isolatedNode === null || isolatedLayer === null) {
        host.dataset.neuralIsolatedNode = 'none'
        host.dataset.neuralIsolationFunction = 'none'
        host.dataset.neuralIsolationActivation = '0.000'
      } else {
        const nodeIndex =
          isolatedNode -
          (isolatedLayer === 'a'
            ? HIDDEN_A_OFFSET
            : HIDDEN_B_OFFSET)
        host.dataset.neuralIsolatedNode =
          `hidden-${isolatedLayer}-${nodeIndex}`
        host.dataset.neuralIsolationFunction =
          isolatedLayer === 'a' ? 'gelu' : 'swish'
        host.dataset.neuralIsolationActivation =
          nodeActivation[isolatedNode].toFixed(3)
      }
    }
  })

  return (
    <group
      ref={sceneGroupRef}
      position={[0, -0.16, 0]}
      rotation={[0.18, 0, 0]}
      scale={mode === 'darkroom' ? 1.02 : 0.9}
    >
      <mesh position={[0, -0.42, -0.02]}>
        <circleGeometry args={[1.58, 96]} />
        <meshStandardMaterial
          color="#03080c"
          emissive={palette.primary}
          emissiveIntensity={0.055}
          metalness={0.64}
          roughness={0.38}
          transparent
          opacity={0.9}
        />
      </mesh>
      <mesh
        position={[0, -0.416, -0.02]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[1.36, 1.52, 128]} />
        <meshBasicMaterial
          color={palette.secondary}
          transparent
          opacity={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <group ref={networkGroupRef}>
        <lineSegments
          geometry={layout.layerRailGeometry}
          renderOrder={1}
        >
          <lineBasicMaterial
            ref={layerRailMaterialRef}
            vertexColors
            transparent
            opacity={0.24}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </lineSegments>
        <lineSegments
          geometry={network.fiberGeometry}
          renderOrder={2}
        >
          <lineBasicMaterial
            ref={fiberMaterialRef}
            vertexColors
            transparent
            opacity={0.18}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </lineSegments>
        <lineSegments
          ref={isolationLineRef}
          geometry={isolationGeometry.geometry}
          visible={false}
          frustumCulled={false}
          renderOrder={8}
        >
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={0.9}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </lineSegments>

        <sprite
          ref={inspectorSpriteRef}
          visible={false}
          scale={[0.72, 0.45, 1]}
          renderOrder={20}
        >
          <spriteMaterial
            map={inspectorPanel?.texture}
            transparent
            opacity={0.96}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>

        <NeuralPulseSandboxNetworkVisuals
          inputLayerRef={inputLayerRef}
          inputNodeRefs={inputNodeRefs}
          attentionClusterRefs={attentionClusterRefs}
          attentionRingRefs={attentionRingRefs}
          hiddenAMeshRef={hiddenAMeshRef}
          hiddenBMeshRef={hiddenBMeshRef}
          outputNodeRefs={outputNodeRefs}
          outputColumnRefs={outputColumnRefs}
          attentionBeamRefs={attentionBeamRefs}
          gradientFiberMeshRef={gradientFiberMeshRef}
          gradientBurstRef={gradientBurstRef}
          gradientBurstMaterialRef={gradientBurstMaterialRef}
          layout={layout}
          network={network}
          selectedToken={selectedToken}
          winner={winner}
          highDetail={highDetail}
        />

        <instancedMesh
          ref={photonGlowMeshRef}
          args={[undefined, undefined, NEURAL_PHOTON_COUNT]}
          frustumCulled={false}
          renderOrder={9}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            ref={photonGlowMaterialRef}
            color="#b7fff8"
            transparent
            opacity={0.05}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
        <instancedMesh
          ref={photonMeshRef}
          args={[undefined, undefined, NEURAL_PHOTON_COUNT]}
          frustumCulled={false}
          renderOrder={10}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            ref={photonCoreMaterialRef}
            color="#efffff"
            transparent
            opacity={0.78}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
      </group>

      <pointLight
        position={[0, 0.8, 0.2]}
        color={palette.secondary}
        intensity={0.95}
        distance={3.4}
        decay={2}
      />
      <pointLight
        position={[0, 0.15, 1.25]}
        color="#ffe28a"
        intensity={0.55}
        distance={2.2}
        decay={2}
      />
      <ambientLight intensity={0.14} color={palette.tertiary} />
    </group>
  )
}
