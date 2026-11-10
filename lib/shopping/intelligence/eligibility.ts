import { genderGate, type GenderClass } from './gender'
import { sizeEligibility, SIZE_STATUS_LABEL, type SizeContext, type SizeEligibility } from './sizes'

/**
 * Elegibilidad PREVIA al motor 4C (no es un criterio de la puntuación y no cambia sus pesos):
 * - Mujer o infantil → excluido. Género ambiguo → visible, nunca recomendado.
 * - Sin ninguna de tus tallas o agotado en todas ellas → excluido.
 * - Tu talla existe pero su stock no está comprobado (o es de otro mercado, o la comprobación es antigua) → pendiente:
 *   puede evaluarse, pero no aparece entre las recomendaciones disponibles ni puede ser «compra recomendada».
 * - Solo con una variante en tu talla, disponible y comprobada hace poco en el mercado español, puede recomendarse.
 */
export const GATE_VERSION = 'gate@1'
/** Antigüedad máxima de la disponibilidad para darla por confirmada (min). Los feeds se sincronizan, como mucho, a diario. */
export const MAX_AGE_MIN = { channel3: 60, ucp: 60, feed: 24 * 60, other: 60 } as const
type H = Record<string, any>
export interface Eligibility {
  ok: boolean; excluded: boolean; gender: { class: GenderClass; ok: boolean; reason: string; source: string | null }
  size: SizeEligibility; label: string; reasons: string[]; version: string
}
const kindOf = (h: H) => (h.raw_attributes?.provider === 'channel3' ? 'channel3' : h.source_kind === 'feed' ? 'feed' : h.source_kind === 'api' ? 'ucp' : 'other')

export function eligibilityOf(h: H, sc: SizeContext, now = Date.now(), market = 'ES'): Eligibility {
  const g = genderGate(h)
  const ra = h.raw_attributes ?? {}
  let s = sizeEligibility(h, sc, { now, checkedAt: ra.fetched_at ?? null, market: ra.market ?? null, maxAgeMin: MAX_AGE_MIN[kindOf(h)] })
  // Disponibilidad de otro mercado: no prueba que haya stock en España
  if (s.status === 'disponible' && ra.market && ra.market !== market) s = { ...s, status: 'stock_desconocido', eligible: false, availability: 'no_verificable', reason: `Hay ${s.size?.original} en ${ra.market_name ?? ra.market}, pero no puedo comprobar el stock en España.` }
  const excluded = g.excluded || s.status === 'sin_talla_compatible' || s.status === 'agotada_en_tu_talla'
  const ok = !excluded && g.ok && s.eligible
  const reasons = [...(g.ok ? [] : [g.reason]), ...(s.eligible ? [] : [s.reason])]
  const label = g.excluded ? 'No es moda masculina' : !g.ok ? 'Sin confirmar que sea de hombre' : SIZE_STATUS_LABEL[s.status]
  return { ok, excluded, gender: { class: g.gender, ok: g.ok, reason: g.reason, source: g.source }, size: s, label, reasons, version: GATE_VERSION }
}

/** Al mostrar una búsqueda guardada: una disponibilidad confirmada que ya es antigua deja de contar como confirmada. */
export function ageOut(h: H, now = Date.now()): H {
  const e = h.eligibility as Eligibility | undefined
  if (!e || e.size.status !== 'disponible' || !e.size.checked_at) return h
  if ((now - new Date(e.size.checked_at).getTime()) / 60e3 <= MAX_AGE_MIN[kindOf(h)]) return h
  const size = { ...e.size, status: 'stock_desconocido' as const, eligible: false, availability: 'no_verificable' as const, reason: 'La disponibilidad de tu talla se comprobó hace demasiado: vuelve a buscar para confirmarla.' }
  return { ...h, eligibility: { ...e, ok: false, size, label: SIZE_STATUS_LABEL.stock_desconocido, reasons: [...e.reasons, size.reason] }, evaluation: gateVerdict(h.evaluation, { ...e, ok: false, size } as Eligibility) }
}

/** Un producto sin talla disponible confirmada nunca puede ser «compra recomendada», aunque puntúe alto en el 4C. */
export function gateVerdict<E extends { verdict: string; verdict_text: string; score: number } | null | undefined>(e: E, el: Eligibility): E {
  if (!e || el.ok || e.verdict !== 'buy') return e
  return { ...e, verdict: 'consider', verdict_text: `Encaja contigo (${e.score}/100), pero no lo recomiendo todavía: ${(el.reasons[0] ?? el.label).replace(/\.$/, '')}.` }
}
