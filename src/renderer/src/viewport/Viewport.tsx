import { useCallback, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { MOUSE, type Group } from 'three'
import { useEditor } from '../document/store'
import { getRoots } from '../document/tree'
import { ExactPreview } from './ExactPreview'
import { FeatureView, SelectionGizmo } from './FeatureView'
import { ViewportInteractionContext, dragIdRef, type ViewportInteraction } from './interaction'

function PreviewActivity(): React.JSX.Element | null {
  const label = useEditor((state) => state.previewLabel)
  const pending = useEditor((state) => state.previewPending)
  if (!label || pending === 0) return null
  return (
    <div
      className="pointer-events-none absolute right-3 bottom-3 z-10 flex items-center gap-2 rounded-md border border-[#2c3240] bg-[#1b1e27]/95 px-3 py-2 text-[12px] text-[#e7e9ee]"
      role="status"
    >
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#3a4152] border-t-[#d97757]" />
      {label}
    </div>
  )
}

export function Viewport({ source }: { source: string }): React.JSX.Element {
  const document = useEditor((state) => state.document)
  const roots = getRoots(document)
  const refs = useRef(new Map<string, Group>())
  const [version, setVersion] = useState(0)
  const register = useCallback((id: string, group: Group | null) => {
    if (group) refs.current.set(id, group)
    else refs.current.delete(id)
    setVersion((current) => current + 1)
  }, [])
  const interaction = useMemo<ViewportInteraction>(
    () => ({ refs, version, register }),
    [register, version]
  )

  return (
    <div className="absolute inset-0" onContextMenu={(event) => event.preventDefault()}>
      <PreviewActivity />
      <ViewportInteractionContext.Provider value={interaction}>
        <Canvas
          camera={{ fov: 40, near: 0.1, far: 8000, position: [90, -140, 80], up: [0, 0, 1] }}
          onPointerMissed={() => {
            if (dragIdRef.current) return
            useEditor.getState().select(null)
          }}
          onCreated={({ camera }) => {
            camera.up.set(0, 0, 1)
            camera.lookAt(0, 0, 0)
          }}
        >
          <color attach="background" args={['#171a21']} />
          <ambientLight intensity={0.72} />
          <directionalLight position={[90, -50, 140]} intensity={1.45} />
          <directionalLight position={[-70, 90, 30]} intensity={0.35} />
          <Grid
            args={[400, 400]}
            rotation={[Math.PI / 2, 0, 0]}
            cellSize={10}
            cellThickness={0.6}
            cellColor="#3c4454"
            sectionSize={50}
            sectionThickness={1.2}
            sectionColor="#6a7588"
            fadeDistance={500}
            fadeStrength={1}
            infiniteGrid
          />
          <axesHelper args={[28]} />
          <OrbitControls
            makeDefault
            target={[0, 0, 0]}
            enableDamping
            dampingFactor={0.12}
            mouseButtons={{
              LEFT: -1 as MOUSE,
              MIDDLE: MOUSE.PAN,
              RIGHT: MOUSE.ROTATE
            }}
          />
          {roots.map((node) => (
            <FeatureView key={node.id} id={node.id} />
          ))}
          <SelectionGizmo />
          <ExactPreview source={source} />
        </Canvas>
      </ViewportInteractionContext.Provider>
    </div>
  )
}
