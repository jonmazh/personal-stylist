import { SUBS, groupOf, subOf } from '@/lib/wardrobe/taxonomy'
import type { NeedSpecT } from '../taxonomy'
import { detectColors, detectKind, type NormalizedProduct } from './normalize'

/** Búsqueda normalizada (la misma para todas las fuentes) y coincidencia de un producto con lo que buscas. */
export interface ProductSearchQuery {
  text: string; category: string | null; subcategory: string | null; colors: string[]; cut: string | null; materials: string | null
  price_min: number | null; price_max: number | null; retailers: string[]; excluded: string[]; need_id: string | null
  /** Atributos estructurados de Channel3 (p. ej. {fit: ['Wide']}) y propuesta a la que pertenece la consulta (búsqueda estratégica) */
  c3_attributes?: Record<string, string[]>; facet?: string
}
const lc = (s: string) => s.toLowerCase()
/** De la necesidad (4A) a una búsqueda: tipo de prenda, colores, corte, materiales y rango de precio. Tiendas: tus preferencias. */
export function queryFromNeed(n: { id?: string; spec: NeedSpecT; price_min?: number | null; price_max?: number | null; preferred_retailers?: string[] | null }, prefs?: { preferred_retailers?: string[]; excluded_retailers?: string[] } | null): ProductSearchQuery {
  const s = n.spec
  const kind = s.subcategory ? subOf(s.subcategory)?.label : groupOf(s.category)?.label
  const text = [kind, ...s.colors.slice(0, 2).map(lc), s.cut ? lc(s.cut) : null, s.materials, 'hombre'].filter(Boolean).join(' ')
  return {
    text, category: s.category, subcategory: s.subcategory ?? null, colors: s.colors, cut: s.cut ?? null, materials: s.materials ?? null,
    price_min: n.price_min ?? null, price_max: n.price_max ?? null,
    retailers: (n.preferred_retailers?.length ? n.preferred_retailers : prefs?.preferred_retailers) ?? [], excluded: prefs?.excluded_retailers ?? [], need_id: n.id ?? null,
  }
}
/** Búsqueda libre («pantalón gris recto hasta 80 €»): se deducen tipo, colores y precio máximo del texto. */
export function queryFromText(text: string, prefs?: { preferred_retailers?: string[]; excluded_retailers?: string[] } | null): ProductSearchQuery {
  const k = detectKind(text)
  const max = text.match(/(?:hasta|max(?:imo)?|<|menos de)\s*(\d+)/i)
  return { text: text.trim().slice(0, 200), category: k.category, subcategory: k.subcategory, colors: detectColors(text), cut: null, materials: null, price_min: null, price_max: max ? Number(max[1]) : null, retailers: prefs?.preferred_retailers ?? [], excluded: prefs?.excluded_retailers ?? [], need_id: null }
}

export interface Match { score: number; matches: string[]; misses: string[]; unknown: string[] }
/** Coincidencia con los criterios (0-100). NO es una recomendación de compra: solo dice cuánto se parece a lo que buscas. */
export function matchProduct(p: Pick<NormalizedProduct, 'product_name' | 'description' | 'category' | 'subcategory' | 'colors' | 'current_price' | 'confirmed_composition'>, q: ProductSearchQuery): Match {
  const m: Match = { score: 0, matches: [], misses: [], unknown: [] }
  let got = 0, max = 0
  const add = (w: number, ok: boolean | null, yes: string, no: string, unk: string) => { max += w; if (ok === true) { got += w; m.matches.push(yes) } else if (ok === false) m.misses.push(no); else { got += w * 0.4; m.unknown.push(unk) } }
  if (q.subcategory) add(40, p.subcategory ? p.subcategory === q.subcategory : null, `Es ${lc(subOf(q.subcategory)?.label ?? '')}`, `No es ${lc(subOf(q.subcategory)?.label ?? '')} (${p.subcategory ? lc(subOf(p.subcategory)?.label ?? p.subcategory) : '—'})`, 'Tipo de prenda sin identificar')
  else if (q.category) add(40, p.category ? p.category === q.category : null, `Es ${lc(groupOf(q.category)?.label ?? '')}`, 'Otra categoría', 'Categoría sin identificar')
  if (q.colors.length) add(25, p.colors.length ? p.colors.some((c) => q.colors.includes(c)) : null, `Color ${p.colors.filter((c) => q.colors.includes(c)).map(lc).join(', ')}`, `Color ${p.colors.map(lc).join(', ')}, no ${q.colors.map(lc).join(' ni ')}`, 'Color sin indicar')
  if (q.price_max != null || q.price_min != null) add(20, p.current_price == null ? null : (q.price_max == null || p.current_price <= q.price_max) && (q.price_min == null || p.current_price >= q.price_min), 'Precio dentro de tu rango', `Precio fuera de tu rango (${p.current_price} €)`, 'Precio sin comprobar')
  const t = lc(`${p.product_name} ${p.description ?? ''}`)
  if (q.cut) add(10, t.includes(lc(q.cut)) ? true : null, `Corte ${lc(q.cut)}`, '', `Corte ${lc(q.cut)} sin confirmar`)
  if (q.materials) { const words = lc(q.materials).split(/[ ,/]+/).filter((w) => w.length > 3); const comp = lc(p.confirmed_composition ?? ''); add(5, !comp ? null : words.some((w) => comp.includes(w.slice(0, 5))), 'Material buscado', 'Otro material', 'Composición desconocida') }
  m.score = max ? Math.round((got / max) * 100) : 50
  return m
}
export const SUB_IDS = SUBS.map((s) => s.id)
