import type { ProductSearchQuery } from '@/lib/shopping/catalog/query'
import type { Target } from './strategy'

/**
 * Personal Shopper 2.0 · 2.0E — Market Discovery desde oportunidades.
 * Una oportunidad (no una categoría) se traduce en varias consultas COMPLEMENTARIAS («facetas»): la propuesta base, una
 * variante con otro vocabulario, los colores que te favorecen y el material, sin repetir consultas. Después cada
 * producto se comprueba contra la oportunidad (¿la materializa?) y la selección se diversifica por marca.
 * El presupuesto de Channel3 por estrategia es de 25 créditos: 6 para tendencias y 19 para búsqueda (1 por faceta en tu mercado).
 */
export const DISCOVERY_C3_BUDGET = 19
export const MAX_FACETS = 4
export interface Facet { id: string; label: string; text: string; c3_attributes?: Record<string, string[]>; colors?: string[] }

// Vocabulario alternativo de cada rasgo (otra forma de nombrar la misma propuesta en las tiendas)
const SYNONYMS: Record<string, string> = {
  'leg-wide': 'pantalón wide leg', 'leg-baggy': 'pantalón baggy', 'leg-straight': 'pantalón straight fit', 'leg-slim': 'pantalón slim fit',
  'top-oversize': 'sudadera oversize', 'top-fitted': 'camiseta slim fit', overshirt: 'overshirt', 'long-coat': 'abrigo largo de lana', blazer: 'blazer desestructurada',
  knit: 'jersey de punto grueso', cardigan: 'cárdigan de punto', turtleneck: 'jersey cuello vuelto', loafer: 'mocasines de piel', boot: 'botas chelsea', layers: 'sobrecamisa ligera',
  cargo: 'pantalón cargo', tailoring: 'pantalón de pinzas', denim: 'vaquero', chunky: 'zapatillas chunky', sneaker: 'zapatillas minimalistas de piel', leather: 'chaqueta de piel',
}
/** Atributo «fit» de Channel3 para pantalones (valores de su taxonomía, comprobados en /v1/categories). */
const FIT_C3: Record<string, string[]> = { Wide: ['Wide'], Recto: ['Straight leg'], Slim: ['Slim'], Tapered: ['Tapered leg'] }
const lcf = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const capf = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function opportunityFacets(t: Target, opts: { favorableColors?: string[]; max?: number } = {}): Facet[] {
  const max = opts.max ?? MAX_FACETS
  const attrs = t.category === 'bottom' && t.cut && FIT_C3[t.cut] ? { fit: FIT_C3[t.cut] } : t.category === 'bottom' && t.silhouette === 'Amplia' ? { fit: ['Relaxed'] } : undefined
  const base = lcf(t.label)
  const out: Facet[] = [{ id: 'base', label: capf(base), text: `${base} hombre`, c3_attributes: attrs }]
  if (t.element && SYNONYMS[t.element]) out.push({ id: 'sinonimo', label: capf(SYNONYMS[t.element]), text: `${SYNONYMS[t.element]} hombre`, c3_attributes: attrs })
  if (t.material) out.push({ id: `material:${t.material}`, label: `En ${t.material}`, text: `${base} de ${t.material} hombre` })
  const colors = [...new Set([...(t.colors_ok ?? []), ...(t.color ? [t.color] : []), ...(opts.favorableColors ?? [])])]
  for (const c of colors.slice(0, 2)) out.push({ id: `color:${c}`, label: `En ${c.toLowerCase()}`, text: `${base} ${c.toLowerCase()} hombre`, c3_attributes: attrs, colors: [c] })
  const seen = new Set<string>()
  return out.filter((f) => !seen.has(f.text) && seen.add(f.text)).slice(0, max)
}
export function facetQuery(base: ProductSearchQuery, f: Facet): ProductSearchQuery {
  return { ...base, text: f.text, colors: [], cut: null, materials: null, c3_attributes: f.c3_attributes, facet: f.id }
}

/** ¿El producto materializa la oportunidad? Un fallo conocido lo excluye; lo desconocido no (queda marcado). */
export interface OppMatch { fit: 'materializa' | 'parcial'; matches: string[]; misses: string[]; unknown: string[] }
const MAT_WORDS: Record<string, RegExp> = { ante: /ante|suede/i, pana: /pana|corduroy/i, lana: /lana|wool|merino|tweed/i, lino: /lino|linen/i, punto: /punto|knit/i }
export function matchOpportunity(p: Record<string, any>, t: Target): OppMatch | null {
  const m: OppMatch = { fit: 'materializa', matches: [], misses: [], unknown: [] }
  if (t.category && p.category && p.category !== t.category) m.misses.push('Otro tipo de prenda')
  const shapeTarget = t.cut || t.silhouette
  if (!shapeTarget && t.subcategory && p.subcategory && p.subcategory !== t.subcategory) m.misses.push('No es la prenda propuesta')
  if (t.cut) {
    const volume = t.cut === 'Wide' && p.silhouette === 'Amplia'
    if (p.cut === t.cut || volume) m.matches.push(`Corte ${t.cut === 'Wide' ? 'amplio' : t.cut.toLowerCase()}`)
    else if (p.cut) m.misses.push(`Corte ${String(p.cut).toLowerCase()}, no el propuesto`)
    else m.unknown.push('Corte sin confirmar por la tienda')
  } else if (t.silhouette) {
    if (p.silhouette === t.silhouette) m.matches.push(`Silueta ${t.silhouette.toLowerCase()}`)
    else if (p.silhouette) m.misses.push(`Silueta ${String(p.silhouette).toLowerCase()}, no la propuesta`)
    else m.unknown.push('Silueta sin confirmar por la tienda')
  }
  if (t.material) {
    const txt = `${p.confirmed_composition ?? ''} ${p.product_name ?? ''} ${p.description ?? ''}`
    if (MAT_WORDS[t.material]?.test(txt)) m.matches.push(`En ${t.material}`)
    else if (p.confirmed_composition && !t.element) m.misses.push(`No es de ${t.material}`)
    else m.unknown.push(`Material (${t.material}) sin confirmar`)
  }
  if (t.colors_ok?.length) {
    if (t.colors_ok.includes(p.primary_color)) m.matches.push(`Color ${String(p.primary_color).toLowerCase()}`)
    else if (!t.element && !t.material && p.primary_color) m.misses.push(`Color ${String(p.primary_color).toLowerCase()}, no uno de los propuestos`)
  }
  if (m.misses.length) return { ...m, fit: 'parcial' }
  m.fit = m.unknown.length ? 'parcial' : 'materializa'
  return m
}

/** Diversidad: en la selección, como mucho 2 productos por marca antes de repetir (el resto pasa detrás). */
export function diversify<T extends Record<string, any>>(ranked: T[], perBrand = 2): T[] {
  const ok = ranked.filter((h) => !h.eligibility || h.eligibility.ok), rest = ranked.filter((h) => h.eligibility && !h.eligibility.ok)
  const count = new Map<string, number>(); const first: T[] = []; const overflow: T[] = []
  for (const h of ok) { const b = String(h.brand ?? h.retailer?.name ?? '').toLowerCase(); const n = count.get(b) ?? 0; count.set(b, n + 1); (n < perBrand ? first : overflow).push(h) }
  return [...first, ...overflow, ...rest]
}
