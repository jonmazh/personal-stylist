import { createHash } from 'node:crypto'
import { z } from 'zod'
import { elementLabel } from '@/lib/style/catalog'

/**
 * Personal Shopper 2.0 · 2.0H — Valoraciones y aprendizaje gradual.
 * Distingue a QUÉ se refiere cada valoración: a un producto concreto, a una oportunidad o a una tendencia; y, dentro
 * de ellas, a la estética, la silueta o el riesgo. Reglas:
 *  - Lo que dices de UN producto o UNA tendencia se aplica a ese producto o esa tendencia (ocultarlo, descartarla).
 *  - Generalizar a tu estilo (un rasgo que no es tuyo, un corte que no te gusta, menos exploración) exige al menos
 *    LEARN_MIN valoraciones coherentes. Nunca se modifica el Style Blueprint: el aprendizaje vive aparte, es trazable
 *    (qué valoraciones lo justifican) y se deshace borrando la valoración.
 */
export const LEARN_MIN = 2
export const FEEDBACK_REASONS = [
  { id: 'me_gusta', label: 'Me gusta' },
  { id: 'no_me_gusta', label: 'No me gusta' },
  { id: 'interesa_no_ahora', label: 'Me interesa, pero no compraría ahora' },
  { id: 'no_mi_estilo', label: 'No representa mi estilo' },
  { id: 'prenda_si_corte_no', label: 'Me gusta la prenda, pero no ese corte' },
  { id: 'tendencia_si_producto_no', label: 'Me gusta la tendencia, pero no ese producto' },
  { id: 'demasiado_arriesgado', label: 'Me parece demasiado arriesgado' },
  { id: 'ya_tengo_parecido', label: 'Ya tengo algo parecido' },
] as const
export type Reason = (typeof FEEDBACK_REASONS)[number]['id']
export const TARGET_KINDS = ['producto', 'oportunidad', 'tendencia'] as const
/** Motivos que tienen sentido para cada tipo de valoración (los demás no se ofrecen). */
export const REASONS_FOR: Record<(typeof TARGET_KINDS)[number], Reason[]> = {
  producto: ['me_gusta', 'no_me_gusta', 'interesa_no_ahora', 'no_mi_estilo', 'prenda_si_corte_no', 'tendencia_si_producto_no', 'demasiado_arriesgado', 'ya_tengo_parecido'],
  oportunidad: ['me_gusta', 'interesa_no_ahora', 'no_mi_estilo', 'demasiado_arriesgado', 'ya_tengo_parecido'],
  tendencia: ['me_gusta', 'no_mi_estilo', 'demasiado_arriesgado'],
}
export const reasonLabel = (id: string) => FEEDBACK_REASONS.find((r) => r.id === id)?.label ?? id

export const FeedbackInput = z.object({
  target_kind: z.enum(TARGET_KINDS), target_ref: z.string().trim().min(1).max(300),
  reason: z.enum(FEEDBACK_REASONS.map((r) => r.id) as [Reason, ...Reason[]]),
  context: z.object({
    name: z.string().max(200).nullish(), brand: z.string().max(80).nullish(), element: z.string().max(40).nullish(), cut: z.string().max(40).nullish(),
    mode: z.string().max(20).nullish(), opportunity_key: z.string().max(120).nullish(), trend_key: z.string().max(80).nullish(),
  }).default({}),
  note: z.string().trim().max(300).nullish(),
}).refine((x) => REASONS_FOR[x.target_kind].includes(x.reason), { message: 'Ese motivo no aplica a este tipo de valoración' })
export type FeedbackRow = { id: string; target_kind: string; target_ref: string; reason: string; context: Record<string, any>; created_at?: string }

