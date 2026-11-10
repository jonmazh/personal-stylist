import { GARMENT_COLORS, SUBS } from '@/lib/wardrobe/taxonomy'
import type { Availability, FieldOrigin, SourceKind } from './taxonomy'

/**
 * Normalización: cualquier fuente (feed, buscador, página, tus datos) se convierte en el mismo producto, con la taxonomía
 * del armario y la procedencia de cada campo. NUNCA se inventan atributos: lo que no aparece queda vacío
 * (p. ej. sin composición publicada → «composición desconocida»).
 */
export interface RawProduct {
  name?: string | null; brand?: string | null; url?: string | null; external_id?: string | null; description?: string | null
  category_text?: string | null; color?: string | null; material?: string | null; price?: unknown; currency?: string | null
  availability?: string | null; images?: string[]; variants?: RawVariant[]; retailer_name?: string | null
  /** Género y edad declarados por la fuente (p. ej. columnas gender / age_group de un feed): datos, no deducciones */
  gender?: string | null; age?: string | null
}
export interface RawVariant { size?: string | null; color?: string | null; sku?: string | null; availability?: string | null; price?: unknown }
export interface Variant { size: string | null; color: string | null; sku: string | null; availability: Availability; price: number | null }
export interface FieldSource { source: FieldOrigin; at: string }
export interface NormalizedProduct {
  cut?: string | null; silhouette?: string | null
  product_name: string; brand: string | null; product_url: string | null; canonical_url: string | null; external_product_id: string | null
  description: string | null; category: string | null; subcategory: string | null; primary_color: string | null; colors: string[]
  confirmed_composition: string | null; current_price: number | null; currency: string; availability_status: Availability
  images: { url: string; origin: 'store'; permission: 'link_only' }[]; variants: Variant[]; field_sources: Record<string, FieldSource>
  source_kind: SourceKind; raw_attributes: Record<string, unknown>
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const clean = (s: unknown, max = 200) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) || null : null)

// ── Tipo de prenda: palabras en español e inglés → subcategoría del armario (la primera que aparezca en el texto) ──
const KIND_WORDS: [string, string[]][] = [
  ['suit', ['traje', 'suit']], ['tuxedo', ['esmoquin', 'tuxedo']], ['blazer', ['blazer', 'americana']], ['waistcoat', ['chaleco de traje', 'waistcoat']],
  ['overshirt', ['sobrecamisa', 'overshirt', 'shacket']], ['denim_jacket', ['cazadora vaquera', 'chaqueta vaquera', 'denim jacket', 'trucker']],
  ['leather_jacket', ['cazadora de piel', 'chaqueta de piel', 'cazadora de cuero', 'leather jacket']], ['bomber', ['bomber']],
  ['trench', ['gabardina', 'trench']], ['parka', ['parka']], ['puffer', ['plumifero', 'acolchada', 'puffer', 'down jacket']],
  ['gilet', ['chaleco acolchado', 'gilet', 'vest']], ['coat', ['abrigo', 'coat', 'overcoat', 'chaqueton']],
  ['jacket', ['cazadora', 'chaqueta', 'jacket']],
  ['hoodie', ['sudadera con capucha', 'hoodie']], ['sweatshirt', ['sudadera', 'sweatshirt']], ['cardigan', ['cardigan', 'rebeca']],
  ['turtleneck', ['cuello alto', 'turtleneck', 'roll neck']], ['knit', ['jersey', 'punto', 'sweater', 'jumper', 'knit', 'pullover']],
  ['polo', ['polo']], ['shirt', ['camisa', 'shirt', 'oxford']], ['tank', ['camiseta sin mangas', 'tank top']], ['tee', ['camiseta', 't-shirt', 'tee']],
  ['jeans', ['vaquero', 'vaqueros', 'jeans', 'denim']], ['chinos', ['chino', 'chinos']], ['cargo', ['cargo']], ['joggers', ['pantalon chandal', 'jogger', 'chandal', 'sweatpants', 'sweatpant', 'track pants', 'trackpants', 'jogging']],
  ['shorts', ['bermuda', 'shorts', 'pantalon corto']], ['trousers', ['pantalon', 'trousers', 'pants']],
  ['loafers', ['mocasin', 'mocasines', 'loafer']], ['boots', ['bota', 'botas', 'botin', 'boots', 'chelsea']], ['sneakers', ['zapatilla', 'zapatillas', 'sneaker', 'trainers', 'deportiva']],
  ['derby', ['blucher', 'derby', 'oxford shoe', 'zapato', 'zapatos', 'shoes']], ['sandals', ['sandalia', 'sandals']],
  ['belt', ['cinturon', 'belt']], ['watch', ['reloj', 'watch']], ['glasses', ['gafas', 'sunglasses']], ['scarf', ['bufanda', 'scarf']],
  ['bag', ['bolso', 'mochila', 'bandolera', 'bag', 'backpack']], ['headwear', ['gorra', 'gorro', 'sombrero', 'cap', 'beanie', 'hat']], ['tie', ['corbata', 'tie']],
  ['socks', ['calcetin', 'calcetines', 'socks']], ['underwear', ['calzoncillo', 'boxer', 'slip', 'underwear']], ['pajamas', ['pijama', 'pyjama']],
]
const wordRe = (w: string) => new RegExp(`(^|[^a-z])${w.replace(/[-]/g, '[- ]?')}(e?s)?([^a-z]|$)`)
const KIND_RES = KIND_WORDS.map(([sub, ws]) => [sub, ws.map(wordRe)] as const)

