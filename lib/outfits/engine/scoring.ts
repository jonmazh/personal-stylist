import type { Bundle } from '@/lib/profile/data'
import { colorimetry, silhouette } from '@/lib/profile/blueprint'
import { colorFit } from '@/lib/color/temperature'
import { PALETTE_OF } from '@/lib/style/references'
import { styleFit, styleProfileOf, type StyleProfile } from '@/lib/style/dna'
import { styleById } from '@/lib/style/catalog'
import { garmentElements, occasionsOf, type Evaluation } from '@/lib/wardrobe/compatibility'
import { OUTFIT_OCCASIONS, roleLabel } from '../taxonomy'
import { LIFE } from '@/lib/profile/areas'
import type { Ctx, IntentId } from './context'

/**
 * Outfit Engine · etapa 5: puntuar combinaciones (100 puntos, pesos configurables).
 * No es una medida cientifica de lo bien vestido que vas: ordena alternativas y explica el criterio.
 * Cada criterio devuelve su puntuacion, sus razones y los datos usados, para poder auditarlo.
 */
export const DEFAULT_WEIGHTS = { occasion: 20, color: 20, silhouette: 20, aesthetic: 15, personal: 15, versatility: 10 } as const
export type WeightKey = keyof typeof DEFAULT_WEIGHTS
export const CRITERIA_LABEL: Record<WeightKey, string> = {
  occasion: 'Adecuación a la ocasión', color: 'Armonía cromática', silhouette: 'Equilibrio de siluetas y proporciones',
  aesthetic: 'Coherencia estética', personal: 'Ajuste y preferencias personales', versatility: 'Versatilidad y utilidad',
}
export function normalizeWeights(w?: Record<string, number>) {
  const out = { ...DEFAULT_WEIGHTS } as Record<WeightKey, number>
  for (const k of Object.keys(out) as WeightKey[]) if (w && typeof w[k] === 'number' && w[k] >= 0) out[k] = w[k]
  const total = Object.values(out).reduce((s, x) => s + x, 0) || 1
  for (const k of Object.keys(out) as WeightKey[]) out[k] = Math.round((out[k] / total) * 1000) / 10
  return out
}

export type G = Record<string, any>
export interface Slot { role: string; g: G }
export interface Crit { key: WeightKey; label: string; weight: number; value: number; points: number; reasons: string[]; cons: string[]; data_used: string[] }
export interface Scored { total: number; criteria: Crit[]; confidence: 'alta' | 'media' | 'baja'; confidenceWhy: string[]; warnings: string[]; features: Features }
export interface Features { formalityAvg: number | null; colors: string[]; accents: string[]; patterns: number; structured: boolean; neutralShare: number; liked: string[]; sporty: boolean }

const NEUTRALS = new Set(['Negro', 'Blanco', 'Gris', 'Azul marino', 'Beige', 'Camel', 'Marrón', 'Crudo', 'Antracita', 'Gris claro', 'Denim', 'Denim claro', 'Caqui'])
const LIGHT = new Set(['Blanco', 'Crudo', 'Beige', 'Gris claro', 'Azul claro', 'Denim claro', 'Rosa', 'Lila'])
const DARK = new Set(['Negro', 'Azul marino', 'Antracita', 'Marrón', 'Denim', 'Verde bosque', 'Burdeos'])
const NEAR_FACE = new Set(['top_base', 'mid_layer', 'third_layer', 'outer_layer', 'full_body'])
const SPORTY = new Set(['joggers', 'hoodie', 'sweatshirt', 'sport_top', 'sport_bottom', 'sport_jacket', 'shorts'])
const TAILORED = new Set(['blazer', 'trousers', 'suit', 'tuxedo', 'derby', 'waistcoat'])
const pal = (c?: string | null) => (c ? PALETTE_OF[c] ?? c : null)
const lc = (s: string) => s.toLowerCase()
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const title = (g: G) => g.title ?? g.name ?? 'Prenda'

export interface ScoreEnv { ctx: Ctx; bundle: Bundle; evals: Map<string, Evaluation>; weights: Record<WeightKey, number>; profile?: StyleProfile; temp?: string | null }
export function scoreEnv(ctx: Ctx, bundle: Bundle, evals: Map<string, Evaluation>, weights?: Record<string, number>): ScoreEnv {
  return { ctx, bundle, evals, weights: normalizeWeights(weights), profile: styleProfileOf(bundle), temp: colorimetry(bundle).temp ?? null }
}

