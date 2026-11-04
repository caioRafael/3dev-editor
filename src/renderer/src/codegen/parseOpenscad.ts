import { booleanRadiusLimit, localBounds, round3, roundVec } from '../document/math'
import { MAIN_FILE, activeModel, introducesCycle, replaceActive } from '../document/files'
import { getRoots, pruneAssets } from '../document/tree'
import { importScaleFromOpenscad, readSvgMetrics, roundVec2 } from '../preview/svgMetrics'
import {
  type Appearance,
  type BooleanKind,
  type BooleanNode,
  type CircleNode,
  type ComponentInstanceNode,
  type CuboidNode,
  type CylinderNode,
  type EllipseNode,
  type Extrusion,
  type FeatureNode,
  type NgonNode,
  type ProjectDocument,
  type RectNode,
  type SphereNode,
  type StarNode,
  type SvgNode,
  type TextHalign,
  type TextNode,
  type TextValign,
  type Transform,
  type Vec2,
  type Vec3,
  DEFAULT_COLOR,
  DEFAULT_FONT,
  MIN_SIZE,
  identityTransform,
  isBooleanNode,
  isCircleNode,
  isComponentNode,
  isCuboidNode,
  isCylinderNode,
  isEllipseNode,
  isNgonNode,
  isProfileNode,
  isRectNode,
  isSphereNode,
  isStarNode,
  isSvgNode,
  isTextNode
} from '../document/types'

const LABELS: Record<ParsedNode['kind'], string> = {
  cuboid: 'Cubo',
  cylinder: 'Cilindro',
  sphere: 'Esfera',
  union: 'União',
  difference: 'Diferença',
  intersection: 'Interseção',
  rect: 'Retângulo',
  circle: 'Círculo',
  ellipse: 'Elipse',
  ngon: 'Polígono',
  star: 'Estrela',
  text: 'Texto',
  svg: 'SVG',
  component: 'Componente'
}

const ASSET_PATH =
  /^(?:\.\.\/)?3dev-assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.svg$/i

const MODIFIER_ORDER = ['color', 'translate', 'rotate', 'scale']

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

interface ParsedComponent extends ParsedBase {
  kind: 'component'
  componentName: string
  scale: Vec3
}

interface ParsedRect extends ParsedBase {
  kind: 'rect'
  size: Vec2
  rounding: number
  chamfer: number
  extrusion: Extrusion
}

interface ParsedCircle extends ParsedBase {
  kind: 'circle'
  diameter: number
  extrusion: Extrusion
}

interface ParsedEllipse extends ParsedBase {
  kind: 'ellipse'
  diameter: Vec2
  extrusion: Extrusion
}

interface ParsedNgon extends ParsedBase {
  kind: 'ngon'
  sides: number
  diameter: number
  rounding: number
  extrusion: Extrusion
}

interface ParsedStar extends ParsedBase {
  kind: 'star'
  points: number
  diameter: number
  innerDiameter: number
  extrusion: Extrusion
}

interface ParsedText extends ParsedBase {
  kind: 'text'
  text: string
  size: number
  font: string
  halign: TextHalign
  valign: TextValign
  extrusion: Extrusion
}

interface ParsedSvg extends ParsedBase {
  kind: 'svg'
  assetId: string
  center: Vec2
  openscadScale: number
  extrusion: Extrusion
}

type ParsedProfile =
  ParsedRect | ParsedCircle | ParsedEllipse | ParsedNgon | ParsedStar | ParsedText | ParsedSvg

type ParsedNode =
  ParsedCuboid | ParsedCylinder | ParsedSphere | ParsedBoolean | ParsedProfile | ParsedComponent

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

interface ScaleModifier {
  kind: 'scale'
  scale: Vec3
  line: number
  column: number
}

