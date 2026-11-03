import { booleanRadiusLimit, localBounds, round3, roundVec } from '../document/math'
import { getRoots } from '../document/tree'
import {
  type Appearance,
  type BooleanKind,
  type BooleanNode,
  type CuboidNode,
  type CylinderNode,
  type FeatureNode,
  type ProjectDocument,
  type SphereNode,
  type Transform,
  type Vec3,
  DEFAULT_COLOR,
  MIN_SIZE,
  identityTransform,
  isBooleanNode,
  isCuboidNode,
  isCylinderNode,
  isSphereNode
} from '../document/types'

const LABELS: Record<ParsedNode['kind'], string> = {
  cuboid: 'Cubo',
  cylinder: 'Cilindro',
  sphere: 'Esfera',
  union: 'União',
  difference: 'Diferença',
  intersection: 'Interseção'
}

const MODIFIER_ORDER = ['color', 'translate', 'rotate']

export interface OpenscadParseSuccess {
  ok: true
  document: ProjectDocument
}

export interface OpenscadParseFailure {
  ok: false
  message: string
  line: number
  column: number
}

export type OpenscadParseResult = OpenscadParseSuccess | OpenscadParseFailure

interface Token {
  kind: 'number' | 'string' | 'ident' | 'punct' | 'eof'
  value: string
  line: number
  column: number
}

interface Parser {
  tokens: Token[]
  index: number
}

interface ParsedBase {
  line: number
  column: number
  transform: Transform
  appearance: Appearance
}

interface ParsedCuboid extends ParsedBase {
  kind: 'cuboid'
  size: Vec3
  rounding: number
  chamfer: number
}

interface ParsedCylinder extends ParsedBase {
  kind: 'cylinder'
  height: number
  diameter: number
}

interface ParsedSphere extends ParsedBase {
  kind: 'sphere'
  diameter: number
}

interface ParsedBoolean extends ParsedBase {
  kind: BooleanKind
  children: ParsedNode[]
  rounding: number
}

type ParsedNode = ParsedCuboid | ParsedCylinder | ParsedSphere | ParsedBoolean

interface ColorModifier {
  kind: 'color'
  color: string
  opacity: number
  line: number
  column: number
}

interface TranslateModifier {
  kind: 'translate'
  position: Vec3
  line: number
  column: number
}

interface RotateModifier {
  kind: 'rotate'
  rotation: Vec3
  line: number
  column: number
}

type Modifier = ColorModifier | TranslateModifier | RotateModifier

interface NumberValue {
  type: 'number'
  value: number
  token: Token
}

interface StringValue {
  type: 'string'
  value: string
  token: Token
}

interface VectorValue {
  type: 'vector'
  value: Vec3
  token: Token
}

interface IdentValue {
  type: 'ident'
  value: string
  token: Token
}

type ArgValue = NumberValue | StringValue | VectorValue | IdentValue

interface CallArg {
  name: string | null
  value: ArgValue
}

interface BuildContext {
  previous: ProjectDocument
  nodes: Record<string, FeatureNode>
}

class ParseFailure extends Error {
  readonly line: number
  readonly column: number

  constructor(message: string, line: number, column: number) {
    super(message)
    this.name = 'ParseFailure'
    this.line = line
    this.column = column
  }
}

export function parseOpenscad(source: string, previous: ProjectDocument): OpenscadParseResult {
  try {
    return { ok: true, document: parseSource(source, previous) }
  } catch (error) {
    if (error instanceof ParseFailure) {
      return { ok: false, message: error.message, line: error.line, column: error.column }
    }
    throw error
  }
}

function parseSource(source: string, previous: ProjectDocument): ProjectDocument {
  const parser: Parser = { tokens: tokenize(source), index: 0 }
  let fn = previous.fn
  let sawFn = false
  const statements: ParsedNode[] = []
  while (!isEof(parser)) {
    if (isIdent(parser, 'include') || isIdent(parser, 'use')) {
      parseInclude(parser)
      continue
    }
    if (isIdent(parser, '$fn')) {
      if (sawFn) fail(parser, '$fn repetido.')
      fn = parseFn(parser)
      sawFn = true
      continue
    }
    statements.push(parseStatement(parser))
  }
  return reconcile(previous, statements, fn)
}