export interface Learned {
  hidden_products: string[]; trends_rejected: string[]; trends_liked: string[]; opps_later: string[]; opps_have: string[]
  soft_rejected: string[]; liked: string[]; cut_avoid: Record<string, string[]>; risk_averse: boolean
  applied: { rule: string; detail: string; count: number; feedback_ids: string[] }[]; pending: { rule: string; detail: string; count: number }[]; hash: string
}
export function learn(rows: FeedbackRow[]): Learned {
  const L: Learned = { hidden_products: [], trends_rejected: [], trends_liked: [], opps_later: [], opps_have: [], soft_rejected: [], liked: [], cut_avoid: {}, risk_averse: false, applied: [], pending: [], hash: '' }
  const by = <K extends string>(f: (r: FeedbackRow) => K | null) => { const m = new Map<K, FeedbackRow[]>(); for (const r of rows) { const k = f(r); if (k) m.set(k, [...(m.get(k) ?? []), r]) } return m }
  const ids = (xs: FeedbackRow[]) => xs.map((x) => x.id)
  // Concretas (se aplican al objeto valorado)
  for (const r of rows) {
    if (r.target_kind === 'producto' && ['no_me_gusta', 'no_mi_estilo', 'ya_tengo_parecido', 'tendencia_si_producto_no', 'prenda_si_corte_no'].includes(r.reason)) L.hidden_products.push(r.target_ref)
    if (r.target_kind === 'tendencia' && ['no_mi_estilo', 'demasiado_arriesgado'].includes(r.reason)) L.trends_rejected.push(r.target_ref)
    if (r.target_kind === 'tendencia' && r.reason === 'me_gusta') L.trends_liked.push(r.target_ref)
    if (r.reason === 'tendencia_si_producto_no' && r.context?.trend_key) L.trends_liked.push(r.context.trend_key)
    if (r.target_kind === 'oportunidad' && r.reason === 'interesa_no_ahora') L.opps_later.push(r.target_ref)
    if (r.target_kind === 'oportunidad' && r.reason === 'ya_tengo_parecido') L.opps_have.push(r.target_ref)
  }
  // Generalizaciones (exigen LEARN_MIN valoraciones coherentes)
  for (const [el, xs] of by((r) => (r.reason === 'no_mi_estilo' && r.context?.element ? r.context.element as string : null))) {
    const rule = { rule: 'rasgo_no_es_tuyo', detail: `${elementLabel(el)}: no representa tu estilo`, count: xs.length }
    if (xs.length >= LEARN_MIN) { L.soft_rejected.push(el); L.applied.push({ ...rule, feedback_ids: ids(xs) }) } else L.pending.push(rule)
  }
  for (const [el, xs] of by((r) => (r.reason === 'me_gusta' && r.context?.element ? r.context.element as string : null))) {
    const rule = { rule: 'rasgo_te_gusta', detail: `${elementLabel(el)}: te gusta`, count: xs.length }
    if (xs.length >= LEARN_MIN && !L.soft_rejected.includes(el)) { L.liked.push(el); L.applied.push({ ...rule, feedback_ids: ids(xs) }) } else L.pending.push(rule)
  }
  for (const [k, xs] of by((r) => (r.reason === 'prenda_si_corte_no' && r.context?.element && r.context?.cut ? `${r.context.element}|${r.context.cut}` as string : null))) {
    const [el, cut] = k.split('|')
    const rule = { rule: 'corte_no', detail: `${elementLabel(el)}: no en corte ${cut.toLowerCase()}`, count: xs.length }
    if (xs.length >= LEARN_MIN) { (L.cut_avoid[el] ??= []).push(cut); L.applied.push({ ...rule, feedback_ids: ids(xs) }) } else L.pending.push(rule)
  }
  const risky = rows.filter((r) => r.reason === 'demasiado_arriesgado')
  if (risky.length) { const rule = { rule: 'menos_exploracion', detail: 'Prefieres propuestas menos arriesgadas', count: risky.length }; if (risky.length >= LEARN_MIN) { L.risk_averse = true; L.applied.push({ ...rule, feedback_ids: ids(risky) }) } else L.pending.push(rule) }
  for (const k of ['hidden_products', 'trends_rejected', 'trends_liked', 'opps_later', 'opps_have'] as const) L[k] = [...new Set(L[k])]
  L.hash = createHash('sha256').update(JSON.stringify([L.trends_rejected, L.trends_liked, L.opps_later, L.opps_have, L.soft_rejected, L.liked, L.cut_avoid, L.risk_averse])).digest('hex').slice(0, 16)
  return L
}
export const emptyLearned = (): Learned => learn([])
