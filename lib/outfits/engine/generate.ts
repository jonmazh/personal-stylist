import type { Bundle } from '@/lib/profile/data'
import type { Evaluation } from '@/lib/wardrobe/compatibility'
import { SEASONS } from '@/lib/wardrobe/taxonomy'
import { checkComposition, roleLabel, rolesFor, type ItemRole } from '../taxonomy'
import { INTENTS, resolveContext, templatesFor, type Ctx, type GenerateRequestT, type IntentId } from './context'
import { explain, intentFit, scoreEnv, scoreOutfit, type G, type ScoreEnv, type Scored, type Slot } from './scoring'

/**
 * Outfit Engine (fase 3B): genera y valida combinaciones SIN IA.
 * 1 contexto · 2 perfil · 3 armario (filtros obligatorios) · 4 candidatos (plantillas + poda) · 5 puntuacion ·
 * 6 criterio experto (penalizaciones y descartes) · 7 seleccion variada + validacion de la salida.
 * La IA (3C) recibira solo el conjunto reducido resultante para dirigirlo creativamente.
 */
export const ENGINE_VERSION = 'outfit-engine@1'
export const TOP_K = 6                 // candidatas por funcion tras la poda
export const MAX_COMBINATIONS = 20000
export const MAX_USES = 2              // una prenda aparece como mucho en 2 propuestas si hay alternativas

const FORMAL_SHOES = new Set(['derby', 'loafers'])
const WARM = new Set(['knit', 'turtleneck', 'cardigan', 'sweatshirt', 'hoodie', 'coat', 'parka', 'puffer', 'trench', 'boots', 'scarf'])
const title = (g: G) => g.title ?? g.name ?? 'Prenda'

export interface Exclusion { garment: string; reason: string }
/** Etapa 3: solo prendas activas, no descartadas, de tu armario y compatibles con las condiciones. */
export function eligible(garments: G[], ctx: Ctx) {
  const ok: G[] = [], out: Exclusion[] = []
  const r = ctx.req
  for (const g of garments) {
    const why =
      g.wardrobe_status !== 'active' ? 'no está en tu armario activo'
      : g.decision === 'replace' || g.decision === 'donate_sell' ? 'la has marcado para sustituir o donar'
      : r.exclude_garment_ids.includes(g.id) ? 'la has excluido'
      : g.category && r.exclude_categories.includes(g.category) ? 'su categoría está excluida'
      : r.restrictions.includes('no_suit') && ['suit', 'tuxedo'].includes(g.subcategory) ? 'sin traje'
      : r.restrictions.includes('no_formal_shoes') && FORMAL_SHOES.has(g.subcategory) ? 'sin zapatos formales'
      : r.restrictions.includes('no_sneakers') && g.subcategory === 'sneakers' ? 'sin zapatillas'
      : g.formality_level && g.formality_level < ctx.hardMin && g.category !== 'accessories' ? `demasiado informal para el código de vestimenta (${g.formality_level}/5)`
      : ctx.noLayers && (WARM.has(g.subcategory) || (['top', 'outerwear', 'tailoring'].includes(g.category) && (g.seasons ?? []).length && !(g.seasons as string[]).includes('verano'))) ? 'abriga demasiado para el calor'
      : ctx.req.weather === 'cold' && (g.seasons ?? []).length && (g.seasons as string[]).every((s) => s === 'verano') && g.category !== 'footwear' ? 'es de verano y hace frío'
      : !rolesFor(g).some((x) => !ctx.forbiddenRoles.includes(x)) ? 'no tiene función posible con estas condiciones'
      : null
    if (why) out.push({ garment: title(g), reason: why }); else ok.push(g)
  }
  return { ok, excluded: out }
}

