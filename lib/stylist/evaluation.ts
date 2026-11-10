/**
 * Personal Shopper 2.0 · 2.0F — Evaluación estratégica.
 * Dos niveles separados, sin tocar el motor 4C (sus pesos 25/20/15/20/10/10 no cambian):
 *  Nivel 1 · Elegibilidad: moda masculina, tu talla disponible y comprobada, información comercial suficiente
 *            (precio en tu moneda y tienda identificada) y que materializa la oportunidad. Si falla, no hay recomendación.
 *  Nivel 2 · Valor estratégico (0-100): adecuación a la oportunidad, contribución al armario (proporción nueva,
 *            conexión de prendas aisladas, nuevos conjuntos, sin depender de compras futuras), idoneidad personal
 *            (color, corte y estética del 4C), potencial de conjuntos y relevancia de mercado (si la hay).
 * El 4C sigue siendo la compatibilidad personal y no se confunde con la calidad de la oportunidad. Las
 * incompatibilidades se muestran como alertas que limitan la decisión: una puntuación alta no las oculta.
 */
export const STRATEGIC_VERSION = 'strategic-eval@1'
type Row = Record<string, any>
export const STRATEGIC_WEIGHTS = { opportunity: 25, wardrobe: 25, personal: 25, outfits: 15, market: 10 } as const
export const STRATEGIC_LABEL: Record<keyof typeof STRATEGIC_WEIGHTS, string> = { opportunity: 'Adecuación a la oportunidad', wardrobe: 'Contribución al armario', personal: 'Idoneidad personal', outfits: 'Potencial de conjuntos', market: 'Relevancia de mercado' }
export const DECISIONS = [
  { id: 'eleccion', label: 'Elección del estilista' }, { id: 'buena_opcion', label: 'Buena opción' }, { id: 'con_reservas', label: 'Con reservas' },
  { id: 'no_recomendado', label: 'No lo recomiendo' }, { id: 'no_elegible', label: 'No disponible para ti' },
] as const
export type Decision = (typeof DECISIONS)[number]['id']

export interface StrategicContext {
  opportunity: { title: string; target: Row | null; scores?: { fashion_relevance: number | null } | null; market?: Row | null }
  /** Firmas de proporción de tus conjuntos («Regular|Recto») y prendas aisladas, del diagnóstico 2.0B */
  proportions: string[]; islands: string[]; currency: string
}
export interface StrategicEval {
  version: string
  level1: { ok: boolean; checks: { key: string; label: string; ok: boolean | null; detail: string }[] }
  value: number | null; components: { key: string; label: string; weight: number; value: number | null; reasons: string[] }[]
  flags: string[]; decision: Decision; decision_text: string; price_tier: 'económica' | 'media' | 'premium' | null
}
const crit = (e: Row | null, k: string) => (e?.criteria as Row[] | undefined)?.find((c) => c.key === k)

