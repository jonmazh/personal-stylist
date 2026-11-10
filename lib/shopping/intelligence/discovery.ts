import { groupOf, subOf } from '@/lib/wardrobe/taxonomy'
import type { ProductSearchQuery } from '../catalog/query'
import { suggestColors } from './color'
import type { ShopperContext } from './context'

/**
 * Búsqueda inteligente: descubrir candidatos SIN limitarse a las palabras escritas. Se buscan suficientes productos del
 * tipo de prenda (sin exigir el color pedido) y, además, en los colores que te favorecen y faltan en tu armario.
 * Los candidatos se evalúan después uno a uno con tu perfil (la evaluación decide, no la coincidencia textual).
 */
export interface DiscoveryPlan { queries: ProductSearchQuery[]; notes: string[] }
const lc = (s: string) => s.toLowerCase()
export function discoveryQueries(q: ProductSearchQuery, ctx: ShopperContext, max = 3): DiscoveryPlan {
  const kind = q.subcategory ? subOf(q.subcategory)?.label : q.category ? groupOf(q.category)?.label : null
  const notes: string[] = []
  const base: ProductSearchQuery = { ...q, colors: [], cut: null, materials: null }
  if (!kind) return { queries: [q], notes: ['No identifico el tipo de prenda: busco con tu texto tal cual.'] }
  const texts: string[] = [`${kind} hombre`]
  if (q.colors.length) { texts.push(`${kind} ${q.colors.map(lc).join(' ')} hombre`); notes.push(`Pediste ${q.colors.map(lc).join(' o ')}: lo busco, pero también otros colores para comparar.`) }
  const suggested = q.category ? suggestColors(q.category, ctx, 3).filter((c) => !q.colors.includes(c)) : []
  const used = suggested.slice(0, Math.max(0, max - texts.length))
  for (const c of used) texts.push(`${kind} ${lc(c)} hombre`)
  if (used.length) notes.push(`Añado colores que te favorecen y faltan en tu armario: ${used.map(lc).join(', ')}.`)
  else if (!ctx.color.temp) notes.push('No conozco tu colorimetría: no puedo priorizar colores que te favorezcan.')
  const uniq = [...new Set(texts)].slice(0, max)
  return { queries: uniq.map((text) => ({ ...base, text })), notes }
}
