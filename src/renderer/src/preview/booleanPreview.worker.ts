import { parseProjectDocument } from '../document/parse'
import { buildBooleanMesh } from './manifoldPreview'
import { type ProjectDocument, isRecord } from '../document/types'

interface BooleanJob {
  id: number
  document: ProjectDocument
  nodeId: string
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
  if (typeof nodeId !== 'string' || !document) {
    reply({ id, positions: null, indices: null, error: 'Falha na prévia booleana.' })
    return
  }
  void run({ id, document, nodeId })
}

async function run(job: BooleanJob): Promise<void> {
  try {
    const mesh = await buildBooleanMesh(job.document, job.nodeId)
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

function reply(result: BooleanResult, transfer: Transferable[] = []): void {
  self.postMessage(result, { transfer })
}
