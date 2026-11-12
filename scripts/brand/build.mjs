// Rebuilds every brand asset from the shapes in this file.
//
//   npm --prefix scripts/brand ci
//   npm --prefix scripts/brand run build
//
// Writes the sources to assets/brand/ and the files the website serves to frontend/public/.
// Text is converted to outlines with Inter (SIL Open Font License 1.1), so no file depends on a
// font being installed. docs/BRAND.md explains the design.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const BRAND_DIR = join(root, 'assets', 'brand')
const PUBLIC_DIR = join(root, 'frontend', 'public')
const ICON_DIR = join(PUBLIC_DIR, 'icons')
mkdirSync(BRAND_DIR, { recursive: true })
mkdirSync(ICON_DIR, { recursive: true })

// The palette. "Ember" runs from amber through rose to violet, and is kept for the mark, primary
// actions and a few headline words. Ink is the near-black used on top of it.
export const COLORS = {
  amber: '#FF9A3C',
  rose: '#FF4F7B',
  violet: '#8B5CF6',
  ink: '#140A1C',
  night: '#0A0A0C',
  nightRaised: '#141418',
  paper: '#FFFFFF',
  textDark: '#EDEDF0',
  textLight: '#16161A',
  mutedDark: '#A1A1AA',
}

function font(weight) {
  const file = join(here, 'node_modules', '@fontsource', 'inter', 'files', `inter-latin-${weight}-normal.woff`)
  const buffer = readFileSync(file)
  return opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length))
}
const INTER_600 = font(600)
const INTER_500 = font(500)
const INTER_400 = font(400)

// Text as one SVG path. Letter spacing is in em, like CSS.
function textPath(text, { face = INTER_600, size, x = 0, y = 0, tracking = 0 }) {
  const scale = size / face.unitsPerEm
  let cursor = x
  const parts = []
  // One glyph per character, with kerning. Latin text needs no other shaping.
  const glyphs = [...text].map((char) => face.charToGlyph(char))
  glyphs.forEach((glyph, index) => {
    parts.push(glyph.getPath(cursor, y, size).toPathData(2))
    let advance = glyph.advanceWidth * scale
    const next = glyphs[index + 1]
    if (next) advance += face.getKerningValue(glyph, next) * scale
    cursor += advance + tracking * size
  })
  return { d: parts.join(''), width: cursor - x - (glyphs.length ? tracking * size : 0) }
}

function gradient(id, { x1 = 0, y1 = 0, x2 = 1, y2 = 1, units = 'objectBoundingBox' } = {}) {
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="${units}">
    <stop offset="0" stop-color="${COLORS.amber}"/>
    <stop offset="0.52" stop-color="${COLORS.rose}"/>
    <stop offset="1" stop-color="${COLORS.violet}"/>
  </linearGradient>`
}

// The mark, on a 64 x 64 grid: a reply card with a speech tail. Two short lines are the AI's draft,
// and the check is a person's approval. "AI drafts, people approve."
const CARD_64 =
  'M18 8h28a12 12 0 0 1 12 12v18a12 12 0 0 1-12 12H27l-10.6 7.9A1.6 1.6 0 0 1 13.9 56.6L15 50.1A12 12 0 0 1 6 38V20A12 12 0 0 1 18 8z'
function markBody64(fillId) {
  return `<path d="${CARD_64}" fill="url(#${fillId})"/>
  <path d="M17 21h17M17 29.5h9" stroke="${COLORS.ink}" stroke-width="4.2" stroke-linecap="round" opacity="0.5"/>
  <path d="m31 32 6.2 6.2L49 24.4" stroke="${COLORS.ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
}

// The small mark, on a 32 x 32 grid, for 16 to 32 px: the card and the check only, heavier.
const CARD_32 =
  'M9 3h14a6 6 0 0 1 6 6v9a6 6 0 0 1-6 6h-9.4l-5.4 4.1A.9.9 0 0 1 6.8 27.3L7.4 23.7A6 6 0 0 1 3 18V9a6 6 0 0 1 6-6z'
function smallMarkBody(fillId) {
  return `<path d="${CARD_32}" fill="url(#${fillId})"/>
  <path d="m10 13.6 4 4 8-8.2" stroke="${COLORS.ink}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
}

function svg(width, height, body, defs = '', extra = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none"${extra}>
  <defs>${defs}</defs>
  ${body}
</svg>
`
}

const markSvg = svg(64, 64, markBody64('g'), gradient('g'))
const smallMarkSvg = svg(32, 32, smallMarkBody('g'), gradient('g'))

// The wordmark: "IknowService" in the text color, and "AI" in the gradient.
function wordmark(size, textColor) {
  const main = textPath('IknowService', { size, tracking: -0.02 })
  const ai = textPath('AI', { size, x: main.width + size * 0.02, tracking: -0.01 })
  const width = Math.ceil(main.width + size * 0.02 + ai.width + 2)
  return { width, main, ai, textColor }
}

