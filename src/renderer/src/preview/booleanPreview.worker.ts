import { parseProjectDocument } from '../document/parse'
import { buildBooleanMesh } from './manifoldPreview'
import { type ContourSet } from './contours'
import { type ProjectDocument, isRecord } from '../document/types'

interface BooleanJob {
  id: number
  document: ProjectDocument
  nodeId: string
  contours: Record<string, ContourSet>
}

interface BooleanResult {
  id: number
  positions: Float32Array | null
  indices: Uint32Array | null
  error?: string
}

self.onmessage = (event: MessageEvent<unknown>) => {
  if (!isRecord(event.data) || typeof event.data.id !== 'number') return
  const id = event.data.id
  const nodeId = event.data.nodeId
  const document = parseProjectDocument(event.data.document)
  const contours = readContours(event.data.contours)
  if (typeof nodeId !== 'string' || !document) {
    reply({ id, positions: null, indices: null, error: 'Falha na prévia booleana.' })
    return
  }
  void run({ id, document, nodeId, contours })
}

async function run(job: BooleanJob): Promise<void> {
  try {
    const mesh = await buildBooleanMesh(job.document, job.nodeId, true, job.contours)
    const positions = mesh?.positions ?? null
    const indices = mesh?.indices ?? null
    const transfer: Transferable[] = []
    if (positions) transfer.push(positions.buffer)
    if (indices) transfer.push(indices.buffer)
    reply({ id: job.id, positions, indices }, transfer)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na prévia booleana.'
    reply({ id: job.id, positions: null, indices: null, error: message })
  }
}

function readContours(value: unknown): Record<string, ContourSet> {
  if (!isRecord(value)) return {}
  const contours: Record<string, ContourSet> = {}
  for (const [id, candidate] of Object.entries(value)) {
    if (!isContourSet(candidate)) continue
    contours[id] = candidate
  }
  return contours
}

function isContourSet(value: unknown): value is ContourSet {
  if (!isRecord(value) || !Array.isArray(value.rings)) return false
  if (value.fillRule !== 'NonZero' && value.fillRule !== 'EvenOdd') return false
  return value.rings.every((ring) => {
    if (!isRecord(ring) || !Array.isArray(ring.points)) return false
    return ring.points.every((point) => {
      if (!isRecord(point)) return false
      return typeof point.x === 'number' && typeof point.y === 'number'
    })
  })
}

function reply(result: BooleanResult, transfer: Transferable[] = []): void {
  self.postMessage(result, { transfer })
}
