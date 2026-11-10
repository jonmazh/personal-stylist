import type { Bundle } from '@/lib/profile/data'
import { compatibility, type Evaluation } from '@/lib/wardrobe/compatibility'
import { DUP_THRESHOLD, categoryCoverage, occasionCoverage, similarity } from '@/lib/wardrobe/audit'
import { garmentTitle } from '@/lib/wardrobe/display'
import { subOf } from '@/lib/wardrobe/taxonomy'
import { LIFE } from '@/lib/profile/areas'
import type { Signals } from '@/lib/outfits/learning'
import { COMBINABLE, VIRTUAL_ID, effectivePriority, simulateOutfits } from './priority'
import type { SizeRecommendation } from './sizing'
import { buildShopperContext, type Conf, type ShopperContext } from './intelligence/context'
import { analyzeColor, type ColorAnalysis } from './intelligence/color'

/**
 * Personal Shopper Intelligence (evolución de 4C): ¿merece la pena ESTE producto para TI y TU armario?
 * - Puntuación sobre 100 con seis criterios explicables y pesos configurables.
 * - Lo desconocido NO se puntúa como negativo: el criterio queda neutro (50 %) y baja la confianza.
 * - Indicadores separados: confianza, completitud de datos, redundancia, Wardrobe Value Added, outfits nuevos (con IDs
 *   reales del Outfit Engine), talla y verificación.
 * - Veredicto que puede ser «no lo compraría». Reglas deterministas; la IA solo interpreta productos (Product Analyzer).
 */