/** Tipo de prenda a partir del nombre (prioritario) y de la categoría de la tienda. */
export function detectKind(name?: string | null, categoryText?: string | null) {
  for (const text of [name, categoryText]) {
    if (!text) continue
    const t = strip(text)
    let best: { sub: string; pos: number } | null = null
    for (const [sub, res] of KIND_RES) for (const re of res) { const m = re.exec(t); if (m && (!best || m.index < best.pos)) best = { sub, pos: m.index } }
    if (best) { const s = SUBS.find((x) => x.id === best!.sub)!; return { category: s.group, subcategory: s.id } }
  }
  return { category: null, subcategory: null }
}

// ── Colores ──
const COLOR_WORDS: [string, string[]][] = [
  ['Azul marino', ['azul marino', 'marino', 'navy']], ['Azul claro', ['azul claro', 'celeste', 'light blue', 'sky blue']], ['Denim claro', ['denim claro', 'light denim', 'light wash']],
  ['Denim', ['denim', 'indigo', 'azul vaquero']], ['Gris claro', ['gris claro', 'light grey', 'light gray', 'gris perla']], ['Antracita', ['antracita', 'charcoal', 'gris oscuro', 'dark grey']],
  ['Gris', ['gris', 'grey', 'gray', 'jaspeado']], ['Negro', ['negro', 'black']], ['Blanco', ['blanco', 'white']], ['Crudo', ['crudo', 'ecru', 'off-white', 'hueso', 'cream', 'crema']],
  ['Beige', ['beige', 'arena', 'sand', 'piedra', 'stone', 'tostado']], ['Camel', ['camel', 'cognac', 'coñac', 'tan']], ['Marrón', ['marron', 'brown', 'chocolate', 'tabaco', 'cuero']],
  ['Caqui', ['caqui', 'khaki']], ['Oliva', ['oliva', 'olive']], ['Verde bosque', ['verde botella', 'verde bosque', 'bottle green', 'forest green', 'verde oscuro']],
  ['Burdeos', ['burdeos', 'granate', 'burgundy', 'wine', 'maroon']], ['Rojo', ['rojo', 'red']], ['Rosa', ['rosa', 'pink']], ['Lila', ['lila', 'malva', 'lilac', 'purple']],
  ['Mostaza', ['mostaza', 'mustard']], ['Amarillo', ['amarillo', 'yellow']], ['Naranja', ['naranja', 'orange']], ['Verde', ['verde', 'green']],
  ['Multicolor', ['multicolor', 'estampado multicolor']],
]
const COLOR_RES = COLOR_WORDS.filter(([c]) => GARMENT_COLORS.includes(c)).map(([c, ws]) => [c, ws.map((w) => new RegExp(`(^|[^a-z])${strip(w)}([^a-z]|$)`))] as const)
/** Colores del texto en el orden en que aparecen (los compuestos ganan a los simples: «azul marino» no es también «azul»). */
export function detectColors(text?: string | null): string[] {
  if (!text) return []
  let t = strip(text)
  const found: { c: string; pos: number }[] = []
  for (const [c, res] of COLOR_RES) for (const re of res) { const m = re.exec(t); if (m) { found.push({ c, pos: m.index }); t = t.slice(0, m.index) + ' '.repeat(m[0].length) + t.slice(m.index + m[0].length); break } }
  return [...new Set(found.sort((a, z) => a.pos - z.pos).map((x) => x.c))].slice(0, 4)
}