export function strategicEvaluation(h: Row, sc: StrategicContext, opts: { medianPrice?: number | null } = {}): StrategicEval {
  const e = h.evaluation as Row | null, el = h.eligibility as Row | null, m = h.opportunity_match as Row | null
  // ── Nivel 1 · Elegibilidad ──
  const priced = h.current_price != null && h.currency === sc.currency
  const checks = [
    { key: 'genero', label: 'Moda masculina', ok: el ? el.gender?.ok !== false : null, detail: el?.gender?.reason ?? 'Sin clasificar' },
    { key: 'talla', label: 'Tu talla disponible y comprobada', ok: el ? !!el.ok || (el.gender?.ok !== false && el.size?.status === 'no_aplica') : null, detail: el?.label ?? 'Sin comprobar' },
    { key: 'comercial', label: 'Información comercial suficiente', ok: priced && !!(h.retailer || h.raw_attributes?.domain || h.product_url), detail: !priced ? (h.current_price == null ? 'Precio sin comprobar' : `Precio en ${h.currency}, no en ${sc.currency}`) : 'Precio y tienda identificados' },
    { key: 'oportunidad', label: 'Materializa la oportunidad', ok: m ? !(m.misses ?? []).length : null, detail: m ? (m.fit === 'materializa' ? 'Sí' : `Por confirmar: ${(m.unknown ?? []).join(', ').toLowerCase()}`) : 'Sin oportunidad' },
  ]
  const level1 = { ok: checks.every((c) => c.ok !== false) && checks[1].ok === true, checks }

  // ── Nivel 2 · Valor estratégico ──
  const t = sc.opportunity.target ?? {}
  const comps: StrategicEval['components'] = []
  const add = (key: keyof typeof STRATEGIC_WEIGHTS, value: number | null, reasons: string[]) => comps.push({ key, label: STRATEGIC_LABEL[key], weight: STRATEGIC_WEIGHTS[key], value: value == null ? null : Math.max(0, Math.min(1, value)), reasons })
  add('opportunity', m ? (m.fit === 'materializa' ? 1 : (m.misses ?? []).length ? 0 : 0.65) : null, m ? [...(m.matches ?? []), ...(m.unknown ?? []).map((u: string) => `${u} (por confirmar)`)] : [])
  // Contribución al armario: lo que cambia en tu forma de vestir, no «una categoría que no tienes»
  const wr: string[] = []; let w = 0.35
  const sig = `${t.category === 'bottom' ? '' : h.silhouette ?? ''}|${t.category === 'bottom' ? h.cut ?? (h.silhouette === 'Amplia' ? 'Amplia' : '') : ''}`
  const newShape = t.category === 'bottom' ? !!(h.cut || h.silhouette) && !sc.proportions.some((p) => p.split('|')[1] === (h.cut ?? 'Amplia')) : !!h.silhouette && !sc.proportions.some((p) => p.split('|')[0] === h.silhouette)
  if (newShape) { w += 0.3; wr.push(`Introduce una proporción que tus conjuntos no tienen (${t.category === 'bottom' ? `pantalón ${String(h.cut ?? 'holgado').toLowerCase()}` : `arriba ${String(h.silhouette).toLowerCase()}`})`) }
  void sig
  const partners = ((e?.combines_with ?? []) as Row[]).map((g) => g.id)
  const bridged = sc.islands.filter((id) => partners.includes(id))
  if (bridged.length) { w += 0.15; wr.push(`Conecta ${bridged.length} prenda${bridged.length === 1 ? '' : 's'} que hoy no forma${bridged.length === 1 ? '' : 'n'} ningún conjunto`) }
  const red = Number(e?.redundancy_score ?? 0)
  if (red >= 70) { w -= 0.35; wr.push('Duplica prácticamente algo que ya tienes') } else if (red >= 50) { w -= 0.15; wr.push('Se parece bastante a una prenda tuya') }
  const dependent = !!e && (e.wva?.total_outfits ?? 0) === 0
  if (dependent) { w -= 0.3; wr.push('Hoy no forma conjuntos con tu armario: dependería de compras futuras') }
  else if (e) { w += Math.min(0.2, (e.wva?.new_outfits ?? 0) / 20); if (e.wva?.new_outfits) wr.push(`${e.wva.new_outfits} conjuntos nuevos con tus prendas`) }
  add('wardrobe', e ? w : null, wr)
  // Idoneidad personal: color, corte y estética del 4C (sin necesidad ni precio, que son otra cosa)
  const pc = ['color', 'cut', 'style'].map((k) => crit(e, k)).filter(Boolean) as Row[]
  const known = pc.filter((c) => c.value != null)
  add('personal', known.length ? known.reduce((s, c) => s + c.value * c.weight, 0) / known.reduce((s, c) => s + c.weight, 0) : null, known.map((c) => `${c.label}: ${Math.round(c.value * 10)}/10`))
  add('outfits', e ? Math.min(1, (e.wva?.total_outfits ?? 0) / 25) : null, e ? [`${e.wva?.total_outfits ?? 0} conjuntos válidos con tus prendas`] : [])
  const fr = sc.opportunity.scores?.fashion_relevance ?? null
  add('market', fr == null ? null : fr / 100, fr == null ? ['Sin respaldo de mercado: es una mejora de estilo, no una tendencia'] : [`Tendencia «${sc.opportunity.market?.name}» (${sc.opportunity.market?.kind === 'tendencia_editorial' ? 'evidencia editorial' : 'propuesta aislada'})`])
  // Lo desconocido no cuenta: se reparten los pesos entre lo que se conoce
  const kn = comps.filter((c) => c.value != null)
  // Sin evaluación personal (producto excluido antes del 4C) no hay valor estratégico que mostrar
  const value = e && kn.length ? Math.round(kn.reduce((s, c) => s + c.value! * c.weight, 0) / kn.reduce((s, c) => s + c.weight, 0) * 100) : null

  // ── Alertas: incompatibilidades que una puntuación alta no puede ocultar ──
  const flags: string[] = []
  const color = crit(e, 'color'), cut = crit(e, 'cut')
  if (color?.value != null && color.value < 0.45) flags.push('El color te favorece poco')
  if (cut?.value != null && cut.value < 0.45) flags.push('El corte choca con tus preferencias o tu silueta')
  if (red >= 70) flags.push('Duplica algo que ya tienes')
  if (dependent) flags.push('Depende de compras futuras para poder usarla')
  if (e?.verdict === 'skip') flags.push('El evaluador personal (4C) no lo compraría')

  const price = Number(h.current_price), med = opts.medianPrice ?? null
  const price_tier = !priced || !med ? null : price < med * 0.75 ? 'económica' : price > med * 1.33 ? 'premium' : 'media'
  let decision: Decision
  if (!level1.ok) decision = 'no_elegible'
  else if (flags.some((f) => /Duplica|4C/.test(f)) || (value ?? 0) < 45) decision = 'no_recomendado'
  else if (flags.length) decision = 'con_reservas'
  else if ((value ?? 0) >= 70 && (e?.score ?? 0) >= 60) decision = 'eleccion'
  else decision = (value ?? 0) >= 55 ? 'buena_opcion' : 'con_reservas'
  const why = comps.filter((c) => c.value != null && c.value >= 0.7).map((c) => c.label.toLowerCase())
  const decision_text = decision === 'no_elegible' ? `No disponible para ti: ${checks.filter((c) => c.ok === false).map((c) => c.detail).join('; ')}.`
    : decision === 'no_recomendado' ? `No lo recomiendo para «${sc.opportunity.title}»${flags.length ? `: ${flags.join('; ').toLowerCase()}` : ': aporta poco a tu estilo'}.`
    : decision === 'con_reservas' ? `Puede servir para «${sc.opportunity.title}», con reservas: ${flags.join('; ').toLowerCase() || 'su valor estratégico es moderado'}.`
    : `${decision === 'eleccion' ? 'Elección del estilista' : 'Buena opción'} para «${sc.opportunity.title}»${why.length ? `: destaca en ${why.join(', ')}` : ''}.`
  return { version: STRATEGIC_VERSION, level1, value, components: comps, flags, decision, decision_text, price_tier }
}