type Modifier = ColorModifier | TranslateModifier | RotateModifier | ScaleModifier

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
  values: number[]
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
  const uses: string[] = []
  const fileName = previous.activeFile
  const readPrelude = (): boolean => {
    if (isIdent(parser, 'include')) {
      parseInclude(parser)
      return true
    }
    if (isIdent(parser, 'use')) {
      const name = parseUse(parser, previous, fileName)
      if (uses.includes(name)) fail(parser, `use de ${name} repetido.`)
      uses.push(name)
      return true
    }
    if (isIdent(parser, '$fn')) {
      if (sawFn) fail(parser, '$fn repetido.')
      fn = parseFn(parser)
      sawFn = true
      return true
    }
    return false
  }
  while (readPrelude()) {
    // Header statements stay outside the module body.
  }
  const statements =
    fileName === MAIN_FILE
      ? parseMainStatements(parser, previous, readPrelude)
      : parseComponentModule(parser, previous, fileName)
  while (readPrelude()) {
    // A trailing $fn is still the file resolution.
  }
  if (!isEof(parser)) fail(parser, 'Código extra depois do modelo.')
  const instantiated = instantiatedComponents(statements)
  for (const name of uses) {
    if (!instantiated.has(name)) {
      throw new ParseFailure(`use de ${name} não é usado.`, 1, 1)
    }
  }
  for (const name of instantiated) {
    if (!uses.includes(name)) throw new ParseFailure(`Falta use de ${name}.`, 1, 1)
  }
  const document = reconcile(previous, statements, fn)
  for (const name of instantiated) {
    if (introducesCycle(document, fileName, name)) {
      throw new ParseFailure('Esse componente criaria um ciclo.', 1, 1)
    }
  }
  return document
}

function parseMainStatements(
  parser: Parser,
  previous: ProjectDocument,
  readPrelude: () => boolean
): ParsedNode[] {
  const statements: ParsedNode[] = []
  while (!isEof(parser)) {
    if (readPrelude()) continue
    statements.push(parseStatement(parser, previous))
  }
  return statements
}

function parseComponentModule(
  parser: Parser,
  previous: ProjectDocument,
  fileName: string
): ParsedNode[] {
  expectIdent(parser, 'module')
  expectIdent(parser, fileName)
  expectPunct(parser, '(')
  expectPunct(parser, ')')
  expectPunct(parser, '{')
  const statements: ParsedNode[] = []
  while (!isPunct(parser, '}') && !isEof(parser)) {
    if (isIdent(parser, 'include') || isIdent(parser, 'use') || isIdent(parser, '$fn')) {
      fail(parser, 'include, use e $fn ficam fora do módulo.')
    }
    statements.push(parseStatement(parser, previous))
  }
  expectPunct(parser, '}')
  expectIdent(parser, fileName)
  expectPunct(parser, '(')
  expectPunct(parser, ')')
  expectPunct(parser, ';')
  return statements
}

function parseStatement(parser: Parser, previous: ProjectDocument): ParsedNode {
  const modifiers: Modifier[] = []
  while (isModifier(parser)) modifiers.push(parseModifier(parser))
  validateModifierOrder(modifiers)
  return applyModifiers(parseShape(parser, previous), modifiers)
}

function parseShape(parser: Parser, previous: ProjectDocument): ParsedNode {
  const token = peek(parser)
  if (token.kind !== 'ident') fail(parser, `Construção não suportada: ${describe(token)}.`)
  if (token.value === 'round3d') return parseRound3d(parser, previous)
  if (token.value === 'linear_extrude') return parseExtrusion(parser)
  if (token.value === 'cuboid') return parseCuboid(parser)
  if (token.value === 'cyl') return parseCylinder(parser)
  if (token.value === 'spheroid') return parseSphere(parser)
  if (token.value === 'union' || token.value === 'difference' || token.value === 'intersection') {
    return parseBoolean(parser, token.value, previous)
  }
  if (token.value !== MAIN_FILE && previous.files[token.value]) {
    return parseComponentCall(parser, token.value)
  }
  throw new ParseFailure(`Construção não suportada: ${token.value}.`, token.line, token.column)
}

function parseComponentCall(parser: Parser, name: string): ParsedComponent {
  const token = expectIdent(parser, name)
  expectPunct(parser, '(')
  expectPunct(parser, ')')
  expectPunct(parser, ';')
  return {
    ...blankShape(token),
    kind: 'component',
    componentName: name,
    scale: { x: 1, y: 1, z: 1 }
  }
}

