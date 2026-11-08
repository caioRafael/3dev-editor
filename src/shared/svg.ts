export interface SvgMetrics {
  viewMin: { x: number; y: number }
  viewSize: { x: number; y: number }
  mmPerUnit: number
}

export function readSvgMetrics(source: string): SvgMetrics | null {
  const tag = rootSvgTag(source)
  if (!tag) return null
  const viewBox = attribute(tag, 'viewBox')
  const width = attribute(tag, 'width')
  const height = attribute(tag, 'height')
  const box = viewBox ? parseViewBox(viewBox) : null
  const widthMm = width ? physicalMillimeters(width) : null
  const heightMm = height ? physicalMillimeters(height) : null

  if (box && box.width > 0 && box.height > 0) {
    const mmPerUnit = widthMm !== null ? widthMm / box.width : 1
    return {
      viewMin: { x: box.minX, y: box.minY },
      viewSize: { x: box.width, y: box.height },
      mmPerUnit
    }
  }

  if (widthMm !== null && heightMm !== null && widthMm > 0 && heightMm > 0) {
    return {
      viewMin: { x: 0, y: 0 },
      viewSize: { x: widthMm, y: heightMm },
      mmPerUnit: 1
    }
  }

  const widthPx = width ? unitless(width) : null
  const heightPx = height ? unitless(height) : null
  if (widthPx !== null && heightPx !== null && widthPx > 0 && heightPx > 0) {
    return {
      viewMin: { x: 0, y: 0 },
      viewSize: { x: widthPx, y: heightPx },
      mmPerUnit: 1
    }
  }
  return null
}

export function svgSourceForOpenscad(source: string): string {
  const metrics = readSvgMetrics(source)
  if (!metrics) return source
  const width = millimeters(metrics.viewSize.x * metrics.mmPerUnit)
  const height = millimeters(metrics.viewSize.y * metrics.mmPerUnit)
  return replaceRootSize(source, width, height)
}

function millimeters(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return `${Object.is(rounded, -0) ? 0 : rounded}mm`
}

function replaceRootSize(source: string, width: string, height: string): string {
  const start = source.search(/<svg\b/i)
  if (start < 0) return source
  const end = tagEnd(source, start)
  if (end < 0) return source
  let tag = source.slice(start, end + 1)
  tag = setAttribute(tag, 'width', width)
  tag = setAttribute(tag, 'height', height)
  return source.slice(0, start) + tag + source.slice(end + 1)
}

function tagEnd(source: string, start: number): number {
  let quote: '"' | "'" | null = null
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '>') return index
  }
  return -1
}

function setAttribute(tag: string, name: string, value: string): string {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')
  if (pattern.test(tag)) return tag.replace(pattern, `${name}="${value}"`)
  if (tag.endsWith('/>')) return tag.replace(/\/>$/, ` ${name}="${value}"/>`)
  return tag.replace(/>$/, ` ${name}="${value}">`)
}

function rootSvgTag(source: string): string | null {
  const start = source.search(/<svg\b/i)
  if (start < 0) return null
  const end = tagEnd(source, start)
  if (end < 0) return null
  return source.slice(start, end + 1)
}

function attribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')
  const match = pattern.exec(tag)
  return match?.[2] ?? match?.[3] ?? null
}

function parseViewBox(
  value: string
): { minX: number; minY: number; width: number; height: number } | null {
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null
  const [minX, minY, width, height] = parts
  if (width <= 0 || height <= 0) return null
  return { minX, minY, width, height }
}

function physicalMillimeters(value: string): number | null {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(mm|cm|in|pt)$/i.exec(value.trim())
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = match[2].toLowerCase()
  if (unit === 'mm') return amount
  if (unit === 'cm') return amount * 10
  if (unit === 'in') return amount * 25.4
  return (amount * 25.4) / 72
}

function unitless(value: string): number | null {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(px)?$/i.exec(value.trim())
  if (!match) return null
  const amount = Number(match[1])
  return Number.isFinite(amount) && amount > 0 ? amount : null
}
