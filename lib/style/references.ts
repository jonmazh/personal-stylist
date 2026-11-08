import { STYLE_CATALOG, type ElementId } from './catalog'

/**
 * Galeria de referencias del catalogo de estilos (README 4.3 y BIS 1).
 * Las ilustraciones son originales y se generan desde codigo (sin fotos de terceros ni scraping).
 * Los elementos visuales y los colores de cada conjunto se DERIVAN de sus prendas: el etiquetado es coherente.
 */
export type Fit = 'ajustado' | 'regular' | 'amplio'
type TopKind = 'tee' | 'graphic' | 'shirt' | 'flannel' | 'knit' | 'turtle' | 'polo' | 'hoodie' | 'sweat'
type OuterKind = 'blazer' | 'coat' | 'overshirt' | 'bomber' | 'puffer' | 'leather' | 'denimjk' | 'varsity' | 'cardigan' | 'track' | 'flannel'
type BottomKind = 'chino' | 'jeans' | 'tailored' | 'cargo' | 'jogger'
type Leg = 'slim' | 'straight' | 'wide' | 'baggy'
type ShoeKind = 'sneaker' | 'chunky' | 'runner' | 'skate' | 'loafer' | 'derby' | 'boot'
type Extra = 'chain' | 'crossbody' | 'cap' | 'beanie' | 'sunglasses' | 'clean-lines' | 'vintage' | 'stripe'

export interface Outfit {
  id: string
  style: string                       // id del catalogo (lib/style/catalog.ts)
  desc: string                        // texto alternativo y descripcion accesible
  fit: Fit
  structure: 'estructurado' | 'relajado'
  formality: 1 | 2 | 3 | 4 | 5
  top: { kind: TopKind; color: string; collar?: string }
  outer?: { kind: OuterKind; color: string }
  bottom: { kind: BottomKind; color: string; leg: Leg }
  shoes: { kind: ShoeKind; color: string }
  extras?: Extra[]
  colors: string[]                    // derivado: colores de la paleta de la app
  elements: ElementId[]               // derivado: elementos visuales
}

/** Escala de valoracion (BIS 1 §5). Se distingue admirar una estetica de querer vestirla. */
export const RATINGS = [
  { id: 'love', label: 'Me encanta', weight: 2, wear: true },
  { id: 'like', label: 'Me gusta', weight: 1, wear: true },
  { id: 'represents', label: 'Me representa', weight: 2.5, wear: true },
  { id: 'admire', label: 'Me gusta, pero no me lo pondría', weight: 0, wear: false },
  { id: 'dislike', label: 'No me gusta', weight: -1.5, wear: false },
  { id: 'element', label: 'Me gusta algún elemento, pero no el conjunto', weight: 0, wear: false },
] as const
export type RatingId = (typeof RATINGS)[number]['id']
/** Valoraciones de versiones anteriores, por si quedan sin convertir (la migracion 0005 las convierte). */
export const LEGACY_RATING: Record<string, RatingId> = { aspire: 'represents', never: 'dislike' }
export const normRating = (r: string) => (LEGACY_RATING[r] ?? r) as RatingId
export const ratingLabel = (id: string) => RATINGS.find((r) => r.id === normRating(id))?.label ?? id

/** Colores de prenda: los de la paleta mas algunos textiles habituales, y a que color de la paleta equivalen. */
export const GARMENT_HEX: Record<string, string> = {
  Negro: '#1F1F1F', Blanco: '#F7F6F2', Gris: '#8D8D8A', 'Azul marino': '#1F2A44', Beige: '#D9C7A7', Camel: '#B08D57',
  Marrón: '#5C4033', Oliva: '#6B6B3A', Burdeos: '#6D1F2A', 'Azul claro': '#A9C2DD', 'Verde bosque': '#2F4A36',
  Rojo: '#B0282E', Rosa: '#D9A3AE', Lila: '#B39DC4', Mostaza: '#C99A2E',
  Crudo: '#EDE5D3', Denim: '#2F4868', 'Denim claro': '#7F9BBF', Caqui: '#A89A6E', Antracita: '#3A3B3D', 'Gris claro': '#C9C8C3',
}
const PALETTE_OF: Record<string, string> = { Crudo: 'Beige', Denim: 'Azul marino', 'Denim claro': 'Azul claro', Caqui: 'Beige', Antracita: 'Gris', 'Gris claro': 'Gris' }
const ACCENTS = new Set(['Rojo', 'Burdeos', 'Mostaza', 'Rosa', 'Lila', 'Verde bosque'])
const EARTH = new Set(['Beige', 'Camel', 'Marrón', 'Oliva', 'Crudo', 'Caqui', 'Blanco'])

const hex = (c: string) => GARMENT_HEX[c] ?? c
const lightness = (c: string) => { const h = hex(c).replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 }

/** Elementos visuales que se ven en el conjunto. */
function deriveElements(o: Omit<Outfit, 'colors' | 'elements'>): ElementId[] {
  const e = new Set<ElementId>()
  if (o.fit === 'amplio') e.add('top-oversize')
  if (o.fit === 'ajustado') e.add('top-fitted')
  if (o.bottom.kind === 'jogger') e.add('leg-jogger')
  else e.add(({ slim: 'leg-slim', straight: 'leg-straight', wide: 'leg-wide', baggy: 'leg-baggy' } as const)[o.bottom.leg])
  const TOP: Record<TopKind, ElementId> = { tee: 'basic-tee', graphic: 'graphic-tee', shirt: 'shirt', flannel: 'flannel', knit: 'knit', turtle: 'turtleneck', polo: 'polo', hoodie: 'hoodie', sweat: 'hoodie' }
  e.add(TOP[o.top.kind])
  if (o.top.collar) { e.add('shirt'); e.add('layers') }
  const OUT: Partial<Record<OuterKind, ElementId>> = { blazer: 'blazer', coat: 'long-coat', overshirt: 'overshirt', puffer: 'puffer', leather: 'leather', denimjk: 'denim-jacket', varsity: 'varsity', cardigan: 'cardigan', track: 'tracksuit', flannel: 'flannel' }
  if (o.outer) {
    const x = OUT[o.outer.kind]; if (x) e.add(x)
    if (['overshirt', 'denimjk', 'cardigan', 'leather', 'flannel'].includes(o.outer.kind)) e.add('layers')
    if (o.outer.kind === 'puffer' || o.outer.kind === 'track') e.add('technical')
  }
  const BOT: Partial<Record<BottomKind, ElementId>> = { jeans: 'denim', cargo: 'cargo', tailored: 'tailoring' }
  const b = BOT[o.bottom.kind]; if (b) e.add(b)
  e.add(o.shoes.kind)
  for (const x of o.extras ?? []) if (x !== 'stripe') e.add(x)
  // Color: monocromo, contraste claro-oscuro, tonal o con acento
  const cs = [o.top.color, o.outer?.color, o.bottom.color].filter(Boolean) as string[]
  const ls = cs.map(lightness), range = Math.max(...ls) - Math.min(...ls)
  if (new Set(cs.map((c) => PALETTE_OF[c] ?? c)).size <= 2 && range < 0.35) e.add('monochrome')
  else if (range > 0.6) e.add('contrast')
  else if (cs.every((c) => EARTH.has(c))) e.add('tonal')
  if (cs.some((c) => ACCENTS.has(c))) e.add('accent')
  return [...e]
}

