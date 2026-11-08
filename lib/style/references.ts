import { STYLES } from '@/lib/profile/areas'

/**
 * Descubrimiento visual del Style DNA (README 4.3): conjuntos de referencia que el usuario valora.
 * Las ilustraciones son originales y se generan desde codigo (sin fotos de terceros).
 * Cada conjunto lleva etiquetas que se agregan en el Style DNA (lib/style/dna.ts).
 */
export type Fit = 'ajustado' | 'regular' | 'amplio'
type TopKind = 'tee' | 'shirt' | 'knit' | 'polo' | 'hoodie'
type OuterKind = 'blazer' | 'coat' | 'overshirt' | 'bomber'
type BottomKind = 'chino' | 'jeans' | 'tailored' | 'cargo'
type ShoeKind = 'sneaker' | 'loafer' | 'derby' | 'boot' | 'runner'

export interface Outfit {
  id: string
  style: (typeof STYLES)[number]
  desc: string                       // texto alternativo y descripcion accesible
  fit: Fit
  structure: 'estructurado' | 'relajado'
  formality: 1 | 2 | 3 | 4 | 5
  colors: string[]                   // colores de la paleta (COLOR_NAMES) que predominan
  top: { kind: TopKind; color: string; collar?: string }
  outer?: { kind: OuterKind; color: string }
  bottom: { kind: BottomKind; color: string; leg: 'slim' | 'straight' | 'wide' }
  shoes: { kind: ShoeKind; color: string }
}

export const RATINGS = [
  { id: 'love', label: 'Me encanta', weight: 2 },
  { id: 'like', label: 'Me gusta', weight: 1 },
  { id: 'aspire', label: 'Me gustaría conseguir algo parecido', weight: 1.5 },
  { id: 'admire', label: 'Me gusta, pero no para mí', weight: 0 },
  { id: 'never', label: 'No me lo pondría', weight: -1.5 },
] as const
export type RatingId = (typeof RATINGS)[number]['id']
export const ratingLabel = (id: string) => RATINGS.find((r) => r.id === id)?.label ?? id

/** Colores de prenda: los de la paleta mas algunos textiles habituales. */
export const GARMENT_HEX: Record<string, string> = {
  Negro: '#1F1F1F', Blanco: '#F7F6F2', Gris: '#8D8D8A', 'Azul marino': '#1F2A44', Beige: '#D9C7A7', Camel: '#B08D57',
  Marrón: '#5C4033', Oliva: '#6B6B3A', Burdeos: '#6D1F2A', 'Azul claro': '#A9C2DD', 'Verde bosque': '#2F4A36',
  Rojo: '#B0282E', Rosa: '#D9A3AE', Lila: '#B39DC4', Mostaza: '#C99A2E',
  Crudo: '#EDE5D3', Denim: '#2F4868', Caqui: '#A89A6E', Antracita: '#3A3B3D', 'Gris claro': '#C9C8C3',
}