// ── Corte y silueta: solo si la tienda los dice en el nombre o la descripción (procedencia «Deducido») ──
const CUT_WORDS: [string, RegExp][] = [
  ['Recto', /(^|[^a-z])(recto|recta|straight|regular fit)([^a-z]|$)/], ['Slim', /(^|[^a-z])(slim|pitillo|skinny|ajustado)([^a-z]|$)/],
  ['Tapered', /(^|[^a-z])(tapered|carrot|zanahoria)([^a-z]|$)/], ['Wide', /(^|[^a-z])(wide|ancho|amplio|baggy|barrel|loose|palazzo)([^a-z]|$)/],
]
const SIL_WORDS: [string, RegExp][] = [['Amplia', /(^|[^a-z])(oversize|oversized|relaxed|boxy|holgad[ao])([^a-z]|$)/], ['Ajustada', /(^|[^a-z])(slim fit|entallad[ao]|muscle fit)([^a-z]|$)/], ['Regular', /(^|[^a-z])(regular fit|corte regular)([^a-z]|$)/]]
export function detectCut(name?: string | null, description?: string | null, category?: string | null) {
  const t = strip(`${name ?? ''} ${description ?? ''}`)
  const cut = category === 'bottom' ? CUT_WORDS.find(([, re]) => re.test(strip(name ?? '')))?.[0] ?? CUT_WORDS.find(([, re]) => re.test(t))?.[0] ?? null : null
  const silhouette = category && ['top', 'outerwear', 'tailoring'].includes(category) ? SIL_WORDS.find(([, re]) => re.test(t))?.[0] ?? null : null
  return { cut, silhouette }
}

// ── Precio, moneda, disponibilidad, composición ──
/** «49,95 €», «EUR 1.299,00», «59.99», 59.99 → número; si no se entiende, null. */
export function parsePrice(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null
  if (typeof v !== 'string') return null
  const m = v.replace(/\s/g, '').match(/\d[\d.,]*/)
  if (!m) return null
  let n = m[0]
  const lastSep = Math.max(n.lastIndexOf(','), n.lastIndexOf('.'))
  if (lastSep >= 0 && n.length - lastSep - 1 === 2) n = n.slice(0, lastSep).replace(/[.,]/g, '') + '.' + n.slice(lastSep + 1)
  else n = n.replace(/[.,]/g, '')
  const x = Number(n)
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : null
}
export function parseCurrency(...vs: unknown[]): string | null {
  for (const v of vs) {
    if (typeof v !== 'string') continue
    const t = v.toUpperCase()
    const iso = t.match(/\b(EUR|USD|GBP|CHF|SEK|DKK|NOK|PLN)\b/); if (iso) return iso[1]
    if (t.includes('€')) return 'EUR'; if (t.includes('£')) return 'GBP'; if (t.includes('$')) return 'USD'
  }
  return null
}
export function mapAvailability(v?: string | null): Availability {
  const t = strip(String(v ?? '')).replace(/^https?:\/\/schema\.org\//, '')
  if (/^(instock|in stock|in_stock|disponible|available)$/.test(t)) return 'in_stock'
  if (/limitedavailability|limited|pocas unidades|ultimas unidades/.test(t)) return 'limited'
  if (/outofstock|out of stock|out_of_stock|soldout|sold out|agotado|discontinued/.test(t)) return 'out_of_stock'
  if (/preorder|backorder|reserva/.test(t)) return 'preorder'
  return 'unknown'
}
const FIBERS = 'algodon|cotton|lana|wool|lino|linen|seda|silk|poliester|polyester|poliamida|polyamide|nylon|elastano|elastane|spandex|viscosa|viscose|lyocell|tencel|cachemir|cashmere|modal|acrilico|acrylic|piel|leather|cuero|ante|suede|alpaca|mohair|merino'
/** Composición SOLO si la tienda la publica con porcentajes («98% algodón 2% elastano»). Sin porcentajes no se da por confirmada. */
export function parseComposition(text?: string | null): string | null {
  if (!text) return null
  const re = new RegExp(`(\\d{1,3}(?:[.,]\\d+)?)\\s?%\\s*(${FIBERS})`, 'gi')
  const parts = [...strip(text).matchAll(re)].map((m) => `${m[1].replace(',', '.')} % ${m[2]}`)
  const uniq = [...new Set(parts)]
  if (!uniq.length) return null
  const total = uniq.reduce((s, p) => s + Number(p.split(' ')[0]), 0)
  return total > 0 && total <= 101 ? uniq.join(', ') : uniq.slice(0, 6).join(', ')
}

// ── URLs ──
const TRACKING = /^(utm_|gclid$|fbclid$|mc_|ref$|_ga$|srsltid$|cid$|awc$|aff)/i
export function canonicalUrl(u?: string | null): string | null {
  if (!u) return null
  try {
    const url = new URL(u)
    if (!/^https?:$/.test(url.protocol)) return null
    url.hash = ''; url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k)
    url.searchParams.sort()
    let s = url.toString(); if (s.endsWith('/') && url.pathname !== '/') s = s.slice(0, -1)
    return s
  } catch { return null }
}
export const hostOf = (u?: string | null) => { try { return new URL(String(u)).hostname.toLowerCase().replace(/^www\./, '') } catch { return null } }
/** Tienda de una URL por sus dominios (también subdominios: «shop.cos.com» → COS). */
export function retailerForUrl<T extends { domains: readonly string[] }>(u: string | null | undefined, retailers: readonly T[]): T | null {
  const h = hostOf(u); if (!h) return null
  return retailers.find((r) => r.domains.some((d) => h === d || h.endsWith('.' + d))) ?? null
}