/** Puntuacion previa de una prenda para la poda: compatibilidad, ajuste, cercania a la formalidad, favorita. */
function preScore(g: G, ctx: Ctx, evals: Map<string, Evaluation>) {
  const e = evals.get(g.id)
  const mid = (ctx.formality[0] + ctx.formality[1]) / 2
  const f = g.formality_level ? 3 - Math.min(3, Math.abs(g.formality_level - mid)) : 1.5
  return (e?.compat.score ?? 5) + (e?.fit.score != null ? (e.fit.score - 6) * 0.5 : 0) + f + (g.is_favorite ? 1 : 0) + (ctx.req.preferred_garment_ids.includes(g.id) ? 3 : 0) + (ctx.req.required_garment_ids.includes(g.id) ? 100 : 0)
}

export interface Candidate { items: Slot[]; template: string; scored: Scored }
/** Etapa 4: candidatas por funcion (top-K) y combinaciones por plantilla. */
export function buildCandidates(pool: G[], ctx: Ctx, env: ScoreEnv) {
  const byRole = new Map<string, G[]>()
  for (const g of pool) for (const role of rolesFor(g)) if (!ctx.forbiddenRoles.includes(role)) byRole.set(role, [...(byRole.get(role) ?? []), g])
  // La capa intermedia solo con prendas de punto o chaleco (no una camiseta sobre otra)
  if (byRole.has('mid_layer')) byRole.set('mid_layer', byRole.get('mid_layer')!.filter((g) => ['knit', 'cardigan', 'sweatshirt', 'turtleneck', 'waistcoat', 'gilet'].includes(g.subcategory)))
  for (const [role, gs] of byRole) byRole.set(role, [...gs].sort((a, z) => preScore(z, ctx, env.evals) - preScore(a, ctx, env.evals)).slice(0, TOP_K))
  const available = new Set([...byRole.entries()].filter(([, v]) => v.length).map(([k]) => k))
  const { templates, coatMissing } = templatesFor(ctx, available)
  const out: Candidate[] = []
  let evaluated = 0, rejected = 0
  const required = ctx.req.required_garment_ids
  for (const t of templates) {
    const lists = t.slots.map((s) => byRole.get(s) ?? [])
    const rec = (i: number, acc: Slot[]) => {
      if (evaluated >= MAX_COMBINATIONS) return
      if (i === t.slots.length) {
        evaluated++
        if (required.some((id) => !acc.some((s) => s.g.id === id))) { rejected++; return }
        const map = new Map(acc.map((s) => [s.g.id, s.g]))
        if (checkComposition(acc.map((s) => ({ garment_id: s.g.id, role: s.role })), map).some((p) => p.level === 'error')) { rejected++; return }
        // Etapa 6: criterio experto — descartes que una puntuacion alta no compensa
        // Una camisa abierta como tercera pieza solo sobre camiseta
        const third = acc.find((s) => s.role === 'third_layer')?.g
        if (third?.subcategory === 'shirt' && !['tee', 'tank'].includes(acc.find((s) => s.role === 'top_base')?.g.subcategory)) { rejected++; return }
        // La capa intermedia va sobre una camisa, camiseta o polo (no sobre otro jersey ni una sobrecamisa)
        if (acc.some((s) => s.role === 'mid_layer') && !['shirt', 'tee', 'polo', 'tank', 'turtleneck'].includes(acc.find((s) => s.role === 'top_base')?.g.subcategory)) { rejected++; return }
        const scored = scoreOutfit(acc, env)
        if (scored.criteria.find((c) => c.key === 'aesthetic')!.value < 0.3 || scored.criteria.find((c) => c.key === 'occasion')!.value < 0.35) { rejected++; return }
        out.push({ items: acc, template: t.id, scored }); return
      }
      for (const g of lists[i]) if (!acc.some((s) => s.g.id === g.id)) rec(i + 1, [...acc, { role: t.slots[i], g }])
    }
    rec(0, [])
  }
  return { candidates: out, evaluated, rejected, coatMissing, perRole: Object.fromEntries([...byRole].map(([k, v]) => [k, v.length])), templates: templates.map((t) => t.id) }
}

