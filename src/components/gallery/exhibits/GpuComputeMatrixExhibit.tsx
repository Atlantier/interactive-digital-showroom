import { useFrame } from '@react-three/fiber'
import {
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react'
import * as THREE from 'three'
import {
  ACCUMULATOR_PARTICLE_COUNT,
  getGpuComputeTelemetry,
  GPU_COMPUTE_MODES,
  GPU_WARP_SIZE,
  NV_LINK_PARTICLE_COUNT,
  TENSOR_VOXEL_COUNT,
} from '../../../data/gpuCompute'
import { getVfxPreset } from '../../../data/vfxPresets'
import { useAppStore } from '../../../store/useAppStore'
import {
  useGalleryStore,
  type ExhibitMeta,
} from '../../../store/useGalleryStore'
import { getEffectiveGalleryTimeScale } from '../../../utils/motionPreferences'
import type { GalleryPointerState } from '../OpticalExhibitScene'
import {
  TENSOR_POINT_VERTEX_SHADER,
  TENSOR_POINT_FRAGMENT_SHADER,
  GPU_HEAT_VERTEX_SHADER,
  GPU_HEAT_FRAGMENT_SHADER,
} from '../../../shaders/gpuComputeMatrix'
import {
  BVH_GREEN,
  TENSOR_CENTER_Y,
  TENSOR_EXTENT,
  TENSOR_SCAN_PLANE_SIZE,
  createBvhNodes,
  createBusParticles,
  createCircuitTraceGeometry,
  createScanGridGeometry,
  createTensorGrid,
  createWarpBeams,
  deterministic,
  sampleBusRoute,
  type WarpState,
} from './gpuComputeMatrixModel'

const TAU = Math.PI * 2
const BUS_GROUP_COUNT = 3
const BUS_GROUP_SIZE = NV_LINK_PARTICLE_COUNT / BUS_GROUP_COUNT
const BVH_NODE_COUNT = 15
const EMERALD = new THREE.Color('#36ff9f')
const CYBER_BLUE = new THREE.Color('#2f8dff')
const RESULT_GOLD = new THREE.Color('#ffd76d')
const RESULT_WHITE = new THREE.Color('#f1ffff')
const HEAT_AMBER = new THREE.Color('#ff9d2e')
const ZERO_Y = new THREE.Vector3(0, 1, 0)
const WARP_ANCHOR_INDEX = 292


export function GpuComputeMatrixExhibit({
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
  const palette = useMemo(() => getVfxPreset(vfxPreset), [vfxPreset])
  const highDetail = performanceTier === 'high'
  const active =
    mode === 'darkroom'
      ? activeExhibitId === 'phase-torus'
      : activeExhibitId === null
  const tensorLoad = exhibit.params.tensorLoad ?? 0.82
  const clock = exhibit.params.clock ?? 1.36
  const rayBias = exhibit.params.rayBias ?? 0.18
  const bvhDepth = exhibit.params.bvhDepth ?? 0.72
  const tensor = useMemo(createTensorGrid, [])
  const busParticles = useMemo(createBusParticles, [])
  const circuitGeometry = useMemo(
    createCircuitTraceGeometry,
    [],
  )
  const scanGridGeometry = useMemo(
    createScanGridGeometry,
    [],
  )
  const bvhNodes = useMemo(createBvhNodes, [])
  const modeWeights = useMemo(() => {
    const weights = new Float32Array(2)
    weights[0] = 1
    return weights
  }, [])
  const tensorPointGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(tensor.positions, 3),
    )
    geometry.setAttribute(
      'aActivation',
      new THREE.BufferAttribute(
        tensor.activation,
        1,
      ).setUsage(THREE.DynamicDrawUsage),
    )
    geometry.setAttribute(
      'aSeed',
      new THREE.BufferAttribute(tensor.seeds, 1),
    )
    return geometry
  }, [tensor])
  const tensorActivationAttribute = useMemo(
    () =>
      tensorPointGeometry.getAttribute(
        'aActivation',
      ) as THREE.BufferAttribute,
    [tensorPointGeometry],
  )
  const tensorPointUniforms = useMemo(
    () => ({
      uDpr: { value: 1 },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uWorkload: { value: 0.68 },
    }),
    [],
  )
  const siliconHeatUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uWorkload: { value: 0.68 },
      uSurface: { value: 0 },
    }),
    [],
  )
  const tensorHeatUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uWorkload: { value: 0.68 },
      uSurface: { value: 1 },
    }),
    [],
  )
  const warpBeams = useMemo(createWarpBeams, [])
  const warpStateRef = useRef<WarpState>({
    active: false,
    elapsed: 0,
    origin: new THREE.Vector3(),
    progress: 0,
    voxelIndex: -1,
  })
  const sceneGroupRef = useRef<THREE.Group>(null)
  const tensorGroupRef = useRef<THREE.Group>(null)
  const bvhGroupRef = useRef<THREE.Group>(null)
  const tensorMeshRef = useRef<THREE.InstancedMesh>(null)
  const tensorPointsRef = useRef<THREE.Points>(null)
  const tensorMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const tensorPointMaterialRef =
    useRef<THREE.ShaderMaterial>(null)
  const siliconHeatMaterialRef =
    useRef<THREE.ShaderMaterial>(null)
  const tensorHeatMaterialRef =
    useRef<THREE.ShaderMaterial>(null)
  const warpBeamRef = useRef<THREE.InstancedMesh>(null)
  const warpBeamMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const warpCoreRef = useRef<THREE.Mesh>(null)
  const warpCoreMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const warpRingRef = useRef<THREE.Mesh>(null)
  const warpRingMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const planeARef = useRef<THREE.Mesh>(null)
  const planeBRef = useRef<THREE.Mesh>(null)
  const planeAMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const planeBMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const intersectionRef = useRef<THREE.Mesh>(null)
  const intersectionMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const accumulatorParticlesRef =
    useRef<THREE.InstancedMesh>(null)
  const accumulatorMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const busMeshRefs = useRef<
    Array<THREE.InstancedMesh | null>
  >([null, null, null])
  const bvhMaterialRefs = useRef<
    Array<THREE.LineBasicMaterial | null>
  >([])
  const bvhRayLineRef = useRef<THREE.LineSegments>(null)
  const bvhRayBeamRef = useRef<THREE.Mesh>(null)
  const bvhRayHeadRef = useRef<THREE.Mesh>(null)
  const bvhRayMaterialRef =
    useRef<THREE.MeshBasicMaterial>(null)
  const bvhHitLevels = useMemo(
    () => new Float32Array(BVH_NODE_COUNT),
    [],
  )
  const bvhRayGeometry = useMemo(() => {
    const positions = new Float32Array(6)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    )
    return geometry
  }, [])
  const hostRef = useRef<HTMLElement | null>(null)
  const tensorClockRef = useRef(0)
  const dataTimerRef = useRef(0)
  const lastPointerImpulseRef = useRef(pointerRef.current.impulse)
  const accumulatorPhaseRef = useRef(
    Array.from(
      { length: ACCUMULATOR_PARTICLE_COUNT },
      (_, index) => deterministic(index * 5 + 9),
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
      rayOrigin: new THREE.Vector3(-1.85, 1.2, 1.25),
      rayTarget: new THREE.Vector3(),
      rayDirection: new THREE.Vector3(),
      rayMidpoint: new THREE.Vector3(),
      warpHead: new THREE.Vector3(),
      warpTail: new THREE.Vector3(),
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
    canvas.dataset.gpuComputeMatrix = 'tensor-core-bvh'
    canvas.dataset.gpuTensorDimensions = '8x8x8'
    canvas.dataset.gpuTensorVoxels = String(TENSOR_VOXEL_COUNT)
    canvas.dataset.gpuNvlinkParticles = String(
      NV_LINK_PARTICLE_COUNT,
    )
    canvas.dataset.gpuBvhNodes = String(BVH_NODE_COUNT)
    canvas.dataset.gpuComputeMode =
      useGalleryStore.getState().gpuComputeMode
    canvas.dataset.gpuWarpSize = String(GPU_WARP_SIZE)
    canvas.dataset.gpuWarpActive = 'false'
    canvas.dataset.gpuWarpCount = '0'
    canvas.dataset.gpuHeatmap = 'silicon-cube-thermal-field'
    canvas.dataset.gpuWorkload = useGalleryStore
      .getState()
      .gpuComputeWorkload.toFixed(3)
    return () => {
      delete canvas.dataset.gpuComputeMatrix
      delete canvas.dataset.gpuTensorDimensions
      delete canvas.dataset.gpuTensorVoxels
      delete canvas.dataset.gpuNvlinkParticles
      delete canvas.dataset.gpuBvhNodes
      delete canvas.dataset.gpuComputeMode
      delete canvas.dataset.gpuTensorActivation
      delete canvas.dataset.gpuBvhHits
      delete canvas.dataset.gpuBusEnergy
      delete canvas.dataset.gpuRayProgress
      delete canvas.dataset.gpuWarpSize
      delete canvas.dataset.gpuWarpActive
      delete canvas.dataset.gpuWarpCount
      delete canvas.dataset.gpuWarpProgress
      delete canvas.dataset.gpuWarpVoxel
      delete canvas.dataset.gpuVoxelAnchorNdc
      delete canvas.dataset.gpuHeatmap
      delete canvas.dataset.gpuHeatmapIntensity
      delete canvas.dataset.gpuWorkload
      delete canvas.dataset.gpuTflops
      delete canvas.dataset.gpuMemoryBandwidth
      delete canvas.dataset.gpuScanMultiplier
      if (hostRef.current === canvas) hostRef.current = null
    }
  }, [active])

  useEffect(
    () => () => {
      circuitGeometry.dispose()
      scanGridGeometry.dispose()
      tensorPointGeometry.dispose()
      bvhRayGeometry.dispose()
      bvhNodes.forEach((node) =>
        node.edgesGeometry.dispose(),
      )
      tensorMeshRef.current?.dispose()
      warpBeamRef.current?.dispose()
      accumulatorParticlesRef.current?.dispose()
      busMeshRefs.current.forEach((mesh) => mesh?.dispose())
    },
    [
      bvhNodes,
      bvhRayGeometry,
      circuitGeometry,
      scanGridGeometry,
      tensorPointGeometry,
    ],
  )

  useEffect(() => {
    const mesh = tensorMeshRef.current
    if (!mesh) return
    for (let index = 0; index < TENSOR_VOXEL_COUNT; index += 1) {
      mesh.setColorAt(index, CYBER_BLUE)
    }
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }, [])

  useFrame((state, delta) => {
    if (!active) return
    const safeDelta = Math.min(delta, 0.045)
    const timeScale = getEffectiveGalleryTimeScale(
      useGalleryStore.getState().timeScale,
    )
    const time = state.clock.elapsedTime * timeScale
    const galleryState = useGalleryStore.getState()
    const workload = galleryState.gpuComputeWorkload
    const loadCurve = workload * workload
    const scanMultiplier =
      0.42 + Math.pow(workload, 1.72) * 4.85
    const pointer = pointerRef.current
    const sceneGroup = sceneGroupRef.current
    if (!sceneGroup) return
    sceneGroup.rotation.y = pointer.u * 0.08
    sceneGroup.rotation.z = Math.sin(time * 0.16) * 0.008

    const activeModeIndex = Math.max(
      0,
      GPU_COMPUTE_MODES.indexOf(galleryState.gpuComputeMode),
    )
    const modeBlend = 1 - Math.exp(-safeDelta * 7.5)
    for (let index = 0; index < 2; index += 1) {
      const target = index === activeModeIndex ? 1 : 0
      modeWeights[index] +=
        (target - modeWeights[index]) * modeBlend
    }
    const tensorWeight = modeWeights[0]
    const bvhWeight = modeWeights[1]
    if (tensorGroupRef.current) {
      tensorGroupRef.current.visible = tensorWeight > 0.006
      tensorGroupRef.current.scale.setScalar(
        0.82 + tensorWeight * 0.18,
      )
      tensorGroupRef.current.position.y =
        (1 - tensorWeight) * -0.08
    }
    if (bvhGroupRef.current) {
      bvhGroupRef.current.visible = bvhWeight > 0.006
      bvhGroupRef.current.scale.setScalar(
        0.82 + bvhWeight * 0.18,
      )
      bvhGroupRef.current.position.y =
        (1 - bvhWeight) * -0.08
    }

    let busEnergy = 0
    for (let group = 0; group < BUS_GROUP_COUNT; group += 1) {
      const mesh = busMeshRefs.current[group]
      if (!mesh) continue
      for (let local = 0; local < BUS_GROUP_SIZE; local += 1) {
        const index = group * BUS_GROUP_SIZE + local
        const progress =
          (busParticles.offsets[index] +
            time *
              busParticles.speeds[index] *
              (0.72 + tensorLoad * 0.5 + workload * 1.25)) %
          1
        sampleBusRoute(group, progress, temporary.position)
        const pulse =
          0.55 +
          Math.sin(
            time * 8.5 +
              busParticles.seeds[index] * TAU,
          ) *
            0.18
        temporary.scale.setScalar(
          (0.0055 + busParticles.seeds[index] * 0.005) *
            pulse,
        )
        temporary.matrix.compose(
          temporary.position,
          temporary.quaternion.identity(),
          temporary.scale,
        )
        mesh.setMatrixAt(local, temporary.matrix)
        busEnergy += pulse
      }
      mesh.instanceMatrix.needsUpdate = true
    }
    busEnergy /= Math.max(1, NV_LINK_PARTICLE_COUNT)

    let tensorActivation = 0
    let tensorPeak = 0
    if (tensorWeight > 0.006) {
      tensorClockRef.current +=
        safeDelta *
        timeScale *
        (0.18 + clock * 0.13) *
        scanMultiplier
      const cycle = tensorClockRef.current % 1
      const planeX = -0.9 + cycle * 1.8
      const planeZ = 0.9 - cycle * 1.8
      if (planeARef.current) {
        planeARef.current.position.x = planeX
      }
      if (planeBRef.current) {
        planeBRef.current.position.z = planeZ
      }
      if (intersectionRef.current) {
        intersectionRef.current.position.x = planeX
        intersectionRef.current.position.z = planeZ
        intersectionRef.current.scale.y =
          0.82 +
          Math.sin(cycle * Math.PI) * 0.2
      }
      const scanPulse = Math.sin(cycle * Math.PI)
      if (planeAMaterialRef.current) {
        planeAMaterialRef.current.opacity =
          0.045 + scanPulse * 0.075
      }
      if (planeBMaterialRef.current) {
        planeBMaterialRef.current.opacity =
          0.045 + scanPulse * 0.075
      }
      if (intersectionMaterialRef.current) {
        intersectionMaterialRef.current.opacity =
          0.35 + scanPulse * 0.55
      }

      const decay = Math.exp(
        -safeDelta * (6.8 + workload * 3.6),
      )
      const mesh = tensorMeshRef.current
      for (let index = 0; index < TENSOR_VOXEL_COUNT; index += 1) {
        const x = tensor.positions[index * 3]
        const y = tensor.positions[index * 3 + 1]
        const z = tensor.positions[index * 3 + 2]
        const hit =
          Math.abs(x - planeX) < 0.095 &&
          Math.abs(z - planeZ) < 0.095
        tensor.activation[index] = Math.max(
          tensor.activation[index] * decay,
          hit ? 1 : 0,
        )
        const activation = tensor.activation[index]
        tensorActivation += activation
        tensorPeak = Math.max(tensorPeak, activation)
        if (mesh) {
          temporary.position.set(x, y, z)
          const scale =
            0.92 +
            activation * 1.75 +
            Math.sin(
              time * 2.1 + tensor.seeds[index] * TAU,
            ) *
              0.04
          temporary.scale.setScalar(scale)
          temporary.matrix.compose(
            temporary.position,
            temporary.quaternion.identity(),
            temporary.scale,
          )
          mesh.setMatrixAt(index, temporary.matrix)
          temporary.color
            .copy(CYBER_BLUE)
            .lerp(EMERALD, clamp01((x + 0.8) / 1.6))
            .lerp(
              HEAT_AMBER,
              loadCurve * (0.08 + activation * 0.14),
            )
            .lerp(RESULT_GOLD, activation * 0.88)
            .lerp(RESULT_WHITE, activation * 0.42)
          mesh.setColorAt(index, temporary.color)
        }
      }
      tensorActivation /= TENSOR_VOXEL_COUNT
      tensorActivationAttribute.needsUpdate = true
      if (mesh) {
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }
      if (tensorMaterialRef.current) {
        tensorMaterialRef.current.opacity =
          (0.5 + tensorPeak * 0.42) * tensorWeight
      }

      const accumulator =
        accumulatorParticlesRef.current
      if (accumulator) {
        for (
          let index = 0;
          index < ACCUMULATOR_PARTICLE_COUNT;
          index += 1
        ) {
          const phase =
            (accumulatorPhaseRef.current[index] +
              safeDelta *
                (0.34 +
                  tensorActivation * 0.85 +
                  workload * 0.72) *
                timeScale) %
            1
          accumulatorPhaseRef.current[index] = phase
          const angle =
            deterministic(index * 9 + 3) * TAU
          const radius =
            0.14 +
            deterministic(index * 7 + 2) * 0.56
          temporary.position.set(
            Math.cos(angle) * radius,
            1.18 + phase * 0.62,
            Math.sin(angle) * radius,
          )
          temporary.scale.setScalar(
            0.006 +
              tensorActivation * 0.008 +
              deterministic(index * 3) * 0.003,
          )
          temporary.matrix.compose(
            temporary.position,
            temporary.quaternion.identity(),
            temporary.scale,
          )
          accumulator.setMatrixAt(index, temporary.matrix)
        }
        accumulator.instanceMatrix.needsUpdate = true
      }
      if (accumulatorMaterialRef.current) {
        accumulatorMaterialRef.current.opacity =
          (0.42 + tensorActivation * 0.48) *
          tensorWeight
      }
    }
    if (tensorPointMaterialRef.current) {
      tensorPointMaterialRef.current.uniforms.uTime.value = time
      tensorPointMaterialRef.current.uniforms.uOpacity.value =
        (0.72 +
          tensorPeak * 0.18 +
          workload * 0.06) *
        tensorWeight
      tensorPointMaterialRef.current.uniforms.uDpr.value =
        state.viewport.dpr
      tensorPointMaterialRef.current.uniforms.uWorkload.value =
        workload
    }
    if (siliconHeatMaterialRef.current) {
      siliconHeatMaterialRef.current.uniforms.uTime.value = time
      siliconHeatMaterialRef.current.uniforms.uWorkload.value =
        workload
    }
    if (tensorHeatMaterialRef.current) {
      tensorHeatMaterialRef.current.uniforms.uTime.value = time
      tensorHeatMaterialRef.current.uniforms.uWorkload.value =
        workload
    }

    const warp = warpStateRef.current
    const tensorPoints = tensorPointsRef.current
    if (pointer.impulse !== lastPointerImpulseRef.current) {
      lastPointerImpulseRef.current = pointer.impulse
      if (
        galleryState.gpuComputeMode === 'tensor' &&
        tensorWeight > 0.45 &&
        tensorPoints
      ) {
        sceneGroup.updateMatrixWorld(true)
        tensorPoints.updateWorldMatrix(true, false)
        let closestDistance = 0.2 * 0.2
        let closestIndex = -1
        for (let index = 0; index < TENSOR_VOXEL_COUNT; index += 1) {
          temporary.position
            .set(
              tensor.positions[index * 3],
              tensor.positions[index * 3 + 1],
              tensor.positions[index * 3 + 2],
            )
            .applyMatrix4(tensorPoints.matrixWorld)
            .project(state.camera)
          const deltaU = temporary.position.x - pointer.u
          const deltaV = temporary.position.y - pointer.v
          const distanceSquared =
            deltaU * deltaU + deltaV * deltaV
          if (distanceSquared < closestDistance) {
            closestDistance = distanceSquared
            closestIndex = index
          }
        }
        if (closestIndex >= 0) {
          warp.active = true
          warp.elapsed = 0
          warp.progress = 0
          warp.voxelIndex = closestIndex
          warp.origin.set(
            tensor.positions[closestIndex * 3],
            tensor.positions[closestIndex * 3 + 1],
            tensor.positions[closestIndex * 3 + 2],
          )
          tensor.activation[closestIndex] = 1
          tensorActivationAttribute.needsUpdate = true
        }
      }
    }

    if (warp.active && tensorWeight > 0.2) {
      warp.elapsed +=
        safeDelta * timeScale * (0.82 + workload * 0.65)
      const warpDuration = 1.8
      warp.progress = clamp01(warp.elapsed / warpDuration)
      const fade = clamp01(
        (warpDuration - warp.elapsed) / 0.34,
      )
      const beamMesh = warpBeamRef.current
      if (beamMesh) {
        beamMesh.visible = true
        for (let index = 0; index < GPU_WARP_SIZE; index += 1) {
          const beam = warpBeams[index]
          const localElapsed = Math.max(
            0,
            warp.elapsed - beam.delay,
          )
          const launch = clamp01(localElapsed / 0.92)
          const eased = 1 - Math.pow(1 - launch, 3)
          const distance = eased * beam.length
          const segmentLength = 0.14 + workload * 0.09
          temporary.warpHead
            .copy(warp.origin)
            .add(beam.offset)
            .addScaledVector(beam.direction, distance)
          temporary.warpTail
            .copy(temporary.warpHead)
            .addScaledVector(
              beam.direction,
              -Math.min(segmentLength, distance),
            )
          temporary.position
            .copy(temporary.warpTail)
            .add(temporary.warpHead)
            .multiplyScalar(0.5)
          temporary.quaternion.setFromUnitVectors(
            ZERO_Y,
            beam.direction,
          )
          const currentLength = Math.max(
            0.001,
            temporary.warpTail.distanceTo(
              temporary.warpHead,
            ),
          )
          const radius = 0.0045 + workload * 0.002
          temporary.scale.set(radius, currentLength, radius)
          temporary.matrix.compose(
            temporary.position,
            temporary.quaternion,
            temporary.scale,
          )
          beamMesh.setMatrixAt(index, temporary.matrix)
        }
        beamMesh.instanceMatrix.needsUpdate = true
      }
      if (warpBeamMaterialRef.current) {
        warpBeamMaterialRef.current.opacity = 0.78 * fade
      }
      if (warpCoreRef.current) {
        warpCoreRef.current.visible = true
        warpCoreRef.current.position.copy(warp.origin)
        warpCoreRef.current.scale.setScalar(
          0.035 +
            Math.sin(warp.elapsed * 18) * 0.008 +
            fade * 0.018,
        )
      }
      if (warpCoreMaterialRef.current) {
        warpCoreMaterialRef.current.opacity = 0.82 * fade
      }
      if (warpRingRef.current) {
        warpRingRef.current.visible = true
        warpRingRef.current.position.copy(warp.origin)
        warpRingRef.current.scale.setScalar(
          0.8 + warp.progress * 4.2,
        )
      }
      if (warpRingMaterialRef.current) {
        warpRingMaterialRef.current.opacity =
          (1 - warp.progress) * 0.62
      }
      if (warp.elapsed >= warpDuration) {
        warp.active = false
      }
    } else {
      if (warpBeamRef.current) {
        warpBeamRef.current.visible = false
      }
      if (warpCoreRef.current) {
        warpCoreRef.current.visible = false
      }
      if (warpRingRef.current) {
        warpRingRef.current.visible = false
      }
      warp.active = false
    }

    let bvhHits = 0
    let rayProgress = 0
    if (bvhWeight > 0.006) {
      temporary.rayTarget.set(
        Math.sin(time * 0.82) * (0.82 + bvhDepth * 0.28),
        0.54 + Math.sin(time * 1.27) * 0.42,
        Math.cos(time * 0.69) * (0.45 + rayBias * 0.35),
      )
      temporary.rayDirection
        .subVectors(temporary.rayTarget, temporary.rayOrigin)
        .normalize()
      raycaster.ray.set(
        temporary.rayOrigin,
        temporary.rayDirection,
      )
      const hitDecay = 1 - Math.exp(-safeDelta * 9.5)
      for (let index = 0; index < bvhNodes.length; index += 1) {
        const node = bvhNodes[index]
        const hit = raycaster.ray.intersectsBox(node.bounds)
        bvhHitLevels[index] +=
          ((hit ? 1 : 0) - bvhHitLevels[index]) * hitDecay
        const level = bvhHitLevels[index]
        if (level > 0.18) bvhHits += 1
        const material = bvhMaterialRefs.current[index]
        if (material) {
          const depthBoost = 0.1 + (3 - node.depth) * 0.035
          temporary.color.lerpColors(
            node.color,
            BVH_GREEN,
            clamp01(level * (0.7 + depthBoost)),
          )
          material.color.copy(temporary.color)
          material.opacity =
            0.09 +
            level * (0.45 + (3 - node.depth) * 0.08) *
              bvhWeight
        }
      }
      const rayPosition = bvhRayGeometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute
      rayPosition.array[0] = temporary.rayOrigin.x
      rayPosition.array[1] = temporary.rayOrigin.y
      rayPosition.array[2] = temporary.rayOrigin.z
      rayPosition.array[3] = temporary.rayTarget.x
      rayPosition.array[4] = temporary.rayTarget.y
      rayPosition.array[5] = temporary.rayTarget.z
      rayPosition.needsUpdate = true

      if (bvhRayBeamRef.current) {
        const length = temporary.rayOrigin.distanceTo(
          temporary.rayTarget,
        )
        temporary.rayMidpoint
          .copy(temporary.rayOrigin)
          .add(temporary.rayTarget)
          .multiplyScalar(0.5)
        temporary.quaternion.setFromUnitVectors(
          ZERO_Y,
          temporary.rayDirection,
        )
        bvhRayBeamRef.current.position.copy(
          temporary.rayMidpoint,
        )
        bvhRayBeamRef.current.quaternion.copy(
          temporary.quaternion,
        )
        bvhRayBeamRef.current.scale.set(
          0.012 + bvhHits * 0.0016,
          length,
          0.012 + bvhHits * 0.0016,
        )
      }
      if (bvhRayHeadRef.current) {
        bvhRayHeadRef.current.position.copy(
          temporary.rayTarget,
        )
        bvhRayHeadRef.current.scale.setScalar(
          0.04 + bvhHits * 0.006,
        )
      }
      if (bvhRayMaterialRef.current) {
        bvhRayMaterialRef.current.opacity =
          (0.4 + bvhHits * 0.05) * bvhWeight
      }
      rayProgress =
        (Math.sin(time * 0.41) + 1) * 0.5
    }

    dataTimerRef.current += safeDelta
    const host = hostRef.current
    if (host && dataTimerRef.current >= 0.1) {
      dataTimerRef.current = 0
      const telemetry = getGpuComputeTelemetry(workload, time)
      host.dataset.gpuComputeMode = galleryState.gpuComputeMode
      host.dataset.gpuWorkload = workload.toFixed(3)
      host.dataset.gpuTensorActivation =
        tensorActivation.toFixed(3)
      host.dataset.gpuBvhHits = String(bvhHits)
      host.dataset.gpuBusEnergy = busEnergy.toFixed(3)
      host.dataset.gpuRayProgress = rayProgress.toFixed(3)
      host.dataset.gpuTflops = telemetry.tflops.toFixed(1)
      host.dataset.gpuMemoryBandwidth =
        telemetry.memoryBandwidth.toFixed(3)
      host.dataset.gpuHeatmapIntensity =
        telemetry.heat.toFixed(3)
      host.dataset.gpuScanMultiplier =
        scanMultiplier.toFixed(3)
      host.dataset.gpuWarpActive = String(warp.active)
      host.dataset.gpuWarpCount = warp.active
        ? String(GPU_WARP_SIZE)
        : '0'
      host.dataset.gpuWarpProgress =
        warp.progress.toFixed(3)
      host.dataset.gpuWarpVoxel = String(warp.voxelIndex)
      const points = tensorPointsRef.current
      if (points) {
        points.updateWorldMatrix(true, false)
        temporary.position
          .set(
            tensor.positions[WARP_ANCHOR_INDEX * 3],
            tensor.positions[WARP_ANCHOR_INDEX * 3 + 1],
            tensor.positions[WARP_ANCHOR_INDEX * 3 + 2],
          )
          .applyMatrix4(points.matrixWorld)
          .project(state.camera)
        host.dataset.gpuVoxelAnchorNdc =
          `${temporary.position.x.toFixed(3)},` +
          temporary.position.y.toFixed(3)
      }
    }
  })

  return (
    <group
      ref={sceneGroupRef}
      position={[0, -0.14, 0]}
      rotation={[0.2, 0, 0]}
      scale={mode === 'darkroom' ? 1.04 : 0.88}
    >
      <mesh position={[0, -0.37, 0]}>
        <boxGeometry args={[3.12, 0.095, 2.36]} />
        <meshStandardMaterial
          color="#05090c"
          metalness={0.88}
          roughness={0.24}
          emissive={palette.primary}
          emissiveIntensity={0.035}
        />
      </mesh>
      <mesh position={[0, -0.319, 0]}>
        <boxGeometry args={[2.94, 0.025, 2.18]} />
        <meshStandardMaterial
          color="#081318"
          metalness={0.72}
          roughness={0.32}
          emissive={palette.secondary}
          emissiveIntensity={0.045}
        />
      </mesh>
      <mesh
        position={[0, -0.304, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={2}
      >
        <planeGeometry args={[2.9, 2.14, 1, 1]} />
        <shaderMaterial
          ref={siliconHeatMaterialRef}
          uniforms={siliconHeatUniforms}
          vertexShader={GPU_HEAT_VERTEX_SHADER}
          fragmentShader={GPU_HEAT_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <lineSegments geometry={circuitGeometry}>
        <lineBasicMaterial
          color="#3bcfc8"
          transparent
          opacity={0.1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>

      {[
        [-1.08, -0.39],
        [1.08, -0.39],
        [-1.08, 0.72],
        [1.08, 0.72],
      ].map(([x, z], index) => (
        <group key={`hbm-${index}`} position={[x, -0.285, z]}>
          <mesh>
            <boxGeometry args={[0.58, 0.075, 0.24]} />
            <meshStandardMaterial
              color="#091217"
              metalness={0.82}
              roughness={0.26}
              emissive={index % 2 === 0 ? '#28d7d2' : '#ffd36a'}
              emissiveIntensity={0.16}
            />
          </mesh>
          <mesh position={[0, 0.052, 0]}>
            <boxGeometry args={[0.46, 0.009, 0.15]} />
            <meshBasicMaterial
              color={index % 2 === 0 ? '#65fff1' : '#ffe29a'}
              transparent
              opacity={0.34}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {[
        '#53f4ff',
        '#5dffc6',
        '#ffd36a',
      ].map((color, group) => (
        <instancedMesh
          key={`bus-${group}`}
          ref={(mesh) => {
            busMeshRefs.current[group] = mesh
          }}
          args={[undefined, undefined, BUS_GROUP_SIZE]}
          frustumCulled={false}
          renderOrder={3}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.78}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
      ))}

      <group ref={tensorGroupRef}>
        <mesh position={[0, 1.63, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.76, 96]} />
          <meshBasicMaterial
            color="#ffe28a"
            transparent
            opacity={0.26}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 1.54, 0]}>
          <boxGeometry args={[1.3, 0.035, 1.3]} />
          <meshStandardMaterial
            color="#081216"
            metalness={0.76}
            roughness={0.24}
            emissive="#ffd36a"
            emissiveIntensity={0.12}
          />
        </mesh>
        <instancedMesh
          ref={tensorMeshRef}
          args={[undefined, undefined, TENSOR_VOXEL_COUNT]}
          frustumCulled={false}
          renderOrder={7}
        >
          <octahedronGeometry args={[0.072, 0]} />
          <meshBasicMaterial
            ref={tensorMaterialRef}
            color="#ffffff"
            vertexColors
            transparent
            opacity={0.4}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
        <points
          ref={tensorPointsRef}
          geometry={tensorPointGeometry}
          frustumCulled={false}
          renderOrder={8}
        >
          <shaderMaterial
            ref={tensorPointMaterialRef}
            uniforms={tensorPointUniforms}
            vertexShader={TENSOR_POINT_VERTEX_SHADER}
            fragmentShader={TENSOR_POINT_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </points>
        <mesh
          position={[0, TENSOR_CENTER_Y, 0]}
          renderOrder={6}
        >
          <boxGeometry
            args={[
              TENSOR_EXTENT * 2.06,
              TENSOR_EXTENT * 2.06,
              TENSOR_EXTENT * 2.06,
            ]}
          />
          <shaderMaterial
            ref={tensorHeatMaterialRef}
            uniforms={tensorHeatUniforms}
            vertexShader={GPU_HEAT_VERTEX_SHADER}
            fragmentShader={GPU_HEAT_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <instancedMesh
          ref={warpBeamRef}
          args={[undefined, undefined, GPU_WARP_SIZE]}
          visible={false}
          frustumCulled={false}
          renderOrder={13}
        >
          <cylinderGeometry args={[1, 1, 1, 5, 1]} />
          <meshBasicMaterial
            ref={warpBeamMaterialRef}
            color="#ffe06a"
            transparent
            opacity={0.78}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
        <mesh
          ref={warpCoreRef}
          visible={false}
          renderOrder={14}
        >
          <octahedronGeometry args={[1, 1]} />
          <meshBasicMaterial
            ref={warpCoreMaterialRef}
            color="#fffbd9"
            transparent
            opacity={0.82}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh
          ref={warpRingRef}
          visible={false}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={13}
        >
          <ringGeometry args={[0.08, 0.11, 48]} />
          <meshBasicMaterial
            ref={warpRingMaterialRef}
            color="#ffca62"
            transparent
            opacity={0.62}
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, TENSOR_CENTER_Y, 0]}>
          <boxGeometry
            args={[
              TENSOR_EXTENT * 2.12,
              TENSOR_EXTENT * 2.12,
              TENSOR_EXTENT * 2.12,
            ]}
          />
          <meshBasicMaterial
            color="#6ceaff"
            wireframe
            transparent
            opacity={0.14}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh
          ref={planeARef}
          position={[-0.9, TENSOR_CENTER_Y, 0]}
          rotation={[0, Math.PI / 2, 0]}
          renderOrder={4}
        >
          <planeGeometry
            args={[TENSOR_SCAN_PLANE_SIZE, TENSOR_SCAN_PLANE_SIZE]}
          />
          <meshBasicMaterial
            ref={planeAMaterialRef}
            color="#36ff9f"
            transparent
            opacity={0.1}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
          <lineSegments
            geometry={scanGridGeometry}
            position={[0, 0, 0.003]}
          >
            <lineBasicMaterial
              color="#77ffd0"
              transparent
              opacity={0.24}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </lineSegments>
        </mesh>
        <mesh
          ref={planeBRef}
          position={[0, TENSOR_CENTER_Y, 0.9]}
          renderOrder={4}
        >
          <planeGeometry
            args={[TENSOR_SCAN_PLANE_SIZE, TENSOR_SCAN_PLANE_SIZE]}
          />
          <meshBasicMaterial
            ref={planeBMaterialRef}
            color="#2f8dff"
            transparent
            opacity={0.1}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
          <lineSegments
            geometry={scanGridGeometry}
            position={[0, 0, 0.003]}
          >
            <lineBasicMaterial
              color="#77c9ff"
              transparent
              opacity={0.24}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </lineSegments>
        </mesh>
        <mesh
          ref={intersectionRef}
          position={[0, TENSOR_CENTER_Y, 0]}
          renderOrder={8}
        >
          <cylinderGeometry args={[0.018, 0.018, 1.7, 8]} />
          <meshBasicMaterial
            ref={intersectionMaterialRef}
            color="#fff0a3"
            transparent
            opacity={0.7}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <instancedMesh
          ref={accumulatorParticlesRef}
          args={[
            undefined,
            undefined,
            ACCUMULATOR_PARTICLE_COUNT,
          ]}
          frustumCulled={false}
          renderOrder={9}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            ref={accumulatorMaterialRef}
            color="#ffe99b"
            transparent
            opacity={0.7}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
      </group>

      <group ref={bvhGroupRef}>
        {bvhNodes.map((node, index) => (
          <lineSegments
            key={`bvh-node-${index}`}
            geometry={node.edgesGeometry}
            position={node.center}
            renderOrder={5 + node.depth}
          >
            <lineBasicMaterial
              ref={(material) => {
                bvhMaterialRefs.current[index] = material
              }}
              color={node.color}
              transparent
              opacity={0.1}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </lineSegments>
        ))}
        <lineSegments
          ref={bvhRayLineRef}
          geometry={bvhRayGeometry}
          frustumCulled={false}
          renderOrder={12}
        >
          <lineBasicMaterial
            color="#fff2b0"
            transparent
            opacity={0.8}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </lineSegments>
        <mesh ref={bvhRayBeamRef} renderOrder={11}>
          <cylinderGeometry args={[1, 1, 1, 6, 1]} />
          <meshBasicMaterial
            ref={bvhRayMaterialRef}
            color="#eaffb0"
            transparent
            opacity={0.5}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={bvhRayHeadRef} renderOrder={13}>
          <icosahedronGeometry args={[1, highDetail ? 1 : 0]} />
          <meshBasicMaterial
            color="#fff3a6"
            transparent
            opacity={0.95}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>

      <pointLight
        position={[0, 1.15, 0.2]}
        color="#62f7ff"
        intensity={1.5}
        distance={3.6}
        decay={2}
      />
      <pointLight
        position={[0, 0.4, 1.3]}
        color="#ffe28a"
        intensity={0.8}
        distance={3.2}
        decay={2}
      />
      <ambientLight intensity={0.14} color={palette.tertiary} />
    </group>
  )
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}
