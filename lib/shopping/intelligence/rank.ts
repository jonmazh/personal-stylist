/**
 * Ordenación y grupos de resultados por compatibilidad PERSONAL (nunca por precio, popularidad ni coincidencia textual).
 * Los productos descartados («no compraría») nunca aparecen como recomendación principal. Antes de todo eso se aplican
 * las condiciones previas (moda masculina, tu talla disponible y comprobada): solo los productos que las cumplen entran
 * en los grupos principales; los pendientes (talla o stock sin comprobar) y los excluidos se muestran aparte.
 */
type H = Record<string, any> & {
  evaluation?: { score: number; verdict: string; wva: { score: number }; confidence_score: number; criteria: { key: string; value: number | null }[] } | null
  eligibility?: { ok: boolean; excluded: boolean } | null
}
export interface Groups { recommended: number[]; best_wardrobe: number | null; best_need: number | null; alternatives: number[]; not_recommended: number[]; pending: number[]; excluded: number[]; unevaluated: number[] }
/** Sin datos de elegibilidad (búsquedas antiguas) se mantiene el comportamiento anterior. */
const tier = (h: H) => (!h.eligibility ? 0 : h.eligibility.ok ? 0 : h.eligibility.excluded ? -2000 : -1000)
export function rankHits<T extends H>(hits: T[]): T[] {
  const rank = (h: H) => tier(h) + (h.evaluation ? (h.evaluation.verdict === 'skip' ? -200 : h.evaluation.verdict === 'wait' ? -100 : 0) + h.evaluation.score + h.evaluation.confidence_score / 100 : -300)
  return [...hits].sort((a, z) => rank(z) - rank(a))
}
export function groupHits(hits: H[]): Groups {
  const idx = hits.map((_, i) => i)
  const ev = (i: number) => hits[i].evaluation
  const eligible = (i: number) => !hits[i].eligibility || hits[i].eligibility!.ok
  const ok = idx.filter((i) => eligible(i) && ev(i) && ['buy', 'consider'].includes(ev(i)!.verdict))
  const recommended = ok.filter((i) => ev(i)!.verdict === 'buy' || ev(i)!.score >= 65).slice(0, 3)
  const bestW = [...ok].sort((a, z) => ev(z)!.wva.score - ev(a)!.wva.score)[0] ?? null
  const needVal = (i: number) => ev(i)!.criteria.find((c) => c.key === 'need')?.value ?? 0
  const bestN = [...ok].filter((i) => needVal(i) >= 0.7).sort((a, z) => ev(z)!.score - ev(a)!.score)[0] ?? null
  return {
    recommended, best_wardrobe: bestW, best_need: bestN,
    alternatives: ok.filter((i) => !recommended.includes(i)),
    not_recommended: idx.filter((i) => eligible(i) && ev(i) && ['skip', 'wait'].includes(ev(i)!.verdict)),
    pending: idx.filter((i) => hits[i].eligibility && !hits[i].eligibility!.ok && !hits[i].eligibility!.excluded),
    excluded: idx.filter((i) => hits[i].eligibility?.excluded),
    unevaluated: idx.filter((i) => eligible(i) && !ev(i)),
  }
}