const key = (c: Candidate) => c.items.map((s) => s.g.id).sort().join(',')
const overlap = (a: Candidate, z: Candidate) => { const A = new Set(a.items.map((s) => s.g.id)); const shared = z.items.filter((s) => A.has(s.g.id)).length; return shared / Math.max(a.items.length, z.items.length) }

/**
 * Etapa 7: una propuesta por intencion (la preferida primero), evitando conjuntos casi iguales y que
 * las mismas prendas se repitan si hay alternativas igual de buenas.
 */
export function selectDiverse(cands: Candidate[], ctx: Ctx, n: number) {
  const order: IntentId[] = [...INTENTS.map((i) => i.id)]
  const pref = ctx.req.preferred_style as IntentId | null | undefined
  if (pref) { order.splice(order.indexOf(pref), 1); order.unshift(pref) }
  const chosen: (Candidate & { intent: IntentId; rank: number })[] = []
  const uses = new Map<string, number>()
  const seen = new Set<string>()
  for (const intent of order) {
    if (chosen.length >= n) break
    let best: Candidate | null = null, bestV = -Infinity
    for (const c of cands) {
      if (seen.has(key(c))) continue
      if (chosen.some((x) => overlap(x, c) > 0.5)) continue
      const reuse = c.items.reduce((s, x) => s + Math.max(0, (uses.get(x.g.id) ?? 0) - (MAX_USES - 1)), 0)
      const v = c.scored.total + intentFit(c.scored.features, intent, ctx) * 12 - c.items.reduce((s, x) => s + (uses.get(x.g.id) ?? 0) * 3, 0) - reuse * 25
      if (v > bestV) { bestV = v; best = c }
    }
    if (!best) break
    chosen.push({ ...best, intent, rank: chosen.length + 1 }); seen.add(key(best))
    for (const x of best.items) uses.set(x.g.id, (uses.get(x.g.id) ?? 0) + 1)
  }
  return chosen
}

/** Alternativas: cambiar una sola prenda por otra candidata que mantenga una puntuacion parecida (4.3). */
function alternatives(c: Candidate, pool: G[], env: ScoreEnv) {
  const out: { role: string; from: string; to: string; garment_id: string; delta: number }[] = []
  for (const role of ['footwear', 'third_layer', 'outer_layer', 'top_base'] as ItemRole[]) {
    const idx = c.items.findIndex((s) => s.role === role); if (idx < 0) continue
    let best: { g: G; total: number } | null = null
    for (const g of pool) {
      if (!rolesFor(g).includes(role) || c.items.some((s) => s.g.id === g.id)) continue
      const items = c.items.map((s, i) => (i === idx ? { role, g } : s))
      if (checkComposition(items.map((s) => ({ garment_id: s.g.id, role: s.role })), new Map(items.map((s) => [s.g.id, s.g]))).some((p) => p.level === 'error')) continue
      const total = scoreOutfit(items, env).total
      if (!best || total > best.total) best = { g, total }
    }
    if (best && best.total >= c.scored.total - 8) out.push({ role, from: title(c.items[idx].g), to: title(best.g), garment_id: best.g.id, delta: best.total - c.scored.total })
    if (out.length >= 2) break
  }
  return out
}

const INTENT_NAME: Record<IntentId, string> = { elegante: 'Elegancia', minimalista: 'Minimalismo', relajada: 'Relajado', personalidad: 'Con carácter', versatil: 'Versátil' }
const lc = (s: string) => s.toLowerCase()

export interface Proposal {
  rank: number; intent: IntentId; name: string; template: string; score: number; confidence: 'alta' | 'media' | 'baja'; confidenceWhy: string[]
  items: { garment_id: string; role: string; title: string }[]; criteria: Scored['criteria']; why: string[]; context: string; warnings: string[]
  alternatives: ReturnType<typeof alternatives>
}