/** Producto normalizado con la procedencia de cada campo (origin = de dónde vienen los datos «crudos»). */
export function normalizeProduct(raw: RawProduct, kind: SourceKind, origin: FieldOrigin, now = new Date()): NormalizedProduct | null {
  const name = clean(raw.name)
  if (!name) return null
  const at = now.toISOString()
  const fs: Record<string, FieldSource> = {}
  const set = <T>(field: string, v: T, src: FieldOrigin = origin): T => { if (v != null && !(Array.isArray(v) && !v.length)) fs[field] = { source: src, at }; return v }
  const description = set('description', clean(raw.description, 4000))
  const kindOf = detectKind(name, raw.category_text)
  const colorsDeclared = detectColors(raw.color)
  const colors = colorsDeclared.length ? colorsDeclared : detectColors(name)
  const colorSrc: FieldOrigin = colorsDeclared.length ? origin : 'derived'
  const composition = parseComposition(raw.material) ?? parseComposition(description)
  const price = parsePrice(raw.price)
  const variants: Variant[] = (raw.variants ?? []).slice(0, 60).map((v) => ({ size: clean(v.size, 30), color: clean(v.color, 40), sku: clean(v.sku, 80), availability: mapAvailability(v.availability), price: parsePrice(v.price) }))
  const url = typeof raw.url === 'string' && /^https?:\/\//.test(raw.url) ? raw.url.slice(0, 1000) : null
  const p: NormalizedProduct = {
    product_name: set('product_name', name), brand: set('brand', clean(raw.brand, 80) ?? clean(raw.retailer_name, 80)), product_url: set('product_url', url), canonical_url: canonicalUrl(url),
    external_product_id: clean(raw.external_id, 120), description,
    category: set('category', kindOf.category, 'derived'), subcategory: set('subcategory', kindOf.subcategory, 'derived'),
    primary_color: set('primary_color', colors[0] ?? null, colorSrc), colors,
    confirmed_composition: set('confirmed_composition', composition), current_price: set('current_price', price),
    currency: parseCurrency(raw.currency, typeof raw.price === 'string' ? raw.price : null) ?? 'EUR',
    availability_status: set('availability_status', mapAvailability(raw.availability)),
    images: (raw.images ?? []).filter((x) => typeof x === 'string' && /^https?:\/\//.test(x)).slice(0, 8).map((u2) => ({ url: u2, origin: 'store' as const, permission: 'link_only' as const })),
    variants, field_sources: fs, source_kind: kind, raw_attributes: { ...(raw.gender ? { gender: String(raw.gender).toLowerCase().slice(0, 20) } : {}), ...(raw.age ? { age: String(raw.age).toLowerCase().slice(0, 20) } : {}) },
  }
  const shape = detectCut(name, description, kindOf.category)
  if (shape.cut) { p.cut = shape.cut; fs.cut = { source: 'derived', at } }
  if (shape.silhouette) { p.silhouette = shape.silhouette; fs.silhouette = { source: 'derived', at } }
  if (p.availability_status === 'unknown') delete fs.availability_status
  return p
}