function parseStatement(parser: Parser): ParsedNode {
  const modifiers: Modifier[] = []
  while (isModifier(parser)) modifiers.push(parseModifier(parser))
  validateModifierOrder(modifiers)
  return applyModifiers(parseShape(parser), modifiers)
}

function parseShape(parser: Parser): ParsedNode {
  const token = peek(parser)
  if (token.kind !== 'ident') fail(parser, `Construção não suportada: ${describe(token)}.`)
  if (token.value === 'round3d') return parseRound3d(parser)
  if (token.value === 'cuboid') return parseCuboid(parser)
  if (token.value === 'cyl') return parseCylinder(parser)
  if (token.value === 'spheroid') return parseSphere(parser)
  if (token.value === 'union' || token.value === 'difference' || token.value === 'intersection') {
    return parseBoolean(parser, token.value)
  }
  throw new ParseFailure(`Construção não suportada: ${token.value}.`, token.line, token.column)
}

function parseCuboid(parser: Parser): ParsedCuboid {
  const token = expectIdent(parser, 'cuboid')
  const args = parseArgs(parser)
  expectPunct(parser, ';')
  let size: Vec3 | null = null
  let rounding = 0
  let chamfer = 0
  for (const arg of args) {
    if (arg.name === null || arg.name === 'size') {
      if (size) failToken(token, 'Tamanho repetido em cuboid.')
      size = requireSize(arg.value)
    } else if (arg.name === 'rounding') {
      rounding = requireNonNegative(arg.value, 'rounding')
    } else if (arg.name === 'chamfer') {
      chamfer = requireNonNegative(arg.value, 'chamfer')
    } else if (arg.name === 'anchor') {
      requireCenter(arg.value)
    } else {
      failToken(arg.value.token, `Argumento não suportado em cuboid: ${arg.name}.`)
    }
  }
  if (!size) failToken(token, 'O cuboid precisa de um tamanho [x, y, z].')
  if (rounding > 0 && chamfer > 0) {
    failToken(token, 'O cuboid não aceita rounding e chamfer ao mesmo tempo.')
  }
  return { ...blankShape(token), kind: 'cuboid', size, rounding, chamfer }
}

function parseCylinder(parser: Parser): ParsedCylinder {
  const token = expectIdent(parser, 'cyl')
  const args = parseArgs(parser)
  expectPunct(parser, ';')
  let height: number | null = null
  let diameter: number | null = null
  for (const arg of args) {
    if (arg.name === 'h' || arg.name === 'height') {
      height = requirePositive(arg.value, 'A altura')
    } else if (arg.name === 'd' || arg.name === 'diameter') {
      if (diameter !== null) failToken(arg.value.token, 'Diâmetro repetido em cyl.')
      diameter = requirePositive(arg.value, 'O diâmetro')
    } else if (arg.name === 'r' || arg.name === 'radius') {
      if (diameter !== null) failToken(arg.value.token, 'Diâmetro repetido em cyl.')
      diameter = requirePositiveNumber(numberOrFail(arg.value) * 2, arg.value.token, 'O raio')
    } else if (arg.name === 'anchor') {
      requireCenter(arg.value)
    } else if (arg.name === null) {
      failToken(arg.value.token, 'cyl usa os argumentos h e d.')
    } else {
      failToken(arg.value.token, `Argumento não suportado em cyl: ${arg.name}.`)
    }
  }
  if (height === null || diameter === null) failToken(token, 'cyl precisa de h e d.')
  return { ...blankShape(token), kind: 'cylinder', height, diameter }
}

