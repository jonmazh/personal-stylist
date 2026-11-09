import type { Bundle } from '@/lib/profile/data'
import { compatibility, type Evaluation } from '@/lib/wardrobe/compatibility'
import { DUP_THRESHOLD, similarity } from '@/lib/wardrobe/audit'
import { garmentTitle } from '@/lib/wardrobe/display'
import { subOf } from '@/lib/wardrobe/taxonomy'
import type { Signals } from '@/lib/outfits/learning'
import { COMBINABLE, VIRTUAL_ID, effectivePriority, simulateOutfits } from './priority'
import type { SizeRecommendation } from './sizing'

/**
 * Purchase Evaluator (fase 4C): ¿merece la pena ESTE producto para TU armario? Puntuación sobre 100 explicable,
 * indicadores independientes que la puntuación no oculta, redundancia con lo que ya tienes (y qué aportaría de nuevo)
 * y un veredicto que puede ser «no lo compres». Reglas deterministas: no ordena por precio, popularidad ni tendencia.
 */
export const EVAL_VERSION = 'purchase-eval@1'
export const PURCHASE_WEIGHTS = { style: 20, cut: 20, color: 15, combos: 20, needs: 10, quality: 10, value: 5 } as const
export type PKey = keyof typeof PURCHASE_WEIGHTS
export const PURCHASE_LABEL: Record<PKey, string> = {
  style: 'Compatibilidad con tu estilo', cut: 'Corte y proporciones', color: 'Compatibilidad cromática', combos: 'Combinabilidad con tu armario',
  needs: 'Adecuación a tus necesidades', quality: 'Calidad y materiales documentados', value: 'Relación calidad-precio',
}
export const VERDICTS = [
  { id: 'buy', label: 'Comprar', help: 'Encaja contigo, cubre una necesidad y aporta al armario.' },
  { id: 'consider', label: 'Considerar', help: 'Puede merecer la pena, con matices que conviene revisar.' },
  { id: 'wait', label: 'Esperar', help: 'Falta algo (talla, precio, datos o una necesidad más urgente) antes de decidir.' },
  { id: 'skip', label: 'No comprar', help: 'No aporta lo suficiente a tu armario o no encaja contigo.' },
] as const
export type VerdictId = (typeof VERDICTS)[number]['id']

type G = Record<string, any>
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const r1 = (x: number) => Math.round(x * 10) / 10
const lc = (s: string) => s.toLowerCase()
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const NOBLE = /lana|wool|merino|algod|cotton|lino|linen|seda|silk|cachemir|cashmere|piel|leather|cuero|alpaca|mohair/
const SYNTH = /poliest|polyest|acril|acryl|poliamid|polyamid|nylon/

/** El producto como prenda virtual (para los motores del armario), con la procedencia de cada dato. */
export function productAsGarment(p: G, need?: G | null): G {
  const src = (k: string) => { const s = p.field_sources?.[k]?.source; return s === 'user' ? 'usuario' : s === 'ai' || s === 'photo' || s === 'derived' || s === 'search' ? 'ia' : s ? 'usuario' : undefined }
  const occasions = need?.spec?.occasions?.length ? need.spec.occasions : p.formality_level >= 4 ? ['trabajo', 'eventos'] : p.formality_level === 3 ? ['trabajo', 'ocio'] : ['ocio']
  return {
    id: VIRTUAL_ID, name: p.product_name, title: p.product_name, category: p.category, subcategory: p.subcategory, primary_color: p.primary_color,
    secondary_colors: (p.colors ?? []).filter((c: string) => c !== p.primary_color), cut: p.cut ?? null, silhouette: p.silhouette ?? null, pattern: p.pattern ?? 'Liso',
    formality_level: p.formality_level ?? need?.spec?.formality_min ?? null, seasons: p.seasons?.length ? p.seasons : need?.spec?.seasons ?? [], occasions,
    apparent_material: p.apparent_material ?? null, confirmed_composition: p.confirmed_composition ?? null, attributes: p.attributes ?? {}, wardrobe_status: 'active',
    field_sources: Object.fromEntries(['category', 'subcategory', 'primary_color', 'cut', 'silhouette', 'formality_level', 'seasons'].map((k) => [k, src(k) ? { source: src(k), confirmed_by: src(k) === 'usuario' ? 'usuario' : undefined } : undefined]).filter(([, v]) => v)),
  }
}

