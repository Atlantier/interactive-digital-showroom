import type { RefObject } from 'react'
import * as THREE from 'three'
import {
  NEURAL_ATTENTION_HEADS,
  NEURAL_HEAD_COLORS,
  NEURAL_HIDDEN_COUNT,
} from '../../../data/neuralNetwork'
import {
  ATTENTION_CLUSTER_SIZE,
  LAYER_Z,
  type NeuralLayout,
  type NeuralNetwork,
} from './neuralPulseSandboxModel'

interface NeuralPulseSandboxNetworkVisualsProps {
  inputLayerRef: RefObject<THREE.Group | null>
  inputNodeRefs: RefObject<Array<THREE.Mesh | null>>
  attentionClusterRefs: RefObject<
    Array<THREE.InstancedMesh | null>
  >
  attentionRingRefs: RefObject<Array<THREE.Mesh | null>>
  hiddenAMeshRef: RefObject<THREE.InstancedMesh | null>
  hiddenBMeshRef: RefObject<THREE.InstancedMesh | null>
  outputNodeRefs: RefObject<Array<THREE.Mesh | null>>
  outputColumnRefs: RefObject<Array<THREE.Mesh | null>>
  attentionBeamRefs: RefObject<Array<THREE.Mesh | null>>
  gradientFiberMeshRef: RefObject<THREE.InstancedMesh | null>
  gradientBurstRef: RefObject<THREE.Mesh | null>
  gradientBurstMaterialRef: RefObject<THREE.MeshBasicMaterial | null>
  layout: NeuralLayout
  network: NeuralNetwork
  selectedToken: number
  winner: number
  highDetail: boolean
}

export function NeuralPulseSandboxNetworkVisuals({
  inputLayerRef,
  inputNodeRefs,
  attentionClusterRefs,
  attentionRingRefs,
  hiddenAMeshRef,
  hiddenBMeshRef,
  outputNodeRefs,
  outputColumnRefs,
  attentionBeamRefs,
  gradientFiberMeshRef,
  gradientBurstRef,
  gradientBurstMaterialRef,
  layout,
  network,
  selectedToken,
  winner,
  highDetail,
}: NeuralPulseSandboxNetworkVisualsProps) {
  return (
    <>
      <group ref={inputLayerRef}>
        {layout.inputPositions.map((position, index) => (
          <group
            key={`neural-input-${index}`}
            position={position}
            userData={{ tokenIndex: index }}
          >
            <mesh
              ref={(mesh) => {
                inputNodeRefs.current[index] = mesh
              }}
              renderOrder={6}
            >
              <octahedronGeometry args={[1, 0]} />
              <meshBasicMaterial
                color="#8cf9ff"
                transparent
                opacity={0.82}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
            <mesh renderOrder={4}>
              <sphereGeometry args={[0.16, 10, 7]} />
              <meshBasicMaterial
                transparent
                opacity={0}
                depthWrite={false}
                colorWrite={false}
              />
            </mesh>
            <mesh scale={1.35} renderOrder={5}>
              <octahedronGeometry args={[0.068, 0]} />
              <meshBasicMaterial
                color="#5ef2ff"
                transparent
                opacity={0.08}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          </group>
        ))}
      </group>

      {Array.from(
        { length: NEURAL_ATTENTION_HEADS },
        (_, head) => (
          <group key={`attention-head-${head}`}>
            <instancedMesh
              ref={(mesh) => {
                attentionClusterRefs.current[head] = mesh
              }}
              args={[
                undefined,
                undefined,
                ATTENTION_CLUSTER_SIZE,
              ]}
              frustumCulled={false}
              renderOrder={6}
            >
              <icosahedronGeometry args={[1, highDetail ? 1 : 0]} />
              <meshBasicMaterial
                color={NEURAL_HEAD_COLORS[head]}
                transparent
                opacity={0.78}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </instancedMesh>
            <mesh
              ref={(mesh) => {
                attentionRingRefs.current[head] = mesh
              }}
              position={layout.attentionPositions[head]}
              rotation={[Math.PI / 2, 0, 0]}
              renderOrder={5}
            >
              <torusGeometry
                args={[0.22, 0.008, 6, highDetail ? 64 : 36]}
              />
              <meshBasicMaterial
                color={NEURAL_HEAD_COLORS[head]}
                transparent
                opacity={0.36}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          </group>
        ),
      )}

      <instancedMesh
        ref={hiddenAMeshRef}
        args={[undefined, undefined, NEURAL_HIDDEN_COUNT]}
        frustumCulled={false}
        renderOrder={6}
      >
        <icosahedronGeometry args={[1, highDetail ? 1 : 0]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.88}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={hiddenBMeshRef}
        args={[undefined, undefined, NEURAL_HIDDEN_COUNT]}
        frustumCulled={false}
        renderOrder={6}
      >
        <icosahedronGeometry args={[1, highDetail ? 1 : 0]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.88}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>

      {layout.outputPositions.map((position, index) => (
        <group
          key={`neural-output-${index}`}
          position={[position.x, -0.36, position.z]}
        >
          <mesh
            ref={(mesh) => {
              outputColumnRefs.current[index] = mesh
            }}
            renderOrder={4}
          >
            <cylinderGeometry args={[0.016, 0.025, 1, 8]} />
            <meshBasicMaterial
              color={
                index === winner
                  ? '#ffe28a'
                  : NEURAL_HEAD_COLORS[
                      index % NEURAL_ATTENTION_HEADS
                    ]
              }
              transparent
              opacity={0.48}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <mesh
            ref={(mesh) => {
              outputNodeRefs.current[index] = mesh
            }}
            renderOrder={8}
          >
            <icosahedronGeometry args={[1, highDetail ? 1 : 0]} />
            <meshBasicMaterial
              color={index === winner ? '#ffe28a' : '#e7ffff'}
              transparent
              opacity={index === winner ? 1 : 0.72}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {network.attentionBeams.map((beam, index) => (
        <mesh
          key={`neural-attention-beam-${index}`}
          ref={(mesh) => {
            attentionBeamRefs.current[index] = mesh
          }}
          geometry={beam.geometry}
          visible={beam.sourceToken === selectedToken}
          renderOrder={4}
        >
          <meshBasicMaterial
            color={NEURAL_HEAD_COLORS[beam.headIndex]}
            transparent
            opacity={0.16 + beam.weight * 0.55}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}

      <instancedMesh
        ref={gradientFiberMeshRef}
        args={[
          undefined,
          undefined,
          network.gradientFibers.count,
        ]}
        visible={false}
        frustumCulled={false}
        renderOrder={7}
      >
        <cylinderGeometry args={[1, 1, 1, 4, 1]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.32}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>

      <mesh
        ref={gradientBurstRef}
        position={[0, 0.28, LAYER_Z[4]]}
        visible={false}
        frustumCulled={false}
        renderOrder={12}
      >
        <ringGeometry args={[0.72, 0.94, 96]} />
        <meshBasicMaterial
          ref={gradientBurstMaterialRef}
          color="#ffb64a"
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </>
  )
}
