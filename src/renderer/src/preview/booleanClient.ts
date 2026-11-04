import type { ProjectDocument } from '../document/types'
import type { ContourSet } from './contours'
import type { SolidMeshData } from './manifoldPreview'

interface BooleanJob {
  id: number
  document: ProjectDocument
  nodeId: string
  fileName: string
  contours: Record<string, ContourSet>
}

interface BooleanResult {
  id: number
  positions: Float32Array | null
  indices: Uint32Array | null
  error?: string
}

interface Waiter {
  resolve: (mesh: SolidMeshData | null) => void
  reject: (error: Error) => void
}

let worker: Worker | null = null
let generation = 0
let running = false
let nextId = 0
let latest: BooleanJob | null = null
const waiters = new Map<number, Waiter>()

export function requestBooleanMesh(
  document: ProjectDocument,
  nodeId: string,
  contours: Record<string, ContourSet>,
  fileName = document.activeFile
): Promise<SolidMeshData | null> {
  const id = nextId + 1
  nextId = id
  return new Promise((resolve, reject) => {
    if (latest) {
      waiters.get(latest.id)?.resolve(null)
      waiters.delete(latest.id)
    }
    latest = { id, document, nodeId, fileName, contours }
    waiters.set(id, { resolve, reject })
    if (running) dropRunningWork()
    pump()
  })
}

function pump(): void {
  if (running || !latest) return
  const job = latest
  latest = null
  running = true
  getWorker().postMessage(job)
}

function dropRunningWork(): void {
  generation += 1
  worker?.terminate()
  worker = null
  running = false
  for (const [id, waiter] of waiters) {
    if (latest?.id === id) continue
    waiter.resolve(null)
    waiters.delete(id)
  }
}

function getWorker(): Worker {
  if (worker) return worker
  const token = generation
  worker = new Worker(new URL('./booleanPreview.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<BooleanResult>) => {
    if (token !== generation) return
    running = false
    const result = event.data
    const waiter = waiters.get(result.id)
    waiters.delete(result.id)
    if (result.error) waiter?.reject(new Error(result.error))
    else if (result.positions && result.indices) {
      waiter?.resolve({ positions: result.positions, indices: result.indices })
    } else waiter?.resolve(null)
    pump()
  }
  worker.onerror = () => {
    if (token !== generation) return
    running = false
    latest = null
    const failure = new Error('Falha na prévia booleana.')
    for (const waiter of waiters.values()) waiter.reject(failure)
    waiters.clear()
  }
  return worker
}