export interface PCrit { key: PKey; label: string; weight: number; value: number; points: number; reasons: string[]; missing: string[] }
export interface PurchaseEvaluation {
  version: string; weights: typeof PURCHASE_WEIGHTS; score: number; confidence: 'alta' | 'media' | 'baja'; criteria: PCrit[]
  indicators: { profile: { score: number | null; text: string }; confidence: { level: string; text: string }; sizes: { status: 'ok' | 'unknown' | 'missing' | 'out'; text: string }; price: { price: number | null; text: string; cpw: number | null }; duplicity: { level: 'alta' | 'media' | 'baja'; text: string }; combinations: { count: number; text: string } }
  redundancy: { level: 'alta' | 'media' | 'baja'; garments: { id: string; title: string; similarity: number; same: string[]; diffs: string[] }[]; newPartners: number; partners: number; adds: string[] }
  verdict: VerdictId; verdict_text: string; reasons: string[]; risks: string[]; limitations: string[]
}
export interface EvalEnv {
  garments: G[]; evals: Map<string, Evaluation>; bundle: Bundle; signals?: Signals; now?: Date
  need?: G | null; openNeeds?: G[]; size?: SizeRecommendation | null; staleDays?: number | null; analyzed?: boolean; quality?: { documented: string[]; apparent: string[]; unknown: string[] } | null
  priceDrop?: number | null; usesPerMonth?: number | null; modelPhotos?: boolean
}

