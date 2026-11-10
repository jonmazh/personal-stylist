/**
 * Ordenación y grupos de resultados por compatibilidad PERSONAL (nunca por precio, popularidad ni coincidencia textual).
 * Los productos descartados («no compraría») nunca aparecen como recomendación principal.
 */
type H = Record<string, any> & { evaluation?: { score: number; verdict: string; wva: { score: number }; confidence_score: number; criteria: { key: string; value: number | null }[] } | null }
export interface Groups { recommended: number[]; best_wardrobe: number | null; best_need: number | null; alternatives: number[]; not_recommended: number[]; unevaluated: number[] }
export function rankHits<T extends H>(hits: T[]): T[] {
  const rank = (h: H) => (h.evaluation ? (h.evaluation.verdict === 'skip' ? -200 : h.evaluation.verdict === 'wait' ? -100 : 0) + h.evaluation.score + h.evaluation.confidence_score / 100 : -300)
  return [...hits].sort((a, z) => rank(z) - rank(a))
}
export function groupHits(hits: H[]): Groups {
  const idx = hits.map((_, i) => i)
  const ev = (i: number) => hits[i].evaluation
  const ok = idx.filter((i) => ev(i) && ['buy', 'consider'].includes(ev(i)!.verdict))
  const recommended = ok.filter((i) => ev(i)!.verdict === 'buy' || ev(i)!.score >= 65).slice(0, 3)
  const bestW = [...ok].sort((a, z) => ev(z)!.wva.score - ev(a)!.wva.score)[0] ?? null
  const needVal = (i: number) => ev(i)!.criteria.find((c) => c.key === 'need')?.value ?? 0
  const bestN = [...ok].filter((i) => needVal(i) >= 0.7).sort((a, z) => ev(z)!.score - ev(a)!.score)[0] ?? null
  return {
    recommended, best_wardrobe: bestW, best_need: bestN,
    alternatives: ok.filter((i) => !recommended.includes(i)),
    not_recommended: idx.filter((i) => ev(i) && ['skip', 'wait'].includes(ev(i)!.verdict)),
    unevaluated: idx.filter((i) => !ev(i)),
  }
}