function occasionCrit(items: Slot[], env: ScoreEnv): Omit<Crit, 'key' | 'label' | 'weight' | 'points'> {
  const [lo, hi] = env.ctx.formality
  const reasons: string[] = [], cons: string[] = []
  const neg = (t: string) => { reasons.push(t); cons.push(t) }, known = items.filter((s) => s.g.formality_level)
  let v = 0.7
  if (known.length) {
    const fit = known.map((s) => { const f = s.g.formality_level; return f >= lo && f <= hi ? 1 : Math.abs(f < lo ? lo - f : f - hi) === 1 ? 0.5 : 0.15 })
    v = fit.reduce((a, x) => a + x, 0) / fit.length
    const off = known.filter((s) => s.g.formality_level < lo - 1 || s.g.formality_level > hi + 1)
    if (off.length) neg(`${off.map((s) => `«${title(s.g)}» (${s.g.formality_level}/5)`).join(', ')} se sale de la formalidad buscada (${lo === hi ? lo : `${lo}–${hi}`}/5).`)
    else {
      const near = known.filter((s) => s.g.formality_level < lo || s.g.formality_level > hi)
      ;(near.length ? neg : (t: string) => reasons.push(t))(near.length ? `Formalidad casi en el punto (${lo === hi ? lo : `${lo}–${hi}`}/5): ${near.map((s) => `«${title(s.g)}» (${s.g.formality_level}/5)`).join(', ')} queda un punto ${near[0].g.formality_level < lo ? 'por debajo' : 'por encima'}.` : `Todas las prendas están en la formalidad adecuada (${lo === hi ? lo : `${lo}–${hi}`}/5).`)
    }
    const fs = known.map((s) => s.g.formality_level), spread = Math.max(...fs) - Math.min(...fs)
    if (spread >= 3) { v -= 0.2; neg('Mezcla prendas de formalidad muy distinta.') }
  } else neg('Ninguna prenda tiene la formalidad indicada: no puedo valorar bien la adecuación.')
  const occ = OUTFIT_OCCASIONS.find((o) => o.id === env.ctx.req.occasion)
  if (occ) {
    const tagged = items.filter((s) => occasionsOf(s.g).ids.includes(occ.life)).length
    if (tagged >= Math.ceil(items.length / 2)) { v += 0.08; reasons.push(`La mayoría de las prendas son de las que usas para ${lc(LIFE.find(([k]) => k === occ.life)?.[1] ?? occ.label)}.`) }
  }
  if (env.ctx.req.dress_code === 'formal' && items.some((s) => s.role === 'full_body' || s.g.subcategory === 'blazer')) { v += 0.1; reasons.push('Incluye traje o americana, como pide un código formal.') }
  return { value: clamp01(v), reasons, cons, data_used: ['Formalidad de cada prenda', 'Ocasiones de cada prenda', `Formalidad objetivo: ${env.ctx.formalitySource}`] }
}

