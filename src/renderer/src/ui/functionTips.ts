import { create } from 'zustand'
import type {
  BooleanKind,
  EditorTool,
  OperationKind,
  PrimitiveKind,
  ShapeProfileKind
} from '../document/types'

export interface FunctionTip {
  id: string
  title: string
  body: string
}

export type FunctionMenuId = 'shapes' | 'components' | 'solid' | 'flat'

const TOGGLE = 'Clicar de novo ativa ou desativa o grupo.'

const TOOL_TIPS: Record<EditorTool, FunctionTip> = {
  select: {
    id: 'tool:select',
    title: 'Selecionar',
    body: 'Clique em um sólido para selecioná-lo. Shift adiciona ou tira itens da seleção.'
  },
  move: {
    id: 'tool:move',
    title: 'Mover',
    body: 'Arraste o gizmo para mudar a posição do sólido selecionado.'
  },
  rotate: {
    id: 'tool:rotate',
    title: 'Girar',
    body: 'Arraste o gizmo para girar o sólido selecionado em torno dos eixos.'
  },
  scale: {
    id: 'tool:scale',
    title: 'Escalar',
    body: 'Arraste o gizmo para alterar o tamanho do sólido selecionado.'
  }
}

const MENU_TIPS: Record<FunctionMenuId, FunctionTip> = {
  shapes: {
    id: 'menu:shapes',
    title: 'Formas',
    body: 'Adiciona sólidos 3D ou perfis 2D à cena.'
  },
  components: {
    id: 'menu:components',
    title: 'Componentes',
    body: 'Insere na peça atual uma cópia de um componente do projeto.'
  },
  solid: {
    id: 'menu:solid',
    title: 'Operações 3D',
    body: 'Junta, corta ou transforma os sólidos selecionados.'
  },
  flat: {
    id: 'menu:flat',
    title: 'Operações 2D',
    body: 'Altera perfis planos com offset, casca convexa ou revolução.'
  }
}

const PRIMITIVE_TIPS: Record<PrimitiveKind, FunctionTip> = {
  cuboid: {
    id: 'shape:cuboid',
    title: 'Cubo',
    body: 'Adiciona um cubo sólido à cena.'
  },
  cylinder: {
    id: 'shape:cylinder',
    title: 'Cilindro',
    body: 'Adiciona um cilindro sólido à cena.'
  },
  sphere: {
    id: 'shape:sphere',
    title: 'Esfera',
    body: 'Adiciona uma esfera sólida à cena.'
  }
}

const PROFILE_TIPS: Record<ShapeProfileKind, FunctionTip> = {
  rect: {
    id: 'profile:rect',
    title: 'Retângulo',
    body: 'Adiciona um perfil retangular para extrusar ou usar numa operação 2D.'
  },
  circle: {
    id: 'profile:circle',
    title: 'Círculo',
    body: 'Adiciona um perfil circular para extrusar ou usar numa operação 2D.'
  },
  ellipse: {
    id: 'profile:ellipse',
    title: 'Elipse',
    body: 'Adiciona um perfil elíptico para extrusar ou usar numa operação 2D.'
  },
  ngon: {
    id: 'profile:ngon',
    title: 'Polígono',
    body: 'Adiciona um polígono regular para extrusar ou usar numa operação 2D.'
  },
  star: {
    id: 'profile:star',
    title: 'Estrela',
    body: 'Adiciona um perfil em estrela para extrusar ou usar numa operação 2D.'
  },
  text: {
    id: 'profile:text',
    title: 'Texto',
    body: 'Adiciona um perfil de texto para extrusar ou usar numa operação 2D.'
  }
}

const SVG_TIP: FunctionTip = {
  id: 'shape:svg',
  title: 'SVG',
  body: 'Importa um desenho SVG como perfil 2D.'
}