type Spec = Omit<Outfit, 'colors' | 'elements'>
const make = (s: Spec): Outfit => ({
  ...s,
  colors: [...new Set([s.top.color, s.top.collar, s.outer?.color, s.bottom.color, s.shoes.color].filter(Boolean).map((c) => PALETTE_OF[c!] ?? c!))],
  elements: deriveElements(s),
})

const T = (kind: TopKind, color: string, collar?: string) => ({ kind, color, collar })
const O = (kind: OuterKind, color: string) => ({ kind, color })
const B = (kind: BottomKind, color: string, leg: Leg) => ({ kind, color, leg })
const Z = (kind: ShoeKind, color: string) => ({ kind, color })

export const OUTFITS: Outfit[] = ([
  // ── Ids historicos (conservan las valoraciones anteriores) ──
  { id: 'clasico-1', style: 'classic-contemporary', desc: 'Americana azul marino, camisa blanca, pantalón de vestir gris y mocasines marrones', fit: 'regular', structure: 'estructurado', formality: 4, top: T('shirt', 'Blanco'), outer: O('blazer', 'Azul marino'), bottom: B('tailored', 'Gris', 'straight'), shoes: Z('loafer', 'Marrón') },
  { id: 'clasico-2', style: 'classic-contemporary', desc: 'Abrigo camel, jersey gris, pantalón de vestir azul marino y zapatos negros', fit: 'regular', structure: 'estructurado', formality: 4, top: T('knit', 'Gris'), outer: O('coat', 'Camel'), bottom: B('tailored', 'Azul marino', 'straight'), shoes: Z('derby', 'Negro') },
  { id: 'minimal-1', style: 'scandinavian-minimalism', desc: 'Camiseta blanca, sobrecamisa gris, chino crudo y zapatillas blancas', fit: 'regular', structure: 'relajado', formality: 2, top: T('tee', 'Blanco'), outer: O('overshirt', 'Gris claro'), bottom: B('chino', 'Crudo', 'straight'), shoes: Z('sneaker', 'Blanco') },
  { id: 'minimal-2', style: 'scandinavian-minimalism', desc: 'Abrigo largo antracita, jersey negro, pantalón negro recto y botas negras', fit: 'regular', structure: 'estructurado', formality: 3, top: T('knit', 'Negro'), outer: O('coat', 'Antracita'), bottom: B('tailored', 'Negro', 'straight'), shoes: Z('boot', 'Negro') },
  { id: 'italiana-1', style: 'italian-casual', desc: 'Americana beige desestructurada, camisa azul claro, pantalón blanco y mocasines marrones', fit: 'regular', structure: 'relajado', formality: 4, top: T('shirt', 'Azul claro'), outer: O('blazer', 'Beige'), bottom: B('tailored', 'Blanco', 'straight'), shoes: Z('loafer', 'Marrón'), extras: ['sunglasses'] },
  { id: 'italiana-2', style: 'italian-casual', desc: 'Polo de punto oliva, pantalón amplio crudo con pinzas y mocasines marrones', fit: 'amplio', structure: 'relajado', formality: 3, top: T('polo', 'Oliva'), bottom: B('tailored', 'Crudo', 'wide'), shoes: Z('loafer', 'Marrón') },
  { id: 'workwear-1', style: 'workwear-contemporaneo', desc: 'Chaqueta de trabajo azul marino, camiseta cruda, vaquero oscuro recto y botas marrones', fit: 'regular', structure: 'relajado', formality: 2, top: T('tee', 'Crudo'), outer: O('overshirt', 'Azul marino'), bottom: B('jeans', 'Denim', 'straight'), shoes: Z('boot', 'Marrón') },
  { id: 'workwear-2', style: 'workwear-contemporaneo', desc: 'Sobrecamisa oliva, camiseta blanca, pantalón cargo caqui y botas marrones', fit: 'amplio', structure: 'relajado', formality: 1, top: T('tee', 'Blanco'), outer: O('overshirt', 'Oliva'), bottom: B('cargo', 'Caqui', 'wide'), shoes: Z('boot', 'Marrón') },
  { id: 'street-1', style: 'streetwear-contemporaneo', desc: 'Sudadera negra amplia, pantalón cargo gris amplio y zapatillas de running blancas', fit: 'amplio', structure: 'relajado', formality: 1, top: T('hoodie', 'Negro'), bottom: B('cargo', 'Gris', 'wide'), shoes: Z('runner', 'Blanco') },
  { id: 'street-2', style: 'streetwear-contemporaneo', desc: 'Bomber verde bosque, camiseta blanca, vaquero negro amplio y zapatillas blancas', fit: 'amplio', structure: 'relajado', formality: 1, top: T('tee', 'Blanco'), outer: O('bomber', 'Verde bosque'), bottom: B('jeans', 'Negro', 'wide'), shoes: Z('sneaker', 'Blanco') },
  { id: 'preppy-1', style: 'preppy-contemporaneo', desc: 'Jersey azul marino sobre camisa oxford blanca, chino beige y mocasines marrones', fit: 'regular', structure: 'estructurado', formality: 3, top: T('knit', 'Azul marino', 'Blanco'), bottom: B('chino', 'Beige', 'straight'), shoes: Z('loafer', 'Marrón') },
  { id: 'preppy-2', style: 'preppy-contemporaneo', desc: 'Polo burdeos, chino blanco ajustado y zapatillas blancas', fit: 'ajustado', structure: 'estructurado', formality: 2, top: T('polo', 'Burdeos'), bottom: B('chino', 'Blanco', 'slim'), shoes: Z('sneaker', 'Blanco') },
  { id: 'sofisticado-1', style: 'elevated-casual', desc: 'Sobrecamisa azul marino, camiseta blanca, vaquero oscuro ajustado y zapatillas blancas', fit: 'ajustado', structure: 'relajado', formality: 2, top: T('tee', 'Blanco'), outer: O('overshirt', 'Azul marino'), bottom: B('jeans', 'Denim', 'slim'), shoes: Z('sneaker', 'Blanco') },
  { id: 'sofisticado-2', style: 'elevated-casual', desc: 'Jersey camel sobre camisa blanca, pantalón antracita y zapatos marrones', fit: 'regular', structure: 'estructurado', formality: 3, top: T('knit', 'Camel', 'Blanco'), bottom: B('tailored', 'Antracita', 'straight'), shoes: Z('derby', 'Marrón') },
  { id: 'oldmoney-1', style: 'old-money', desc: 'Jersey crudo sobre camisa blanca, pantalón amplio azul marino y mocasines marrones', fit: 'amplio', structure: 'relajado', formality: 4, top: T('knit', 'Crudo', 'Blanco'), bottom: B('tailored', 'Azul marino', 'wide'), shoes: Z('loafer', 'Marrón') },
  { id: 'oldmoney-2', style: 'old-money', desc: 'Americana azul marino, camisa azul claro, pantalón de franela gris y mocasines negros', fit: 'regular', structure: 'estructurado', formality: 5, top: T('shirt', 'Azul claro'), outer: O('blazer', 'Azul marino'), bottom: B('tailored', 'Gris', 'straight'), shoes: Z('loafer', 'Negro') },
  // ── A · Urbanos y contemporaneos ──
  { id: 'urbancas-1', style: 'urban-casual', desc: 'Sudadera gris, vaquero recto azul, zapatillas blancas y gorra', fit: 'regular', structure: 'relajado', formality: 1, top: T('sweat', 'Gris'), bottom: B('jeans', 'Denim', 'straight'), shoes: Z('sneaker', 'Blanco'), extras: ['cap'] },
  { id: 'urbancas-2', style: 'urban-casual', desc: 'Cazadora vaquera, camiseta blanca, chino negro recto y zapatillas blancas', fit: 'regular', structure: 'relajado', formality: 2, top: T('tee', 'Blanco'), outer: O('denimjk', 'Denim'), bottom: B('chino', 'Negro', 'straight'), shoes: Z('sneaker', 'Blanco') },
  { id: 'cleanstreet-1', style: 'clean-streetwear', desc: 'Sudadera cruda amplia y lisa, pantalón amplio gris claro, zapatillas blancas y gorro', fit: 'amplio', structure: 'relajado', formality: 1, top: T('sweat', 'Crudo'), bottom: B('tailored', 'Gris claro', 'wide'), shoes: Z('sneaker', 'Blanco'), extras: ['beanie', 'clean-lines'] },
  { id: 'cleanstreet-2', style: 'clean-streetwear', desc: 'Camiseta pesada negra amplia, vaquero negro amplio y zapatillas blancas', fit: 'amplio', structure: 'relajado', formality: 1, top: T('tee', 'Negro'), bottom: B('jeans', 'Negro', 'wide'), shoes: Z('sneaker', 'Blanco'), extras: ['clean-lines'] },
  { id: 'cleancani-1', style: 'clean-cani', desc: 'Chándal negro conjuntado, camiseta blanca, zapatillas de running blancas, cadena y bandolera', fit: 'regular', structure: 'relajado', formality: 1, top: T('tee', 'Blanco'), outer: O('track', 'Negro'), bottom: B('jogger', 'Negro', 'slim'), shoes: Z('runner', 'Blanco'), extras: ['chain', 'crossbody'] },
  { id: 'cleancani-2', style: 'clean-cani', desc: 'Camiseta blanca ajustada, pantalón de chándal gris con raya, zapatillas de running negras, gorra y bandolera', fit: 'ajustado', structure: 'relajado', formality: 1, top: T('tee', 'Blanco'), bottom: B('jogger', 'Gris', 'slim'), shoes: Z('runner', 'Negro'), extras: ['cap', 'crossbody', 'stripe'] },
  { id: 'moderncani-1', style: 'modern-cani', desc: 'Plumífero negro corto, sudadera gris, pantalón de chándal gris, zapatillas de running negras y bandolera', fit: 'amplio', structure: 'relajado', formality: 1, top: T('hoodie', 'Gris'), outer: O('puffer', 'Negro'), bottom: B('jogger', 'Gris', 'slim'), shoes: Z('runner', 'Negro'), extras: ['crossbody'] },
  { id: 'moderncani-2', style: 'modern-cani', desc: 'Chaqueta técnica azul marino, cuello alto negro, jogger negro, zapatillas de running blancas, gorra y cadena', fit: 'regular', structure: 'relajado', formality: 1, top: T('turtle', 'Negro'), outer: O('track', 'Azul marino'), bottom: B('jogger', 'Negro', 'slim'), shoes: Z('runner', 'Blanco'), extras: ['cap', 'chain'] },
  { id: 'urbanmin-1', style: 'urban-minimalism', desc: 'Abrigo largo negro, camiseta negra, pantalón amplio negro y zapatillas negras', fit: 'amplio', structure: 'estructurado', formality: 2, top: T('tee', 'Negro'), outer: O('coat', 'Negro'), bottom: B('tailored', 'Negro', 'wide'), shoes: Z('sneaker', 'Negro'), extras: ['clean-lines'] },
  { id: 'urbanmin-2', style: 'urban-minimalism', desc: 'Camiseta pesada antracita amplia, pantalón amplio gris y botas negras', fit: 'amplio', structure: 'relajado', formality: 2, top: T('tee', 'Antracita'), bottom: B('tailored', 'Gris', 'wide'), shoes: Z('boot', 'Negro'), extras: ['clean-lines'] },
  { id: 'skate-1', style: 'skate-inspired', desc: 'Camisa de cuadros abierta, camiseta gráfica blanca, vaquero baggy claro, zapatillas de skate negras y gorro', fit: 'amplio', structure: 'relajado', formality: 1, top: T('graphic', 'Blanco'), outer: O('flannel', 'Rojo'), bottom: B('jeans', 'Denim claro', 'baggy'), shoes: Z('skate', 'Negro'), extras: ['beanie'] },
  { id: 'skate-2', style: 'skate-inspired', desc: 'Sudadera azul marino, cargo beige baggy, zapatillas de skate y gorra', fit: 'amplio', structure: 'relajado', formality: 1, top: T('hoodie', 'Azul marino'), bottom: B('cargo', 'Beige', 'baggy'), shoes: Z('skate', 'Negro'), extras: ['cap'] },
  { id: 'sporty-1', style: 'sporty-urban', desc: 'Chaqueta técnica negra, camiseta gris, jogger negro, zapatillas de running blancas y gorra', fit: 'regular', structure: 'relajado', formality: 1, top: T('tee', 'Gris'), outer: O('track', 'Negro'), bottom: B('jogger', 'Negro', 'slim'), shoes: Z('runner', 'Blanco'), extras: ['cap'] },
  { id: 'sporty-2', style: 'sporty-urban', desc: 'Sudadera gris y jogger gris con raya, zapatillas de running blancas', fit: 'regular', structure: 'relajado', formality: 1, top: T('sweat', 'Gris'), bottom: B('jogger', 'Gris', 'slim'), shoes: Z('runner', 'Blanco'), extras: ['stripe'] },
  { id: 'hiphop-1', style: 'hip-hop-inspired', desc: 'Camiseta blanca oversize, vaquero baggy azul, zapatillas chunky blancas, cadena y gorra', fit: 'amplio', structure: 'relajado', formality: 1, top: T('tee', 'Blanco'), bottom: B('jeans', 'Denim', 'baggy'), shoes: Z('chunky', 'Blanco'), extras: ['chain', 'cap'] },
  { id: 'hiphop-2', style: 'hip-hop-inspired', desc: 'Cazadora varsity burdeos, sudadera negra, vaquero baggy negro y zapatillas chunky blancas', fit: 'amplio', structure: 'relajado', formality: 1, top: T('hoodie', 'Negro'), outer: O('varsity', 'Burdeos'), bottom: B('jeans', 'Negro', 'baggy'), shoes: Z('chunky', 'Blanco') },
  { id: 'contcas-1', style: 'contemporary-casual', desc: 'Sobrecamisa beige, camiseta blanca, vaquero recto azul y zapatillas blancas', fit: 'regular', structure: 'relajado', formality: 2, top: T('tee', 'Blanco'), outer: O('overshirt', 'Beige'), bottom: B('jeans', 'Denim', 'straight'), shoes: Z('sneaker', 'Blanco') },
  { id: 'contcas-2', style: 'contemporary-casual', desc: 'Jersey azul marino, vaquero recto azul y zapatillas blancas', fit: 'regular', structure: 'relajado', formality: 2, top: T('knit', 'Azul marino'), bottom: B('jeans', 'Denim', 'straight'), shoes: Z('sneaker', 'Blanco') },
  // ── B · Minimalistas y modernos ──
  { id: 'mincont-1', style: 'minimalismo-contemporaneo', desc: 'Jersey fino negro, pantalón de sastrería gris recto y zapatos negros', fit: 'regular', structure: 'estructurado', formality: 3, top: T('knit', 'Negro'), bottom: B('tailored', 'Gris', 'straight'), shoes: Z('derby', 'Negro'), extras: ['clean-lines'] },
  { id: 'mincont-2', style: 'minimalismo-contemporaneo', desc: 'Abrigo gris claro, camiseta blanca, pantalón negro recto y zapatillas blancas', fit: 'regular', structure: 'estructurado', formality: 3, top: T('tee', 'Blanco'), outer: O('coat', 'Gris claro'), bottom: B('tailored', 'Negro', 'straight'), shoes: Z('sneaker', 'Blanco'), extras: ['clean-lines'] },
  { id: 'clean-1', style: 'clean-aesthetic', desc: 'Camiseta blanca, chino crudo recto y zapatillas blancas', fit: 'regular', structure: 'relajado', formality: 2, top: T('tee', 'Blanco'), bottom: B('chino', 'Crudo', 'straight'), shoes: Z('sneaker', 'Blanco'), extras: ['clean-lines'] },
  { id: 'clean-2', style: 'clean-aesthetic', desc: 'Camisa azul claro, chino beige y mocasines camel', fit: 'regular', structure: 'estructurado', formality: 3, top: T('shirt', 'Azul claro'), bottom: B('chino', 'Beige', 'straight'), shoes: Z('loafer', 'Camel'), extras: ['clean-lines'] },
  { id: 'basics-1', style: 'modern-basics', desc: 'Camiseta azul marino, chino beige recto y zapatillas blancas', fit: 'regular', structure: 'relajado', formality: 2, top: T('tee', 'Azul marino'), bottom: B('chino', 'Beige', 'straight'), shoes: Z('sneaker', 'Blanco') },
  { id: 'basics-2', style: 'modern-basics', desc: 'Sudadera gris, vaquero oscuro recto y zapatillas blancas', fit: 'regular', structure: 'relajado', formality: 1, top: T('sweat', 'Gris'), bottom: B('jeans', 'Denim', 'straight'), shoes: Z('sneaker', 'Blanco') },
  { id: 'essentials-1', style: 'contemporary-essentials', desc: 'Camiseta pesada beige amplia, pantalón amplio crudo y zapatillas blancas', fit: 'amplio', structure: 'relajado', formality: 2, top: T('tee', 'Beige'), bottom: B('tailored', 'Crudo', 'wide'), shoes: Z('sneaker', 'Blanco'), extras: ['clean-lines'] },
  { id: 'essentials-2', style: 'contemporary-essentials', desc: 'Abrigo camel, sudadera gris, pantalón amplio negro y zapatillas blancas', fit: 'amplio', structure: 'relajado', formality: 2, top: T('sweat', 'Gris'), outer: O('coat', 'Camel'), bottom: B('tailored', 'Negro', 'wide'), shoes: Z('sneaker', 'Blanco') },
  // ── C · Clasicos y sofisticados ──
  { id: 'quiet-1', style: 'quiet-luxury', desc: 'Polo de punto camel, pantalón de sastrería gris recto y mocasines marrones', fit: 'regular', structure: 'estructurado', formality: 4, top: T('polo', 'Camel'), bottom: B('tailored', 'Gris', 'straight'), shoes: Z('loafer', 'Marrón'), extras: ['clean-lines'] },
  { id: 'quiet-2', style: 'quiet-luxury', desc: 'Abrigo camel, cuello alto crudo, pantalón beige recto y zapatos marrones', fit: 'regular', structure: 'estructurado', formality: 4, top: T('turtle', 'Crudo'), outer: O('coat', 'Camel'), bottom: B('tailored', 'Beige', 'straight'), shoes: Z('derby', 'Marrón') },
  { id: 'smart-1', style: 'smart-casual', desc: 'Americana gris, camisa oxford azul claro, chino azul marino y zapatos marrones', fit: 'regular', structure: 'estructurado', formality: 4, top: T('shirt', 'Azul claro'), outer: O('blazer', 'Gris'), bottom: B('chino', 'Azul marino', 'straight'), shoes: Z('derby', 'Marrón') },
  { id: 'smart-2', style: 'smart-casual', desc: 'Jersey gris sobre camisa azul claro, chino azul marino y zapatos marrones', fit: 'regular', structure: 'estructurado', formality: 3, top: T('knit', 'Gris', 'Azul claro'), bottom: B('chino', 'Azul marino', 'straight'), shoes: Z('derby', 'Marrón') },
  { id: 'tailoring-1', style: 'casual-tailoring', desc: 'Americana beige desestructurada, camiseta blanca, pantalón de pinzas gris amplio y zapatillas blancas', fit: 'amplio', structure: 'relajado', formality: 3, top: T('tee', 'Blanco'), outer: O('blazer', 'Beige'), bottom: B('tailored', 'Gris', 'wide'), shoes: Z('sneaker', 'Blanco') },
  { id: 'tailoring-2', style: 'casual-tailoring', desc: 'Americana azul marino, camiseta negra, pantalón de pinzas antracita amplio y mocasines negros', fit: 'amplio', structure: 'relajado', formality: 3, top: T('tee', 'Negro'), outer: O('blazer', 'Azul marino'), bottom: B('tailored', 'Antracita', 'wide'), shoes: Z('loafer', 'Negro') },
  // ── D · Alternativos y de inspiracion editorial ──
  { id: 'vintage-1', style: 'vintage-contemporary', desc: 'Cazadora de cuero marrón, camiseta blanca, vaquero lavado recto y botas marrones', fit: 'regular', structure: 'relajado', formality: 2, top: T('tee', 'Blanco'), outer: O('leather', 'Marrón'), bottom: B('jeans', 'Denim claro', 'straight'), shoes: Z('boot', 'Marrón'), extras: ['vintage'] },
  { id: 'vintage-2', style: 'vintage-contemporary', desc: 'Camisa de cuadros marrón, chino camel recto y botas marrones', fit: 'regular', structure: 'relajado', formality: 2, top: T('flannel', 'Marrón'), bottom: B('chino', 'Camel', 'straight'), shoes: Z('boot', 'Marrón'), extras: ['vintage'] },
  { id: 'retro-1', style: 'retro-streetwear', desc: 'Cazadora varsity azul marino, camiseta gráfica blanca, vaquero amplio azul, zapatillas blancas y gorra', fit: 'amplio', structure: 'relajado', formality: 1, top: T('graphic', 'Blanco'), outer: O('varsity', 'Azul marino'), bottom: B('jeans', 'Denim', 'wide'), shoes: Z('sneaker', 'Blanco'), extras: ['cap', 'vintage'] },
  { id: 'retro-2', style: 'retro-streetwear', desc: 'Chaqueta de chándal retro burdeos, camiseta blanca, vaquero amplio claro y zapatillas blancas', fit: 'amplio', structure: 'relajado', formality: 1, top: T('tee', 'Blanco'), outer: O('track', 'Burdeos'), bottom: B('jeans', 'Denim claro', 'wide'), shoes: Z('sneaker', 'Blanco'), extras: ['vintage'] },
  { id: 'indie-1', style: 'indie-aesthetic', desc: 'Cazadora vaquera, camiseta negra ajustada, vaquero negro slim y botas negras', fit: 'ajustado', structure: 'relajado', formality: 2, top: T('tee', 'Negro'), outer: O('denimjk', 'Denim'), bottom: B('jeans', 'Negro', 'slim'), shoes: Z('boot', 'Negro') },
  { id: 'indie-2', style: 'indie-aesthetic', desc: 'Camisa de cuadros burdeos ajustada, vaquero slim azul y botas negras', fit: 'ajustado', structure: 'relajado', formality: 2, top: T('flannel', 'Burdeos'), bottom: B('jeans', 'Denim', 'slim'), shoes: Z('boot', 'Negro') },
  { id: 'grunge-1', style: 'grunge-moderno', desc: 'Cazadora de cuero negra sobre camisa de cuadros burdeos, vaquero negro recto, botas negras y cadena', fit: 'regular', structure: 'relajado', formality: 2, top: T('flannel', 'Burdeos'), outer: O('leather', 'Negro'), bottom: B('jeans', 'Negro', 'straight'), shoes: Z('boot', 'Negro'), extras: ['chain'] },
  { id: 'grunge-2', style: 'grunge-moderno', desc: 'Camisa de cuadros gris abierta, camiseta negra amplia, vaquero negro amplio y botas negras', fit: 'amplio', structure: 'relajado', formality: 1, top: T('tee', 'Negro'), outer: O('flannel', 'Antracita'), bottom: B('jeans', 'Negro', 'wide'), shoes: Z('boot', 'Negro') },
  { id: 'urbvint-1', style: 'urban-vintage', desc: 'Cazadora vaquera lavada, sudadera gris, vaquero amplio azul, zapatillas blancas y gorro', fit: 'amplio', structure: 'relajado', formality: 1, top: T('sweat', 'Gris'), outer: O('denimjk', 'Denim claro'), bottom: B('jeans', 'Denim', 'wide'), shoes: Z('sneaker', 'Blanco'), extras: ['beanie', 'vintage'] },
  { id: 'urbvint-2', style: 'urban-vintage', desc: 'Camiseta gráfica negra amplia, cargo marrón amplio y zapatillas crudas', fit: 'amplio', structure: 'relajado', formality: 1, top: T('graphic', 'Negro'), bottom: B('cargo', 'Marrón', 'wide'), shoes: Z('sneaker', 'Crudo'), extras: ['vintage'] },
  { id: 'editorial-1', style: 'editorial-casual', desc: 'Abrigo largo camel, cuello alto negro, pantalón amplio negro y mocasines negros', fit: 'amplio', structure: 'estructurado', formality: 3, top: T('turtle', 'Negro'), outer: O('coat', 'Camel'), bottom: B('tailored', 'Negro', 'wide'), shoes: Z('loafer', 'Negro') },
  { id: 'editorial-2', style: 'editorial-casual', desc: 'Cárdigan burdeos, camiseta blanca, pantalón amplio gris y zapatos marrones', fit: 'amplio', structure: 'relajado', formality: 3, top: T('tee', 'Blanco'), outer: O('cardigan', 'Burdeos'), bottom: B('tailored', 'Gris', 'wide'), shoes: Z('derby', 'Marrón') },
] as Spec[]).map(make)

