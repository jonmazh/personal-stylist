import type { Bundle } from '@/lib/profile/data'
import { colorimetry } from '@/lib/profile/blueprint'
import { LIFE } from '@/lib/profile/areas'
import { compatibility, type Evaluation } from '@/lib/wardrobe/compatibility'
import { DUP_THRESHOLD, categoryCoverage, occasionCoverage, similarity, type Use } from '@/lib/wardrobe/audit'
import { garmentTitle } from '@/lib/wardrobe/display'
import { GROUPS, SEASONS, subOf } from '@/lib/wardrobe/taxonomy'
import { GenerateRequest, resolveContext } from '@/lib/outfits/engine/context'
import { buildCandidates, learnedContext } from '@/lib/outfits/engine/generate'
import { scoreEnv } from '@/lib/outfits/engine/scoring'
import { emptySignals, type Signals } from '@/lib/outfits/learning'
import type { NeedSpecT, NeedType } from './taxonomy'

/**
 * Motor de prioridades de compra (fase 4A). Puntua una NECESIDAD (no un producto): cuanto la necesitas, cuanto la usarias,
 * cuantos conjuntos nuevos permitiria, cuanto encaja contigo, su urgencia y lo fiable que es la informacion.
 * Es explicable (razones y datos por criterio), configurable (pesos) y distinta de la recomendacion final del estilista.
 */