const BOOLEAN_TIPS: Record<BooleanKind, FunctionTip> = {
  union: {
    id: 'op:union',
    title: 'União',
    body: `Junta os sólidos selecionados em um só. Exige pelo menos dois sólidos. ${TOGGLE}`
  },
  difference: {
    id: 'op:difference',
    title: 'Diferença',
    body: `Subtrai os demais sólidos do primeiro selecionado. Exige pelo menos dois sólidos. ${TOGGLE}`
  },
  intersection: {
    id: 'op:intersection',
    title: 'Interseção',
    body: `Mantém só o volume em que os sólidos se cruzam. Exige pelo menos dois sólidos. ${TOGGLE}`
  }
}

const OPERATION_TIPS: Record<OperationKind, FunctionTip> = {
  offset: {
    id: 'op:offset',
    title: 'Offset',
    body: `Aumenta ou diminui o contorno. Selecione pelo menos um perfil ou uma operação 2D. ${TOGGLE}`
  },
  hull2d: {
    id: 'op:hull2d',
    title: 'Casca 2D',
    body: `Cria a casca convexa dos perfis selecionados. Selecione pelo menos dois perfis ou operações 2D. ${TOGGLE}`
  },
  hull: {
    id: 'op:hull',
    title: 'Casca 3D',
    body: `Cria a casca convexa dos sólidos selecionados. Selecione pelo menos dois sólidos. ${TOGGLE}`
  },
  mirror: {
    id: 'op:mirror',
    title: 'Espelhar',
    body: `Espelha o sólido selecionado em um eixo. ${TOGGLE}`
  },
  revolve: {
    id: 'op:revolve',
    title: 'Revolução',
    body: `Gira um perfil em torno de um eixo. Selecione um perfil ou uma operação 2D. ${TOGGLE}`
  },
  projection: {
    id: 'op:projection',
    title: 'Projeção',
    body: `Projeta os sólidos no plano XY. Selecione pelo menos um sólido. ${TOGGLE}`
  },
  resize: {
    id: 'op:resize',
    title: 'Redimensionar',
    body: `Ajusta o sólido selecionado a um tamanho alvo. ${TOGGLE}`
  },
  minkowski: {
    id: 'op:minkowski',
    title: 'Minkowski',
    body: `Soma os sólidos selecionados por Minkowski. Selecione pelo menos dois sólidos. ${TOGGLE}`
  }
}

const COMPONENT_BODY =
  'Insere uma cópia deste componente na peça atual. Ele continua editável no arquivo do componente.'

export function tipForTool(tool: EditorTool): FunctionTip {
  return TOOL_TIPS[tool]
}

export function tipForMenu(menu: FunctionMenuId): FunctionTip {
  return MENU_TIPS[menu]
}

export function tipForPrimitive(kind: PrimitiveKind): FunctionTip {
  return PRIMITIVE_TIPS[kind]
}

export function tipForProfile(kind: ShapeProfileKind): FunctionTip {
  return PROFILE_TIPS[kind]
}

export function tipForSvg(): FunctionTip {
  return SVG_TIP
}

export function tipForBoolean(kind: BooleanKind): FunctionTip {
  return BOOLEAN_TIPS[kind]
}

export function tipForOperation(kind: OperationKind): FunctionTip {
  return OPERATION_TIPS[kind]
}

export function componentTip(name: string): FunctionTip {
  return { id: 'component', title: name, body: COMPONENT_BODY }
}

interface FunctionTipState {
  current: FunctionTip
  dismissedId: string | null
  show: (tip: FunctionTip) => void
  dismiss: () => void
  syncTool: (tool: EditorTool) => void
}

export const useFunctionTip = create<FunctionTipState>((set) => ({
  current: tipForTool('select'),
  dismissedId: null,
  show: (tip) => set({ current: tip, dismissedId: null }),
  dismiss: () => set((state) => ({ dismissedId: state.current.id })),
  syncTool: (tool) =>
    set((state) => {
      const tip = tipForTool(tool)
      if (state.current.id === tip.id) return state
      return { current: tip, dismissedId: null }
    })
}))