function colorCrit(items: Slot[], env: ScoreEnv) {
  const reasons: string[] = [], cons: string[] = []
  const neg = (t: string) => { reasons.push(t); cons.push(t) }
  const cols = items.map((s) => pal(s.g.primary_color)).filter(Boolean) as string[]
  const accents = [...new Set(cols.filter((c) => !NEUTRALS.has(c)))]
  let v = accents.length === 0 ? 0.85 : accents.length === 1 ? 1 : accents.length === 2 ? 0.72 : 0.4
  ;(accents.length >= 2 ? neg : (t: string) => reasons.push(t))(accents.length === 0 ? 'Base neutra: combina sin riesgo.' : accents.length === 1 ? `Un único color de acento (${lc(accents[0])}) sobre una base neutra.` : `${accents.length} colores de acento (${accents.map(lc).join(', ')}): compiten entre sí.`)
  const patterned = items.filter((s) => s.g.pattern && !['Liso', 'Textura'].includes(s.g.pattern))
  if (patterned.length === 2) { v -= 0.15; neg(`Dos prendas estampadas (${patterned.map((s) => title(s.g)).join(' y ')}).`) }
  if (patterned.length >= 3) { v -= 0.3; neg('Demasiados estampados juntos.') }
  const c = env.bundle.color ?? {}
  const avoids: string[] = c.avoids ?? [], likes: string[] = c.likes ?? []
  for (const s of items) {
    const col = pal(s.g.primary_color); if (!col) continue
    if (avoids.includes(col)) { v -= 0.2; neg(`${col} está entre los colores que evitas.`) }
    if (env.temp && NEAR_FACE.has(s.role)) { const f = colorFit(env.temp as never, col, { nearFace: true, liked: likes.includes(col) }); if (f.verdict === 'con matices' && s.role === 'top_base') { v -= 0.1; neg(f.reason) } else if (f.verdict === 'favorece' && s.role === 'top_base') { v += 0.05; neg(`Cerca de la cara, ${lc(col)} armoniza con tu temperatura ${lc(env.temp)}.`) } }
  }
  if (likes.length && cols.some((x) => likes.includes(x))) v += 0.03
  const light = cols.filter((x) => LIGHT.has(x)).length, dark = cols.filter((x) => DARK.has(x)).length
  const contrast = c.contrast as string | undefined
  if (contrast === 'Bajo' && cols.includes('Negro') && cols.includes('Blanco')) { v -= 0.1; neg('El contraste negro-blanco es fuerte para tu contraste natural bajo.') }
  if (contrast === 'Alto' && (light === 0 || dark === 0) && cols.length >= 3) { v -= 0.05; neg('Con tu contraste alto, te favorece algo más de diferencia entre claros y oscuros.') }
  const data = ['Color y estampado de cada prenda']
  if (env.temp) data.push(`Temperatura ${lc(env.temp)}`)
  if (avoids.length || likes.length) data.push('Colores que te gustan y que evitas')
  if (contrast) data.push(`Contraste ${lc(contrast)}`)
  return { value: clamp01(v), reasons, cons, data_used: data, accents, cols, patterned: patterned.length }
}

const volTop = (g?: G) => (!g ? null : g.silhouette === 'Amplia' ? 2 : g.silhouette === 'Ajustada' ? 0 : g.silhouette === 'Regular' ? 1 : null)
const volBottom = (g?: G) => (!g ? null : g.cut === 'Wide' || g.silhouette === 'Amplia' ? 2 : g.cut === 'Slim' || g.silhouette === 'Ajustada' ? 0 : g.cut || g.silhouette ? 1 : null)
function silhouetteCrit(items: Slot[], env: ScoreEnv) {
  const reasons: string[] = [], cons: string[] = []
  const neg = (t: string) => { reasons.push(t); cons.push(t) }
  const top = items.find((s) => s.role === 'third_layer')?.g ?? items.find((s) => s.role === 'top_base')?.g
  const bottom = items.find((s) => s.role === 'bottom')?.g
  const t = volTop(top), b = volBottom(bottom)
  let v = 0.75
  const likesVolume = env.profile?.elements.liked.some((e) => ['top-oversize', 'leg-wide', 'leg-baggy'].includes(e.element))
  if (items.some((s) => s.role === 'full_body')) { v = 0.9; reasons.push('Un traje da una línea continua de arriba abajo.') }
  else if (t === null || b === null) neg('Falta la silueta o el corte de alguna prenda: valoración aproximada.')
  else if (t === 2 && b === 2) { v = likesVolume ? 0.85 : 0.55; (likesVolume ? (x: string) => reasons.push(x) : neg)(likesVolume ? 'Volumen arriba y abajo, coherente con tu gusto por las siluetas amplias.' : 'Volumen arriba y abajo: el conjunto pierde estructura.') }
  else if (t === 0 && b === 0) { v = 0.8; reasons.push('Todo ajustado: línea estilizada, pero exigente.') }
  else if (t !== b) { v = 0.92; reasons.push(t > b ? 'Más volumen arriba que abajo: contraste de volúmenes equilibrado.' : 'Parte superior más ceñida y pierna con más volumen: proporción actual.') }
  else { v = 0.95; reasons.push('Volúmenes equilibrados entre arriba y abajo.') }
  const sil = silhouette(env.bundle)
  if (sil?.legs === 'cortas' && (bottom?.attributes?.length === 'Largo' || items.some((s) => s.role === 'outer_layer' && s.g.attributes?.length === 'Largo'))) { v -= 0.1; neg('Con piernas proporcionalmente cortas, un largo con mucha acumulación o un abrigo largo acortan la figura.') }
  if (sil?.shape === 'cintura' && top?.silhouette === 'Ajustada') { v -= 0.1; neg('Una parte superior ajustada marca la cintura más que el pecho.') }
  const pref = env.bundle.profile?.fit_pref as string | undefined
  if (pref === 'Ajustado' && items.some((s) => s.g.silhouette === 'Amplia')) { v -= 0.05; neg('Prefieres un ajuste ceñido y hay alguna prenda amplia.') }
  if (pref === 'Amplio' && items.every((s) => s.g.silhouette !== 'Amplia') && t !== null) { v -= 0.05; neg('Prefieres prendas amplias y aquí no hay ninguna.') }
  const data = ['Silueta y corte de cada prenda']
  if (sil) data.push('Proporciones de tus medidas'); if (pref) data.push(`Ajuste preferido: ${lc(pref)}`)
  return { value: clamp01(v), reasons, cons, data_used: data }
}