function instantiatedComponents(nodes: ParsedNode[]): Set<string> {
  const names = new Set<string>()
  const walk = (node: ParsedNode): void => {
    if (node.kind === 'component') names.add(node.componentName)
    if (node.kind === 'union' || node.kind === 'difference' || node.kind === 'intersection') {
      node.children.forEach(walk)
    }
  }
  nodes.forEach(walk)
  return names
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

function parseExtrusion(parser: Parser): ParsedProfile {
  const token = expectIdent(parser, 'linear_extrude')
  const args = parseArgs(parser)
  let height: number | null = null
  let twist = 0
  let scale = 1
  let centered = false
  for (const arg of args) {
    if (arg.name === 'height') height = requirePositive(arg.value, 'A altura')
    else if (arg.name === 'center') {
      if (arg.value.type !== 'ident' || arg.value.value !== 'true') {
        failToken(arg.value.token, 'A extrusão precisa de center=true.')
      }
      centered = true
    } else if (arg.name === 'twist') twist = requireFiniteNumber(arg.value, 'twist')
    else if (arg.name === 'scale') scale = requireNonNegative(arg.value, 'scale')
    else
      failToken(
        arg.value.token,
        `Argumento não suportado em linear_extrude: ${arg.name ?? 'posicional'}.`
      )
  }
  if (height === null) failToken(token, 'linear_extrude precisa de height.')
  if (!centered) failToken(token, 'linear_extrude precisa de center=true.')
  expectPunct(parser, '{')
  const profile = parseProfile(parser)
  expectPunct(parser, '}')
  if (isPunct(parser, ';')) eat(parser)
  return { ...profile, extrusion: { height, twist, scale } }
}

function parseProfile(parser: Parser): ParsedProfile {
  let center: Vec2 | null = null
  if (isIdent(parser, 'translate')) {
    const modifier = parseTranslate(parser)
    if (modifier.position.z !== 0) {
      throw new ParseFailure(
        'A translação do SVG fica no plano XY.',
        modifier.line,
        modifier.column
      )
    }
    center = { x: modifier.position.x, y: modifier.position.y }
    if (!isIdent(parser, 'import'))
      fail(parser, 'translate dentro da extrusão só posiciona um SVG.')
  }
  const token = peek(parser)
  if (token.kind !== 'ident') fail(parser, `Construção não suportada: ${describe(token)}.`)
  if (token.value === 'rect') return parseRect(parser)
  if (token.value === 'circle') return parseCircleProfile(parser)
  if (token.value === 'ellipse') return parseEllipse(parser)
  if (token.value === 'regular_ngon') return parseNgon(parser)
  if (token.value === 'star') return parseStar(parser)
  if (token.value === 'text') return parseText(parser)
  if (token.value === 'import') return parseSvgImport(parser, center ?? { x: 0, y: 0 })
  if (center) fail(parser, 'translate dentro da extrusão só posiciona um SVG.')
  throw new ParseFailure(`Construção não suportada: ${token.value}.`, token.line, token.column)
}

function parseRect(parser: Parser): ParsedRect {
  const token = expectIdent(parser, 'rect')
  const args = parseArgs(parser)
  expectPunct(parser, ';')
  let size: Vec2 | null = null
  let rounding = 0
  let chamfer = 0
  for (const arg of args) {
    if (arg.name === null || arg.name === 'size') {
      if (size) failToken(token, 'Tamanho repetido em rect.')
      size = requirePair(arg.value, 'rect precisa de um tamanho [x, y].')
    } else if (arg.name === 'rounding') rounding = requireNonNegative(arg.value, 'rounding')
    else if (arg.name === 'chamfer') chamfer = requireNonNegative(arg.value, 'chamfer')
    else if (arg.name === 'anchor') requireCenter(arg.value)
    else failToken(arg.value.token, `Argumento não suportado em rect: ${arg.name}.`)
  }
  if (!size) failToken(token, 'rect precisa de um tamanho [x, y].')
  if (rounding > 0 && chamfer > 0)
    failToken(token, 'rect não aceita rounding e chamfer ao mesmo tempo.')
  return { ...blankProfile(token), kind: 'rect', size, rounding, chamfer }
}

function parseCircleProfile(parser: Parser): ParsedCircle {
  const token = expectIdent(parser, 'circle')
  const args = parseArgs(parser)
  expectPunct(parser, ';')
  let diameter: number | null = null
  for (const arg of args) {
    if (arg.name === 'd' || arg.name === 'diameter') {
      if (diameter !== null) failToken(arg.value.token, 'Diâmetro repetido em circle.')
      diameter = requirePositive(arg.value, 'O diâmetro')
    } else if (arg.name === 'r' || arg.name === 'radius') {
      if (diameter !== null) failToken(arg.value.token, 'Diâmetro repetido em circle.')
      diameter = requirePositiveNumber(numberOrFail(arg.value) * 2, arg.value.token, 'O raio')
    } else if (arg.name === 'anchor') requireCenter(arg.value)
    else
      failToken(arg.value.token, `Argumento não suportado em circle: ${arg.name ?? 'posicional'}.`)
  }
  if (diameter === null) failToken(token, 'circle precisa de d.')
  return { ...blankProfile(token), kind: 'circle', diameter }
}

function parseEllipse(parser: Parser): ParsedEllipse {
  const token = expectIdent(parser, 'ellipse')
  const args = parseArgs(parser)
  expectPunct(parser, ';')
  let diameter: Vec2 | null = null
  for (const arg of args) {
    if (arg.name === 'd' || arg.name === 'diameter') {
      if (diameter) failToken(arg.value.token, 'Diâmetro repetido em ellipse.')
      diameter = requirePositivePair(arg.value, 'ellipse precisa de d=[x, y].')
    } else if (arg.name === 'r' || arg.name === 'radius') {
      if (diameter) failToken(arg.value.token, 'Diâmetro repetido em ellipse.')
      const radius = requirePositivePair(arg.value, 'ellipse precisa de r=[x, y].')
      diameter = { x: round3(radius.x * 2), y: round3(radius.y * 2) }
    } else if (arg.name === 'anchor') requireCenter(arg.value)
    else
      failToken(arg.value.token, `Argumento não suportado em ellipse: ${arg.name ?? 'posicional'}.`)
  }
  if (!diameter) failToken(token, 'ellipse precisa de d=[x, y].')
  return { ...blankProfile(token), kind: 'ellipse', diameter }
}

function parseNgon(parser: Parser): ParsedNgon {
  const token = expectIdent(parser, 'regular_ngon')
  const args = parseArgs(parser)
  expectPunct(parser, ';')
  let sides: number | null = null
  let diameter: number | null = null
  let rounding = 0
  for (const arg of args) {
    if (arg.name === 'n') sides = requireCount(arg.value, 3, 32, 'O número de lados')
    else if (arg.name === 'd' || arg.name === 'diameter') {
      if (diameter !== null) failToken(arg.value.token, 'Diâmetro repetido em regular_ngon.')
      diameter = requirePositive(arg.value, 'O diâmetro')
    } else if (arg.name === 'r' || arg.name === 'radius') {
      if (diameter !== null) failToken(arg.value.token, 'Diâmetro repetido em regular_ngon.')
      diameter = requirePositiveNumber(numberOrFail(arg.value) * 2, arg.value.token, 'O raio')
    } else if (arg.name === 'rounding') rounding = requireNonNegative(arg.value, 'rounding')
    else if (arg.name === 'anchor') requireCenter(arg.value)
    else
      failToken(
        arg.value.token,
        `Argumento não suportado em regular_ngon: ${arg.name ?? 'posicional'}.`
      )
  }
  if (sides === null || diameter === null) failToken(token, 'regular_ngon precisa de n e d.')
  return { ...blankProfile(token), kind: 'ngon', sides, diameter, rounding }
}

function parseStar(parser: Parser): ParsedStar {
  const token = expectIdent(parser, 'star')
  const args = parseArgs(parser)
  expectPunct(parser, ';')
  let points: number | null = null
  let diameter: number | null = null
  let innerDiameter: number | null = null
  for (const arg of args) {
    if (arg.name === 'n') points = requireCount(arg.value, 3, 32, 'O número de pontas')
    else if (arg.name === 'd' || arg.name === 'diameter') {
      if (diameter !== null) failToken(arg.value.token, 'Diâmetro repetido em star.')
      diameter = requirePositive(arg.value, 'O diâmetro')
    } else if (arg.name === 'r' || arg.name === 'radius') {
      if (diameter !== null) failToken(arg.value.token, 'Diâmetro repetido em star.')
      diameter = requirePositiveNumber(numberOrFail(arg.value) * 2, arg.value.token, 'O raio')
    } else if (arg.name === 'id') {
      if (innerDiameter !== null) failToken(arg.value.token, 'Diâmetro interno repetido em star.')
      innerDiameter = requirePositive(arg.value, 'O diâmetro interno')
    } else if (arg.name === 'ir') {
      if (innerDiameter !== null) failToken(arg.value.token, 'Diâmetro interno repetido em star.')
      innerDiameter = requirePositiveNumber(
        numberOrFail(arg.value) * 2,
        arg.value.token,
        'O raio interno'
      )
    } else if (arg.name === 'anchor') requireCenter(arg.value)
    else failToken(arg.value.token, `Argumento não suportado em star: ${arg.name ?? 'posicional'}.`)
  }
  if (points === null || diameter === null || innerDiameter === null) {
    failToken(token, 'star precisa de n, d e id.')
  }
  return { ...blankProfile(token), kind: 'star', points, diameter, innerDiameter }
}

function parseText(parser: Parser): ParsedText {
  const token = expectIdent(parser, 'text')
  const args = parseArgs(parser)
  expectPunct(parser, ';')
  let text: string | null = null
  let size = 10
  let font = DEFAULT_FONT
  let halign: TextHalign = 'center'
  let valign: TextValign = 'center'
  for (const arg of args) {
    if (arg.name === 'text') text = requireText(arg.value, 'O texto')
    else if (arg.name === 'size') size = requirePositive(arg.value, 'O tamanho do texto')
    else if (arg.name === 'font') font = requireText(arg.value, 'A fonte') || DEFAULT_FONT
    else if (arg.name === 'halign') halign = requireHalign(arg.value)
    else if (arg.name === 'valign') valign = requireValign(arg.value)
    else if (arg.name === 'anchor') requireCenter(arg.value)
    else failToken(arg.value.token, `Argumento não suportado em text: ${arg.name ?? 'posicional'}.`)
  }
  if (!text) failToken(token, 'text precisa do argumento text.')
  return { ...blankProfile(token), kind: 'text', text, size, font, halign, valign }
}

function parseSvgImport(parser: Parser, center: Vec2): ParsedSvg {
  const token = expectIdent(parser, 'import')
  const args = parseArgs(parser)
  expectPunct(parser, ';')
  let file: string | null = null
  let openscadScale = 1
  for (const arg of args) {
    if (arg.name === null || arg.name === 'file') {
      if (file) failToken(arg.value.token, 'Arquivo repetido em import.')
      file = requireText(arg.value, 'O arquivo')
    } else if (arg.name === 'scale') openscadScale = requireNonNegative(arg.value, 'scale')
    else failToken(arg.value.token, `Argumento não suportado em import: ${arg.name}.`)
  }
  const assetId = file ? ASSET_PATH.exec(file)?.[1] : undefined
  if (!file || !assetId) failToken(token, 'O SVG precisa estar na pasta 3dev-assets do projeto.')
  return { ...blankProfile(token), kind: 'svg', assetId, center: roundVec2(center), openscadScale }
}

function blankProfile(token: Token): ParsedBase & { extrusion: Extrusion } {
  return {
    ...blankShape(token),
    extrusion: { height: 1, twist: 0, scale: 1 }
  }
}

function parseBoolean(parser: Parser, kind: BooleanKind, previous: ProjectDocument): ParsedBoolean {
  const token = expectIdent(parser, kind)
  expectPunct(parser, '(')
  expectPunct(parser, ')')
  expectPunct(parser, '{')
  const children: ParsedNode[] = []
  while (!isPunct(parser, '}') && !isEof(parser)) children.push(parseStatement(parser, previous))
  expectPunct(parser, '}')
  if (isPunct(parser, ';')) eat(parser)
  if (children.length < 2) {
    failToken(token, `A operação ${kind} precisa de pelo menos dois sólidos.`)
  }
  return { ...blankShape(token), kind, children, rounding: 0 }
}

function parseRound3d(parser: Parser, previous: ProjectDocument): ParsedBoolean {
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
  const child = parseStatement(parser, previous)
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
  if (isIdent(parser, 'scale')) return parseScale(parser)
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

function parseScale(parser: Parser): ScaleModifier {
  const token = expectIdent(parser, 'scale')
  const args = parseArgs(parser)
  if (args.length !== 1 || args[0].name !== null) {
    failToken(token, 'scale() aceita apenas [x, y, z].')
  }
  return {
    kind: 'scale',
    scale: requireCoordinate(args[0].value, 'scale() aceita apenas [x, y, z].'),
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

function parseUse(parser: Parser, previous: ProjectDocument, fileName: string): string {
  const keyword = eat(parser)
  expectPunct(parser, '<')
  let path = ''
  while (!isPunct(parser, '>') && !isEof(parser)) path += eat(parser).value
  expectPunct(parser, '>')
  if (isPunct(parser, ';')) eat(parser)
  const match =
    fileName === MAIN_FILE
      ? /^components\/([A-Za-z_][A-Za-z0-9_]*)\.scad$/.exec(path)
      : /^([A-Za-z_][A-Za-z0-9_]*)\.scad$/.exec(path)
  const name = match?.[1]
  if (!name || name === MAIN_FILE || !previous.files[name]) {
    throw new ParseFailure(
      `use não suportado: ${path || keyword.value}.`,
      keyword.line,
      keyword.column
    )
  }
  return name
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
  if (isPunct(parser, ']')) failToken(token, 'O vetor precisa ter 2 ou 3 números.')
  while (!isEof(parser)) {
    values.push(round3(expectNumber(parser).value))
    if (!isPunct(parser, ',')) break
    eat(parser)
    if (isPunct(parser, ']')) break
  }
  expectPunct(parser, ']')
  if (values.length < 2 || values.length > 3) {
    failToken(token, 'O vetor precisa ter 2 ou 3 números.')
  }
  return { type: 'vector', values, token }
}

function validateModifierOrder(modifiers: Modifier[]): void {
  let last = -1
  for (const modifier of modifiers) {
    const index = MODIFIER_ORDER.indexOf(modifier.kind)
    if (index <= last) {
      throw new ParseFailure(
        'Use cada transform uma vez, na ordem color, translate, rotate e scale.',
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
  let scale = node.kind === 'component' ? node.scale : null
  for (const modifier of modifiers) {
    if (modifier.kind === 'color') {
      appearance = { color: modifier.color, opacity: modifier.opacity }
    } else if (modifier.kind === 'translate') {
      position = modifier.position
    } else if (modifier.kind === 'rotate') {
      rotation = modifier.rotation
    } else if (node.kind !== 'component') {
      throw new ParseFailure(
        'scale() só se aplica a um componente.',
        modifier.line,
        modifier.column
      )
    } else {
      scale = modifier.scale
    }
  }
  const transformed = {
    ...node,
    appearance,
    transform: { position: roundVec(position), rotation: roundVec(rotation) }
  }
  if (transformed.kind !== 'component' || !scale) return transformed
  return { ...transformed, scale: roundVec(scale) }
}

function reconcile(previous: ProjectDocument, parsed: ParsedNode[], fn: number): ProjectDocument {
  const context: BuildContext = { previous, nodes: {} }
  matchList(getRoots(previous), parsed, null, context)
  return pruneAssets(
    replaceActive(
      { ...previous, fn },
      { nodes: context.nodes, assets: activeModel(previous).assets }
    )
  )
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
  const label = parsed.kind === 'component' ? parsed.componentName : LABELS[parsed.kind]
  const name = prev?.name ?? nextFeatureName(context, label)
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
  } else if (isParsedProfile(parsed)) {
    context.nodes[id] = materializeProfile(parsed, shared, context)
  } else if (parsed.kind === 'component') {
    const node: ComponentInstanceNode = {
      ...shared,
      kind: 'component',
      componentName: parsed.componentName,
      scale: roundVec(parsed.scale)
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
      localBounds(
        replaceActive(context.previous, {
          nodes: context.nodes,
          assets: activeModel(context.previous).assets
        }),
        draft
      )
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
    const child = activeModel(previous).nodes[childId]
    if (child) assertRemovable(child, previous, at)
  }
}

function keepSubtree(node: FeatureNode, context: BuildContext): void {
  context.nodes[node.id] = cloneNode(node)
  if (!isBooleanNode(node)) return
  for (const childId of node.childIds) {
    const child = activeModel(context.previous).nodes[childId]
    if (child) keepSubtree(child, context)
  }
}

function isParsedProfile(node: ParsedNode): node is ParsedProfile {
  return (
    node.kind === 'rect' ||
    node.kind === 'circle' ||
    node.kind === 'ellipse' ||
    node.kind === 'ngon' ||
    node.kind === 'star' ||
    node.kind === 'text' ||
    node.kind === 'svg'
  )
}

function materializeProfile(
  parsed: ParsedProfile,
  shared: {
    id: string
    name: string
    visible: boolean
    locked: boolean
    consumedBy: string | null
    transform: Transform
    appearance: Appearance
  },
  context: BuildContext
): ProfileNodeFromParsed {
  const extrusion = {
    height: round3(parsed.extrusion.height),
    twist: round3(parsed.extrusion.twist),
    scale: round3(parsed.extrusion.scale)
  }
  if (parsed.kind === 'rect') {
    const node: RectNode = {
      ...shared,
      kind: 'rect',
      size: roundVec2(parsed.size),
      rounding: round3(parsed.rounding),
      chamfer: round3(parsed.chamfer),
      extrusion
    }
    return node
  }
  if (parsed.kind === 'circle') {
    const node: CircleNode = {
      ...shared,
      kind: 'circle',
      diameter: round3(parsed.diameter),
      extrusion
    }
    return node
  }
  if (parsed.kind === 'ellipse') {
    const node: EllipseNode = {
      ...shared,
      kind: 'ellipse',
      diameter: roundVec2(parsed.diameter),
      extrusion
    }
    return node
  }
  if (parsed.kind === 'ngon') {
    const node: NgonNode = {
      ...shared,
      kind: 'ngon',
      sides: parsed.sides,
      diameter: round3(parsed.diameter),
      rounding: round3(parsed.rounding),
      extrusion
    }
    return node
  }
  if (parsed.kind === 'star') {
    const node: StarNode = {
      ...shared,
      kind: 'star',
      points: parsed.points,
      diameter: round3(parsed.diameter),
      innerDiameter: round3(parsed.innerDiameter),
      extrusion
    }
    return node
  }
  if (parsed.kind === 'text') {
    const node: TextNode = {
      ...shared,
      kind: 'text',
      text: parsed.text,
      size: round3(parsed.size),
      font: parsed.font,
      halign: parsed.halign,
      valign: parsed.valign,
      extrusion
    }
    return node
  }
  const asset = activeModel(context.previous).assets[parsed.assetId]
  if (!asset) {
    throw new ParseFailure('Esse SVG não está no projeto.', parsed.line, parsed.column)
  }
  const metrics = readSvgMetrics(asset.source)
  if (!metrics) {
    throw new ParseFailure('O SVG do projeto não tem viewBox.', parsed.line, parsed.column)
  }
  const importScale = round3(
    Math.min(100, Math.max(0.001, importScaleFromOpenscad(parsed.openscadScale, metrics.mmPerUnit)))
  )
  const node: SvgNode = {
    ...shared,
    kind: 'svg',
    assetId: parsed.assetId,
    center: roundVec2(parsed.center),
    importScale,
    mmPerUnit: metrics.mmPerUnit,
    viewMin: roundVec2(metrics.viewMin),
    viewSize: roundVec2(metrics.viewSize),
    extrusion
  }
  return node
}

type ProfileNodeFromParsed =
  RectNode | CircleNode | EllipseNode | NgonNode | StarNode | TextNode | SvgNode

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
  if (isComponentNode(node) && isComponentNode(copy)) return { ...copy, scale: { ...node.scale } }
  if (isBooleanNode(node) && isBooleanNode(copy)) return { ...copy, childIds: [...node.childIds] }
  if (isProfileNode(node) && isProfileNode(copy)) return cloneProfile(node)
  return copy
}

function cloneProfile(node: FeatureNode): FeatureNode {
  if (!isProfileNode(node)) return node
  const extrusion = { ...node.extrusion }
  if (isRectNode(node)) return { ...node, extrusion, size: { ...node.size } }
  if (isEllipseNode(node)) return { ...node, extrusion, diameter: { ...node.diameter } }
  if (isTextNode(node)) return { ...node, extrusion }
  if (isSvgNode(node)) {
    return {
      ...node,
      extrusion,
      center: { ...node.center },
      viewMin: { ...node.viewMin },
      viewSize: { ...node.viewSize }
    }
  }
  return { ...node, extrusion }
}

function childNodes(document: ProjectDocument, node: BooleanNode): FeatureNode[] {
  const nodes = activeModel(document).nodes
  return node.childIds.flatMap((id) => {
    const child = nodes[id]
    return child ? [child] : []
  })
}

function nextFeatureName(context: BuildContext, label: string): string {
  const used = new Set<string>()
  for (const node of Object.values(activeModel(context.previous).nodes)) used.add(node.name)
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
  if (isRectNode(node)) {
    return JSON.stringify({
      ...common,
      size: roundVec2(node.size),
      rounding: round3(node.rounding),
      chamfer: round3(node.chamfer),
      extrusion: roundExtrusion(node.extrusion)
    })
  }
  if (isCircleNode(node)) {
    return JSON.stringify({
      ...common,
      diameter: round3(node.diameter),
      extrusion: roundExtrusion(node.extrusion)
    })
  }
  if (isEllipseNode(node)) {
    return JSON.stringify({
      ...common,
      diameter: roundVec2(node.diameter),
      extrusion: roundExtrusion(node.extrusion)
    })
  }
  if (isNgonNode(node)) {
    return JSON.stringify({
      ...common,
      sides: node.sides,
      diameter: round3(node.diameter),
      rounding: round3(node.rounding),
      extrusion: roundExtrusion(node.extrusion)
    })
  }
  if (isStarNode(node)) {
    return JSON.stringify({
      ...common,
      points: node.points,
      diameter: round3(node.diameter),
      innerDiameter: round3(node.innerDiameter),
      extrusion: roundExtrusion(node.extrusion)
    })
  }
  if (isTextNode(node)) {
    return JSON.stringify({
      ...common,
      text: node.text,
      size: round3(node.size),
      font: node.font,
      halign: node.halign,
      valign: node.valign,
      extrusion: roundExtrusion(node.extrusion)
    })
  }
  if (isSvgNode(node)) {
    return JSON.stringify({
      ...common,
      assetId: node.assetId,
      center: roundVec2(node.center),
      importScale: round3(node.importScale),
      mmPerUnit: node.mmPerUnit,
      viewMin: roundVec2(node.viewMin),
      viewSize: roundVec2(node.viewSize),
      extrusion: roundExtrusion(node.extrusion)
    })
  }
  if (isComponentNode(node)) {
    return JSON.stringify({
      ...common,
      componentName: node.componentName,
      scale: roundVec(node.scale)
    })
  }
  return JSON.stringify(common)
}

function roundExtrusion(extrusion: Extrusion): Extrusion {
  return {
    height: round3(extrusion.height),
    twist: round3(extrusion.twist),
    scale: round3(extrusion.scale)
  }
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
  if (value.type !== 'vector' || value.values.length !== 3) {
    throw new ParseFailure(message, value.token.line, value.token.column)
  }
  return roundVec({ x: value.values[0], y: value.values[1], z: value.values[2] })
}

function requirePair(value: ArgValue, message: string): Vec2 {
  if (value.type !== 'vector' || value.values.length !== 2) {
    throw new ParseFailure(message, value.token.line, value.token.column)
  }
  return roundVec2({ x: value.values[0], y: value.values[1] })
}

function requirePositivePair(value: ArgValue, message: string): Vec2 {
  const pair = requirePair(value, message)
  return {
    x: requirePositiveNumber(pair.x, value.token, 'O tamanho'),
    y: requirePositiveNumber(pair.y, value.token, 'O tamanho')
  }
}

function requireFiniteNumber(value: ArgValue, label: string): number {
  const number = numberOrFail(value)
  if (!Number.isFinite(number)) {
    throw new ParseFailure(`${label} precisa ser um número.`, value.token.line, value.token.column)
  }
  return round3(number)
}

function requireCount(value: ArgValue, min: number, max: number, label: string): number {
  const count = Math.round(numberOrFail(value))
  if (count < min || count > max) {
    throw new ParseFailure(
      `${label} precisa estar entre ${min} e ${max}.`,
      value.token.line,
      value.token.column
    )
  }
  return count
}

function requireText(value: ArgValue, label: string): string {
  if (value.type !== 'string') {
    throw new ParseFailure(`${label} precisa ser um texto.`, value.token.line, value.token.column)
  }
  return value.value
}

function requireHalign(value: ArgValue): TextHalign {
  const text = requireText(value, 'halign')
  if (text === 'left' || text === 'center' || text === 'right') return text
  throw new ParseFailure(
    'halign aceita left, center ou right.',
    value.token.line,
    value.token.column
  )
}

function requireValign(value: ArgValue): TextValign {
  const text = requireText(value, 'valign')
  if (text === 'top' || text === 'center' || text === 'baseline' || text === 'bottom') return text
  throw new ParseFailure(
    'valign aceita top, center, baseline ou bottom.',
    value.token.line,
    value.token.column
  )
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
  return (
    isIdent(parser, 'color') ||
    isIdent(parser, 'translate') ||
    isIdent(parser, 'rotate') ||
    isIdent(parser, 'scale')
  )
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