export const OUTFITS: Outfit[] = [
  { id: 'clasico-1', style: 'Clásico contemporáneo', desc: 'Americana azul marino, camisa blanca, pantalón de vestir gris y mocasines marrones', fit: 'regular', structure: 'estructurado', formality: 4, colors: ['Azul marino', 'Blanco', 'Gris', 'Marrón'],
    top: { kind: 'shirt', color: 'Blanco' }, outer: { kind: 'blazer', color: 'Azul marino' }, bottom: { kind: 'tailored', color: 'Gris', leg: 'straight' }, shoes: { kind: 'loafer', color: 'Marrón' } },
  { id: 'clasico-2', style: 'Clásico contemporáneo', desc: 'Abrigo camel, jersey gris, pantalón de vestir azul marino y zapatos negros', fit: 'regular', structure: 'estructurado', formality: 4, colors: ['Camel', 'Gris', 'Azul marino', 'Negro'],
    top: { kind: 'knit', color: 'Gris' }, outer: { kind: 'coat', color: 'Camel' }, bottom: { kind: 'tailored', color: 'Azul marino', leg: 'straight' }, shoes: { kind: 'derby', color: 'Negro' } },
  { id: 'minimal-1', style: 'Minimalismo escandinavo', desc: 'Camiseta blanca, sobrecamisa gris, chino crudo y zapatillas blancas', fit: 'regular', structure: 'relajado', formality: 2, colors: ['Blanco', 'Gris', 'Beige'],
    top: { kind: 'tee', color: 'Blanco' }, outer: { kind: 'overshirt', color: 'Gris claro' }, bottom: { kind: 'chino', color: 'Crudo', leg: 'straight' }, shoes: { kind: 'sneaker', color: 'Blanco' } },
  { id: 'minimal-2', style: 'Minimalismo escandinavo', desc: 'Abrigo largo antracita, jersey negro, pantalón negro recto y botas negras', fit: 'regular', structure: 'estructurado', formality: 3, colors: ['Negro', 'Gris'],
    top: { kind: 'knit', color: 'Negro' }, outer: { kind: 'coat', color: 'Antracita' }, bottom: { kind: 'tailored', color: 'Negro', leg: 'straight' }, shoes: { kind: 'boot', color: 'Negro' } },
  { id: 'italiana-1', style: 'Elegancia italiana', desc: 'Americana beige desestructurada, camisa azul claro, pantalón blanco y mocasines marrones', fit: 'regular', structure: 'relajado', formality: 4, colors: ['Beige', 'Azul claro', 'Blanco', 'Marrón'],
    top: { kind: 'shirt', color: 'Azul claro' }, outer: { kind: 'blazer', color: 'Beige' }, bottom: { kind: 'tailored', color: 'Blanco', leg: 'straight' }, shoes: { kind: 'loafer', color: 'Marrón' } },
  { id: 'italiana-2', style: 'Elegancia italiana', desc: 'Polo de punto oliva, pantalón amplio crudo con pinzas y mocasines marrones', fit: 'amplio', structure: 'relajado', formality: 3, colors: ['Oliva', 'Beige', 'Marrón'],
    top: { kind: 'polo', color: 'Oliva' }, bottom: { kind: 'tailored', color: 'Crudo', leg: 'wide' }, shoes: { kind: 'loafer', color: 'Marrón' } },
  { id: 'workwear-1', style: 'Workwear', desc: 'Chaqueta de trabajo azul marino, camiseta cruda, vaquero oscuro recto y botas marrones', fit: 'regular', structure: 'relajado', formality: 2, colors: ['Azul marino', 'Beige', 'Marrón'],
    top: { kind: 'tee', color: 'Crudo' }, outer: { kind: 'overshirt', color: 'Azul marino' }, bottom: { kind: 'jeans', color: 'Denim', leg: 'straight' }, shoes: { kind: 'boot', color: 'Marrón' } },
  { id: 'workwear-2', style: 'Workwear', desc: 'Sobrecamisa oliva, camiseta blanca, pantalón cargo caqui y botas marrones', fit: 'amplio', structure: 'relajado', formality: 1, colors: ['Oliva', 'Blanco', 'Beige', 'Marrón'],
    top: { kind: 'tee', color: 'Blanco' }, outer: { kind: 'overshirt', color: 'Oliva' }, bottom: { kind: 'cargo', color: 'Caqui', leg: 'wide' }, shoes: { kind: 'boot', color: 'Marrón' } },
  { id: 'street-1', style: 'Streetwear contemporáneo', desc: 'Sudadera negra amplia, pantalón cargo gris amplio y zapatillas de running blancas', fit: 'amplio', structure: 'relajado', formality: 1, colors: ['Negro', 'Gris', 'Blanco'],
    top: { kind: 'hoodie', color: 'Negro' }, bottom: { kind: 'cargo', color: 'Gris', leg: 'wide' }, shoes: { kind: 'runner', color: 'Blanco' } },
  { id: 'street-2', style: 'Streetwear contemporáneo', desc: 'Bomber verde bosque, camiseta blanca, vaquero negro amplio y zapatillas blancas', fit: 'amplio', structure: 'relajado', formality: 1, colors: ['Verde bosque', 'Blanco', 'Negro'],
    top: { kind: 'tee', color: 'Blanco' }, outer: { kind: 'bomber', color: 'Verde bosque' }, bottom: { kind: 'jeans', color: 'Negro', leg: 'wide' }, shoes: { kind: 'sneaker', color: 'Blanco' } },
  { id: 'preppy-1', style: 'Preppy / Ivy League', desc: 'Jersey azul marino sobre camisa oxford blanca, chino beige y mocasines marrones', fit: 'regular', structure: 'estructurado', formality: 3, colors: ['Azul marino', 'Blanco', 'Beige', 'Marrón'],
    top: { kind: 'knit', color: 'Azul marino', collar: 'Blanco' }, bottom: { kind: 'chino', color: 'Beige', leg: 'straight' }, shoes: { kind: 'loafer', color: 'Marrón' } },
  { id: 'preppy-2', style: 'Preppy / Ivy League', desc: 'Polo burdeos, chino blanco ajustado y zapatillas blancas', fit: 'ajustado', structure: 'estructurado', formality: 2, colors: ['Burdeos', 'Blanco'],
    top: { kind: 'polo', color: 'Burdeos' }, bottom: { kind: 'chino', color: 'Blanco', leg: 'slim' }, shoes: { kind: 'sneaker', color: 'Blanco' } },
  { id: 'sofisticado-1', style: 'Casual sofisticado', desc: 'Sobrecamisa azul marino, camiseta blanca, vaquero oscuro ajustado y zapatillas blancas', fit: 'ajustado', structure: 'relajado', formality: 2, colors: ['Azul marino', 'Blanco'],
    top: { kind: 'tee', color: 'Blanco' }, outer: { kind: 'overshirt', color: 'Azul marino' }, bottom: { kind: 'jeans', color: 'Denim', leg: 'slim' }, shoes: { kind: 'sneaker', color: 'Blanco' } },
  { id: 'sofisticado-2', style: 'Casual sofisticado', desc: 'Jersey camel sobre camisa blanca, pantalón antracita y zapatos marrones', fit: 'regular', structure: 'estructurado', formality: 3, colors: ['Camel', 'Blanco', 'Gris', 'Marrón'],
    top: { kind: 'knit', color: 'Camel', collar: 'Blanco' }, bottom: { kind: 'tailored', color: 'Antracita', leg: 'straight' }, shoes: { kind: 'derby', color: 'Marrón' } },
  { id: 'oldmoney-1', style: 'Old money', desc: 'Jersey crudo sobre camisa blanca, pantalón amplio azul marino y mocasines marrones', fit: 'amplio', structure: 'relajado', formality: 4, colors: ['Beige', 'Blanco', 'Azul marino', 'Marrón'],
    top: { kind: 'knit', color: 'Crudo', collar: 'Blanco' }, bottom: { kind: 'tailored', color: 'Azul marino', leg: 'wide' }, shoes: { kind: 'loafer', color: 'Marrón' } },
  { id: 'oldmoney-2', style: 'Old money', desc: 'Americana azul marino, camisa azul claro, pantalón de franela gris y mocasines negros', fit: 'regular', structure: 'estructurado', formality: 5, colors: ['Azul marino', 'Azul claro', 'Gris', 'Negro'],
    top: { kind: 'shirt', color: 'Azul claro' }, outer: { kind: 'blazer', color: 'Azul marino' }, bottom: { kind: 'tailored', color: 'Gris', leg: 'straight' }, shoes: { kind: 'loafer', color: 'Negro' } },
]