export function evaluatePurchase(p: G, env: EvalEnv): PurchaseEvaluation {
  const b = env.bundle
  const need = env.need ?? null
  const v = productAsGarment(p, need)
  const replaces = need?.type === 'replacement' ? need.replaces_garment_id : null
  const active = env.garments.filter((g) => g.wardrobe_status === 'active' && g.decision !== 'donate_sell' && g.id !== replaces)
  const compat = compatibility(v, b, (p.images ?? []).length)
  const cc = (id: string) => compat.criteria.find((c) => c.id === id)
  const crit = (key: PKey): PCrit => ({ key, label: PURCHASE_LABEL[key], weight: PURCHASE_WEIGHTS[key], value: 0.5, points: 0, reasons: [], missing: [] })
  const fromCompat = (key: PKey, id: string, missingMsg: string) => {
    const c = crit(key), x = cc(id)
    if (x?.score != null) { c.value = x.score / 10; c.reasons.push(...x.why.slice(0, 2)) } else { c.missing.push(...(x?.missing.length ? x.missing.slice(0, 2) : [missingMsg])) }
    return c
  }
  const style = fromCompat('style', 'style', 'Falta tu identidad estética')
  const cut = fromCompat('cut', 'cut', 'Corte del producto sin identificar: analízalo o corrígelo')
  const color = fromCompat('color', 'color', 'Color sin identificar')

  // Combinabilidad: Outfit Engine con el producto como prenda virtual
  const combos = crit('combos')
  const outfits = p.category && COMBINABLE.includes(p.category) ? simulateOutfits(v, active, env, v.seasons) : []
  const partnersOf = (os: { items: { g: G }[] }[], self: string) => new Set(os.flatMap((o) => o.items.map((s) => s.g.id)).filter((id) => id !== self))
  const partners = partnersOf(outfits, VIRTUAL_ID)
  if (!p.category) combos.missing.push('Tipo de prenda sin identificar')
  else if (!COMBINABLE.includes(p.category)) { combos.value = 0.5; combos.reasons.push('Complemento: no cambia las combinaciones básicas.') }
  else { combos.value = clamp01(outfits.length / 12); combos.reasons.push(outfits.length ? `El motor de conjuntos forma ${outfits.length} combinación${outfits.length === 1 ? '' : 'es'} válida${outfits.length === 1 ? '' : 's'} con ${partners.size} prenda${partners.size === 1 ? '' : 's'} tuya${partners.size === 1 ? '' : 's'}.` : 'Con tus prendas actuales el motor no encuentra combinaciones válidas.') }

  // Redundancia y qué aportaría
  const sims = active.filter((g) => g.category === v.category).map((g) => ({ g, s: similarity(v, g) })).filter((x) => x.s.score >= 55).sort((a, z) => z.s.score - a.s.score).slice(0, 3)
  // Alta: una casi idéntica, o varias del mismo tipo y color (p. ej. ya tienes dos chinos beige)
  const sameKindColor = sims.filter((x) => x.s.same.includes('mismo tipo') && x.s.same.some((t) => t.startsWith('mismo color')))
  const dupes = sims.filter((x) => x.s.score >= DUP_THRESHOLD || (sameKindColor.length >= 2 && sameKindColor.includes(x)))
  const level = dupes.length ? 'alta' : sims.length ? 'media' : 'baja'
  let newPartners = partners.size
  const adds: string[] = []
  if (sims.length && COMBINABLE.includes(v.category)) {
    const top = sims[0].g
    const existing = partnersOf(simulateOutfits(top, active, env, top.seasons ?? []), top.id)
    newPartners = [...partners].filter((id) => !existing.has(id)).length
    adds.push(newPartners ? `Abriría combinaciones con ${newPartners} prenda${newPartners === 1 ? '' : 's'} que hoy no combinas con «${garmentTitle(top)}».` : `No abriría combinaciones que no tengas ya con «${garmentTitle(top)}».`)
    if (sims[0].s.diffs.length) adds.push(`Diferencias: ${sims[0].s.diffs.slice(0, 3).join('; ')}.`)
  }
  const redundancy = { level: level as 'alta' | 'media' | 'baja', garments: sims.map((x) => ({ id: x.g.id as string, title: garmentTitle(x.g), similarity: x.s.score, same: x.s.same, diffs: x.s.diffs })), newPartners, partners: partners.size, adds }
  if (level === 'alta') { combos.value = clamp01(combos.value * (partners.size ? newPartners / partners.size : 0)); combos.reasons.push('Casi todas esas combinaciones ya las tienes con una prenda parecida.') }

  // Necesidades
  const needs = crit('needs')
  const sameKind = (n: G) => n.spec?.subcategory ? n.spec.subcategory === p.subcategory : n.spec?.category === p.category
  const covering = need ?? (env.openNeeds ?? []).find((n) => sameKind(n) && n.type !== 'desire') ?? null
  if (covering) {
    const pr = effectivePriority(covering)
    needs.value = covering.type === 'desire' ? 0.3 : pr === 'high' ? 1 : pr === 'medium' ? 0.7 : 0.4
    needs.reasons.push(covering.type === 'desire' ? `Responde a un deseo («${covering.title}»), no a una necesidad del armario.` : `Cubre «${covering.title}» (prioridad ${pr === 'high' ? 'alta' : pr === 'medium' ? 'media' : 'baja'}).`)
    if (need && !sameKind(need)) { needs.value *= 0.5; needs.reasons.push('Pero no es el tipo de prenda que buscabas para esa necesidad.') }
  } else { needs.value = 0.15; needs.reasons.push('No cubre ninguna necesidad abierta de tu armario: sería un deseo.') }
  const urgentElse = (env.openNeeds ?? []).filter((n) => n.type !== 'desire' && effectivePriority(n) === 'high' && !sameKind(n) && n.id !== covering?.id).sort((a, z) => Number(z.priority_score ?? 0) - Number(a.priority_score ?? 0))[0] ?? null

  // Calidad documentada (no por precio ni por fotos)
  const quality = crit('quality')
  const comp = String(p.confirmed_composition ?? '').toLowerCase()
  if (comp) {
    const noble = NOBLE.test(comp), synth = SYNTH.test(comp)
    quality.value = noble && !synth ? 0.9 : noble ? 0.7 : synth ? 0.45 : 0.6
    quality.reasons.push(`Composición publicada: ${p.confirmed_composition}.`)
  } else { quality.value = 0.35; quality.missing.push('Composición desconocida') }
  if (env.quality?.documented.length) quality.reasons.push(...env.quality.documented.filter((d) => !d.startsWith('Composición')).slice(0, 2))
  if (env.quality?.apparent.length) { quality.value = clamp01(quality.value + 0.05); quality.reasons.push(`Apariencia en las fotos: ${lc(env.quality.apparent.slice(0, 2).join('; '))} (no demuestra la calidad real).`) }

  // Relación calidad-precio y coste por uso (sin confundir precio con calidad)
  const value = crit('value')
  const price = p.current_price != null ? Number(p.current_price) : null
  const max = need?.price_max ?? covering?.price_max ?? (Number(b.profile?.budget_max) || null)
  const uses = Math.max(1, Math.round((env.usesPerMonth ?? 3) * 30))   // usos al mes × ~30 meses de vida útil
  const cpw = price != null ? Math.round((price / uses) * 100) / 100 : null
  if (price == null) value.missing.push('Precio sin comprobar')
  else {
    value.value = max ? (price <= max ? clamp01(0.6 + quality.value * 0.4) : clamp01(0.4 - (price - max) / max)) : clamp01(0.3 + quality.value * 0.5)
    value.reasons.push(max ? (price <= max ? `${price} € dentro de tu límite (${max} €).` : `${price} € por encima de tu límite (${max} €).`) : `${price} €; sin límite de precio definido.`)
    if (cpw != null) value.reasons.push(`Coste por uso estimado: ~${cpw.toLocaleString('es-ES')} € (≈ ${uses} usos).`)
    if (env.priceDrop) value.reasons.push(`Ha bajado ${env.priceDrop} € desde la primera vez que lo viste.`)
  }

  const criteria = [style, cut, color, combos, needs, quality, value].map((c) => ({ ...c, value: r1(clamp01(c.value) * 10) / 10, points: r1(clamp01(c.value) * c.weight) }))
  const score = Math.round(criteria.reduce((s, c) => s + c.points, 0))

  // Confianza: datos del producto + datos del perfil
  const known = [p.subcategory, p.primary_color, p.cut, p.formality_level, p.confirmed_composition].filter((x) => x != null).length
  const aiOnly = ['subcategory', 'primary_color', 'cut'].filter((k) => ['ai', 'photo', 'derived', 'search'].includes(p.field_sources?.[k]?.source)).length
  const missingCount = criteria.reduce((s, c) => s + c.missing.length, 0)
  const confidence: 'alta' | 'media' | 'baja' = known >= 4 && missingCount <= 1 && aiOnly <= 1 ? 'alta' : known >= 2 && missingCount <= 3 ? 'media' : 'baja'

  // Límites, riesgos e indicadores
  const limitations: string[] = []
  if (!p.confirmed_composition) limitations.push('Composición desconocida: la calidad del tejido no se puede valorar.')
  if (price == null) limitations.push('Precio sin comprobar.')
  if (!env.analyzed) limitations.push('Producto sin analizar: corte, silueta y formalidad pueden faltar o venir solo del nombre.')
  if (aiOnly) limitations.push(`${aiOnly} dato${aiOnly === 1 ? '' : 's'} clave (tipo, color o corte) proceden de la IA o del nombre, sin confirmar.`)
  if (env.staleDays == null || env.staleDays > 3) limitations.push('Precio y tallas sin verificar recientemente: compruébalos antes de comprar.')
  const risks: string[] = []
  if (color.value < 0.4 && !color.missing.length) risks.push('El color no favorece a tu colorimetría.')
  if (cut.value < 0.4 && !cut.missing.length) risks.push('El corte no va con tus proporciones o preferencias.')
  if (level === 'alta') risks.push('Riesgo alto de duplicar algo que ya tienes.')
  const sz = env.size
  const variants: G[] = p.variants ?? []
  const sizes = sz?.size
    ? { status: (sz.available === false ? 'out' : 'ok') as 'ok' | 'out', text: `Talla recomendada: ${sz.size} (confianza ${sz.confidence})${sz.available === false ? ', agotada' : sz.available ? ', disponible' : ''}.` }
    : variants.length ? { status: 'unknown' as const, text: `Tallas disponibles: ${variants.filter((x) => x.availability !== 'out_of_stock').map((x) => x.size).join(', ') || 'ninguna'}; sin referencia para recomendar una.` }
      : { status: 'missing' as const, text: 'Sin información de tallas.' }
  if (sizes.status === 'out') risks.push('Tu talla probable está agotada.')
  if (p.availability_status === 'out_of_stock') risks.push('Agotado.')
  if (env.modelPhotos) risks.push('Las fotos son con modelo: su ajuste no es el tuyo.')

  // Veredicto
  const reasons: string[] = []
  let verdict: VerdictId
  const redundantNoAdd = level === 'alta' && (!partners.size || newPartners / partners.size < 0.25)
  if (redundantNoAdd || score < 45 || (color.value < 0.35 && !color.missing.length)) verdict = 'skip'
  else if (p.availability_status === 'out_of_stock' || sizes.status === 'out' || (!covering && urgentElse) || (price != null && max != null && price > max * 1.3)) verdict = 'wait'
  else if (score >= 75 && confidence !== 'baja' && level !== 'alta' && covering && covering.type !== 'desire') verdict = 'buy'
  else verdict = 'consider'

  const goodAt = criteria.filter((c) => c.value >= 0.75 && !c.missing.length).map((c) => lc(c.label))
  if (goodAt.length) reasons.push(`A favor: ${goodAt.slice(0, 3).join(', ')}.`)
  let text: string
  if (verdict === 'skip' && redundantNoAdd) {
    text = `${style.value >= 0.6 ? 'Es compatible con tu estilo, pero no lo compraría' : 'No lo compraría'}. Ya tienes ${dupes.length === 1 ? 'una prenda que cumple' : `${dupes.length} prendas que cumplen`} prácticamente la misma función (${dupes.map((x) => `«${garmentTitle(x.g)}»`).join(', ')}). ${newPartners ? `Apenas ampliaría tus combinaciones (${newPartners} prenda${newPartners === 1 ? '' : 's'} nueva${newPartners === 1 ? '' : 's'} con la que combinar).` : 'No ampliaría tus combinaciones.'}${urgentElse ? ` Priorizaría invertir en «${urgentElse.title}», donde hay una necesidad mayor.` : ''}`
  } else if (verdict === 'skip') {
    text = `No lo compraría: ${color.value < 0.35 && !color.missing.length ? 'el color no te favorece' : `encaja poco contigo y con tu armario (${score}/100)`}.${urgentElse ? ` Priorizaría «${urgentElse.title}».` : ''}`
  } else if (verdict === 'wait') {
    text = p.availability_status === 'out_of_stock' || sizes.status === 'out' ? 'Esperaría: no está disponible en tu talla. Puedes dejarlo en seguimiento.'
      : !covering && urgentElse ? `Esperaría: no cubre ninguna necesidad y ahora mismo es más importante «${urgentElse.title}».`
        : 'Esperaría: el precio supera bastante tu límite para lo que aporta.'
  } else if (verdict === 'buy') {
    text = `Lo compraría: ${goodAt.slice(0, 2).join(' y ') || 'encaja contigo'}, cubre «${covering!.title}» y ${outfits.length ? `abre ${outfits.length} combinaciones con tu ropa` : 'completa tu armario'}.${limitations.length ? ' Antes, revisa: ' + lcFirst(limitations[0]) : ''}`
  } else {
    const weak = criteria.filter((c) => c.value < 0.5 || c.missing.length).map((c) => lc(c.label))
    text = `Podría merecer la pena (${score}/100)${weak.length ? `, pero flojea en ${weak.slice(0, 2).join(' y ')}` : ''}.${!covering ? ' No cubre una necesidad: sería un deseo.' : ''}`
  }
  if (verdict !== 'skip' && level !== 'baja') text += ` Además, se parece a ${sims.slice(0, 2).map((x) => `«${garmentTitle(x.g)}»`).join(' y ')}: mira qué aportaría de nuevo.`

  const profScore = compat.score
  return {
    version: EVAL_VERSION, weights: PURCHASE_WEIGHTS, score, confidence, criteria,
    indicators: {
      profile: { score: profScore, text: profScore != null ? `${profScore.toLocaleString('es-ES')}/10${compat.provisional ? ' (provisional)' : ''}` : 'Sin datos suficientes' },
      confidence: { level: confidence, text: confidence === 'alta' ? 'Datos completos y confirmados.' : confidence === 'media' ? 'Faltan algunos datos o están sin confirmar.' : 'Pocos datos fiables: tómalo como orientación.' },
      sizes, price: { price, cpw, text: price == null ? 'Sin comprobar' : `${price.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €${env.priceDrop ? ` (−${env.priceDrop} €)` : ''}` },
      duplicity: { level, text: level === 'alta' ? `Muy parecido a ${redundancy.garments[0].title}` : level === 'media' ? `Se parece a ${redundancy.garments[0].title}` : 'Nada parecido en tu armario' },
      combinations: { count: outfits.length, text: COMBINABLE.includes(p.category) ? `${outfits.length} conjuntos con ${partners.size} prendas tuyas` : 'No aplica' },
    },
    redundancy, verdict, verdict_text: text, reasons, risks, limitations,
  }
}
export const kindLabel = (p: G) => (p.subcategory ? subOf(p.subcategory)?.label : p.category) ?? 'Prenda'