function parseSphere(parser: Parser): ParsedSphere {
  const token = expectIdent(parser, 'spheroid')
  const args = parseArgs(parser)
  expectPunct(parser, ';')
  let diameter: number | null = null
  for (const arg of args) {
    if (arg.name === 'd' || arg.name === 'diameter') {
      if (diameter !== null) failToken(arg.value.token, 'Diâmetro repetido em spheroid.')
      diameter = requirePositive(arg.value, 'O diâmetro')
    } else if (arg.name === 'r' || arg.name === 'radius') {
      if (diameter !== null) failToken(arg.value.token, 'Diâmetro repetido em spheroid.')
      diameter = requirePositiveNumber(numberOrFail(arg.value) * 2, arg.value.token, 'O raio')
    } else if (arg.name === 'anchor') {
      requireCenter(arg.value)
    } else if (arg.name === null) {
      failToken(arg.value.token, 'spheroid usa o argumento d.')
    } else {
      failToken(arg.value.token, `Argumento não suportado em spheroid: ${arg.name}.`)
    }
  }
  if (diameter === null) failToken(token, 'spheroid precisa de d.')
  return { ...blankShape(token), kind: 'sphere', diameter }
}

function parseBoolean(parser: Parser, kind: BooleanKind): ParsedBoolean {
  const token = expectIdent(parser, kind)
  expectPunct(parser, '(')
  expectPunct(parser, ')')
  expectPunct(parser, '{')
  const children: ParsedNode[] = []
  while (!isPunct(parser, '}') && !isEof(parser)) children.push(parseStatement(parser))
  expectPunct(parser, '}')
  if (isPunct(parser, ';')) eat(parser)
  if (children.length < 2) {
    failToken(token, `A operação ${kind} precisa de pelo menos dois sólidos.`)
  }
  return { ...blankShape(token), kind, children, rounding: 0 }
}

function parseRound3d(parser: Parser): ParsedBoolean {
  const token = expectIdent(parser, 'round3d')
  const args = parseArgs(parser)
  let rounding: number | null = null
  for (const arg of args) {
    if (arg.name === 'r') {
      if (rounding !== null) failToken(arg.value.token, 'r repetido em round3d.')
      rounding = requireNonNegative(arg.value, 'r')
    } else if (arg.name === 'size') {
      requirePositive(arg.value, 'size')
    } else if (arg.name === 'or' || arg.name === 'ir') {
      failToken(arg.value.token, 'round3d aceita r para arredondar todas as arestas.')
    } else {
      failToken(arg.value.token, `Argumento não suportado em round3d: ${arg.name ?? 'posicional'}.`)
    }
  }
  if (rounding === null || rounding <= 0) failToken(token, 'round3d precisa de r maior que zero.')
  if (!isPunct(parser, '{')) fail(parser, 'round3d precisa envolver a operação entre chaves.')
  expectPunct(parser, '{')
  if (isPunct(parser, '}')) {
    failToken(token, 'round3d precisa envolver união, diferença ou interseção.')
  }
  const child = parseStatement(parser)
  expectPunct(parser, '}')
  if (isPunct(parser, ';')) eat(parser)
  if (!isParsedBoolean(child)) {
    failToken(token, 'round3d só pode envolver união, diferença ou interseção.')
  }
  if (child.rounding > 0) failToken(token, 'round3d aninhado não é suportado.')
  return { ...child, rounding }
}

function isParsedBoolean(node: ParsedNode): node is ParsedBoolean {
  return node.kind === 'union' || node.kind === 'difference' || node.kind === 'intersection'
}

function parseModifier(parser: Parser): Modifier {
  if (isIdent(parser, 'color')) return parseColor(parser)
  if (isIdent(parser, 'translate')) return parseTranslate(parser)
  return parseRotate(parser)
}

function parseColor(parser: Parser): ColorModifier {
  const token = expectIdent(parser, 'color')
  const args = parseArgs(parser)
  if (args.length < 1 || args.length > 2) {
    failToken(token, 'color() aceita a cor e, opcionalmente, a opacidade.')
  }
  const colorArg = args[0]
  if (colorArg.name !== null || colorArg.value.type !== 'string') {
    failToken(colorArg.value.token, 'A cor precisa ser um texto, como "#d97757".')
  }
  let opacity = 1
  const alpha = args[1]
  if (alpha) {
    if (alpha.name !== null || alpha.value.type !== 'number') {
      failToken(alpha.value.token, 'A opacidade precisa ser um número.')
    }
    if (alpha.value.value < 0 || alpha.value.value > 1) {
      failToken(alpha.value.token, 'A opacidade precisa estar entre 0 e 1.')
    }
    opacity = round3(alpha.value.value)
  }
  return {
    kind: 'color',
    color: normalizeColor(colorArg.value.value, colorArg.value.token),
    opacity,
    line: token.line,
    column: token.column
  }
}

