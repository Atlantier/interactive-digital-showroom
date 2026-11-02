import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { RayMazeElement as OpticalElement } from '../../../utils/rayMazeSolver'
export function DialTicks({
  radius,
  majorColor,
  minorColor,
}: {
  radius: number
  majorColor: string
  minorColor: string
}) {
  const geometry = useMemo(() => {
    const positions: number[] = []
    const colors: number[] = []
    const major = new THREE.Color(majorColor)
    const minor = new THREE.Color(minorColor)
    for (let index = 0; index < 16; index += 1) {
      const angle = (index / 16) * Math.PI * 2
      const isMajor = index % 4 === 0
      const innerRadius =
        radius - (isMajor ? 0.043 : 0.025)
      const color = isMajor ? major : minor
      positions.push(
        Math.cos(angle) * innerRadius,
        Math.sin(angle) * innerRadius,
        0.047,
        Math.cos(angle) * (radius + 0.006),
        Math.sin(angle) * (radius + 0.006),
        0.047,
      )
      colors.push(
        color.r,
        color.g,
        color.b,
        color.r,
        color.g,
        color.b,
      )
    }
    const nextGeometry = new THREE.BufferGeometry()
    nextGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    )
    nextGeometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3),
    )
    return nextGeometry
  }, [majorColor, minorColor, radius])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.58}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  )
}

export function OpticalElementAssembly({
  element,
  index,
  registerGroup,
  registerRingMaterial,
  primary,
  secondary,
  tertiary,
}: {
  element: OpticalElement
  index: number
  registerGroup: (
    index: number,
    group: THREE.Group | null,
  ) => void
  registerRingMaterial: (
    index: number,
    material: THREE.MeshBasicMaterial | null,
  ) => void
  primary: string
  secondary: string
  tertiary: string
}) {
  return (
    <group
      ref={(group) => registerGroup(index, group)}
      position={[element.x, element.y, 0.075]}
      rotation={[0, 0, element.angle]}
    >
      {element.type === 'mirror' ? (
        <>
          <mesh>
            <boxGeometry args={[element.length, 0.075, 0.13]} />
            <meshStandardMaterial
              color="#c8fdf3"
              emissive={primary}
              emissiveIntensity={0.18}
              metalness={1}
              roughness={0.08}
            />
          </mesh>
          <mesh position={[0, 0, 0.071]}>
            <boxGeometry args={[element.length * 0.92, 0.01, 0.03]} />
            <meshBasicMaterial
              color="#ecfffd"
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, -0.045]}>
            <cylinderGeometry args={[0.045, 0.055, 0.08, 16]} />
            <meshStandardMaterial
              color="#233b3b"
              metalness={0.8}
              roughness={0.3}
            />
          </mesh>
        </>
      ) : null}

      {element.type === 'splitter' ? (
        <>
          <mesh>
            <boxGeometry
              args={[
                element.length,
                element.length,
                0.16,
              ]}
            />
            <meshPhysicalMaterial
              color="#a8fff1"
              emissive={secondary}
              emissiveIntensity={0.24}
              transparent
              opacity={0.3}
              roughness={0.08}
              metalness={0.12}
              transmission={0.24}
              thickness={0.2}
            />
          </mesh>
          <mesh scale={1.015}>
            <boxGeometry
              args={[
                element.length,
                element.length,
                0.16,
              ]}
            />
            <meshBasicMaterial
              color={secondary}
              wireframe
              transparent
              opacity={0.7}
              toneMapped={false}
            />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <planeGeometry
              args={[
                element.length * 0.9,
                element.length * 0.9,
              ]}
            />
            <meshBasicMaterial
              color="#eaffff"
              transparent
              opacity={0.1}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </>
      ) : null}

      {element.type === 'prism' ? (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry
              args={[
                element.hitRadius,
                element.hitRadius,
                0.13,
                3,
              ]}
            />
            <meshPhysicalMaterial
              color="#b4fff2"
              emissive={tertiary}
              emissiveIntensity={0.18}
              transparent
              opacity={0.42}
              roughness={0.05}
              metalness={0}
              transmission={0.46}
              thickness={0.3}
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} scale={1.01}>
            <cylinderGeometry
              args={[
                element.hitRadius,
                element.hitRadius,
                0.13,
                3,
              ]}
            />
            <meshBasicMaterial
              color="#dfffff"
              wireframe
              transparent
              opacity={0.6}
              toneMapped={false}
            />
          </mesh>
        </>
      ) : null}

      {element.type === 'emitter' ? (
        <>
          <mesh position={[-0.035, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <cylinderGeometry args={[0.075, 0.09, 0.3, 18]} />
            <meshStandardMaterial
              color="#17272a"
              emissive={primary}
              emissiveIntensity={0.16}
              metalness={0.84}
              roughness={0.24}
            />
          </mesh>
          <mesh position={[0.13, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <cylinderGeometry args={[0.052, 0.068, 0.08, 18]} />
            <meshBasicMaterial
              color="#dffff9"
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0.176, 0, 0]}>
            <sphereGeometry args={[0.028, 16, 12]} />
            <meshBasicMaterial
              color="#ffffff"
              toneMapped={false}
            />
          </mesh>
        </>
      ) : null}

      <mesh position={[0, 0, -0.03]}>
        <cylinderGeometry
          args={[0.075, 0.095, 0.045, 20]}
        />
        <meshStandardMaterial
          color="#0a1213"
          metalness={0.7}
          roughness={0.2}
        />
      </mesh>
      <mesh position={[0, 0, 0.075]}>
        <sphereGeometry args={[0.017, 12, 8]} />
        <meshBasicMaterial
          color={secondary}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <torusGeometry args={[element.ringRadius, 0.006, 6, 64]} />
        <meshBasicMaterial
          ref={(material) =>
            registerRingMaterial(index, material)
          }
          color={secondary}
          transparent
          opacity={0.34}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <DialTicks
        radius={element.ringRadius}
        majorColor={primary}
        minorColor={tertiary}
      />
      <mesh
        position={[element.ringRadius, 0, 0.05]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <coneGeometry args={[0.022, 0.07, 3]} />
        <meshBasicMaterial
          color={primary}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
