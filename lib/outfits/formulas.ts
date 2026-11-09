import { PALETTE_OF } from '@/lib/style/references'
import { subOf } from '@/lib/wardrobe/taxonomy'
import { checkComposition, roleLabel, rolesFor, ROLE_ORDER } from './taxonomy'
import { scoreOutfit, type G, type ScoreEnv } from './engine/scoring'

/**
 * Style Formulas (fase 3D): estructuras repetibles definidas por TIPO de prenda y sus caracteristicas
 * (no por una prenda concreta). Si cambias tu camisa por otra que encaje, la formula sigue funcionando.
 */
export interface Slot { role: string; subcategories: string[]; colors: string[]; cuts: string[]; formality_min: number | null; formality_max: number | null; optional: boolean }
const pal = (c?: string | null) => (c ? PALETTE_OF[c] ?? c : null)
const lc = (s: string) => s.toLowerCase()
export const MAX_TRY = 3000

/** Abstrae un conjunto en fórmula: tipo de prenda por función, corte del pantalón y formalidad ±1. Los colores, libres. */
export function slotsFromItems(items: { role: string; g: G }[]): Slot[] {
  return [...items].sort((a, z) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(z.role)).filter((i) => i.role !== 'accessory').map((i) => ({
    role: i.role, subcategories: i.g.subcategory ? [i.g.subcategory] : [], colors: [], cuts: i.role === 'bottom' && i.g.cut ? [i.g.cut] : [],
    formality_min: i.g.formality_level ? Math.max(1, i.g.formality_level - 1) : null, formality_max: i.g.formality_level ? Math.min(5, i.g.formality_level + 1) : null, optional: false,
  }))
}
export const signatureOf = (slots: Pick<Slot, 'role' | 'subcategories' | 'cuts'>[]) => slots.map((s) => `${s.role}:${[...s.subcategories].sort().join('/') || '*'}${s.cuts.length ? `(${[...s.cuts].sort().join('/')})` : ''}`).sort().join('+')
export function formulaText(slots: Slot[]) {
  return slots.map((s) => {
    const t = s.subcategories.length ? s.subcategories.map((x) => subOf(x)?.label ?? x).join(' o ') : roleLabel(s.role)
    return lc(`${t}${s.cuts.length ? ` ${s.cuts.join('/')}` : ''}${s.colors.length ? ` (${s.colors.join(', ')})` : ''}`) + (s.optional ? ' (opcional)' : '')
  }).join(' + ').replace(/^./, (c) => c.toUpperCase())
}

export function matches(slot: Slot, g: G) {
  return rolesFor(g).includes(slot.role as never)
    && (!slot.subcategories.length || slot.subcategories.includes(g.subcategory))
    && (!slot.colors.length || slot.colors.includes(pal(g.primary_color) ?? ''))
    && (!slot.cuts.length || slot.cuts.includes(g.cut))
    && (!g.formality_level || ((slot.formality_min == null || g.formality_level >= slot.formality_min) && (slot.formality_max == null || g.formality_level <= slot.formality_max)))
}

/** Qué prendas encajan en cada hueco y cuántas variaciones permite la fórmula con tu armario. */
export function coverage(slots: Slot[], pool: G[]) {
  const per = slots.map((s) => ({ slot: s, garments: pool.filter((g) => matches(s, g)) }))
  const required = per.filter((x) => !x.slot.optional)
  const variations = required.every((x) => x.garments.length) ? required.reduce((n, x) => n * x.garments.length, 1) : 0
  return { per, variations, missing: required.filter((x) => !x.garments.length).map((x) => x.slot) }
}

/** Probar una fórmula: mejores combinaciones de tu armario que la cumplen, puntuadas por el motor. */
export function tryFormula(slots: Slot[], pool: G[], env: ScoreEnv, n = 3) {
  const { per } = coverage(slots, pool)
  const lists = per.filter((x) => !x.slot.optional || x.garments.length).map((x) => ({ role: x.slot.role, gs: x.garments.slice(0, 8) }))
  const out: { items: { role: string; g: G }[]; score: number; why: string[] }[] = []
  let count = 0
  const rec = (i: number, acc: { role: string; g: G }[]) => {
    if (count >= MAX_TRY) return
    if (i === lists.length) {
      count++
      if (checkComposition(acc.map((s) => ({ garment_id: s.g.id, role: s.role })), new Map(acc.map((s) => [s.g.id, s.g]))).some((p) => p.level === 'error')) return
      const sc = scoreOutfit(acc, env)
      out.push({ items: acc, score: sc.total, why: sc.criteria.filter((c) => c.value >= 0.75).map((c) => c.reasons.find((r) => !c.cons.includes(r))).filter(Boolean).slice(0, 2) as string[] })
      return
    }
    for (const g of lists[i].gs) if (!acc.some((s) => s.g.id === g.id)) rec(i + 1, [...acc, { role: lists[i].role, g }])
  }
  if (lists.length) rec(0, [])
  // Variadas: no repetir la misma combinación ni casi la misma
  const sorted = out.sort((a, z) => z.score - a.score), chosen: typeof out = []
  for (const c of sorted) { if (chosen.length >= n) break; if (chosen.some((x) => x.items.filter((i) => c.items.some((j) => j.g.id === i.g.id)).length >= c.items.length - 1)) continue; chosen.push(c) }
  return { combos: chosen, evaluated: count }
}

/** Fórmulas que repites: estructuras presentes en 2 o más conjuntos que te gustaron, repetirías o te pusiste. */
export function detectFormulas(outfits: { id: string; name: string; items: { role: string; g: G }[]; positive: boolean }[], existing: Set<string>) {
  const groups = new Map<string, { slots: Slot[]; outfits: { id: string; name: string }[] }>()
  for (const o of outfits) {
    if (!o.positive || o.items.length < 3) continue
    const slots = slotsFromItems(o.items), sig = signatureOf(slots)
    const g = groups.get(sig) ?? { slots, outfits: [] }
    g.outfits.push({ id: o.id, name: o.name })
    // El rango de formalidad se amplía para cubrir todos los conjuntos del grupo
    g.slots = g.slots.map((s, i) => ({ ...s, formality_min: Math.min(s.formality_min ?? 5, slots[i]?.formality_min ?? 5), formality_max: Math.max(s.formality_max ?? 1, slots[i]?.formality_max ?? 1) }))
    groups.set(sig, g)
  }
  return [...groups.entries()].filter(([sig, g]) => g.outfits.length >= 2 && !existing.has(sig)).map(([signature, g]) => ({ signature, slots: g.slots, outfits: g.outfits, text: formulaText(g.slots) }))
}
