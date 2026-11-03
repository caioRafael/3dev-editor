import { createContext, useContext, type MutableRefObject } from 'react'
import type { Group } from 'three'

export interface ViewportInteraction {
  refs: MutableRefObject<Map<string, Group>>
  version: number
  register: (id: string, group: Group | null) => void
}

export const dragIdRef: { current: string | null } = { current: null }

export const ViewportInteractionContext = createContext<ViewportInteraction | null>(null)

export function useViewportInteraction(): ViewportInteraction {
  const value = useContext(ViewportInteractionContext)
  if (!value) throw new Error('O viewport não está montado.')
  return value
}
