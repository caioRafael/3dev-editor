import { useEffect, useLayoutEffect, useRef } from 'react'
import { Edges, TransformControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { MathUtils, type Group } from 'three'
import { useEditor } from '../document/store'
import {
  type FeatureNode,
  isComponentNode,
  isCuboidNode,
  isCylinderNode,
  isGroupEnabled,
  isGroupNode,
  isProfileNode,
  isSphereNode,
  showsInactiveChildren
} from '../document/types'
import { round3 } from '../document/math'
import { useBooleanGeometry } from '../preview/useBooleanGeometry'
import { useCuboidGeometry } from '../preview/useCuboidGeometry'
import { useProfileGeometry } from '../preview/useProfileGeometry'
import { useViewportInteraction, dragIdRef } from './interaction'

interface FeatureViewProps {
  id: string
  fileName?: string
  selectId?: string
}

export function FeatureView({
  id,
  fileName,
  selectId
}: FeatureViewProps): React.JSX.Element | null {
  const node = useEditor((state) => {
    const owner = fileName ?? state.document.activeFile
    return state.document.files[owner]?.nodes[id]
  })
  const selected = useEditor((state) => state.selection.includes(selectId ?? id))
  const revealed = useEditor((state) => {
    const owner = fileName ?? state.document.activeFile
    const nodes = state.document.files[owner]?.nodes
    if (!nodes || !node) return false
    return showsInactiveChildren(nodes, node)
  })
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
  const nested = selectId !== undefined
  const picking = selectId ?? id
  const showMesh = !node.consumedBy || selected || revealed
  const interactive = previewMode === 'fast' && (!node.consumedBy || revealed) && !nested
  const groupActive = !isGroupNode(node) || isGroupEnabled(node)

  return (
    <group ref={groupRef}>
      {showMesh && isComponentNode(node) ? (
        <group scale={[node.scale.x, node.scale.y, node.scale.z]}>
          <ComponentBodies componentName={node.componentName} selectId={picking} />
        </group>
      ) : null}
      {showMesh && isGroupNode(node) && groupActive ? (
        <BooleanMesh
          node={node}
          fileName={fileName}
          selected={selected}
          interactive={interactive}
          selectId={picking}
        />
      ) : null}
      {showMesh && isProfileNode(node) ? (
        <ProfileMesh
          node={node}
          selected={selected && !nested}
          interactive={interactive || nested}
          segments={segments}
          ghost={Boolean(node.consumedBy) && !revealed}
          selectId={picking}
        />
      ) : null}
      {showMesh && (isCuboidNode(node) || isCylinderNode(node) || isSphereNode(node)) ? (
        <PrimitiveMesh
          node={node}
          selected={selected && !nested}
          interactive={interactive || nested}
          segments={segments}
          ghost={Boolean(node.consumedBy) && !revealed}
          selectId={picking}
        />
      ) : null}
      {isGroupNode(node)
        ? node.childIds.map((childId) => (
            <FeatureView key={childId} id={childId} fileName={fileName} selectId={selectId} />
          ))
        : null}
    </group>
  )
}

function ComponentBodies({
  componentName,
  selectId
}: {
  componentName: string
  selectId: string
}): React.JSX.Element {
  const nodes = useEditor((state) => state.document.files[componentName]?.nodes)
  const roots = nodes ? Object.values(nodes).filter((node) => node.consumedBy === null) : []
  return (
    <>
      {roots.map((root) => (
        <FeatureView key={root.id} id={root.id} fileName={componentName} selectId={selectId} />
      ))}
    </>
  )
}

export function SelectionGizmo(): React.JSX.Element | null {
  const tool = useEditor((state) => state.tool)
  const selection = useEditor((state) => state.selection)
  const nodes = useEditor((state) => state.document.files[state.document.activeFile]?.nodes)
  const { refs, version, controls } = useViewportInteraction()
  const selectedId = selection.at(-1) ?? null
  const node = selectedId && nodes ? nodes[selectedId] : undefined
  const object = selectedId ? refs.current.get(selectedId) : undefined
  const gizmoActive =
    Boolean(selectedId && node && object && !node.locked) &&
    (tool === 'move' || tool === 'rotate' || tool === 'scale')
  useEffect(() => {
    if (!gizmoActive) return
    return () => {
      const orbit = controls.current
      if (orbit) orbit.enabled = true
    }
  }, [controls, gizmoActive])
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
        const orbit = controls.current
        if (orbit) orbit.enabled = false
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
        const orbit = controls.current
        try {
          useEditor.getState().commitTransform(selectedId, { position, rotation }, scale)
        } finally {
          if (orbit) orbit.enabled = true
          window.setTimeout(() => {
            dragIdRef.current = null
          }, 0)
        }
      }}
    />
  )
}

function PrimitiveMesh({
  node,
  selected,
  interactive,
  segments,
  ghost,
  selectId
}: {
  node: FeatureNode
  selected: boolean
  interactive: boolean
  segments: number
  ghost: boolean
  selectId: string
}): React.JSX.Element {
  const opacity = ghost ? Math.min(node.appearance.opacity, 0.45) : node.appearance.opacity
  const rounded = useCuboidGeometry(node, segments)
  return (
    <mesh
      key={rounded ? 'treated' : 'basic'}
      castShadow
      geometry={rounded ?? undefined}
      rotation={isCylinderNode(node) ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
      onClick={(event) => selectFromEvent(event, selectId)}
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

function ProfileMesh({
  node,
  selected,
  interactive,
  segments,
  ghost,
  selectId
}: {
  node: FeatureNode
  selected: boolean
  interactive: boolean
  segments: number
  ghost: boolean
  selectId: string
}): React.JSX.Element | null {
  const geometry = useProfileGeometry(node, segments)
  if (!geometry) return null
  const opacity = ghost ? Math.min(node.appearance.opacity, 0.45) : node.appearance.opacity
  return (
    <mesh
      geometry={geometry}
      castShadow
      onClick={(event) => selectFromEvent(event, selectId)}
      {...(interactive ? {} : { raycast: skipRaycast })}
    >
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
  fileName,
  selected,
  interactive,
  selectId
}: {
  node: FeatureNode
  fileName?: string
  selected: boolean
  interactive: boolean
  selectId: string
}): React.JSX.Element | null {
  const geometry = useBooleanGeometry(node.id, fileName)
  if (!geometry) return null
  return (
    <mesh
      geometry={geometry}
      castShadow
      onClick={(event) => selectFromEvent(event, selectId)}
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

const CLICK_DELTA = 2

function selectFromEvent(event: ThreeEvent<MouseEvent>, id: string): void {
  event.stopPropagation()
  if (event.button !== 0 || event.delta > CLICK_DELTA || dragIdRef.current) return
  useEditor.getState().select(id, { additive: event.shiftKey })
}

function skipRaycast(): void {
  return
}