function wordmarkSvg(textColor) {
  const size = 48
  const { width, main, ai } = wordmark(size, textColor)
  const height = 60
  // Baseline at 46, so the cap height sits inside the box.
  const shift = `transform="translate(0 46)"`
  return svg(
    width,
    height,
    `<g ${shift}><path d="${main.d}" fill="${textColor}"/><path d="${ai.d}" fill="url(#w)"/></g>`,
    gradient('w', { x1: main.width, y1: -36, x2: width, y2: 0, units: 'userSpaceOnUse' }),
  )
}

function lockupSvg(textColor, background) {
  const size = 40
  const { width: wordWidth, main, ai } = wordmark(size, textColor)
  const markSize = 56
  const gap = 16
  const pad = background ? 24 : 0
  const width = Math.ceil(pad * 2 + markSize + gap + wordWidth)
  const height = pad * 2 + markSize
  const textX = pad + markSize + gap
  const baseline = pad + markSize / 2 + size * 0.36
  const back = background ? `<rect width="${width}" height="${height}" rx="16" fill="${background}"/>` : ''
  return svg(
    width,
    height,
    `${back}<g transform="translate(${pad} ${pad}) scale(${markSize / 64})">${markBody64('m')}</g>
  <g transform="translate(${textX} ${baseline})"><path d="${main.d}" fill="${textColor}"/><path d="${ai.d}" fill="url(#w)"/></g>`,
    gradient('m') + gradient('w', { x1: main.width, y1: -30, x2: wordWidth, y2: 0, units: 'userSpaceOnUse' }),
  )
}

// An app icon: the mark on the night background. `safe` is the share of the canvas the mark may use,
// so a maskable icon keeps it inside the 80% circle that platforms may crop to.
function appIconSvg(size, { safe = 0.72, radius = 0 } = {}) {
  const markSize = size * safe
  const offset = (size - markSize) / 2
  return svg(
    size,
    size,
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${COLORS.night}"/>
  <circle cx="${size / 2}" cy="${size * 0.46}" r="${size * 0.42}" fill="url(#glow)"/>
  <g transform="translate(${offset} ${offset}) scale(${markSize / 64})">${markBody64('m')}</g>`,
    gradient('m') +
      `<radialGradient id="glow"><stop offset="0" stop-color="${COLORS.rose}" stop-opacity="0.28"/><stop offset="1" stop-color="${COLORS.rose}" stop-opacity="0"/></radialGradient>`,
  )
}

// The Open Graph image, 1200 x 630. Every word on it is true of v1 as built.
function ogImageSvg() {
  const W = 1200
  const H = 630
  const lockup = wordmark(34, COLORS.textDark)
  const lines = [
    [{ text: 'An IT service desk where', fill: COLORS.textDark }],
    [{ text: 'AI drafts the answer', fill: COLORS.textDark }],
    [
      { text: 'and ', fill: COLORS.textDark },
      { text: 'people stay in charge.', fill: 'url(#h)' },
    ],
  ]
  let headline = ''
  lines.forEach((parts, row) => {
    let x = 72
    const y = 262 + row * 78
    for (const part of parts) {
      const t = textPath(part.text, { size: 66, x, y, tracking: -0.025 })
      headline += `<path d="${t.d}" fill="${part.fill}"/>`
      x += t.width + (part.text.endsWith(' ') ? 0 : 0)
    }
  })
  const steps = ['Redact', 'Retrieve', 'Triage', 'Validate', 'Policy gate', 'Human review', 'Audit']
  let chips = ''
  let cx = 72
  steps.forEach((step, index) => {
    const label = textPath(step, { face: INTER_500, size: 20, x: cx + 16, y: 516 })
    const w = label.width + 32
    const highlighted = step === 'Policy gate' || step === 'Human review'
    chips += `<rect x="${cx}" y="487" width="${w}" height="42" rx="21" fill="${highlighted ? '#1F1420' : COLORS.nightRaised}" stroke="${highlighted ? COLORS.rose : '#2A2A31'}" stroke-width="1.5"/>`
    chips += `<path d="${label.d}" fill="${highlighted ? '#FFD3DE' : '#C9C9D1'}"/>`
    cx += w
    if (index < steps.length - 1) {
      chips += `<path d="M${cx + 6} 508h12" stroke="#4A4A55" stroke-width="2" stroke-linecap="round"/>`
      cx += 24
    }
  })
  const footer = textPath('iknowserviceai.onrender.com   ·   Open source, MIT   ·   Synthetic demo data', {
    face: INTER_400,
    size: 20,
    x: 72,
    y: 586,
  })
  return svg(
    W,
    H,
    `<rect width="${W}" height="${H}" fill="${COLORS.night}"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <ellipse cx="980" cy="70" rx="520" ry="330" fill="url(#glow)"/>
  <g transform="translate(72 64) scale(${52 / 64})">${markBody64('m')}</g>
  <g transform="translate(140 102)"><path d="${lockup.main.d}" fill="${COLORS.textDark}"/><path d="${lockup.ai.d}" fill="url(#w)"/></g>
  ${headline}
  ${chips}
  <path d="${footer.d}" fill="${COLORS.mutedDark}"/>`,
    gradient('m') +
      gradient('w', { x1: lockup.main.width, y1: -26, x2: lockup.width, y2: 0, units: 'userSpaceOnUse' }) +
      gradient('h', { x1: 200, y1: 0, x2: 900, y2: 0, units: 'userSpaceOnUse' }) +
      `<radialGradient id="glow"><stop offset="0" stop-color="${COLORS.violet}" stop-opacity="0.30"/><stop offset="0.55" stop-color="${COLORS.rose}" stop-opacity="0.10"/><stop offset="1" stop-color="${COLORS.rose}" stop-opacity="0"/></radialGradient>
  <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" stroke="#FFFFFF" stroke-opacity="0.035" stroke-width="1"/></pattern>`,
  )
}

