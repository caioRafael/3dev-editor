import { useLayoutEffect, useRef } from 'react'
import { Edges, TransformControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { MathUtils, type Group } from 'three'
import { useEditor } from '../document/store'
import {
  type FeatureNode,
  isBooleanNode,
  isCuboidNode,
  isCylinderNode,
  isSphereNode
} from '../document/types'
import { round3 } from '../document/math'
import { useBooleanGeometry } from '../preview/useBooleanGeometry'
import { useCuboidGeometry } from '../preview/useCuboidGeometry'
import { useViewportInteraction, dragIdRef } from './interaction'

interface FeatureViewProps {
  id: string
}

export function FeatureView({ id }: FeatureViewProps): React.JSX.Element | null {
  const node = useEditor((state) => state.document.nodes[id])
  const selected = useEditor((state) => state.selection.includes(id))
  const previewMode = useEditor((state) => state.previewMode)
  const segments = useEditor((state) => Math.max(8, Math.min(128, Math.round(state.document.fn))))
  const groupRef = useRef<Group>(null)
  const { register } = useViewportInteraction()

  useLayoutEffect(() => {
    const group = groupRef.current
    if (!group) return
    register(id, group)
    return () => register(id, null)
  }, [id, node?.visible, register])

  useLayoutEffect(() => {
    const group = groupRef.current
    if (!group || !node || dragIdRef.current === id) return
    group.position.set(
      node.transform.position.x,
      node.transform.position.y,
      node.transform.position.z
    )
    group.rotation.order = 'XYZ'
    group.rotation.set(
      MathUtils.degToRad(node.transform.rotation.x),
      MathUtils.degToRad(node.transform.rotation.y),
      MathUtils.degToRad(node.transform.rotation.z)
    )
    group.scale.set(1, 1, 1)
  }, [id, node])

  if (!node || !node.visible) return null
  const showMesh = !node.consumedBy || selected
  const interactive = previewMode === 'fast' && !node.consumedBy

  return (
    <group ref={groupRef}>
      {showMesh && isBooleanNode(node) ? (
        <BooleanMesh node={node} selected={selected} interactive={interactive} />
      ) : null}
      {showMesh && !isBooleanNode(node) ? (
        <PrimitiveMesh
          node={node}
          selected={selected}
          interactive={interactive}
          segments={segments}
          ghost={Boolean(node.consumedBy)}
        />
      ) : null}
      {isBooleanNode(node)
        ? node.childIds.map((childId) => <FeatureView key={childId} id={childId} />)
        : null}
    </group>
  )
}

export function SelectionGizmo(): React.JSX.Element | null {
  const tool = useEditor((state) => state.tool)
  const selection = useEditor((state) => state.selection)
  const nodes = useEditor((state) => state.document.nodes)
  const { refs, version } = useViewportInteraction()
  const selectedId = selection.at(-1) ?? null
  const node = selectedId ? nodes[selectedId] : undefined
  const object = selectedId ? refs.current.get(selectedId) : undefined
  if (!selectedId || !node || !object || node.locked) return null
  if (tool !== 'move' && tool !== 'rotate' && tool !== 'scale') return null
  const mode = tool === 'move' ? 'translate' : tool === 'rotate' ? 'rotate' : 'scale'

  return (
    <TransformControls
      key={`${selectedId}:${version}`}
      object={object}
      mode={mode}
      space="local"
      onMouseDown={() => {
        dragIdRef.current = selectedId
      }}
      onMouseUp={() => {
        const position = {
          x: round3(object.position.x),
          y: round3(object.position.y),
          z: round3(object.position.z)
        }
        const rotation = {
          x: round3(MathUtils.radToDeg(object.rotation.x)),
          y: round3(MathUtils.radToDeg(object.rotation.y)),
          z: round3(MathUtils.radToDeg(object.rotation.z))
        }
        const scale =
          tool === 'scale' ? { x: object.scale.x, y: object.scale.y, z: object.scale.z } : null
        object.scale.set(1, 1, 1)
        useEditor.getState().commitTransform(selectedId, { position, rotation }, scale)
        window.setTimeout(() => {
          dragIdRef.current = null
        }, 0)
      }}
    />
  )
}

function PrimitiveMesh({
  node,
  selected,
  interactive,
  segments,
  ghost
}: {
  node: FeatureNode
  selected: boolean
  interactive: boolean
  segments: number
  ghost: boolean
}): React.JSX.Element {
  const opacity = ghost ? Math.min(node.appearance.opacity, 0.45) : node.appearance.opacity
  const rounded = useCuboidGeometry(node, segments)
  return (
    <mesh
      key={rounded ? 'treated' : 'basic'}
      castShadow
      geometry={rounded ?? undefined}
      rotation={isCylinderNode(node) ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
      onPointerDown={(event) => selectFromEvent(event, node.id)}
      {...(interactive ? {} : { raycast: skipRaycast })}
    >
      {isCuboidNode(node) && !rounded ? (
        <boxGeometry args={[node.size.x, node.size.y, node.size.z]} />
      ) : null}
      {isCylinderNode(node) ? (
        <cylinderGeometry args={[node.diameter / 2, node.diameter / 2, node.height, segments]} />
      ) : null}
      {isSphereNode(node) ? (
        <sphereGeometry
          args={[node.diameter / 2, segments, Math.max(8, Math.round(segments / 2))]}
        />
      ) : null}
      <meshStandardMaterial
        color={node.appearance.color}
        opacity={opacity}
        transparent={opacity < 0.999 || ghost}
        metalness={0.06}
        roughness={0.58}
        emissive={selected ? '#ffb088' : '#000000'}
        emissiveIntensity={selected ? 0.28 : 0}
        polygonOffset={ghost}
        polygonOffsetFactor={ghost ? -2 : 0}
      />
      {selected ? <Edges threshold={20} color="#fff7f2" /> : null}
    </mesh>
  )
}

function BooleanMesh({
  node,
  selected,
  interactive
}: {
  node: FeatureNode
  selected: boolean
  interactive: boolean
}): React.JSX.Element | null {
  const geometry = useBooleanGeometry(node.id)
  if (!geometry) return null
  return (
    <mesh
      geometry={geometry}
      castShadow
      onPointerDown={(event) => selectFromEvent(event, node.id)}
      {...(interactive ? {} : { raycast: skipRaycast })}
    >
      <meshStandardMaterial
        color={node.appearance.color}
        opacity={node.appearance.opacity}
        transparent={node.appearance.opacity < 0.999}
        metalness={0.06}
        roughness={0.58}
        emissive={selected ? '#ffb088' : '#000000'}
        emissiveIntensity={selected ? 0.28 : 0}
      />
      {selected ? <Edges threshold={20} color="#fff7f2" /> : null}
    </mesh>
  )
}

function selectFromEvent(event: ThreeEvent<PointerEvent>, id: string): void {
  event.stopPropagation()
  useEditor.getState().select(id, { additive: event.shiftKey })
}

function skipRaycast(): void {
  return
}