export const PRIORITY_VERSION = 'shopping-priority@1'
export const DEFAULT_PRIORITY_WEIGHTS = { need: 30, usage: 20, outfits: 20, profile: 15, urgency: 10, confidence: 5 } as const
export type PriorityKey = keyof typeof DEFAULT_PRIORITY_WEIGHTS
export const PRIORITY_LABEL: Record<PriorityKey, string> = {
  need: 'Necesidad real del armario', usage: 'Frecuencia de uso esperada', outfits: 'Potencial de nuevos outfits',
  profile: 'Adecuación al perfil', urgency: 'Urgencia estacional o funcional', confidence: 'Confianza de la información',
}
export const LEVEL_LABEL = { high: 'Alta', medium: 'Media', low: 'Baja' } as const
export const levelOf = (score: number) => (score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low') as 'high' | 'medium' | 'low'
export const VIRTUAL_ID = '00000000-0000-4000-8000-000000000000'

export function normalizePriorityWeights(w?: Record<string, number> | null) {
  const out = { ...DEFAULT_PRIORITY_WEIGHTS } as Record<PriorityKey, number>
  for (const k of Object.keys(out) as PriorityKey[]) if (w && typeof w[k] === 'number' && w[k] >= 0) out[k] = w[k]
  const total = Object.values(out).reduce((s, x) => s + x, 0)
  if (!total) return normalizePriorityWeights(null)
  for (const k of Object.keys(out) as PriorityKey[]) out[k] = Math.round((out[k] / total) * 1000) / 10
  return out
}

type G = Record<string, any>
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const r1 = (x: number) => Math.round(x * 10) / 10
const lc = (s: string) => s.toLowerCase()
const occLabel = (id: string) => LIFE.find(([k]) => k === id)?.[1].toLowerCase() ?? id

/** La prenda buscada como «prenda virtual»: se compara y se combina con tu armario sin mezclarse con él. */
export function virtualGarment(spec: NeedSpecT, title: string): G {
  const f = spec.formality_min && spec.formality_max ? Math.round((spec.formality_min + spec.formality_max) / 2) : spec.formality_min ?? spec.formality_max ?? null
  return {
    id: VIRTUAL_ID, title, name: title, category: spec.category, subcategory: spec.subcategory ?? null, primary_color: spec.colors[0] ?? null, secondary_colors: spec.colors.slice(1),
    cut: spec.cut ?? null, silhouette: spec.silhouette ?? null, pattern: 'Liso', formality_level: f, seasons: spec.seasons, occasions: spec.occasions,
    wardrobe_status: 'active', attributes: {}, field_sources: Object.fromEntries(['category', 'subcategory', 'primary_color', 'cut', 'silhouette', 'formality_level', 'seasons'].map((k) => [k, { source: 'usuario' }])),
  }
}

// Uso esperado por categoria (veces al mes con dedicacion completa) y vida util orientativa (meses), para el coste por uso
const BASE_WEARS: Record<string, number> = { top: 4, bottom: 6, footwear: 8, outerwear: 6, tailoring: 2, accessories: 4, sport: 4, underwear: 8, sleepwear: 8 }
const LIFESPAN: Record<string, number> = { top: 24, bottom: 36, footwear: 30, outerwear: 48, tailoring: 60, accessories: 48, sport: 24, underwear: 12, sleepwear: 24 }
const SEASON_ORDER = ['invierno', 'primavera', 'verano', 'otono']
const seasonOf = (d: Date) => ['invierno', 'invierno', 'primavera', 'primavera', 'primavera', 'verano', 'verano', 'verano', 'otono', 'otono', 'otono', 'invierno'][d.getMonth()]

export interface PCrit { key: PriorityKey; label: string; weight: number; value: number; points: number; reasons: string[]; data_used: string[] }
export interface Assessment {
  version: string; weights: Record<PriorityKey, number>; score: number; level: 'high' | 'medium' | 'low'; criteria: PCrit[]; confidence: 'alta' | 'media' | 'baja'
  expectedWearsMonth: number; newOutfits: number; occasions: { id: string; label: string; pct: number; newlyCovered: boolean }[]
  redundancy: { level: 'alta' | 'media' | 'baja'; garments: { id: string; title: string; similarity: number }[] }
  costPerWear: { price: number | null; uses: number; value: number | null; basis: string }
}
export interface NeedInput { title: string; type: NeedType; spec: NeedSpecT; price_min?: number | null; price_max?: number | null; replaces_garment_id?: string | null; target_date?: string | null }
export interface PriorityEnv { garments: G[]; evals: Map<string, Evaluation>; bundle: Bundle; use?: Use | null; signals?: Signals; weights?: Record<string, number> | null; now?: Date }

export const COMBINABLE = ['top', 'bottom', 'footwear', 'outerwear', 'tailoring']
/**
 * Conjuntos válidos (≥ 60/100) que el Outfit Engine (3B) forma con una prenda virtual y tus prendas, simulando su temporada
 * (un abrigo de invierno se combina como en invierno). La prenda virtual nunca entra en el armario.
 */
export function simulateOutfits(v: G, active: G[], env: Pick<PriorityEnv, 'bundle' | 'evals' | 'signals' | 'now'>, seasons: string[] = []) {
  const req = GenerateRequest.parse({ required_garment_ids: [v.id] })
  const now = env.now ?? new Date()
  const season = seasons.includes('invierno') ? 'invierno' : seasons[0] ?? resolveContext(req, now).season
  const ctx = learnedContext({ ...resolveContext(req, now), season, forbiddenRoles: [], noLayers: false, needsCoat: false }, env.signals ?? emptySignals())
  const se = scoreEnv(ctx, env.bundle, env.evals, undefined, env.signals ?? emptySignals())
  return buildCandidates([...active.filter((g) => g.id !== v.id), v], ctx, se).candidates.filter((c) => c.scored.total >= 60)
}

/** Evalua la prioridad de una necesidad con tu armario real y tu perfil. */
export function assessNeed(n: NeedInput, env: PriorityEnv): Assessment {
  const now = env.now ?? new Date()
  const weights = normalizePriorityWeights(env.weights)
  const b = env.bundle
  const v = virtualGarment(n.spec, n.title)
  const active = env.garments.filter((g) => g.wardrobe_status === 'active' && g.decision !== 'donate_sell' && g.id !== n.replaces_garment_id)
  const life: Record<string, number> = b.life?.life ?? {}
  const lifeTotal = Object.values(life).reduce((s, x) => s + (Number(x) || 0), 0)

  // Redundancia: prendas que ya cumplen esa funcion
  const sims = active.map((g) => ({ g, s: similarity(v, g).score })).filter((x) => x.s >= 55).sort((a, z) => z.s - a.s).slice(0, 3)
  const redLevel = sims.some((x) => x.s >= DUP_THRESHOLD) ? 'alta' : sims.length ? 'media' : 'baja'
  const redundancy = { level: redLevel as 'alta' | 'media' | 'baja', garments: sims.map((x) => ({ id: x.g.id as string, title: garmentTitle(x.g), similarity: x.s })) }

  // Ocasiones que cubriria (y si alguna no esta cubierta hoy)
  const before = occasionCoverage(active, b)
  const after = occasionCoverage([...active, v], b)
  const occasions = n.spec.occasions.map((id) => {
    const pct = Number(life[id]) || 0
    const was = before.find((o) => o.occasion === id), now2 = after.find((o) => o.occasion === id)
    return { id, label: occLabel(id), pct, newlyCovered: !!was && !was.covered && !!now2?.covered }
  })

  // 1. Necesidad real
  const need: PCrit = crit('need', weights)
  if (n.type === 'desire') { need.value = 0.15; need.reasons.push('Es un deseo: no cubre una necesidad del armario. Puedes comprarlo, sabiendo que es por gusto.') }
  else if (n.type === 'replacement') {
    const old = env.garments.find((g) => g.id === n.replaces_garment_id)
    need.value = old?.condition === 'danado' ? 0.95 : old?.decision === 'replace' ? 0.85 : old?.condition === 'desgastado' ? 0.75 : 0.65
    need.reasons.push(old ? `Sustituye a «${garmentTitle(old)}»${old.condition === 'danado' ? ', que está dañada' : old.condition === 'desgastado' ? ', que está desgastada' : old.decision === 'replace' ? ', que marcaste para sustituir' : ''}.` : 'Sustituye una prenda actual.')
  } else {
    const cov = categoryCoverage(active, env.evals, b).find((c) => c.id === n.spec.category)
    const sev = !cov ? 0.5 : cov.status === 'Sin prendas' ? 1 : cov.status === 'Falta variedad' ? 0.75 : cov.status === 'Necesita revisión' ? 0.55 : 0.3
    need.value = n.type === 'improvement' ? Math.min(sev, 0.5) : sev
    if (cov) need.reasons.push(`${cov.label}: ${lc(cov.status)}. ${cov.why}`)
    const uncovered = occasions.filter((o) => o.newlyCovered)
    if (uncovered.length) { need.value = Math.max(need.value, 0.6 + Math.min(0.4, uncovered.reduce((s, o) => s + o.pct, 0) / 100)); need.reasons.push(`Cubriría ${uncovered.map((o) => `${o.label} (${o.pct} % de tu semana)`).join(', ')}, que hoy no tienes cubierto.`) }
    if (n.type === 'improvement') need.reasons.push('Es una mejora: ya tienes algo que cumple esta función.')
  }
  if (redundancy.level === 'alta' && n.type !== 'replacement') { need.value -= 0.3; need.reasons.push(`Ya tienes algo muy parecido: ${redundancy.garments.map((g) => g.title).join(', ')}.`) }
  need.data_used.push('Cobertura de tu armario por categoría y ocasión (auditoría)', 'Prendas activas, decisiones y conservación')

  // 2. Frecuencia de uso esperada
  const usage: PCrit = crit('usage', weights)
  const occShare = n.spec.occasions.length && lifeTotal ? n.spec.occasions.reduce((s, id) => s + (Number(life[id]) || 0), 0) / lifeTotal : 0.5
  const seasonShare = n.spec.seasons.length ? n.spec.seasons.length / 4 : 1
  const rotation = active.filter((g) => g.category === n.spec.category && (!n.spec.occasions.length || (g.occasions ?? []).some((o: string) => n.spec.occasions.includes(o)))).length
  // Usos al mes mientras es temporada; la temporada solo reduce los usos a lo largo de su vida (coste por uso)
  const wears = r1((BASE_WEARS[n.spec.category] ?? 3) * Math.max(0.15, occShare) / (1 + rotation * 0.5))
  usage.value = clamp01(wears / 4)
  usage.reasons.push(`Unas ${wears.toLocaleString('es-ES')} veces al mes${n.spec.seasons.length && n.spec.seasons.length < 4 ? ' en su temporada' : ''}${n.spec.occasions.length ? `, según el peso de ${n.spec.occasions.map(occLabel).join(', ')} en tu semana` : ''}${rotation ? ` y compartiendo uso con ${rotation} prenda${rotation === 1 ? '' : 's'} parecida${rotation === 1 ? '' : 's'}` : ''}.`)
  if (env.use?.tracked) { const cat = active.filter((g) => g.category === n.spec.category); const used = cat.filter((g) => env.use!.per.has(g.id)).length; usage.reasons.push(`Tu registro de uso: usas ${used} de tus ${cat.length} prendas de esta categoría.`); usage.data_used.push('Tu registro de uso') }
  usage.data_used.push('Reparto de tu semana', 'Temporadas de la prenda buscada', 'Prendas parecidas en rotación')

  // 3. Potencial de nuevos outfits (Outfit Engine de la fase 3)
  const outfits: PCrit = crit('outfits', weights)
  let newOutfits = 0
  if (COMBINABLE.includes(n.spec.category)) {
    newOutfits = simulateOutfits(v, active, env, n.spec.seasons).length
    outfits.reasons.push(newOutfits ? `El motor de conjuntos encuentra ${newOutfits} ${newOutfits === 1 ? 'combinación' : 'combinaciones'} válida${newOutfits === 1 ? '' : 's'} (≥ 60/100) con tus prendas actuales.` : 'El motor no encuentra combinaciones válidas con tus prendas actuales: faltaría algo más para sacarle partido.')
  } else outfits.reasons.push('Complemento o prenda auxiliar: no cambia las combinaciones básicas.')
  outfits.value = clamp01(newOutfits / 12)
  outfits.data_used.push('Outfit Engine (fase 3B) con la prenda buscada como prenda virtual')

  // 4. Adecuacion al perfil
  const profile: PCrit = crit('profile', weights)
  const compat = compatibility(v, b, 1)
  profile.value = compat.score != null ? compat.score / 10 : 0.5
  profile.reasons.push(compat.score != null ? `Compatibilidad estimada con tu perfil: ${compat.score.toLocaleString('es-ES')}/10${compat.provisional ? ' (provisional)' : ''}.` : 'Faltan datos de tu perfil para estimar la compatibilidad.')
  const best = compat.criteria.filter((c) => c.score != null && c.id !== 'info').sort((a, z) => (z.score ?? 0) - (a.score ?? 0))[0]
  if (best?.why[0]) profile.reasons.push(best.why[0])
  profile.data_used.push('Style Blueprint: identidad estética, colorimetría, cortes preferidos, estilo de vida (fase 2C)')

  // 5. Urgencia estacional o funcional
  const urgency: PCrit = crit('urgency', weights)
  const cur = seasonOf(now), next = SEASON_ORDER[(SEASON_ORDER.indexOf(cur) + 1) % 4]
  urgency.value = !n.spec.seasons.length ? 0.5 : n.spec.seasons.includes(cur) ? 1 : n.spec.seasons.includes(next) ? 0.7 : 0.2
  urgency.reasons.push(!n.spec.seasons.length ? 'Sin temporada concreta.' : n.spec.seasons.includes(cur) ? 'Es para la temporada actual.' : n.spec.seasons.includes(next) ? 'Es para la próxima temporada: hay margen.' : 'No es para esta temporada ni la siguiente: puede esperar.')
  const old = env.garments.find((g) => g.id === n.replaces_garment_id)
  if (old?.condition === 'danado') { urgency.value = 1; urgency.reasons.push('La prenda que sustituye está dañada.') }
  if (n.target_date) { const days = (new Date(n.target_date).getTime() - now.getTime()) / 864e5; if (days >= 0 && days <= 30) { urgency.value = Math.max(urgency.value, 0.9); urgency.reasons.push(`La necesitas en ${Math.ceil(days)} días.`) } }
  urgency.data_used.push('Temporada actual', 'Fecha objetivo', 'Estado de la prenda a sustituir')

  // 6. Confianza de la informacion
  const confidence: PCrit = crit('confidence', weights)
  const specData = [n.spec.subcategory, n.spec.colors.length, n.spec.cut || n.spec.silhouette, n.spec.formality_min || n.spec.formality_max, n.spec.seasons.length, n.spec.occasions.length].filter(Boolean).length / 6
  const profData = [colorimetry(b).temp, lifeTotal, b.fit?.prefs || b.profile?.fit_pref].filter(Boolean).length / 3
  confidence.value = clamp01(specData * 0.6 + profData * 0.4)
  confidence.reasons.push(`Prenda buscada definida al ${Math.round(specData * 100)} %; perfil al ${Math.round(profData * 100)} %.`)
  confidence.data_used.push('Especificación de la necesidad', 'Datos del perfil')

  const criteria = [need, usage, outfits, profile, urgency, confidence].map((c) => ({ ...c, value: r1(clamp01(c.value) * 10) / 10, points: r1(clamp01(c.value) * c.weight) }))
  const score = Math.round(criteria.reduce((s, c) => s + c.points, 0))

  // Coste por uso (estimado): precio objetivo o tu presupuesto por prenda / usos en su vida util
  const price = n.price_max ?? n.price_min ?? (Number(b.profile?.budget_max) || null)
  const uses = Math.max(1, Math.round(wears * (LIFESPAN[n.spec.category] ?? 24) * seasonShare))
  const costPerWear = { price, uses, value: price ? Math.round((price / uses) * 100) / 100 : null, basis: n.price_max || n.price_min ? 'precio objetivo de la necesidad' : price ? 'tu presupuesto máximo por prenda' : 'sin precio' }

  return {
    version: PRIORITY_VERSION, weights, score, level: levelOf(score), criteria, confidence: confidence.value >= 0.75 ? 'alta' : confidence.value >= 0.45 ? 'media' : 'baja',
    expectedWearsMonth: wears, newOutfits, occasions, redundancy, costPerWear,
  }
}
function crit(key: PriorityKey, w: Record<PriorityKey, number>): PCrit { return { key, label: PRIORITY_LABEL[key], weight: w[key], value: 0, points: 0, reasons: [], data_used: [] } }

/** Prioridad que se muestra: la que fijes tú manda sobre la calculada (la calculada se sigue viendo). */
export const effectivePriority = (n: { user_priority?: string | null; priority_level?: string | null }) => (n.user_priority ?? n.priority_level ?? 'low') as 'high' | 'medium' | 'low'
export const groupLabel = (id: string) => GROUPS.find((g) => g.id === id)?.label ?? id
export const specText = (s: NeedSpecT) => [s.subcategory ? subOf(s.subcategory)?.label : groupLabel(s.category), s.colors.length ? s.colors.join(' o ').toLowerCase() : null, s.cut ? `corte ${lc(s.cut)}` : null, s.silhouette ? `silueta ${lc(s.silhouette)}` : null,
  s.formality_min || s.formality_max ? `formalidad ${s.formality_min ?? 1}–${s.formality_max ?? 5}` : null, s.seasons.length ? s.seasons.map((x) => lc(SEASONS.find((y) => y.id === x)?.label ?? x)).join('/') : null].filter(Boolean).join(' · ')