export const outfitById = (id: string) => OUTFITS.find((o) => o.id === id)

// ── Ilustracion ────────────────────────────────────────────────────
const hex = (c: string) => GARMENT_HEX[c] ?? c
/** Un tono algo mas oscuro para costuras y sombras. */
function shade(c: string, k = 0.78) {
  const h = hex(c).replace('#', '')
  const n = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * k))
  return `#${n.map((x) => x.toString(16).padStart(2, '0')).join('')}`
}
const poly = (pts: number[][], fill: string, extra = '') => `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${fill}" stroke="${shade(fill, 0.7)}" stroke-width="0.8" stroke-linejoin="round"${extra}/>`
const line = (x1: number, y1: number, x2: number, y2: number, c: string, w = 0.8, dash = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/** Figura plana del conjunto en SVG (viewBox 160x300). Contenido estatico del catalogo. */
export function outfitSvg(o: Outfit): string {
  const parts: string[] = []
  const C = 80
  const w = o.fit === 'ajustado' ? 28 : o.fit === 'amplio' ? 38 : 32
  const top = hex(o.top.color)
  const hem = o.top.kind === 'hoodie' ? 156 : 150
  const long = o.top.kind !== 'tee' && o.top.kind !== 'polo'

  // Pantalon (debajo de todo)
  const b = o.bottom, bc = hex(b.color)
  const hw = b.leg === 'slim' ? 10 : b.leg === 'wide' ? 19 : 13
  const leftLeg = [[C - 29, 146], [C + 1, 146], [C, 178], [64 + hw, 272], [64 - hw, 272]]
  const rightLeg = [[C - 1, 146], [C + 29, 146], [96 + hw, 272], [96 - hw, 272], [C, 178]]
  parts.push(poly(leftLeg, bc), poly(rightLeg, bc), line(C - 29, 152, C + 29, 152, shade(bc, 0.6)))
  if (b.kind === 'jeans') parts.push(`<path d="M${C - 25} 156 q8 8 16 0 M${C + 25} 156 q-8 8 -16 0" fill="none" stroke="${hex('Camel')}" stroke-width="0.8" stroke-dasharray="2 1.5"/>`, line(64, 160, 64, 270, hex('Camel'), 0.5, '2 1.5'), line(96, 160, 96, 270, hex('Camel'), 0.5, '2 1.5'))
  if (b.kind === 'tailored') parts.push(line(64, 158, 64, 270, shade(bc, 0.68), 0.7), line(96, 158, 96, 270, shade(bc, 0.68), 0.7))
  if (b.kind === 'chino') parts.push(line(C - 26, 154, C - 20, 168, shade(bc, 0.65)), line(C + 26, 154, C + 20, 168, shade(bc, 0.65)))
  if (b.kind === 'cargo') parts.push(`<rect x="${64 - hw - 2}" y="196" width="12" height="16" fill="${shade(bc, 0.88)}" stroke="${shade(bc, 0.65)}" stroke-width="0.8"/>`, `<rect x="${96 + hw - 10}" y="196" width="12" height="16" fill="${shade(bc, 0.88)}" stroke="${shade(bc, 0.65)}" stroke-width="0.8"/>`)

  // Calzado
  const s = o.shoes, sc = hex(s.color)
  for (const x of [64, 96]) {
    const dir = x < C ? -1 : 1
    if (s.kind === 'boot') parts.push(`<path d="M${x - 11} 258 h22 v18 q${dir * 8} 0 ${dir * 8} 6 v4 h-${30} z" fill="${sc}" stroke="${shade(sc, 0.6)}" stroke-width="0.8" transform="${dir < 0 ? `translate(${2 * x},0) scale(-1,1)` : ''}"/>`)
    else {
      const sole = s.kind === 'sneaker' || s.kind === 'runner'
      parts.push(`<path d="M${x - 12} 270 h20 q${10} 2 ${10} 10 v3 h-30 z" fill="${sc}" stroke="${shade(sc, 0.6)}" stroke-width="0.8" transform="${dir < 0 ? `translate(${2 * x},0) scale(-1,1)` : ''}"/>`)
      if (sole) parts.push(`<rect x="${x - 13}" y="281" width="31" height="4" rx="1" fill="${s.kind === 'runner' ? hex('Gris claro') : hex('Crudo')}" stroke="${shade(hex('Crudo'), 0.7)}" stroke-width="0.6" transform="${dir < 0 ? `translate(${2 * x},0) scale(-1,1)` : ''}"/>`)
      if (s.kind === 'runner') parts.push(line(x - 6, 276, x + 4, 272, hex('Gris'), 1.4))
      if (s.kind === 'derby') parts.push(`<circle cx="${x}" cy="273" r="0.9" fill="${shade(sc, 0.5)}"/><circle cx="${x + 3}" cy="273.5" r="0.9" fill="${shade(sc, 0.5)}"/>`)
    }
  }

  // Parte de arriba
  const sleeve = (side: -1 | 1, len: number) => {
    const x0 = C + side * w
    return long
      ? poly([[x0, 38], [x0 + side * 13, 41], [x0 + side * 20, 124], [x0 + side * 10, 126], [x0, 74]], top)
      : poly([[x0, 38], [x0 + side * 13, 42], [x0 + side * 17, 72], [x0 + side * 5, 74], [x0, 60]], top) + (len ? '' : '')
  }
  parts.push(sleeve(-1, 0), sleeve(1, 0))
  if (o.top.kind === 'hoodie') parts.push(`<path d="M${C - 18} 34 q18 -26 36 0 z" fill="${shade(top, 0.85)}" stroke="${shade(top, 0.6)}" stroke-width="0.8"/>`)
  parts.push(poly([[C - 11, 30], [C - w, 38], [C - w + 2, hem], [C + w - 2, hem], [C + w, 38], [C + 11, 30]], top))
  if (o.top.kind === 'tee') parts.push(`<path d="M${C - 10} 30 q10 9 20 0" fill="none" stroke="${shade(top, 0.6)}" stroke-width="1.2"/>`)
  if (o.top.kind === 'knit') parts.push(`<path d="M${C - 10} 30 q10 10 20 0" fill="none" stroke="${shade(top, 0.65)}" stroke-width="2.4"/>`, `<rect x="${C - w + 2}" y="${hem - 7}" width="${2 * w - 4}" height="7" fill="${shade(top, 0.9)}" stroke="${shade(top, 0.65)}" stroke-width="0.6"/>`)
  if (o.top.kind === 'shirt' || o.top.collar) {
    const cc = hex(o.top.collar ?? o.top.color)
    parts.push(poly([[C - 11, 29], [C, 40], [C - 3, 46], [C - 13, 34]], cc), poly([[C + 11, 29], [C, 40], [C + 3, 46], [C + 13, 34]], cc))
    if (o.top.kind === 'shirt') parts.push(line(C, 40, C, hem, shade(top, 0.7)), ...[60, 85, 110, 135].map((y) => `<circle cx="${C + 2}" cy="${y}" r="0.9" fill="${shade(top, 0.55)}"/>`))
  }
  if (o.top.kind === 'polo') parts.push(poly([[C - 11, 29], [C, 36], [C - 4, 42], [C - 13, 34]], top), poly([[C + 11, 29], [C, 36], [C + 4, 42], [C + 13, 34]], top), line(C, 36, C, 56, shade(top, 0.65)), `<circle cx="${C + 2}" cy="44" r="0.9" fill="${shade(top, 0.5)}"/><circle cx="${C + 2}" cy="51" r="0.9" fill="${shade(top, 0.5)}"/>`)
  if (o.top.kind === 'hoodie') parts.push(`<path d="M${C - 20} 112 h40 l4 26 h-48 z" fill="${shade(top, 0.92)}" stroke="${shade(top, 0.65)}" stroke-width="0.8"/>`, line(C - 4, 34, C - 5, 60, hex('Gris claro'), 1), line(C + 4, 34, C + 5, 60, hex('Gris claro'), 1))

  // Capa exterior
  if (o.outer) {
    const oc = hex(o.outer.color), ow = w + 4
    const ohem = o.outer.kind === 'coat' ? 228 : o.outer.kind === 'blazer' ? 166 : o.outer.kind === 'bomber' ? 150 : 158
    const open = o.outer.kind === 'bomber' ? 4 : o.outer.kind === 'overshirt' ? 6 : 2
    for (const side of [-1, 1] as const) {
      const x0 = C + side * ow
      parts.push(poly([[x0, 37], [x0 + side * 14, 40], [x0 + side * 21, 128], [x0 + side * 10, 130], [x0, 76]], oc))
      const lapelY = o.outer.kind === 'blazer' || o.outer.kind === 'coat' ? 92 : 40
      parts.push(poly([[C + side * 12, 28], [x0, 37], [x0 - side * 1, ohem], [C + side * open, ohem], [C + side * open, lapelY], [C + side * 9, 34]], oc))
      if (o.outer.kind === 'blazer' || o.outer.kind === 'coat') parts.push(poly([[C + side * 12, 28], [C + side * 20, 48], [C + side * 13, 52], [C + side * open, lapelY], [C + side * 9, 34]], shade(oc, 0.9)))
      if (o.outer.kind === 'overshirt') parts.push(poly([[C + side * 12, 28], [C + side * 18, 40], [C + side * 8, 44], [C + side * 9, 34]], shade(oc, 0.9)), `<rect x="${side < 0 ? C - ow + 6 : C + ow - 20}" y="62" width="14" height="14" fill="${shade(oc, 0.93)}" stroke="${shade(oc, 0.65)}" stroke-width="0.7"/>`)
      if (o.outer.kind === 'bomber') parts.push(`<rect x="${side < 0 ? C - ow : C + open}" y="${ohem - 8}" width="${ow - open}" height="8" fill="${shade(oc, 0.85)}" stroke="${shade(oc, 0.6)}" stroke-width="0.6"/>`)
      if (o.outer.kind === 'blazer' || o.outer.kind === 'coat') parts.push(line(side < 0 ? C - ow + 6 : C + ow - 20, 128, side < 0 ? C - ow + 20 : C + ow - 6, 128, shade(oc, 0.6), 1))
    }
    if (o.outer.kind === 'blazer') parts.push(`<circle cx="${C - 4}" cy="112" r="1.4" fill="${shade(oc, 0.55)}"/>`)
    if (o.outer.kind === 'coat') parts.push(`<circle cx="${C - 5}" cy="112" r="1.6" fill="${shade(oc, 0.55)}"/><circle cx="${C - 5}" cy="140" r="1.6" fill="${shade(oc, 0.55)}"/>`)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300" role="img" aria-label="${esc(o.desc)}">${parts.join('')}</svg>`
}