function aestheticCrit(items: Slot[], env: ScoreEnv) {
  const reasons: string[] = [], cons: string[] = []
  const neg = (t: string) => { reasons.push(t); cons.push(t) }
  const elements = [...new Set(items.flatMap((s) => garmentElements(s.g)))]
  const p = env.profile
  let v = 0.65, data = ['Rasgos de estilo de cada prenda']
  if (p && (p.identity.influences.length || p.elements.liked.length || p.elements.rejected.length)) {
    const cands = p.identity.influences.filter((i) => styleById(i.style)?.elements.some((e) => elements.includes(e))).map((i) => i.style)
    const runs = (cands.length ? cands : [undefined]).map((style) => styleFit(p, { style, elements }))
    const best = runs.sort((a, z) => z.score - a.score)[0]
    v = best.score / 100
    reasons.push(...best.reasons.slice(0, 2))
    data.push(`Identidad estética ${p.identity.source === 'declarada' ? 'declarada' : 'propuesta'}`)
  } else neg('Sin identidad estética definida: coherencia valorada solo por las reglas de combinación.')
  const sporty = items.filter((s) => SPORTY.has(s.g.subcategory) || s.g.category === 'sport')
  const tailored = items.filter((s) => TAILORED.has(s.g.subcategory))
  if (sporty.length && tailored.length) { v -= 0.5; neg(`Mezcla deportivo (${sporty.map((s) => title(s.g)).join(', ')}) con sastrería (${tailored.map((s) => title(s.g)).join(', ')}).`) }
  if (items.some((s) => s.g.subcategory === 'derby') && items.some((s) => ['joggers', 'shorts', 'cargo'].includes(s.g.subcategory))) { v -= 0.25; neg('Zapatos de vestir con un pantalón informal.') }
  if (items.some((s) => s.role === 'full_body') && items.some((s) => s.g.subcategory === 'sneakers')) reasons.push('Traje con zapatillas: sastrería relajada (funciona si es intencionado).')
  if (items.some((s) => s.g.subcategory === 'tee' && s.g.pattern === 'Gráfico') && tailored.length) { v -= 0.1; neg('Camiseta gráfica con sastrería: un contraste arriesgado.') }
  return { value: clamp01(v), reasons, cons, data_used: data, elements }
}