function parseTranslate(parser: Parser): TranslateModifier {
  const token = expectIdent(parser, 'translate')
  const args = parseArgs(parser)
  if (args.length !== 1 || args[0].name !== null) {
    failToken(token, 'translate() aceita apenas [x, y, z].')
  }
  return {
    kind: 'translate',
    position: requireCoordinate(args[0].value, 'translate() aceita apenas [x, y, z].'),
    line: token.line,
    column: token.column
  }
}

function parseRotate(parser: Parser): RotateModifier {
  const token = expectIdent(parser, 'rotate')
  const args = parseArgs(parser)
  if (args.length !== 1 || args[0].name !== null) {
    failToken(token, 'rotate() aceita apenas [x, y, z].')
  }
  return {
    kind: 'rotate',
    rotation: requireCoordinate(args[0].value, 'rotate() aceita apenas [x, y, z].'),
    line: token.line,
    column: token.column
  }
}

function parseInclude(parser: Parser): void {
  const keyword = eat(parser)
  expectPunct(parser, '<')
  let path = ''
  while (!isPunct(parser, '>') && !isEof(parser)) path += eat(parser).value
  expectPunct(parser, '>')
  if (isPunct(parser, ';')) eat(parser)
  if (path === 'BOSL2/std.scad') return
  throw new ParseFailure(
    `Include não suportado: ${path || keyword.value}.`,
    keyword.line,
    keyword.column
  )
}

function parseFn(parser: Parser): number {
  const token = expectIdent(parser, '$fn')
  expectPunct(parser, '=')
  const value = expectNumber(parser)
  expectPunct(parser, ';')
  const rounded = Math.round(value.value)
  if (rounded < 8 || rounded > 256) {
    failToken(token, '$fn precisa estar entre 8 e 256.')
  }
  return rounded
}

function parseArgs(parser: Parser): CallArg[] {
  expectPunct(parser, '(')
  const args: CallArg[] = []
  if (isPunct(parser, ')')) {
    eat(parser)
    return args
  }
  while (!isEof(parser)) {
    args.push(parseArg(parser))
    if (!isPunct(parser, ',')) break
    eat(parser)
    if (isPunct(parser, ')')) break
  }
  expectPunct(parser, ')')
  return args
}

function parseArg(parser: Parser): CallArg {
  const token = peek(parser)
  if (
    token.kind === 'ident' &&
    peekAt(parser, 1).kind === 'punct' &&
    peekAt(parser, 1).value === '='
  ) {
    eat(parser)
    expectPunct(parser, '=')
    return { name: token.value, value: parseArgValue(parser) }
  }
  return { name: null, value: parseArgValue(parser) }
}

function parseArgValue(parser: Parser): ArgValue {
  if (isPunct(parser, '[')) return parseVector(parser)
  const token = peek(parser)
  if (token.kind === 'number') {
    eat(parser)
    return { type: 'number', value: Number(token.value), token }
  }
  if (token.kind === 'string') {
    eat(parser)
    return { type: 'string', value: token.value, token }
  }
  if (token.kind === 'ident') {
    eat(parser)
    return { type: 'ident', value: token.value, token }
  }
  fail(parser, `Valor inesperado: ${describe(token)}.`)
}

function parseVector(parser: Parser): VectorValue {
  const token = expectPunct(parser, '[')
  const values: number[] = []
  while (values.length < 3) {
    values.push(expectNumber(parser).value)
    if (values.length < 3) expectPunct(parser, ',')
  }
  if (isPunct(parser, ',')) eat(parser)
  expectPunct(parser, ']')
  return { type: 'vector', value: roundVec({ x: values[0], y: values[1], z: values[2] }), token }
}

function validateModifierOrder(modifiers: Modifier[]): void {
  let last = -1
  for (const modifier of modifiers) {
    const index = MODIFIER_ORDER.indexOf(modifier.kind)
    if (index <= last) {
      throw new ParseFailure(
        'Use cada transform uma vez, na ordem color, translate e rotate.',
        modifier.line,
        modifier.column
      )
    }
    last = index
  }
}

