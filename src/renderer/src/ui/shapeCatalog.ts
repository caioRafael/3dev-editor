import {
  Box,
  Circle,
  Cylinder,
  Ellipse,
  Pentagon,
  Square,
  Star,
  Type,
  createLucideIcon,
  type LucideIcon
} from 'lucide-react'
import type { PrimitiveKind, ShapeProfileKind } from '../document/types'

const SphereIcon = createLucideIcon('sphere', [
  ['circle', { cx: '12', cy: '12', r: '9' }],
  ['ellipse', { cx: '12', cy: '12', rx: '4.5', ry: '9' }],
  ['path', { d: 'M3 12h18' }]
])

export const PRIMITIVES: { kind: PrimitiveKind; label: string; icon: LucideIcon }[] = [
  { kind: 'cuboid', label: 'Cubo', icon: Box },
  { kind: 'cylinder', label: 'Cilindro', icon: Cylinder },
  { kind: 'sphere', label: 'Esfera', icon: SphereIcon }
]

export const PROFILES: { kind: ShapeProfileKind; label: string; icon: LucideIcon }[] = [
  { kind: 'rect', label: 'Retângulo', icon: Square },
  { kind: 'circle', label: 'Círculo', icon: Circle },
  { kind: 'ellipse', label: 'Elipse', icon: Ellipse },
  { kind: 'ngon', label: 'Polígono', icon: Pentagon },
  { kind: 'star', label: 'Estrela', icon: Star },
  { kind: 'text', label: 'Texto', icon: Type }
]