function personalCrit(items: Slot[], env: ScoreEnv) {
  const reasons: string[] = [], cons: string[] = []
  const neg = (t: string) => { reasons.push(t); cons.push(t) }
  const vals = items.map((s) => { const e = env.evals.get(s.g.id); return e?.fit.score ?? e?.compat.score ?? null })
  const known = vals.filter((x): x is number => x !== null)
  let v = known.length ? known.reduce((a, x) => a + x, 0) / known.length / 10 : 0.6
  if (known.length) reasons.push(`Compatibilidad y ajuste medios de las prendas contigo: ${(known.reduce((a, x) => a + x, 0) / known.length).toLocaleString('es-ES', { maximumFractionDigits: 1 })}/10.`)
  const fitted = items.filter((s) => env.evals.get(s.g.id)?.fit.score != null)
  if (fitted.length) reasons.push(`${fitted.length} de ${items.length} prendas con prueba de ajuste confirmada.`)
  const badFit = items.filter((s) => (env.evals.get(s.g.id)?.fit.score ?? 10) < 6)
  if (badFit.length) { v -= 0.1; neg(`No te queda del todo bien: ${badFit.map((s) => title(s.g)).join(', ')}.`) }
  const modify = items.filter((s) => s.g.decision === 'modify')
  if (modify.length) { v -= 0.05; neg(`Pendiente de arreglo: ${modify.map((s) => title(s.g)).join(', ')}.`) }
  const fav = items.filter((s) => s.g.is_favorite)
  if (fav.length) { v += 0.03 * fav.length; reasons.push(`Incluye favoritas: ${fav.map((s) => title(s.g)).join(', ')}.`) }
  if (env.ctx.req.preferred_garment_ids.length) { const hit = items.filter((s) => env.ctx.req.preferred_garment_ids.includes(s.g.id)); if (hit.length) { v += 0.05 * hit.length; reasons.push(`Usa prendas que querías llevar: ${hit.map((s) => title(s.g)).join(', ')}.`) } }
  if (!known.length) neg('Sin compatibilidad ni ajuste calculados para estas prendas: valoración neutra.')
  return { value: clamp01(v), reasons, cons, data_used: ['Compatibilidad personal y Fit Assessment de cada prenda (fase 2C)', 'Favoritas y decisiones'] }
}

function versatilityCrit(items: Slot[], env: ScoreEnv) {
  const reasons: string[] = [], cons: string[] = []
  const neg = (t: string) => { reasons.push(t); cons.push(t) }
  const vals = items.map((s) => env.evals.get(s.g.id)?.value.score).filter((x): x is number => x != null)
  let v = vals.length ? vals.reduce((a, x) => a + x, 0) / vals.length / 10 : 0.6
  if (vals.length) reasons.push(`Valor estratégico medio de las prendas: ${(vals.reduce((a, x) => a + x, 0) / vals.length).toLocaleString('es-ES', { maximumFractionDigits: 1 })}.`)
  const neutral = items.filter((s) => NEUTRALS.has(pal(s.g.primary_color) ?? '')).length / items.length
  if (neutral >= 0.75) { v += 0.05; reasons.push('Casi todo neutro: cada prenda se puede reutilizar en otros conjuntos.') }
  if (env.ctx.req.comfort_priority === 'high') {
    const rigid = items.filter((s) => s.g.attributes?.structure === 'Estructurada' || s.g.attributes?.structure === 'Rígida' || s.g.subcategory === 'derby' || s.role === 'full_body')
    if (rigid.length) { v -= 0.15; neg(`Priorizas la comodidad y hay prendas rígidas: ${rigid.map((s) => title(s.g)).join(', ')}.`) }
    else reasons.push('Prendas cómodas, como pediste.')
  }
  return { value: clamp01(v), reasons, cons, data_used: ['Valor estratégico de cada prenda (fase 2C)', 'Prioridad de comodidad'], neutral }
}