function applyModifiers(node: ParsedNode, modifiers: Modifier[]): ParsedNode {
  let appearance = node.appearance
  let position = node.transform.position
  let rotation = node.transform.rotation
  for (const modifier of modifiers) {
    if (modifier.kind === 'color') {
      appearance = { color: modifier.color, opacity: modifier.opacity }
    } else if (modifier.kind === 'translate') {
      position = modifier.position
    } else {
      rotation = modifier.rotation
    }
  }
  return {
    ...node,
    appearance,
    transform: { position: roundVec(position), rotation: roundVec(rotation) }
  }
}

function reconcile(previous: ProjectDocument, parsed: ParsedNode[], fn: number): ProjectDocument {
  const context: BuildContext = { previous, nodes: {} }
  matchList(getRoots(previous), parsed, null, context)
  return {
    version: 1,
    name: previous.name,
    units: 'mm',
    fn,
    nodes: context.nodes
  }
}

function matchList(
  previousList: FeatureNode[],
  parsedList: ParsedNode[],
  parentId: string | null,
  context: BuildContext
): string[] {
  const visible = previousList.filter((node) => node.visible)
  const pairs: Array<{ parsed: ParsedNode; prev: FeatureNode | null }> = []
  let cursor = 0
  for (const parsed of parsedList) {
    let found = -1
    for (let index = cursor; index < visible.length; index += 1) {
      if (visible[index].kind === parsed.kind) {
        found = index
        break
      }
    }
    if (found < 0) {
      pairs.push({ parsed, prev: null })
      continue
    }
    for (let index = cursor; index < found; index += 1) {
      assertRemovable(visible[index], context.previous, parsed)
    }
    pairs.push({ parsed, prev: visible[found] })
    cursor = found + 1
  }
  const tail = parsedList.at(-1) ?? null
  for (let index = cursor; index < visible.length; index += 1) {
    assertRemovable(visible[index], context.previous, tail)
  }

  const matched = new Set(pairs.flatMap((pair) => (pair.prev ? [pair.prev.id] : [])))
  const ids: string[] = []
  let parsedIndex = 0
  for (const prev of previousList) {
    if (!prev.visible) {
      keepSubtree(prev, context)
      ids.push(prev.id)
      continue
    }
    if (!matched.has(prev.id)) continue
    while (parsedIndex < pairs.length && pairs[parsedIndex]?.prev?.id !== prev.id) {
      const inserted = pairs[parsedIndex]
      if (inserted) ids.push(materialize(inserted.parsed, null, parentId, context))
      parsedIndex += 1
    }
    const pair = pairs[parsedIndex]
    if (pair) ids.push(materialize(pair.parsed, pair.prev, parentId, context))
    parsedIndex += 1
  }
  while (parsedIndex < pairs.length) {
    const pair = pairs[parsedIndex]
    if (pair && !pair.prev) ids.push(materialize(pair.parsed, null, parentId, context))
    parsedIndex += 1
  }
  return ids
}