/** Motor completo. `garments`: tu armario (con titulo); `evals`: evaluaciones de 2C. */
export function generate(req: GenerateRequestT, garments: G[], evals: Map<string, Evaluation>, bundle: Bundle, now = new Date()) {
  const ctx = resolveContext(req, now)
  const env = scoreEnv(ctx, bundle, evals, req.weights)
  const { ok: pool, excluded } = eligible(garments, ctx)
  const missingRequired = req.required_garment_ids.filter((id) => !pool.some((g) => g.id === id))
  const b = missingRequired.length ? { candidates: [], evaluated: 0, rejected: 0, coatMissing: false, perRole: {}, templates: [] } : buildCandidates(pool, ctx, env)
  const chosen = selectDiverse(b.candidates.sort((a, z) => z.scored.total - a.scored.total), ctx, req.number_of_outfits)
  // Validacion de salida: solo ids del inventario elegible y sin errores de composicion
  const valid = new Set(pool.map((g) => g.id))
  const proposals: Proposal[] = chosen.filter((c) => c.items.every((s) => valid.has(s.g.id))).map((c) => {
    const e = explain(c.items, c.scored, ctx)
    const main = c.items.find((s) => s.role === 'third_layer' || s.role === 'full_body' || s.role === 'outer_layer') ?? c.items.find((s) => s.role === 'top_base')!
    const bottom = c.items.find((s) => s.role === 'bottom')
    const colorsName = [main.g.primary_color, bottom?.g.primary_color].filter(Boolean).map((x) => lc(String(x)))
    return {
      rank: c.rank, intent: c.intent, name: `${INTENT_NAME[c.intent]}${colorsName.length ? ` en ${[...new Set(colorsName)].join(' y ')}` : ''}`, template: c.template,
      score: c.scored.total, confidence: c.scored.confidence, confidenceWhy: c.scored.confidenceWhy,
      items: c.items.map((s) => ({ garment_id: s.g.id, role: s.role, title: title(s.g) })), criteria: c.scored.criteria, why: e.why, context: e.context,
      warnings: [...c.scored.warnings, ...(b.coatMissing ? ['Pediste un conjunto para frío o lluvia y no tienes un abrigo disponible.'] : [])],
      alternatives: alternatives(c, pool, env),
    }
  })
  const notes: string[] = []
  if (missingRequired.length) notes.push('Alguna prenda que pediste incluir no está disponible (archivada, descartada o excluida por las condiciones).')
  if (!pool.length) notes.push('No hay prendas disponibles con estas condiciones.')
  else if (!b.candidates.length && !missingRequired.length) notes.push(`No he encontrado combinaciones completas que cumplan las condiciones. Funciones disponibles: ${Object.entries(b.perRole).filter(([, v]) => v).map(([k]) => lc(roleLabel(k))).join(', ') || 'ninguna'}.`)
  else if (proposals.length < req.number_of_outfits) notes.push(`Solo he encontrado ${proposals.length} propuesta${proposals.length === 1 ? '' : 's'} distinta${proposals.length === 1 ? '' : 's'}: con tu armario actual no hay más variedad para esta ocasión.`)
  return {
    engine: ENGINE_VERSION, request: req, ctx: { formality: ctx.formality, formalitySource: ctx.formalitySource, season: ctx.season, seasonLabel: SEASONS.find((s) => s.id === ctx.season)?.label, seasonSource: ctx.seasonSource, forbiddenRoles: ctx.forbiddenRoles, summary: ctx.summary },
    weights: env.weights,
    stats: { garments: garments.length, eligible: pool.length, excluded, perRole: b.perRole, templates: b.templates, evaluated: b.evaluated, rejected: b.rejected, candidates: b.candidates.length },
    proposals, notes,
  }
}
export type GenerationResult = ReturnType<typeof generate>