/** Puntua un conjunto: 6 criterios ponderados, razones auditables, confianza y rasgos para la variedad. */
export function scoreOutfit(items: Slot[], env: ScoreEnv): Scored {
  const o = occasionCrit(items, env), c = colorCrit(items, env), s = silhouetteCrit(items, env), a = aestheticCrit(items, env), p = personalCrit(items, env), vv = versatilityCrit(items, env)
  const raw: [WeightKey, { value: number; reasons: string[]; cons: string[]; data_used: string[] }][] = [['occasion', o], ['color', c], ['silhouette', s], ['aesthetic', a], ['personal', p], ['versatility', vv]]
  const criteria: Crit[] = raw.map(([key, r]) => ({ key, label: CRITERIA_LABEL[key], weight: env.weights[key], value: Math.round(r.value * 100) / 100, points: Math.round(r.value * env.weights[key] * 10) / 10, reasons: r.reasons, cons: r.cons, data_used: r.data_used }))
  const total = Math.round(criteria.reduce((x, k) => x + k.points, 0))
  // Confianza: cuantos datos de las prendas y del perfil sostienen la puntuacion
  const why: string[] = []
  const itemData = items.filter((x) => x.g.formality_level && x.g.primary_color && (x.g.silhouette || x.g.cut || x.role === 'footwear')).length / items.length
  if (itemData < 1) why.push('Alguna prenda no tiene formalidad, color o silueta en su ficha.')
  const prof = [env.temp, env.profile?.identity.influences.length, env.bundle.fit?.prefs || env.bundle.profile?.fit_pref].filter(Boolean).length / 3
  if (prof < 1) why.push('Faltan datos de tu perfil (temperatura, identidad estética o preferencias de corte).')
  const fitted = items.filter((x) => env.evals.get(x.g.id)?.fit.score != null).length / items.length
  if (!fitted) why.push('Ninguna prenda tiene prueba de ajuste: el ajuste real es una estimación.')
  const unconfirmed = items.filter((x) => Object.values(x.g.field_sources ?? {}).some((f: any) => f?.source === 'ia' && !f?.confirmed_by)).length
  if (unconfirmed) why.push(`${unconfirmed} prenda${unconfirmed === 1 ? '' : 's'} con datos propuestos por la IA sin confirmar.`)
  const q = itemData * 0.45 + prof * 0.35 + fitted * 0.2 - (unconfirmed ? 0.1 : 0)
  const confidence = q >= 0.8 ? 'alta' : q >= 0.55 ? 'media' : 'baja'
  const warnings: string[] = []
  for (const x of items) if (x.g.decision === 'modify') warnings.push(`«${title(x.g)}» está pendiente de arreglo.`)
  if (env.ctx.season && items.some((x) => (x.g.seasons ?? []).length && !(x.g.seasons as string[]).includes(env.ctx.season))) warnings.push(`Alguna prenda no está marcada para ${env.ctx.season === 'otono' ? 'otoño' : env.ctx.season}.`)
  const fsum = items.map((x) => x.g.formality_level).filter(Boolean) as number[]
  const liked = (env.profile?.elements.liked ?? []).map((e) => e.element).filter((e) => a.elements.includes(e))
  return {
    total, criteria, confidence, confidenceWhy: why, warnings,
    features: {
      formalityAvg: fsum.length ? fsum.reduce((x, y) => x + y, 0) / fsum.length : null, colors: c.cols, accents: c.accents, patterns: c.patterned,
      structured: items.some((x) => x.g.attributes?.structure === 'Estructurada' || x.role === 'full_body' || x.g.subcategory === 'blazer'), neutralShare: vv.neutral,
      liked, sporty: items.some((x) => SPORTY.has(x.g.subcategory) || x.g.subcategory === 'sneakers'),
    },
  }
}

/** Cuanto encaja un conjunto con cada intencion (0..1): sirve para explorar interpretaciones distintas. */
export function intentFit(f: Features, intent: IntentId, ctx: Ctx): number {
  const [lo, hi] = ctx.formality
  const rel = f.formalityAvg == null ? 0.5 : hi === lo ? 0.5 : (f.formalityAvg - lo) / (hi - lo)
  switch (intent) {
    case 'elegante': return clamp01(0.5 * rel + (f.structured ? 0.3 : 0) + (f.colors.some((c) => DARK.has(c)) ? 0.2 : 0) - (f.sporty ? 0.3 : 0))
    case 'minimalista': return clamp01((new Set(f.colors).size <= 2 ? 0.5 : new Set(f.colors).size === 3 ? 0.25 : 0) + (f.patterns === 0 ? 0.3 : 0) + (f.accents.length === 0 ? 0.2 : 0))
    case 'relajada': return clamp01(0.5 * (1 - rel) + (f.structured ? 0 : 0.3) + (f.sporty ? 0.2 : 0))
    case 'personalidad': return clamp01((f.accents.length ? 0.4 : 0) + (f.patterns ? 0.3 : 0) + Math.min(0.3, f.liked.length * 0.15))
    case 'versatil': return clamp01(f.neutralShare * 0.7 + (f.patterns === 0 ? 0.3 : 0))
  }
}

/** «Por qué funciona»: lo mejor de cada criterio, en frases (la IA lo redactará mejor en 3C). */
export function explain(items: Slot[], s: Scored, ctx: Ctx) {
  const parts = items.map((x) => `${roleLabel(x.role).toLowerCase()}: ${title(x.g)}`)
  const best = [...s.criteria].sort((a, z) => z.value - a.value).filter((c) => c.value >= 0.75).slice(0, 3)
  const pros = (c: Crit) => c.reasons.filter((r) => !c.cons.includes(r))
  return { composition: parts, why: best.map((c) => pros(c)[0]).filter(Boolean), cons: s.criteria.flatMap((c) => c.cons).slice(0, 4), context: ctx.summary.join(' · ') }
}