function materialize(
  parsed: ParsedNode,
  prev: FeatureNode | null,
  parentId: string | null,
  context: BuildContext
): string {
  const id = prev?.id ?? crypto.randomUUID()
  const name = prev?.name ?? nextFeatureName(context, LABELS[parsed.kind])
  const shared = {
    id,
    name,
    visible: true,
    locked: prev?.locked ?? false,
    consumedBy: parentId,
    transform: {
      position: roundVec(parsed.transform.position),
      rotation: roundVec(parsed.transform.rotation)
    },
    appearance: {
      color: parsed.appearance.color.toLowerCase(),
      opacity: round3(parsed.appearance.opacity)
    }
  }
  if (parsed.kind === 'cuboid') {
    const node: CuboidNode = {
      ...shared,
      kind: 'cuboid',
      size: roundVec(parsed.size),
      rounding: round3(parsed.rounding),
      chamfer: round3(parsed.chamfer)
    }
    context.nodes[id] = node
  } else if (parsed.kind === 'cylinder') {
    const node: CylinderNode = {
      ...shared,
      kind: 'cylinder',
      height: round3(parsed.height),
      diameter: round3(parsed.diameter)
    }
    context.nodes[id] = node
  } else if (parsed.kind === 'sphere') {
    const node: SphereNode = {
      ...shared,
      kind: 'sphere',
      diameter: round3(parsed.diameter)
    }
    context.nodes[id] = node
  } else {
    const node: BooleanNode = {
      ...shared,
      kind: parsed.kind,
      childIds: [],
      rounding: round3(parsed.rounding)
    }
    context.nodes[id] = node
    const previousChildren = prev && isBooleanNode(prev) ? childNodes(context.previous, prev) : []
    const childIds = matchList(previousChildren, parsed.children, id, context)
    const draft: BooleanNode = { ...node, childIds }
    const limit = booleanRadiusLimit(
      localBounds({ ...context.previous, nodes: context.nodes }, draft)
    )
    context.nodes[id] = { ...draft, rounding: Math.min(limit, Math.max(0, draft.rounding)) }
  }
  const built = context.nodes[id]
  if (prev?.locked && built && signature(prev) !== signature(built)) {
    throw new ParseFailure(
      `Não é possível alterar ${prev.name} porque está travado.`,
      parsed.line,
      parsed.column
    )
  }
  return id
}

function assertRemovable(
  node: FeatureNode,
  previous: ProjectDocument,
  at: ParsedNode | null
): void {
  if (node.locked) {
    throw new ParseFailure(
      `Não é possível remover ${node.name} porque está travado.`,
      at?.line ?? 1,
      at?.column ?? 1
    )
  }
  if (!isBooleanNode(node)) return
  for (const childId of node.childIds) {
    const child = previous.nodes[childId]
    if (child) assertRemovable(child, previous, at)
  }
}

function keepSubtree(node: FeatureNode, context: BuildContext): void {
  context.nodes[node.id] = cloneNode(node)
  if (!isBooleanNode(node)) return
  for (const childId of node.childIds) {
    const child = context.previous.nodes[childId]
    if (child) keepSubtree(child, context)
  }
}

function cloneNode(node: FeatureNode): FeatureNode {
  const copy: FeatureNode = {
    ...node,
    transform: {
      position: { ...node.transform.position },
      rotation: { ...node.transform.rotation }
    },
    appearance: { ...node.appearance }
  }
  if (isCuboidNode(node) && isCuboidNode(copy)) return { ...copy, size: { ...node.size } }
  if (isBooleanNode(node) && isBooleanNode(copy)) return { ...copy, childIds: [...node.childIds] }
  return copy
}

function childNodes(document: ProjectDocument, node: BooleanNode): FeatureNode[] {
  return node.childIds.flatMap((id) => {
    const child = document.nodes[id]
    return child ? [child] : []
  })
}

function nextFeatureName(context: BuildContext, label: string): string {
  const used = new Set<string>()
  for (const node of Object.values(context.previous.nodes)) used.add(node.name)
  for (const node of Object.values(context.nodes)) used.add(node.name)
  let index = 1
  let name = `${label} ${index}`
  while (used.has(name)) {
    index += 1
    name = `${label} ${index}`
  }
  return name
}

function signature(node: FeatureNode): string {
  const common = {
    kind: node.kind,
    position: roundVec(node.transform.position),
    rotation: roundVec(node.transform.rotation),
    color: node.appearance.color.toLowerCase(),
    opacity: round3(node.appearance.opacity)
  }
  if (isCuboidNode(node)) {
    return JSON.stringify({
      ...common,
      size: roundVec(node.size),
      rounding: round3(node.rounding),
      chamfer: round3(node.chamfer)
    })
  }
  if (isCylinderNode(node)) {
    return JSON.stringify({
      ...common,
      height: round3(node.height),
      diameter: round3(node.diameter)
    })
  }
  if (isSphereNode(node)) {
    return JSON.stringify({ ...common, diameter: round3(node.diameter) })
  }
  if (isBooleanNode(node)) {
    return JSON.stringify({ ...common, childIds: node.childIds, rounding: round3(node.rounding) })
  }
  return JSON.stringify(common)
}