// An ICO file that holds PNG images, which every current browser reads.
function ico(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + 16 * pngs.length
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(entry)
  }
  return Buffer.concat([header, ...entries, ...pngs.map((png) => png.data)])
}

// Renders at twice the target size, then scales down, for smooth edges.
async function png(svgText, size, file) {
  const width = Number(svgText.match(/width="([\d.]+)"/)[1])
  const data = await sharp(Buffer.from(svgText), { density: Math.min(2400, 72 * (size / width) * 2) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer()
  if (file) writeFileSync(file, data)
  return data
}

function write(file, text) {
  writeFileSync(file, text)
  console.log(`wrote ${file.replace(root, '').replaceAll('\\', '/')}`)
}

// Sources
write(join(BRAND_DIR, 'mark.svg'), markSvg)
write(join(BRAND_DIR, 'mark-small.svg'), smallMarkSvg)
write(join(BRAND_DIR, 'wordmark-dark.svg'), wordmarkSvg(COLORS.textDark))
write(join(BRAND_DIR, 'wordmark-light.svg'), wordmarkSvg(COLORS.textLight))
write(join(BRAND_DIR, 'lockup-dark.svg'), lockupSvg(COLORS.textDark, COLORS.night))
write(join(BRAND_DIR, 'lockup-light.svg'), lockupSvg(COLORS.textLight, COLORS.paper))
write(join(BRAND_DIR, 'lockup-on-dark-transparent.svg'), lockupSvg(COLORS.textDark, null))
write(join(BRAND_DIR, 'lockup-on-light-transparent.svg'), lockupSvg(COLORS.textLight, null))
const appIcon = appIconSvg(512, { safe: 0.66, radius: 112 })
const maskable = appIconSvg(512, { safe: 0.54 })
write(join(BRAND_DIR, 'app-icon.svg'), appIcon)
write(join(BRAND_DIR, 'app-icon-maskable.svg'), maskable)
const og = ogImageSvg()
write(join(BRAND_DIR, 'og-image.svg'), og)

// Served files
write(join(PUBLIC_DIR, 'favicon.svg'), smallMarkSvg)
const favicons = []
for (const size of [16, 32, 48]) favicons.push({ size, data: await png(smallMarkSvg, size) })
writeFileSync(join(PUBLIC_DIR, 'favicon.ico'), ico(favicons))
console.log('wrote /frontend/public/favicon.ico (16, 32, 48)')
await png(appIconSvg(180, { safe: 0.66 }), 180, join(ICON_DIR, 'apple-touch-icon.png'))
await png(appIcon, 192, join(ICON_DIR, 'icon-192.png'))
await png(appIcon, 512, join(ICON_DIR, 'icon-512.png'))
await png(maskable, 512, join(ICON_DIR, 'icon-maskable-512.png'))
console.log('wrote /frontend/public/icons/ (180, 192, 512, maskable 512)')
const ogPng = await sharp(Buffer.from(og), { density: 144 }).resize(1200, 630).png({ compressionLevel: 9, palette: false }).toBuffer()
writeFileSync(join(PUBLIC_DIR, 'og-image.png'), ogPng)
console.log(`wrote /frontend/public/og-image.png (${Math.round(ogPng.length / 1024)} KB)`)
// The lockups the website shows, as files rather than inline markup.
write(join(PUBLIC_DIR, 'brand-mark.svg'), markSvg)

const manifest = {
  name: 'IknowServiceAI',
  short_name: 'IknowServiceAI',
  description: 'An IT service desk where AI drafts the answer and people stay in charge.',
  start_url: '/app/',
  scope: '/',
  display: 'standalone',
  background_color: COLORS.night,
  theme_color: COLORS.night,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}
write(join(PUBLIC_DIR, 'site.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`)