export const outfitById = (id: string) => OUTFITS.find((o) => o.id === id)
export const outfitsOf = (styleId: string) => OUTFITS.filter((o) => o.style === styleId)
export const outfitStyleName = (o: Outfit) => STYLE_CATALOG.find((s) => s.id === o.style)?.name ?? o.style

// ── Ilustracion ────────────────────────────────────────────────────
function shade(c: string, k = 0.78) {
  const h = hex(c).replace('#', '')
  const n = [0, 2, 4].map((i) => Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * k)))
  return `#${n.map((x) => x.toString(16).padStart(2, '0')).join('')}`
}
/** Color base de cada relleno de patron (cuadros), para calcular el trazo. */
const PATTERN_BASE = new Map<string, string>()
const poly = (pts: number[][], fill: string, extra = '') => `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${fill}" stroke="${shade(PATTERN_BASE.get(fill) ?? fill, 0.7)}" stroke-width="0.8" stroke-linejoin="round"${extra}/>`
const line = (x1: number, y1: number, x2: number, y2: number, c: string, w = 0.8, dash = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const flip = (x: number, dir: number) => (dir < 0 ? ` transform="translate(${2 * x},0) scale(-1,1)"` : '')

/** Figura plana del conjunto en SVG (viewBox 160x300). Contenido estatico del catalogo. */
export function outfitSvg(o: Outfit): string {
  const parts: string[] = []
  const defs: string[] = []
  const C = 80
  const w = o.fit === 'ajustado' ? 28 : o.fit === 'amplio' ? 38 : 32
  const check = (color: string, key: string) => {
    const id = `chk-${o.id}-${key}`
    defs.push(`<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${hex(color)}"/><rect width="4" height="8" fill="${shade(color, 0.72)}" opacity=".55"/><rect width="8" height="4" fill="${shade(color, 0.72)}" opacity=".45"/><line x1="0" y1="6" x2="8" y2="6" stroke="${hex('Crudo')}" stroke-width=".5" opacity=".5"/></pattern>`)
    PATTERN_BASE.set(`url(#${id})`, hex(color))
    return `url(#${id})`
  }
  const top = o.top.kind === 'flannel' ? check(o.top.color, 'top') : hex(o.top.color)
  const topBase = hex(o.top.color)
  const hem = o.top.kind === 'hoodie' ? 156 : 150
  const long = !['tee', 'graphic', 'polo'].includes(o.top.kind)

  // Pantalon (debajo de todo)
  const b = o.bottom, bc = hex(b.color)
  const jog = b.kind === 'jogger'
  const hw = jog ? 9 : b.leg === 'slim' ? 10 : b.leg === 'wide' ? 19 : b.leg === 'baggy' ? 23 : 13
  const hemY = jog ? 266 : 272
  parts.push(poly([[C - 29, 146], [C + 1, 146], [C, 178], [64 + hw, hemY], [64 - hw, hemY]], bc), poly([[C - 1, 146], [C + 29, 146], [96 + hw, hemY], [96 - hw, hemY], [C, 178]], bc), line(C - 29, 152, C + 29, 152, shade(bc, 0.6)))
  if (b.kind === 'jeans') parts.push(`<path d="M${C - 25} 156 q8 8 16 0 M${C + 25} 156 q-8 8 -16 0" fill="none" stroke="${hex('Camel')}" stroke-width="0.8" stroke-dasharray="2 1.5"/>`, line(64, 160, 64, 270, hex('Camel'), 0.5, '2 1.5'), line(96, 160, 96, 270, hex('Camel'), 0.5, '2 1.5'))
  if (b.kind === 'tailored') parts.push(line(64, 158, 64, 270, shade(bc, 0.68), 0.7), line(96, 158, 96, 270, shade(bc, 0.68), 0.7))
  if (b.kind === 'chino') parts.push(line(C - 26, 154, C - 20, 168, shade(bc, 0.65)), line(C + 26, 154, C + 20, 168, shade(bc, 0.65)))
  if (b.kind === 'cargo') parts.push(`<rect x="${64 - hw - 2}" y="196" width="12" height="16" fill="${shade(bc, 0.88)}" stroke="${shade(bc, 0.65)}" stroke-width="0.8"/>`, `<rect x="${96 + hw - 10}" y="196" width="12" height="16" fill="${shade(bc, 0.88)}" stroke="${shade(bc, 0.65)}" stroke-width="0.8"/>`)
  if (jog) parts.push(`<rect x="${64 - hw}" y="${hemY - 6}" width="${2 * hw}" height="6" fill="${shade(bc, 0.85)}" stroke="${shade(bc, 0.6)}" stroke-width="0.6"/>`, `<rect x="${96 - hw}" y="${hemY - 6}" width="${2 * hw}" height="6" fill="${shade(bc, 0.85)}" stroke="${shade(bc, 0.6)}" stroke-width="0.6"/>`)
  if (jog && (o.extras ?? []).includes('stripe')) parts.push(line(C - 28, 150, 64 - hw + 1, hemY - 6, hex('Blanco'), 2), line(C + 28, 150, 96 + hw - 1, hemY - 6, hex('Blanco'), 2))
  if (b.leg === 'baggy') parts.push(`<path d="M${64 - hw + 3} 262 q${hw - 3} 4 ${2 * hw - 6} 0 M${96 - hw + 3} 262 q${hw - 3} 4 ${2 * hw - 6} 0" fill="none" stroke="${shade(bc, 0.65)}" stroke-width="0.8"/>`)

  // Calzado
  const s = o.shoes, sc = hex(s.color)
  for (const x of [64, 96]) {
    const dir = x < C ? -1 : 1
    const y0 = jog ? 264 : 270
    if (s.kind === 'boot') parts.push(`<path d="M${x - 11} ${y0 - 12} h22 v18 q8 0 8 6 v4 h-30 z" fill="${sc}" stroke="${shade(sc, 0.6)}" stroke-width="0.8"${flip(x, dir)}/>`)
    else {
      const h = s.kind === 'loafer' || s.kind === 'derby' ? 0 : 1
      parts.push(`<path d="M${x - 12} ${y0} h20 q10 2 10 10 v3 h-30 z" fill="${sc}" stroke="${shade(sc, 0.6)}" stroke-width="0.8"${flip(x, dir)}/>`)
      if (h) {
        const sole = s.kind === 'chunky' ? 8 : s.kind === 'skate' ? 5 : 4
        parts.push(`<rect x="${x - 13}" y="${y0 + 11}" width="31" height="${sole}" rx="1" fill="${s.kind === 'runner' ? hex('Gris claro') : hex('Crudo')}" stroke="${shade(hex('Crudo'), 0.7)}" stroke-width="0.6"${flip(x, dir)}/>`)
      }
      if (s.kind === 'runner') parts.push(line(x - 6 * dir, y0 + 6, x + 4 * dir, y0 + 2, hex('Gris'), 1.4))
      if (s.kind === 'chunky') parts.push(`<path d="M${x - 10} ${y0 + 15} q6 -3 12 0 t12 0" fill="none" stroke="${shade(hex('Crudo'), 0.6)}" stroke-width="0.8"${flip(x, dir)}/>`)
      if (s.kind === 'skate') parts.push(line(x - 2 * dir, y0 + 1, x - 2 * dir, y0 + 10, shade(sc, 0.5), 0.8))
      if (s.kind === 'derby') parts.push(`<circle cx="${x}" cy="${y0 + 3}" r="0.9" fill="${shade(sc, 0.5)}"/><circle cx="${x + 3 * dir}" cy="${y0 + 3.5}" r="0.9" fill="${shade(sc, 0.5)}"/>`)
    }
  }

  // Parte de arriba
  const sleeve = (side: -1 | 1) => {
    const x0 = C + side * w
    return long ? poly([[x0, 38], [x0 + side * 13, 41], [x0 + side * 20, 124], [x0 + side * 10, 126], [x0, 74]], top)
      : poly([[x0, 38], [x0 + side * 13, 42], [x0 + side * 17, 72], [x0 + side * 5, 74], [x0, 60]], top)
  }
  parts.push(sleeve(-1), sleeve(1))
  if (o.top.kind === 'hoodie') parts.push(`<path d="M${C - 18} 34 q18 -26 36 0 z" fill="${shade(topBase, 0.85)}" stroke="${shade(topBase, 0.6)}" stroke-width="0.8"/>`)
  parts.push(poly([[C - 11, 30], [C - w, 38], [C - w + 2, hem], [C + w - 2, hem], [C + w, 38], [C + 11, 30]], top))
  if (o.top.kind === 'tee' || o.top.kind === 'graphic') parts.push(`<path d="M${C - 10} 30 q10 9 20 0" fill="none" stroke="${shade(topBase, 0.6)}" stroke-width="1.2"/>`)
  if (o.top.kind === 'graphic') parts.push(`<rect x="${C - 13}" y="58" width="26" height="22" rx="2" fill="${lightness(o.top.color) > 0.5 ? hex('Rojo') : hex('Crudo')}" opacity=".85"/><circle cx="${C}" cy="69" r="6" fill="${lightness(o.top.color) > 0.5 ? hex('Mostaza') : hex('Rojo')}"/>`)
  if (o.top.kind === 'knit' || o.top.kind === 'sweat') parts.push(`<path d="M${C - 10} 30 q10 10 20 0" fill="none" stroke="${shade(topBase, 0.65)}" stroke-width="2.4"/>`, `<rect x="${C - w + 2}" y="${hem - 7}" width="${2 * w - 4}" height="7" fill="${shade(topBase, 0.9)}" stroke="${shade(topBase, 0.65)}" stroke-width="0.6"/>`)
  if (o.top.kind === 'turtle') parts.push(`<rect x="${C - 11}" y="20" width="22" height="13" rx="3" fill="${shade(topBase, 0.92)}" stroke="${shade(topBase, 0.65)}" stroke-width="0.8"/>`, `<rect x="${C - w + 2}" y="${hem - 7}" width="${2 * w - 4}" height="7" fill="${shade(topBase, 0.9)}" stroke="${shade(topBase, 0.65)}" stroke-width="0.6"/>`)
  if (o.top.kind === 'shirt' || o.top.kind === 'flannel' || o.top.collar) {
    const cc = hex(o.top.collar ?? o.top.color)
    parts.push(poly([[C - 11, 29], [C, 40], [C - 3, 46], [C - 13, 34]], cc), poly([[C + 11, 29], [C, 40], [C + 3, 46], [C + 13, 34]], cc))
    if (o.top.kind === 'shirt' || o.top.kind === 'flannel') parts.push(line(C, 40, C, hem, shade(topBase, 0.6)), ...[60, 85, 110, 135].map((y) => `<circle cx="${C + 2}" cy="${y}" r="0.9" fill="${shade(topBase, 0.5)}"/>`))
  }
  if (o.top.kind === 'polo') parts.push(poly([[C - 11, 29], [C, 36], [C - 4, 42], [C - 13, 34]], topBase), poly([[C + 11, 29], [C, 36], [C + 4, 42], [C + 13, 34]], topBase), line(C, 36, C, 56, shade(topBase, 0.65)), `<circle cx="${C + 2}" cy="44" r="0.9" fill="${shade(topBase, 0.5)}"/><circle cx="${C + 2}" cy="51" r="0.9" fill="${shade(topBase, 0.5)}"/>`)
  if (o.top.kind === 'hoodie') parts.push(`<path d="M${C - 20} 112 h40 l4 26 h-48 z" fill="${shade(topBase, 0.92)}" stroke="${shade(topBase, 0.65)}" stroke-width="0.8"/>`, line(C - 4, 34, C - 5, 60, hex('Gris claro'), 1), line(C + 4, 34, C + 5, 60, hex('Gris claro'), 1))

  // Capa exterior
  if (o.outer) {
    const k = o.outer.kind
    const oc = k === 'flannel' ? check(o.outer.color, 'outer') : hex(o.outer.color)
    const ob = hex(o.outer.color), ow = w + 4
    const ohem = k === 'coat' ? 228 : k === 'blazer' ? 166 : ['bomber', 'puffer', 'leather', 'varsity', 'track', 'denimjk'].includes(k) ? 150 : 158
    const open = k === 'track' ? 0 : ['bomber', 'puffer', 'varsity'].includes(k) ? 4 : ['overshirt', 'flannel', 'cardigan', 'denimjk', 'leather'].includes(k) ? 6 : 2
    const sleeveFill = k === 'varsity' ? hex('Crudo') : oc
    for (const side of [-1, 1] as const) {
      const x0 = C + side * ow
      parts.push(poly([[x0, 37], [x0 + side * 14, 40], [x0 + side * 21, 128], [x0 + side * 10, 130], [x0, 76]], sleeveFill))
      if (k === 'track') parts.push(line(x0 + side * 9, 41, x0 + side * 16, 127, hex('Blanco'), 1.6))
      if (k === 'puffer') for (const y of [60, 88, 116]) parts.push(line(x0 + side * 3, y, x0 + side * 15, y + 2, shade(ob, 0.6), 0.8))
      const lapelY = k === 'blazer' || k === 'coat' ? 92 : 40
      parts.push(poly([[C + side * 12, 28], [x0, 37], [x0 - side * 1, ohem], [C + side * open, ohem], [C + side * open, lapelY], [C + side * 9, 34]], oc))
      if (k === 'blazer' || k === 'coat') parts.push(poly([[C + side * 12, 28], [C + side * 20, 48], [C + side * 13, 52], [C + side * open, lapelY], [C + side * 9, 34]], shade(ob, 0.9)))
      if (k === 'leather') parts.push(poly([[C + side * 12, 28], [C + side * 22, 44], [C + side * 12, 50], [C + side * 9, 34]], shade(ob, 0.85)), line(C + side * (ow - 8), 70, C + side * (ow - 18), 96, shade(ob, 0.5), 1))
      if (k === 'overshirt' || k === 'flannel' || k === 'denimjk') parts.push(poly([[C + side * 12, 28], [C + side * 18, 40], [C + side * 8, 44], [C + side * 9, 34]], k === 'flannel' ? shade(ob, 0.9) : shade(ob, 0.9)), `<rect x="${side < 0 ? C - ow + 6 : C + ow - 20}" y="62" width="14" height="14" fill="${shade(ob, 0.93)}" stroke="${shade(ob, 0.65)}" stroke-width="0.7"/>`)
      if (k === 'denimjk') parts.push(line(side < 0 ? C - ow + 1 : C + 6, 90, side < 0 ? C - 6 : C + ow - 1, 90, hex('Camel'), 0.6, '2 1.5'))
      if (['bomber', 'puffer', 'varsity', 'track', 'denimjk', 'leather'].includes(k)) parts.push(`<rect x="${side < 0 ? C - ow : C + open}" y="${ohem - 8}" width="${ow - open}" height="8" fill="${shade(ob, 0.85)}" stroke="${shade(ob, 0.6)}" stroke-width="0.6"/>`)
      if (k === 'puffer') for (const y of [62, 90, 118]) parts.push(line(side < 0 ? C - ow + 1 : C + open, y, side < 0 ? C - open : C + ow - 1, y, shade(ob, 0.6), 0.8))
      if (k === 'cardigan') parts.push(`<rect x="${side < 0 ? C - ow + 1 : C + open}" y="${ohem - 7}" width="${ow - open - 1}" height="7" fill="${shade(ob, 0.88)}" stroke="${shade(ob, 0.6)}" stroke-width="0.6"/>`)
      if (k === 'blazer' || k === 'coat') parts.push(line(side < 0 ? C - ow + 6 : C + ow - 20, 128, side < 0 ? C - ow + 20 : C + ow - 6, 128, shade(ob, 0.6), 1))
    }
    if (k === 'puffer') parts.push(`<rect x="${C - 13}" y="24" width="26" height="12" rx="4" fill="${shade(ob, 0.9)}" stroke="${shade(ob, 0.6)}" stroke-width="0.8"/>`)
    if (k === 'track') parts.push(line(C, 30, C, ohem, shade(ob, 0.45), 1.2), `<rect x="${C - 11}" y="25" width="22" height="7" rx="2" fill="${shade(ob, 0.9)}" stroke="${shade(ob, 0.6)}" stroke-width="0.6"/>`)
    if (k === 'varsity') parts.push(`<rect x="${C - 12}" y="26" width="24" height="6" rx="2" fill="${shade(ob, 0.8)}"/>`)
    if (k === 'cardigan') for (const y of [70, 92, 114, 136]) parts.push(`<circle cx="${C - 3}" cy="${y}" r="1.3" fill="${shade(ob, 0.5)}"/>`)
    if (k === 'blazer') parts.push(`<circle cx="${C - 4}" cy="112" r="1.4" fill="${shade(ob, 0.55)}"/>`)
    if (k === 'coat') parts.push(`<circle cx="${C - 5}" cy="112" r="1.6" fill="${shade(ob, 0.55)}"/><circle cx="${C - 5}" cy="140" r="1.6" fill="${shade(ob, 0.55)}"/>`)
  }

  // Complementos
  const ex = o.extras ?? []
  if (ex.includes('chain')) parts.push(`<path d="M${C - 10} 31 q10 18 20 0" fill="none" stroke="#C9A64B" stroke-width="1.4" stroke-dasharray="1.6 1"/>`)
  if (ex.includes('crossbody')) parts.push(line(C - 20, 34, C + 22, 118, hex('Negro'), 2), `<rect x="${C + 14}" y="112" width="20" height="14" rx="3" fill="${hex('Negro')}" stroke="${hex('Antracita')}" stroke-width="0.8"/>`)
  let ix = 150
  if (ex.includes('cap')) { parts.push(`<path d="M${ix - 18} 18 q8 -12 16 0 z M${ix - 4} 18 h6" fill="${hex('Negro')}" stroke="${hex('Negro')}" stroke-width="1.6" stroke-linecap="round"/>`); ix -= 24 }
  if (ex.includes('beanie')) { parts.push(`<path d="M${ix - 16} 20 q8 -16 16 0 z" fill="${hex('Antracita')}"/><rect x="${ix - 17}" y="18" width="18" height="4" fill="${hex('Gris')}"/>`); ix -= 24 }
  if (ex.includes('sunglasses')) parts.push(`<rect x="${ix - 20}" y="12" width="8" height="5" rx="2" fill="${hex('Negro')}"/><rect x="${ix - 10}" y="12" width="8" height="5" rx="2" fill="${hex('Negro')}"/>${line(ix - 12, 14, ix - 10, 14, hex('Negro'), 1)}`)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300" role="img" aria-label="${esc(o.desc)}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${parts.join('')}</svg>`
}