function blankShape(token: Token): ParsedBase {
  return {
    line: token.line,
    column: token.column,
    transform: identityTransform(),
    appearance: { color: DEFAULT_COLOR, opacity: 1 }
  }
}

function requireCoordinate(value: ArgValue, message: string): Vec3 {
  if (value.type !== 'vector') throw new ParseFailure(message, value.token.line, value.token.column)
  return value.value
}

function requireSize(value: ArgValue): Vec3 {
  const size = requireCoordinate(value, 'O cuboid precisa de um tamanho [x, y, z].')
  return {
    x: requirePositiveNumber(size.x, value.token, 'O tamanho'),
    y: requirePositiveNumber(size.y, value.token, 'O tamanho'),
    z: requirePositiveNumber(size.z, value.token, 'O tamanho')
  }
}

function requirePositive(value: ArgValue, label: string): number {
  return requirePositiveNumber(numberOrFail(value), value.token, label)
}

function requirePositiveNumber(value: number, token: Token, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ParseFailure(`${label} precisa ser maior que zero.`, token.line, token.column)
  }
  return round3(Math.max(MIN_SIZE, value))
}

function requireNonNegative(value: ArgValue, label: string): number {
  if (value.type !== 'number' || !Number.isFinite(value.value) || value.value < 0) {
    throw new ParseFailure(
      `${label} precisa ser zero ou maior.`,
      value.token.line,
      value.token.column
    )
  }
  return round3(value.value)
}

function requireCenter(value: ArgValue): void {
  if (value.type !== 'ident' || value.value !== 'CENTER') {
    throw new ParseFailure('A âncora aceita é CENTER.', value.token.line, value.token.column)
  }
}

function numberOrFail(value: ArgValue): number {
  if (value.type !== 'number' || !Number.isFinite(value.value)) {
    throw new ParseFailure('Era esperado um número.', value.token.line, value.token.column)
  }
  return value.value
}

function normalizeColor(value: string, token: Token): string {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim())
  if (!match) throw new ParseFailure('Cor inválida. Use #rrggbb.', token.line, token.column)
  const hex = match[1].toLowerCase()
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : hex
  return `#${full}`
}

interface Lexer {
  source: string
  index: number
  line: number
  column: number
}

function tokenize(source: string): Token[] {
  const lexer: Lexer = { source, index: 0, line: 1, column: 1 }
  const tokens: Token[] = []

  while (lexer.index < source.length) {
    const char = source[lexer.index] ?? ''
    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      step(lexer, 1)
      continue
    }
    if (char === '/' && source[lexer.index + 1] === '/') {
      while (lexer.index < source.length && source[lexer.index] !== '\n') step(lexer, 1)
      continue
    }
    if (char === '/' && source[lexer.index + 1] === '*') {
      const startLine = lexer.line
      const startColumn = lexer.column
      step(lexer, 2)
      while (
        lexer.index < source.length &&
        !(source[lexer.index] === '*' && source[lexer.index + 1] === '/')
      ) {
        step(lexer, 1)
      }
      if (lexer.index >= source.length) {
        throw new ParseFailure('Comentário não terminado.', startLine, startColumn)
      }
      step(lexer, 2)
      continue
    }
    if (char === '"') {
      tokens.push(readString(lexer))
      continue
    }
    if (isIdentStart(char)) {
      const start = lexer.index
      const startLine = lexer.line
      const startColumn = lexer.column
      step(lexer, 1)
      while (lexer.index < source.length && isIdentPart(source[lexer.index] ?? '')) step(lexer, 1)
      tokens.push({
        kind: 'ident',
        value: source.slice(start, lexer.index),
        line: startLine,
        column: startColumn
      })
      continue
    }
    if (isNumberStart(source, lexer.index)) {
      const match = /^-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(lexer.index))
      if (!match) throw new ParseFailure('Número inválido.', lexer.line, lexer.column)
      const startLine = lexer.line
      const startColumn = lexer.column
      step(lexer, match[0].length)
      tokens.push({ kind: 'number', value: match[0], line: startLine, column: startColumn })
      continue
    }
    if ('()[]{},;=<>./'.includes(char)) {
      tokens.push({ kind: 'punct', value: char, line: lexer.line, column: lexer.column })
      step(lexer, 1)
      continue
    }
    throw new ParseFailure(`Caractere inesperado: ${char}.`, lexer.line, lexer.column)
  }

  tokens.push({ kind: 'eof', value: '', line: lexer.line, column: lexer.column })
  return tokens
}