const ORDER: Record<Decision, number> = { eleccion: 0, buena_opcion: 1, con_reservas: 2, no_recomendado: 3, no_elegible: 4 }
/** Orden de una búsqueda estratégica: decisión, valor estratégico y, después, 4C. */
export function rankStrategic<T extends Row>(hits: T[]): T[] {
  return [...hits].sort((a, z) => ORDER[(a.strategic?.decision ?? 'no_elegible') as Decision] - ORDER[(z.strategic?.decision ?? 'no_elegible') as Decision]
    || (z.strategic?.value ?? -1) - (a.strategic?.value ?? -1) || (z.evaluation?.score ?? -1) - (a.evaluation?.score ?? -1))
}
/** Selección del estilista: hasta 3 elegibles con buena decisión, de marcas distintas; el resto, alternativas por precio. */
export function curate<T extends Row>(hits: T[], hidden: string[] = []): { selection: number[]; alternatives: number[] } {
  // Los productos que has valorado en contra (no me gusta, no es mi estilo, ya tengo algo parecido…) no vuelven a proponerse
  const visible = (h: Row) => !hidden.includes(h.canonical_url)
  const ok = hits.map((h, i) => ({ h, i })).filter(({ h }) => visible(h) && ['eleccion', 'buena_opcion'].includes(h.strategic?.decision))
  const brands = new Set<string>(); const selection: number[] = []
  for (const { h, i } of ok) { const b = String(h.brand ?? h.raw_attributes?.domain ?? '').toLowerCase(); if (selection.length < 3 && !brands.has(b)) { brands.add(b); selection.push(i) } }
  const alternatives = hits.map((h, i) => ({ h, i })).filter(({ h, i }) => visible(h) && !selection.includes(i) && ['eleccion', 'buena_opcion', 'con_reservas'].includes(h.strategic?.decision)).map(({ i }) => i)
  return { selection, alternatives }
}
export const median = (xs: number[]) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, z) => a - z); return s.length ? s[Math.floor(s.length / 2)] : null }