export const EVAL_VERSION = 'personal-shopper@1'
export const PURCHASE_WEIGHTS = { color: 25, cut: 20, style: 15, wardrobe: 20, need: 10, quality: 10 } as const
export type PKey = keyof typeof PURCHASE_WEIGHTS
export const PURCHASE_LABEL: Record<PKey, string> = {
  color: 'Compatibilidad cromática', cut: 'Corte y proporciones', style: 'Identidad estética', wardrobe: 'Compatibilidad con tu armario',
  need: 'Necesidad y utilidad', quality: 'Calidad y precio',
}
export const PURCHASE_HELP: Record<PKey, string> = {
  color: 'Te favorece (colorimetría y contraste), aporta colores que faltan y combina con tus prendas.',
  cut: 'Corte, silueta, largo y volumen frente a tus preferencias de ajuste y tus proporciones.',
  style: 'Encaje con tus estilos validados, referencias, rasgos que prefieres o rechazas y marcas.',
  wardrobe: 'Wardrobe Value Added: outfits nuevos validados, ocasiones, huecos, diferenciación y versatilidad.',
  need: 'Si resuelve un hueco, es una mejora, una sustitución necesaria o un deseo.',
  quality: 'Materiales documentados y precio frente a utilidad y calidad conocida (nunca el precio como prueba de calidad).',
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
const NOBLE = /lana|wool|merino|algod|cotton|lino|linen|seda|silk|cachemir|cashmere|piel|leather|cuero|ante|suede|alpaca|mohair/
const SYNTH = /poliest|polyest|acril|acryl|poliamid|polyamid|nylon/
const CONF_FACTOR: Record<string, number> = { alta: 1, media: 0.7, baja: 0.4 }

export function normalizeWeights(w?: Partial<Record<PKey, number>> | null): Record<PKey, number> {
  const out = { ...PURCHASE_WEIGHTS } as Record<PKey, number>
  if (w) for (const k of Object.keys(out) as PKey[]) if (typeof w[k] === 'number' && w[k]! >= 0) out[k] = w[k]!
  const t = Object.values(out).reduce((s, x) => s + x, 0)
  if (!t) return { ...PURCHASE_WEIGHTS }
  for (const k of Object.keys(out) as PKey[]) out[k] = Math.round((out[k] / t) * 1000) / 10
  return out
}

/** El producto como prenda virtual (para los motores del armario), con la procedencia de cada dato. */
export function productAsGarment(p: G, need?: G | null): G {
  const src = (k: string) => { const s = p.field_sources?.[k]?.source; return s === 'user' ? 'usuario' : s === 'ai' || s === 'photo' || s === 'derived' || s === 'search' ? 'ia' : s ? 'usuario' : undefined }
  const occasions = need?.spec?.occasions?.length ? need.spec.occasions : p.formality_level >= 4 ? ['trabajo', 'eventos'] : p.formality_level === 3 ? ['trabajo', 'ocio'] : p.formality_level ? ['ocio'] : []
  return {
    id: VIRTUAL_ID, name: p.product_name, title: p.product_name, category: p.category, subcategory: p.subcategory, primary_color: p.primary_color,
    secondary_colors: (p.colors ?? []).filter((c: string) => c !== p.primary_color), cut: p.cut ?? null, silhouette: p.silhouette ?? null, pattern: p.pattern ?? 'Liso',
    formality_level: p.formality_level ?? need?.spec?.formality_min ?? null, seasons: p.seasons?.length ? p.seasons : need?.spec?.seasons ?? [], occasions,
    apparent_material: p.apparent_material ?? null, confirmed_composition: p.confirmed_composition ?? null, attributes: p.attributes ?? {}, style_tags: p.style_tags ?? [], wardrobe_status: 'active',
    field_sources: Object.fromEntries(['category', 'subcategory', 'primary_color', 'cut', 'silhouette', 'formality_level', 'seasons'].map((k) => [k, src(k) ? { source: src(k), confirmed_by: src(k) === 'usuario' ? 'usuario' : undefined } : undefined]).filter(([, v]) => v)),
  }
}

export interface PCrit { key: PKey; label: string; weight: number; value: number | null; points: number; known: boolean; confidence: Conf | null; reasons: string[]; missing: string[] }
export interface WVA {
  score: number; new_outfits: number; total_outfits: number; partners: number; outfit_samples: { garment_ids: string[]; titles: string[]; score: number }[]
  occasions_new: string[]; gaps: string[]; differentiation: number; replaces: string | null; versatility: number; cpw: number | null; reasons: string[]
}
export interface PurchaseEvaluation {
  version: string; weights: Record<PKey, number>; score: number; confidence: 'alta' | 'media' | 'baja'; confidence_score: number; completeness: number; redundancy_score: number
  criteria: PCrit[]; color: ColorAnalysis | null; wva: WVA; combines_with: { id: string; title: string }[]
  indicators: { profile: { score: number | null; text: string }; confidence: { level: string; text: string }; sizes: { status: 'ok' | 'unknown' | 'missing' | 'out'; text: string }; price: { price: number | null; text: string; cpw: number | null }; duplicity: { level: 'alta' | 'media' | 'baja'; text: string }; combinations: { count: number; text: string }; wva: { score: number; text: string } }
  redundancy: { level: 'alta' | 'media' | 'baja'; garments: { id: string; title: string; similarity: number; same: string[]; diffs: string[] }[]; newPartners: number; partners: number; adds: string[] }
  verdict: VerdictId; verdict_text: string; reasons: string[]; risks: string[]; limitations: string[]; missing_info: string[]; discard_reasons: string[]
}
export interface EvalEnv {
  garments: G[]; evals: Map<string, Evaluation>; bundle: Bundle; signals?: Signals; now?: Date; ctx?: ShopperContext; weights?: Partial<Record<PKey, number>> | null
  need?: G | null; openNeeds?: G[]; size?: SizeRecommendation | null; staleDays?: number | null; analyzed?: boolean; quality?: { documented: string[]; apparent: string[]; unknown: string[] } | null
  priceDrop?: number | null; usesPerMonth?: number | null; modelPhotos?: boolean; fast?: boolean
}

export function evaluatePurchase(p: G, env: EvalEnv): PurchaseEvaluation {
  const ctx = env.ctx ?? buildShopperContext({ bundle: env.bundle, garments: env.garments, evals: env.evals, signals: env.signals, needs: env.openNeeds ?? [], now: env.now })
  const b = ctx.bundle
  const weights = normalizeWeights(env.weights)
  const need = env.need ?? null
  const v = productAsGarment(p, need)
  const replaces = need?.type === 'replacement' ? need.replaces_garment_id : null
  const active = ctx.garments.filter((g) => g.id !== replaces)
  const compat = compatibility(v, b, (p.images ?? []).length)
  const cc = (id: string) => compat.criteria.find((c) => c.id === id)
  const crit = (key: PKey): PCrit => ({ key, label: PURCHASE_LABEL[key], weight: weights[key], value: null, points: 0, known: false, confidence: null, reasons: [], missing: [] })
  const sameKind = (n: G) => n.spec?.subcategory ? n.spec.subcategory === p.subcategory : n.spec?.category === p.category

  // 1. Color: personal + necesidad cromática del armario + combinabilidad
  const color = crit('color')
  const ca = analyzeColor(p.primary_color, p.category, { ...ctx, garments: active })
  if (!ca) color.missing.push(p.primary_color === 'Multicolor' ? 'Color dominante (multicolor)' : 'El color del producto')
  else {
    color.value = ca.value; color.confidence = ca.confidence; color.reasons.push(...ca.reasons)
    if (ca.personal.value == null) color.missing.push('Tu colorimetría (temperatura): no puedo afirmar que este color te favorezca')
    else if (ctx.color.confidence === 'baja') color.reasons.push('Tu colorimetría es una estimación sin validar: tómalo como orientación.')
    if (need?.spec?.colors?.length && need.spec.colors.includes(p.primary_color)) color.reasons.push(`Es el color que pediste (${lc(p.primary_color)}).`)
    else if (need?.spec?.colors?.length) color.reasons.push(`Pediste ${need.spec.colors.map(lc).join(' o ')}; este es ${lc(p.primary_color)}${ca.label === 'favorable-poco-representado' ? ', que además te favorece y te falta' : ''}.`)
    if (p.field_sources?.primary_color && ['ai', 'derived', 'search', 'photo'].includes(p.field_sources.primary_color.source)) { color.confidence = 'baja'; color.missing.push('Color confirmado por la tienda o por ti') }
  }
  if (ctx.color.contrast) color.reasons.push(`Contraste personal ${lc(ctx.color.contrast)}${ca && ctx.color.contrast === 'Alto' && ca.personal.verdict === 'favorece' ? ': admite colores definidos' : ''}.`)

  // 2. Corte y proporciones (preferencias, morfología y ajuste real)
  const cut = crit('cut')
  const cx = cc('cut')
  if (cx?.score != null) { cut.value = cx.score / 10; cut.confidence = cx.confidence; cut.reasons.push(...cx.why) }
  cut.missing.push(...(cx?.missing ?? []))
  if (!p.cut && !p.silhouette && !['footwear', 'accessories'].includes(p.category)) cut.missing.push('Corte o silueta del producto (analízalo o corrígelo)')

  // 3. Identidad estética
  const style = crit('style')
  const sx = cc('style')
  if (sx?.score != null) { style.value = sx.score / 10; style.confidence = sx.confidence; style.reasons.push(...sx.why.slice(0, 3)) }
  style.missing.push(...(sx?.missing ?? []))
  const brand = lc(String(p.brand ?? p.retailers?.name ?? ''))
  if (brand && ctx.style.brands.some((x) => lc(x) === brand)) { style.value = clamp01((style.value ?? 0.6) + 0.1); style.reasons.push(`${p.brand ?? p.retailers?.name} está entre tus marcas de referencia.`) }

  // 4. Armario: Wardrobe Value Added (Outfit Engine con el producto como prenda virtual)
  const wardrobe = crit('wardrobe')
  const outfits = p.category && COMBINABLE.includes(p.category) ? simulateOutfits(v, active, { bundle: b, evals: ctx.evals, signals: ctx.signals, now: env.now }, v.seasons) : []
  const partnersOf = (os: { items: { g: G }[] }[], self: string) => new Set(os.flatMap((o) => o.items.map((s) => s.g.id as string)).filter((id) => id !== self))
  const partners = partnersOf(outfits, VIRTUAL_ID)
  const sims = active.filter((g) => g.category === v.category).map((g) => ({ g, s: similarity(v, g) })).filter((x) => x.s.score >= 55).sort((a, z) => z.s.score - a.s.score).slice(0, 3)
  const sameKindColor = sims.filter((x) => x.s.same.includes('mismo tipo') && x.s.same.some((t) => t.startsWith('mismo color')))
  // Duplicado: casi idéntica; o varias del mismo tipo y color; o una del mismo tipo y color cuando ese color ya satura la categoría
  const saturated = ca?.wardrobe.saturation === 'saturado'
  const dupes = sims.filter((x) => x.s.score >= DUP_THRESHOLD || (sameKindColor.includes(x) && (sameKindColor.length >= 2 || saturated)))
  const level: 'alta' | 'media' | 'baja' = dupes.length ? 'alta' : sims.length ? 'media' : 'baja'
  let newPartnerIds = new Set(partners)
  const adds: string[] = []
  if (sims.length && COMBINABLE.includes(v.category) && !env.fast) {
    const top = sims[0].g
    const existing = partnersOf(simulateOutfits(top, active, { bundle: b, evals: ctx.evals, signals: ctx.signals, now: env.now }, top.seasons ?? []), top.id)
    const similarIds = new Set(sims.map((x) => x.g.id as string))
    newPartnerIds = new Set([...partners].filter((id) => !existing.has(id) && !similarIds.has(id)))   // la prenda parecida no es «nueva»
    adds.push(newPartnerIds.size ? `Abriría combinaciones con ${newPartnerIds.size} prenda${newPartnerIds.size === 1 ? '' : 's'} que hoy no combinas con «${garmentTitle(top)}».` : `No abriría combinaciones que no tengas ya con «${garmentTitle(top)}».`)
    if (sims[0].s.diffs.length) adds.push(`Diferencias: ${sims[0].s.diffs.slice(0, 3).join('; ')}.`)
  } else if (sims.length) newPartnerIds = new Set([...partners].filter(() => level !== 'alta'))
  const byId = new Map(active.map((g) => [g.id as string, g]))
  // Si es casi un duplicado, solo cuentan los conjuntos con prendas que la parecida no combina; si es distinta (otro color,
  // corte o tejido), sus conjuntos son looks nuevos aunque compartan prendas
  const newOutfits = level === 'alta' ? outfits.filter((o) => o.items.some((s) => newPartnerIds.has(s.g.id))) : outfits
  const samples = newOutfits.slice(0, 3).map((o) => ({ garment_ids: o.items.map((s) => s.g.id as string), titles: o.items.map((s) => (s.g.id === VIRTUAL_ID ? 'Este producto' : garmentTitle(byId.get(s.g.id) ?? s.g))), score: Math.round(o.scored.total) }))
  // Ocasiones que cubriría y que hoy no están cubiertas
  const before = occasionCoverage(active, b), after = occasionCoverage([...active, v], b)
  const occasionsNew = before.filter((o) => !o.covered && after.find((x) => x.occasion === o.occasion)?.covered).map((o) => LIFE.find(([k]) => k === o.occasion)?.[1] ?? o.occasion)
  // Huecos: necesidad abierta del mismo tipo o categoría sin prendas / con poca variedad
  const covering = need ?? ctx.needs.find((n) => sameKind(n) && n.type !== 'desire') ?? null
  const cov = categoryCoverage(active, ctx.evals, b).find((c) => c.id === p.category)
  const gaps = [...(covering && covering.type !== 'desire' ? [covering.title as string] : []), ...(cov && ['Sin prendas', 'Falta variedad'].includes(cov.status) ? [`${cov.label}: ${lc(cov.status)}`] : [])]
  const differentiation = sims.length ? clamp01(1 - sims[0].s.score / 100) : 1
  const complement = new Set(active.filter((g) => partners.has(g.id)).map((g) => g.category))
  const versatility = clamp01(complement.size / 3)
  const price = p.current_price != null ? Number(p.current_price) : null
  const uses = Math.max(1, Math.round((env.usesPerMonth ?? 3) * 30))
  const cpw = price != null ? Math.round((price / uses) * 100) / 100 : null
  const parts: [number, number][] = []
  if (COMBINABLE.includes(p.category)) parts.push([clamp01(newOutfits.length / 10), 30], [versatility, 10])
  parts.push([occasionsNew.length ? 1 : 0.4, 15], [gaps.length ? 1 : 0.3, 20], [differentiation, 15])
  if (cpw != null) parts.push([cpw <= 1 ? 1 : cpw <= 3 ? 0.75 : cpw <= 6 ? 0.45 : 0.2, 10])
  const wvaScore = Math.round((parts.reduce((s, [x, w]) => s + x * w, 0) / parts.reduce((s, [, w]) => s + w, 0)) * 100)
  const wvaReasons = [
    ...(COMBINABLE.includes(p.category) ? [outfits.length ? `El Outfit Engine forma ${outfits.length} conjunto${outfits.length === 1 ? '' : 's'} válido${outfits.length === 1 ? '' : 's'} con ${partners.size} prenda${partners.size === 1 ? '' : 's'} tuya${partners.size === 1 ? '' : 's'}${level === 'alta' ? `; solo ${newOutfits.length} no los puedes hacer hoy con la prenda parecida` : ''}.` : 'Con tus prendas actuales el Outfit Engine no encuentra conjuntos válidos.'] : ['Complemento: no cambia las combinaciones básicas.']),
    ...(occasionsNew.length ? [`Cubre ocasiones hoy sin cubrir: ${occasionsNew.map(lc).join(', ')}.`] : []),
    ...(gaps.length ? [`Resuelve: ${gaps.join('; ')}.`] : []),
    ...(replaces ? [`Sustituye a «${garmentTitle(byId.get(replaces) ?? ctx.bundle.garments?.find?.((g: G) => g.id === replaces) ?? { name: 'tu prenda' })}».`] : []),
    ...(cpw != null ? [`Coste por uso estimado: ~${cpw.toLocaleString('es-ES')} € (≈ ${uses} usos).`] : []),
  ]
  const wva: WVA = { score: wvaScore, new_outfits: newOutfits.length, total_outfits: outfits.length, partners: partners.size, outfit_samples: samples, occasions_new: occasionsNew, gaps, differentiation: r1(differentiation * 10) / 10, replaces: replaces ?? null, versatility: r1(versatility * 10) / 10, cpw, reasons: wvaReasons }
  if (!p.category) { wardrobe.missing.push('Tipo de prenda sin identificar') }
  else { wardrobe.value = wvaScore / 100; wardrobe.confidence = ctx.wardrobe.total >= 8 ? 'alta' : ctx.wardrobe.total >= 4 ? 'media' : 'baja'; wardrobe.reasons.push(...wvaReasons.slice(0, 3)) }
  if (level === 'alta') wardrobe.reasons.push('Casi todo lo que aporta ya lo cubre una prenda muy parecida.')
  if (ctx.wardrobe.total < 4) wardrobe.missing.push('Más prendas en tu armario para simular combinaciones')

  // 5. Necesidad y utilidad
  const needC = crit('need')
  if (covering) {
    const pr = effectivePriority(covering)
    needC.value = covering.type === 'desire' ? 0.3 : covering.type === 'replacement' ? 0.9 : pr === 'high' ? 1 : pr === 'medium' ? 0.7 : 0.45
    needC.reasons.push(covering.type === 'desire' ? `Responde a un deseo («${covering.title}»), no a una necesidad del armario.` : covering.type === 'replacement' ? `Es una sustitución: «${covering.title}».` : covering.type === 'improvement' ? `Es una mejora: «${covering.title}».` : `Cubre «${covering.title}» (prioridad ${pr === 'high' ? 'alta' : pr === 'medium' ? 'media' : 'baja'}).`)
    if (need && !sameKind(need)) { needC.value *= 0.5; needC.reasons.push('Pero no es el tipo de prenda que buscabas para esa necesidad.') }
    needC.confidence = 'alta'
  } else { needC.value = 0.15; needC.confidence = 'media'; needC.reasons.push('No cubre ninguna necesidad abierta de tu armario: sería un capricho (es legítimo, pero es un deseo).') }
  const urgentElse = ctx.needs.filter((n) => n.type !== 'desire' && effectivePriority(n) === 'high' && !sameKind(n) && n.id !== covering?.id).sort((a, z) => Number(z.priority_score ?? 0) - Number(a.priority_score ?? 0))[0] ?? null

  // 6. Calidad y precio (materiales documentados; el precio nunca prueba calidad)
  const quality = crit('quality')
  const comp = lc(String(p.confirmed_composition ?? ''))
  let qv: number | null = null
  if (comp) { const noble = NOBLE.test(comp), synth = SYNTH.test(comp); qv = noble && !synth ? 0.9 : noble ? 0.7 : synth ? 0.45 : 0.6; quality.reasons.push(`Composición publicada: ${p.confirmed_composition}.`) }
  else quality.missing.push('Composición desconocida')
  if (env.quality?.documented.length) quality.reasons.push(...env.quality.documented.filter((d) => !d.startsWith('Composición')).slice(0, 2))
  if (env.quality?.apparent.length) quality.reasons.push(`Apariencia en las fotos: ${lc(env.quality.apparent.slice(0, 2).join('; '))} (no demuestra la calidad real).`)
  const max = need?.price_max ?? covering?.price_max ?? (Number(b.profile?.budget_max) || null)
  let pv: number | null = null
  if (price == null) quality.missing.push('Precio sin comprobar')
  else { pv = max ? (price <= max ? 0.85 : clamp01(0.45 - (price - max) / max)) : 0.6; quality.reasons.push(max ? (price <= max ? `${price} € dentro de tu límite (${max} €).` : `${price} € por encima de tu límite (${max} €).`) : `${price} €; sin límite de precio definido.`); if (env.priceDrop) quality.reasons.push(`Ha bajado ${env.priceDrop} € desde la primera vez que lo viste.`) }
  if (qv != null || pv != null) { quality.value = qv != null && pv != null ? qv * 0.6 + pv * 0.4 : (qv ?? pv)!; quality.confidence = qv != null ? 'alta' : 'baja' }

  // Puntos: lo desconocido queda neutro (50 %) y no resta como si fuera malo
  const criteria = [color, cut, style, wardrobe, needC, quality].map((c) => {
    const known = c.value != null
    const v2 = known ? clamp01(c.value!) : 0.5
    return { ...c, value: known ? r1(v2 * 10) / 10 : null, known, points: r1(v2 * c.weight) }
  })
  const score = Math.round(criteria.reduce((s, c) => s + c.points, 0))
  const confidence_score = Math.round(criteria.reduce((s, c) => s + c.weight * (c.known ? CONF_FACTOR[c.confidence ?? 'baja'] ?? 0.4 : 0), 0))
  const fields = [p.subcategory, p.primary_color, p.cut || p.silhouette, p.formality_level, p.confirmed_composition, price, (p.variants ?? []).length || null, (p.seasons ?? []).length || null]
  const completeness = Math.round((fields.filter((x) => x != null && x !== '').length / fields.length) * 100) / 100
  const confidence: 'alta' | 'media' | 'baja' = confidence_score >= 70 && completeness >= 0.6 ? 'alta' : confidence_score >= 45 ? 'media' : 'baja'
  const redundancy_score = sims.length ? Math.min(100, sims[0].s.score + (dupes.length > 1 ? 10 : 0)) : 0

  // Límites, riesgos e indicadores
  const limitations: string[] = []
  if (!p.confirmed_composition) limitations.push('Composición desconocida: la calidad del tejido no se puede valorar.')
  if (price == null) limitations.push('Precio sin comprobar.')
  if (!env.analyzed) limitations.push('Producto sin analizar: corte, silueta y formalidad pueden faltar o venir solo del nombre.')
  const aiOnly = ['subcategory', 'primary_color', 'cut'].filter((k) => ['ai', 'photo', 'derived', 'search'].includes(p.field_sources?.[k]?.source)).length
  if (aiOnly) limitations.push(`${aiOnly} dato${aiOnly === 1 ? '' : 's'} clave (tipo, color o corte) proceden de la IA o del nombre, sin confirmar.`)
  if (env.staleDays == null || env.staleDays > 3) limitations.push('Precio y tallas sin verificar recientemente: compruébalos antes de comprar.')
  limitations.push('El ajuste real no se puede garantizar con imágenes de la tienda: confírmalo al probártelo.')
  const missing_info = [...new Set(criteria.flatMap((c) => c.missing))]
  const risks: string[] = []
  if (ca && ca.personal.value != null && ca.personal.value < 0.5) risks.push(ca.personal.avoided ? 'Es un color que evitas.' : 'El color no favorece a tu colorimetría cerca de la cara.')
  if (ca?.wardrobe.saturation === 'saturado') risks.push(`Ya tienes ${ca.wardrobe.inCategory} prendas de ese color en esta categoría.`)
  if (cut.value != null && cut.value < 0.5) risks.push('El corte no va con tus proporciones o preferencias.')
  if (level === 'alta') risks.push('Riesgo alto de duplicar algo que ya tienes.')
  if (env.modelPhotos) risks.push('Las fotos son con modelo: su ajuste no es el tuyo.')
  const sz = env.size, variants: G[] = p.variants ?? []
  const sizes = sz?.size ? { status: (sz.available === false ? 'out' : 'ok') as 'ok' | 'out', text: `Talla recomendada: ${sz.size} (confianza ${sz.confidence})${sz.available === false ? ', agotada' : sz.available ? ', disponible' : ''}.` }
    : variants.length ? { status: 'unknown' as const, text: `Tallas disponibles: ${variants.filter((x) => x.availability !== 'out_of_stock').map((x) => x.size).join(', ') || 'ninguna'}; sin referencia para recomendar una.` }
      : { status: 'missing' as const, text: 'Sin información de tallas.' }
  if (sizes.status === 'out') risks.push('Tu talla probable está agotada.')
  if (p.availability_status === 'out_of_stock') risks.push('Agotado.')

  // Veredicto
  const redundantNoAdd = level === 'alta' && (!partners.size || newPartnerIds.size / Math.max(1, partners.size) < 0.25)
  const badColor = !!ca && ca.personal.value != null && ca.personal.value < 0.35 && ca.personal.confidence !== 'baja'
  const badCut = cut.value != null && cut.value < 0.35
  const discard_reasons: string[] = []
  if (redundantNoAdd) discard_reasons.push(`Duplica ${dupes.map((x) => `«${garmentTitle(x.g)}»`).join(', ')} y apenas abre combinaciones nuevas.`)
  if (badColor) discard_reasons.push(ca!.personal.avoided ? 'Es un color que evitas.' : 'El color no te favorece.')
  if (badCut) discard_reasons.push('El corte choca con tus preferencias o con lo que nunca te pondrías.')
  if (score < 50) discard_reasons.push(`Encaja poco contigo y con tu armario (${score}/100).`)
  let verdict: VerdictId
  if (discard_reasons.length) verdict = 'skip'
  else if (p.availability_status === 'out_of_stock' || sizes.status === 'out' || (!covering && urgentElse) || (price != null && max != null && price > max * 1.3)) verdict = 'wait'
  else if (score >= 75 && confidence_score >= 55 && level !== 'alta' && covering && covering.type !== 'desire' && !(ca?.personal.value != null && ca.personal.value < 0.5) && !(cut.value != null && cut.value < 0.5)) verdict = 'buy'
  else verdict = 'consider'

  const goodAt = criteria.filter((c) => c.known && c.value! >= 0.75).map((c) => lc(c.label))
  const reasons: string[] = []
  if (goodAt.length) reasons.push(`A favor: ${goodAt.slice(0, 3).join(', ')}.`)
  if (ca?.label === 'favorable-poco-representado') reasons.push(`El ${lc(ca.color)} te favorece y apenas lo tienes en tu armario.`)
  if (ca?.label === 'equilibra-el-armario') reasons.push(`El ${lc(ca.color)} equilibra tu armario.`)
  const partnerTitles = [...partners].map((id) => byId.get(id)).filter(Boolean).slice(0, 6).map((g) => ({ id: g!.id as string, title: garmentTitle(g!) }))
  let text: string
  if (verdict === 'skip' && redundantNoAdd) {
    text = `${style.value != null && style.value >= 0.6 ? 'Es compatible con tu estilo, pero no lo compraría' : 'No lo compraría'}. Ya tienes ${dupes.length === 1 ? 'una prenda que cumple' : `${dupes.length} prendas que cumplen`} prácticamente la misma función (${dupes.map((x) => `«${garmentTitle(x.g)}»`).join(', ')}). ${newPartnerIds.size ? `Apenas ampliaría tus combinaciones (${newPartnerIds.size} prenda${newPartnerIds.size === 1 ? '' : 's'} nueva${newPartnerIds.size === 1 ? '' : 's'} con la que combinar).` : 'No ampliaría tus combinaciones.'}${urgentElse ? ` Priorizaría invertir en «${urgentElse.title}», donde hay una necesidad mayor.` : ''}`
  } else if (verdict === 'skip') {
    text = `No lo compraría: ${lcFirst(discard_reasons[0])}${urgentElse ? ` Priorizaría «${urgentElse.title}».` : ''}`
  } else if (verdict === 'wait') {
    text = p.availability_status === 'out_of_stock' || sizes.status === 'out' ? 'Esperaría: no está disponible en tu talla. Puedes dejarlo en seguimiento.'
      : !covering && urgentElse ? `Esperaría: no cubre ninguna necesidad y ahora mismo es más importante «${urgentElse.title}».`
        : 'Esperaría: el precio supera bastante tu límite para lo que aporta.'
  } else if (verdict === 'buy') {
    text = `Compra recomendada: ${goodAt.slice(0, 2).join(' y ') || 'encaja contigo'}; cubre «${covering!.title}»${newOutfits.length ? ` y permite ${newOutfits.length} conjunto${newOutfits.length === 1 ? '' : 's'} nuevo${newOutfits.length === 1 ? '' : 's'} con tu ropa` : ''}.${limitations.length > 1 ? ' Antes, revisa: ' + lcFirst(limitations[0]) : ''}`
  } else {
    const weak = criteria.filter((c) => c.known && c.value! < 0.5).map((c) => lc(c.label))
    const unknown = criteria.filter((c) => !c.known).map((c) => lc(c.label))
    text = `Podría merecer la pena (${score}/100)${weak.length ? `, pero flojea en ${weak.slice(0, 2).join(' y ')}` : ''}${unknown.length ? `; faltan datos de ${unknown.slice(0, 2).join(' y ')}` : ''}.${!covering ? ' No cubre una necesidad: sería un deseo.' : ''}`
  }
  if (verdict !== 'skip' && level !== 'baja') text += ` Además, se parece a ${sims.slice(0, 2).map((x) => `«${garmentTitle(x.g)}»`).join(' y ')}: mira qué aportaría de nuevo.`

  return {
    version: EVAL_VERSION, weights, score, confidence, confidence_score, completeness, redundancy_score, criteria, color: ca, wva, combines_with: partnerTitles,
    indicators: {
      profile: { score: compat.score, text: compat.score != null ? `${compat.score.toLocaleString('es-ES')}/10${compat.provisional ? ' (provisional)' : ''}` : 'Sin datos suficientes' },
      confidence: { level: confidence, text: `${confidence_score}/100 · datos del producto al ${Math.round(completeness * 100)} %${missing_info.length ? ` · falta: ${missing_info.slice(0, 2).join(', ').toLowerCase()}` : ''}` },
      sizes, price: { price, cpw, text: price == null ? 'Sin comprobar' : `${price.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €${env.priceDrop ? ` (−${env.priceDrop} €)` : ''}` },
      duplicity: { level, text: level === 'alta' ? `Muy parecido a ${sims[0].g ? garmentTitle(sims[0].g) : ''}` : level === 'media' ? `Se parece a ${garmentTitle(sims[0].g)}` : 'Nada parecido en tu armario' },
      combinations: { count: outfits.length, text: COMBINABLE.includes(p.category) ? `${newOutfits.length} nuevos de ${outfits.length} conjuntos con ${partners.size} prendas tuyas` : 'No aplica' },
      wva: { score: wvaScore, text: `${wvaScore}/100` },
    },
    redundancy: { level, garments: sims.map((x) => ({ id: x.g.id as string, title: garmentTitle(x.g), similarity: x.s.score, same: x.s.same, diffs: x.s.diffs })), newPartners: newPartnerIds.size, partners: partners.size, adds },
    verdict, verdict_text: text, reasons, risks, limitations, missing_info, discard_reasons,
  }
}
export const kindLabel = (p: G) => (p.subcategory ? subOf(p.subcategory)?.label : p.category) ?? 'Prenda'