function readString(lexer: Lexer): Token {
  const { line, column } = lexer
  step(lexer, 1)
  let value = ''
  while (lexer.index < lexer.source.length) {
    const char = lexer.source[lexer.index] ?? ''
    if (char === '\n') throw new ParseFailure('Texto não terminado.', line, column)
    if (char === '"') {
      step(lexer, 1)
      return { kind: 'string', value, line, column }
    }
    if (char === '\\') {
      const escaped = lexer.source[lexer.index + 1]
      if (escaped === undefined) throw new ParseFailure('Texto não terminado.', line, column)
      value += escaped
      step(lexer, 2)
      continue
    }
    value += char
    step(lexer, 1)
  }
  throw new ParseFailure('Texto não terminado.', line, column)
}

function step(lexer: Lexer, count: number): void {
  for (let offset = 0; offset < count; offset += 1) {
    if (lexer.source[lexer.index + offset] === '\n') {
      lexer.line += 1
      lexer.column = 1
    } else {
      lexer.column += 1
    }
  }
  lexer.index += count
}

function isNumberStart(source: string, index: number): boolean {
  const char = source[index] ?? ''
  const next = source[index + 1] ?? ''
  if (char === '-' && (isDigit(next) || (next === '.' && isDigit(source[index + 2] ?? ''))))
    return true
  if (char === '.' && isDigit(next)) return true
  return isDigit(char)
}

function isIdentStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char)
}

function isIdentPart(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char)
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9'
}

function peek(parser: Parser): Token {
  return parser.tokens[parser.index] ?? { kind: 'eof', value: '', line: 1, column: 1 }
}

function peekAt(parser: Parser, offset: number): Token {
  return parser.tokens[parser.index + offset] ?? { kind: 'eof', value: '', line: 1, column: 1 }
}

function eat(parser: Parser): Token {
  const token = peek(parser)
  if (token.kind !== 'eof') parser.index += 1
  return token
}

function isEof(parser: Parser): boolean {
  return peek(parser).kind === 'eof'
}

function isIdent(parser: Parser, value: string): boolean {
  const token = peek(parser)
  return token.kind === 'ident' && token.value === value
}

function isPunct(parser: Parser, value: string): boolean {
  const token = peek(parser)
  return token.kind === 'punct' && token.value === value
}

function isModifier(parser: Parser): boolean {
  return isIdent(parser, 'color') || isIdent(parser, 'translate') || isIdent(parser, 'rotate')
}

function expectIdent(parser: Parser, value: string): Token {
  const token = peek(parser)
  if (token.kind !== 'ident' || token.value !== value) {
    throw new ParseFailure(
      `Esperado ${value}, encontrado ${describe(token)}.`,
      token.line,
      token.column
    )
  }
  return eat(parser)
}

function expectPunct(parser: Parser, value: string): Token {
  const token = peek(parser)
  if (token.kind !== 'punct' || token.value !== value) {
    throw new ParseFailure(
      `Esperado "${value}", encontrado ${describe(token)}.`,
      token.line,
      token.column
    )
  }
  return eat(parser)
}

function expectNumber(parser: Parser): { token: Token; value: number } {
  const token = peek(parser)
  if (token.kind !== 'number') {
    throw new ParseFailure(
      `Esperado um número, encontrado ${describe(token)}.`,
      token.line,
      token.column
    )
  }
  eat(parser)
  const value = Number(token.value)
  if (!Number.isFinite(value)) {
    throw new ParseFailure('Número inválido.', token.line, token.column)
  }
  return { token, value }
}

function fail(parser: Parser, message: string): never {
  const token = peek(parser)
  throw new ParseFailure(message, token.line, token.column)
}

function failToken(token: Token, message: string): never {
  throw new ParseFailure(message, token.line, token.column)
}

function describe(token: Token): string {
  if (token.kind === 'eof') return 'fim do código'
  if (token.value.length > 0) return token.value
  return token.kind
}
