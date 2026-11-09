import type { Bundle } from '@/lib/profile/data'
import { colorimetry } from '@/lib/profile/blueprint'
import { PALETTES } from '@/lib/color/palette'
import { PALETTE_OF } from '@/lib/style/references'
import { LIFE } from '@/lib/profile/areas'
import { MIN_WARDROBE, decisionLabel, occasionsOf, type DecisionId, type Evaluation } from './compatibility'
import { garmentTitle } from './display'
import { CONDITIONS, SEASONS, familyOf, groupOf } from './taxonomy'

/**
 * Auditoria del armario (fase 2D): del articulo al conjunto. Reglas deterministas sobre el inventario real,
 * el perfil y las evaluaciones de 2C. No elimina ni decide nada: propone hallazgos justificados que apruebas o rechazas.
 * Ver docs/ARMARIO.md.
 */
export type G = Record<string, any>
export type FindingKind = 'review' | 'alteration' | 'replace' | 'duplicate' | 'gap' | 'need' | 'condition' | 'unused'
export interface AuditFinding {
  key: string                // estable entre auditorias: recuerda lo que ya aprobaste o rechazaste
  kind: FindingKind
  title: string
  body: string
  why: string[]
  data_used: string[]
  garment_ids: string[]
  recommendation?: { decision?: DecisionId; garment_id?: string; need?: string } | null
  priority: number           // 1 = mas importante
}

const r1 = (x: number) => Math.round(x * 10) / 10
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? 'pendiente' : n.toLocaleString('es-ES', { maximumFractionDigits: 1 }))
const pal = (c?: string | null) => (c ? PALETTE_OF[c] ?? c : null)
const lc = (s: string) => s.toLowerCase()
const occLabel = (id: string) => LIFE.find(([k]) => k === id)?.[1].toLowerCase() ?? id
const LIGHT = new Set(['Blanco', 'Crudo', 'Beige', 'Gris claro', 'Azul claro', 'Denim claro'])
const DARK = new Set(['Negro', 'Azul marino', 'Antracita', 'Marrón', 'Gris', 'Denim', 'Verde bosque', 'Burdeos'])
const words = (s?: string | null) => new Set((s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter((w) => w.length > 3 && !['parece', 'aspecto', 'tejido'].includes(w)))

// ── 6.2 Similitud (categoria, corte, color, material, formalidad, funcion y combinaciones) ──
export const DUP_THRESHOLD = 70
export function similarity(a: G, z: G, ctx: { combosA?: string[]; combosZ?: string[] } = {}) {
  if (!a.category || a.category !== z.category) return { score: 0, same: [] as string[], diffs: [] as string[] }
  let s = 0
  const same: string[] = [], diffs: string[] = []
  const ta = garmentTitle(a), tz = garmentTitle(z)
  if (a.subcategory && a.subcategory === z.subcategory) { s += 25; same.push('mismo tipo') }
  else if (familyOf(a.subcategory, a.category) === familyOf(z.subcategory, z.category)) { s += 12; diffs.push('son tipos de prenda distintos de la misma familia') }
  else diffs.push('son tipos de prenda distintos')
  const ca = pal(a.primary_color), cz = pal(z.primary_color)
  if (ca && ca === cz) { s += 20; same.push(`mismo color (${lc(ca)})`) }
  else if (ca && cz && ((LIGHT.has(ca) && LIGHT.has(cz)) || (DARK.has(ca) && DARK.has(cz)))) { s += 8; diffs.push(`color parecido pero no igual (${lc(a.primary_color)} / ${lc(z.primary_color)})`) }
  else if (ca && cz) diffs.push(`color distinto (${lc(a.primary_color)} / ${lc(z.primary_color)})`)
  if (a.cut && z.cut) { if (a.cut === z.cut) { s += 15; same.push(`mismo corte (${lc(a.cut)})`) } else diffs.push(`«${ta}» tiene corte ${lc(a.cut)} y «${tz}» ${lc(z.cut)}`) }
  else s += 6
  if (a.silhouette && z.silhouette && a.silhouette !== z.silhouette) diffs.push(`silueta ${lc(a.silhouette)} frente a ${lc(z.silhouette)}`)
  const ma = words(a.confirmed_composition ?? a.apparent_material), mz = words(z.confirmed_composition ?? z.apparent_material)
  if (ma.size && mz.size) { if ([...ma].some((w) => mz.has(w))) { s += 10; same.push('material parecido') } else diffs.push(`material distinto (${a.confirmed_composition ?? a.apparent_material} / ${z.confirmed_composition ?? z.apparent_material})`) }
  else s += 4
  if (a.formality_level && z.formality_level) { const d = Math.abs(a.formality_level - z.formality_level); if (d === 0) { s += 10; same.push('misma formalidad') } else if (d === 1) s += 5; else diffs.push(`formalidad ${a.formality_level}/5 frente a ${z.formality_level}/5`) }
  else s += 4
  const oa = occasionsOf(a).ids, oz = occasionsOf(z).ids
  if (oa.length && oz.length) { const j = oa.filter((x) => oz.includes(x)).length / new Set([...oa, ...oz]).size; s += Math.round(j * 10); if (j >= 0.5) same.push('misma función') }
  else s += 4
  if (ctx.combosA && ctx.combosZ && ctx.combosA.length && ctx.combosZ.length) {
    const j = ctx.combosA.filter((x) => ctx.combosZ!.includes(x)).length / new Set([...ctx.combosA, ...ctx.combosZ]).size
    s += Math.round(j * 10); if (j >= 0.6) same.push('combinan con las mismas prendas')
  } else s += 5
  return { score: Math.min(100, s), same, diffs }
}

// ── 6.4 Frecuencia de uso (del registro de uso de Outfit Studio, nunca de las fotos) ──
export const MIN_WEAR_EVENTS = 5
export const MIN_TRACK_DAYS = 30
export const DORMANT_DAYS = 90
export interface WearRow { worn_on: string; garment_ids: string[] }
export type Use = ReturnType<typeof usageStats>
const DAY = 864e5
/** Usos por prenda y si hay registro suficiente (al menos 5 usos en 30 días) para sacar conclusiones. */
export function usageStats(active: G[], wears: WearRow[], now = new Date()) {
  const per = new Map<string, { count: number; last: string }>()
  for (const w of wears) for (const id of w.garment_ids ?? []) { const x = per.get(id); if (!x) per.set(id, { count: 1, last: w.worn_on }); else { x.count++; if (w.worn_on > x.last) x.last = w.worn_on } }
  const since = wears.length ? wears.map((w) => w.worn_on).sort()[0] : null
  const days = since ? Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / DAY)) : 0
  const tracked = wears.length >= MIN_WEAR_EVENTS && days >= MIN_TRACK_DAYS
  const titled = (g: G) => ({ id: g.id as string, title: garmentTitle(g), ...(per.get(g.id) ?? { count: 0, last: null as string | null }) })
  // Sin usar: prendas que ya estaban en el armario cuando empezaste a registrar y no te has puesto desde entonces
  const unused = tracked ? active.filter((g) => !per.has(g.id) && (!g.created_at || g.created_at.slice(0, 10) <= since!)).map(titled) : []
  const dormant = tracked ? active.filter((g) => { const x = per.get(g.id); return x && now.getTime() - new Date(x.last).getTime() > DORMANT_DAYS * DAY }).map(titled) : []
  const top = active.filter((g) => per.has(g.id)).map(titled).sort((a, z) => z.count - a.count).slice(0, 5)
  return { tracked, events: wears.length, since, days, per, top, unused, dormant, worn: active.filter((g) => per.has(g.id)).length }
}

/** Utilidad real (no el numero de duplicados): compatibilidad, ajuste, combinaciones, conservacion y tus decisiones. */
function utility(g: G, ev?: Evaluation, use?: Use) {
  const cond = g.condition === 'danado' ? -3 : g.condition === 'desgastado' ? -1.5 : 0
  const worn = use?.tracked ? Math.min(3, (use.per.get(g.id)?.count ?? 0) * 0.5) : 0
  return worn + (ev?.compat.score ?? 5) + (ev?.fit.score != null ? (ev.fit.score - 6) * 0.6 : 0) + (ev?.value.combos.length ?? 0) * 0.3 + (g.is_favorite ? 1 : 0) + (g.decision === 'keep' ? 1 : 0) + cond
}

export function duplicateGroups(gs: G[], evals: Map<string, Evaluation>) {
  const combos = new Map(gs.map((g) => [g.id, (evals.get(g.id)?.value.combos ?? []).map((x) => x.id as string)]))
  const parent = new Map(gs.map((g) => [g.id, g.id]))
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!))
  const pairs: { a: G; z: G; sim: ReturnType<typeof similarity> }[] = []
  for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
    const sim = similarity(gs[i], gs[j], { combosA: combos.get(gs[i].id), combosZ: combos.get(gs[j].id) })
    if (sim.score >= DUP_THRESHOLD) { pairs.push({ a: gs[i], z: gs[j], sim }); parent.set(find(gs[i].id), find(gs[j].id)) }
  }
  const groups = new Map<string, G[]>()
  for (const g of gs) if (pairs.some((p) => p.a.id === g.id || p.z.id === g.id)) { const r = find(g.id); groups.set(r, [...(groups.get(r) ?? []), g]) }
  return [...groups.values()].map((members) => ({ members, pairs: pairs.filter((p) => members.includes(p.a)) }))
}

function duplicateFinding(members: G[], pairs: { a: G; z: G; sim: ReturnType<typeof similarity> }[], evals: Map<string, Evaluation>, use?: Use): AuditFinding {
  const ranked = [...members].sort((a, z) => utility(z, evals.get(z.id), use) - utility(a, evals.get(a.id), use))
  const best = ranked[0], second = ranked[1]
  const ub = utility(best, evals.get(best.id), use), us = utility(second, evals.get(second.id), use)
  const same = [...new Set(pairs.flatMap((p) => p.sim.same))]
  const diffs = [...new Set(pairs.flatMap((p) => p.sim.diffs))]
  const eb = evals.get(best.id), es = evals.get(second.id)
  const reasons: string[] = []
  if ((eb?.compat.score ?? 0) > (es?.compat.score ?? 0)) reasons.push(`encaja mejor con tu perfil actual (compatibilidad ${fmt(eb?.compat.score)} frente a ${fmt(es?.compat.score)})`)
  if ((eb?.value.combos.length ?? 0) > (es?.value.combos.length ?? 0)) reasons.push(`aporta más posibilidades de combinación (${eb?.value.combos.length} frente a ${es?.value.combos.length})`)
  if (eb?.fit.score != null && (es?.fit.score == null || eb.fit.score > es.fit.score)) reasons.push(`te queda mejor según tu prueba de ajuste (${fmt(eb.fit.score)})`)
  const wb = use?.tracked ? use.per.get(best.id)?.count ?? 0 : 0, ws = use?.tracked ? use.per.get(second.id)?.count ?? 0 : 0
  if (wb > ws) reasons.push(`te la pones más (${wb} ${wb === 1 ? 'vez' : 'veces'} frente a ${ws})`)
  if (best.is_favorite && !second.is_favorite) reasons.push('la tienes marcada como favorita')
  if (second.condition === 'desgastado' || second.condition === 'danado') reasons.push(`«${garmentTitle(second)}» está ${lc(CONDITIONS.find((c) => c.id === second.condition)!.label)}`)
  const clear = ub - us >= 0.8 && reasons.length > 0
  const names = members.map((m) => `«${garmentTitle(m)}»`)
  const body = `${members.length === 2 ? 'Estas dos prendas cumplen' : `Estas ${members.length} prendas cumplen`} prácticamente la misma función (${same.join(', ') || 'muy parecidas'}).${diffs.length ? ` Diferencias: ${diffs.join('; ')}.` : ' No encuentro diferencias relevantes.'} ${clear ? `Recomendaría conservar «${garmentTitle(best)}» porque ${reasons.join(' y ')}.` : 'Con los datos actuales no hay una razón clara para preferir una: decide tú (o registra cómo te quedan).'}`
  return {
    key: `dup:${members.map((m) => m.id).sort().join(',')}`, kind: 'duplicate', title: `Posible duplicado: ${names.join(', ')}`, body,
    why: ['No significa que debas descartar ninguna: tener varias puede tener sentido (rotación, lavados). La recomendación se basa en la utilidad real, no en el número.'],
    data_used: ['Categoría, tipo, corte, color, material, formalidad, ocasiones y combinaciones de cada prenda', 'Compatibilidad, ajuste y valor estratégico (2C)', ...(use?.tracked ? ['Tu registro de uso'] : [])],
    garment_ids: ranked.map((m) => m.id), recommendation: clear ? { decision: 'keep', garment_id: best.id } : null, priority: 2,
  }
}

// ── 6.3 Huecos ──
const CORE = [
  { id: 'top', min: 4 }, { id: 'bottom', min: 3 }, { id: 'footwear', min: 2 }, { id: 'outerwear', min: 1 },
] as const
export type Coverage = 'Bien cubierta' | 'Necesita revisión' | 'Falta variedad' | 'Sin prendas'
const OUT = new Set(['replace', 'donate_sell'])
const WORK: Record<string, [number, number]> = { 'Muy formal (traje)': [4, 5], 'Smart casual': [3, 4], Casual: [2, 3], Teletrabajo: [1, 3] }

export function categoryCoverage(gs: G[], evals: Map<string, Evaluation>, b: Bundle) {
  const cold = ['Cuatro estaciones marcadas', 'Frío y húmedo'].includes(b.life?.climate)
  return CORE.map(({ id, min }) => {
    const all = gs.filter((g) => g.category === id || (id === 'outerwear' && g.category === 'tailoring' && g.subcategory !== 'suit'))
    const usable = all.filter((g) => !OUT.has(g.decision))
    const need = id === 'outerwear' && cold ? 2 : min
    const flagged = usable.filter((g) => ['modify', 'review'].includes(g.decision) || (evals.get(g.id)?.compat.score ?? 10) < 5 || ['desgastado', 'danado'].includes(g.condition))
    const colors = new Set(usable.map((g) => pal(g.primary_color)).filter(Boolean))
    let status: Coverage, why: string
    if (!usable.length) { status = 'Sin prendas'; why = all.length ? 'Todas las que tienes están marcadas para sustituir o donar.' : 'No tienes ninguna registrada.' }
    else if (usable.length < need) { status = 'Falta variedad'; why = `${usable.length} prenda${usable.length === 1 ? '' : 's'} utilizable${usable.length === 1 ? '' : 's'}; para rotar con comodidad conviene tener al menos ${need}.` }
    else if (flagged.length / usable.length >= 0.5) { status = 'Necesita revisión'; why = `${flagged.length} de ${usable.length} necesitan revisión, arreglo, encajan poco contigo o están gastadas.` }
    else if (usable.length >= 3 && colors.size <= 1) { status = 'Falta variedad'; why = `Todas son del mismo color (${[...colors][0]?.toLowerCase() ?? '—'}).` }
    else { status = 'Bien cubierta'; why = `${usable.length} prendas utilizables en ${colors.size} color${colors.size === 1 ? '' : 'es'}.` }
    return { id, label: groupOf(id)!.label, status, why, count: usable.length, flagged: flagged.map((g) => g.id) }
  })
}

/** ¿Puedes vestirte para cada actividad importante de tu semana con lo que tienes? (arriba + abajo + calzado) */
export function occasionCoverage(gs: G[], b: Bundle) {
  const life: Record<string, number> = b.life?.life ?? {}
  const wf = WORK[b.life?.work_formality as string]
  const usable = gs.filter((g) => !OUT.has(g.decision))
  return Object.entries(life).filter(([, v]) => Number(v) >= 10).sort((a, z) => Number(z[1]) - Number(a[1])).map(([occ, pct]) => {
    const fits = (g: G) => occasionsOf(g).ids.includes(occ) && (occ !== 'trabajo' || !wf || !g.formality_level || (g.formality_level >= wf[0] && g.formality_level <= wf[1]))
    const missing = (['top', 'bottom', 'footwear'] as const).filter((c) => !usable.some((g) => (g.category === c || (c === 'top' && g.category === 'tailoring')) && fits(g)))
    return { occasion: occ, label: occLabel(occ), pct: Number(pct), missing, covered: !missing.length }
  })
}

export function seasonCoverage(gs: G[], b: Bundle) {
  const climate = b.life?.climate as string | undefined
  const usable = gs.filter((g) => !OUT.has(g.decision))
  const has = (cats: string[], seasons: string[]) => usable.some((g) => cats.includes(g.category) && (g.seasons ?? []).some((s: string) => seasons.includes(s)))
  const out: { key: string; need: string; why: string; group: string }[] = []
  if (climate !== 'Cálido todo el año' && !has(['outerwear'], ['invierno'])) out.push({ key: 'winter-outer', group: 'outerwear', need: 'Abrigo o chaqueta para invierno', why: `Tu clima es «${lc(climate ?? 'sin indicar')}» y no tienes ninguna prenda exterior marcada para invierno.` })
  if (climate !== 'Frío y húmedo' && !has(['top'], ['verano'])) out.push({ key: 'summer-top', group: 'top', need: 'Prenda superior fresca para verano', why: 'No tienes ninguna prenda superior marcada para verano.' })
  if (!has(['top', 'outerwear'], ['primavera', 'otono'])) out.push({ key: 'midseason', group: 'top', need: 'Prenda superior ligera para entretiempo', why: 'No tienes prendas superiores ni exteriores marcadas para primavera u otoño.' })
  return out
}

/** Necesidades prioritarias concretas, a partir de los huecos, la paleta y tus preferencias de corte. */
export function priorityNeeds(gs: G[], evals: Map<string, Evaluation>, b: Bundle) {
  const temp = colorimetry(b).temp
  const owned = (cat: string) => new Set(gs.filter((g) => g.category === cat && !OUT.has(g.decision)).map((g) => pal(g.primary_color)))
  const firstNew = (cat: string, list: string[]) => list.find((c) => !owned(cat).has(c)) ?? list[0]
  const p = temp ? PALETTES[temp] : null
  const prefs = b.fit?.prefs ?? {}
  const wfName = b.life?.work_formality as string | undefined
  const describe = (cat: string, occ?: string) => {
    if (cat === 'bottom') return `Pantalón ${lc(firstNew('bottom', p?.inferiores ?? ['Gris', 'Azul marino', 'Beige']))} de corte ${lc(prefs.pantalones ?? 'recto')}`
    if (cat === 'footwear') return `Calzado versátil para ${occ === 'trabajo' && wfName ? lc(wfName) : occ ?? 'el día a día'}`
    if (cat === 'outerwear') return `Chaqueta o abrigo en ${lc(firstNew('outerwear', p?.neutros ?? ['Azul marino', 'Gris']))}`
    return `Prenda superior en ${lc(firstNew('top', p?.cara ?? ['Blanco', 'Azul claro']))}${occ ? ` para ${occ}` : ''}`
  }
  const needs: { need: string; why: string[]; data: string[]; weight: number; key: string; cat?: string }[] = []
  const occ = occasionCoverage(gs, b)
  // Deporte: una sola necesidad (equipacion), no tres
  const sport = occ.find((o) => o.occasion === 'deporte' && o.missing.length)
  if (sport) needs.push({ key: 'occ:deporte', need: `Ropa de deporte (${sport.missing.map((m) => lc(groupOf(m)!.label)).join(', ')})`, why: [`El deporte es un ${sport.pct} % de tu semana y no tienes prendas marcadas para ello.`], data: ['Reparto de tu semana', 'Ocasiones de tus prendas'], weight: sport.pct + 10 })
  // Resto: una necesidad por categoria, para la ocasion mas importante, explicando todas las que cubriria
  for (const cat of ['top', 'bottom', 'footwear'] as const) {
    const os = occ.filter((o) => o.occasion !== 'deporte' && o.missing.includes(cat))
    if (!os.length) continue
    needs.push({ key: `occ:${cat}`, cat, need: describe(cat, os[0].label), why: os.map((o) => `Para ${o.label} (${o.pct} % de tu semana) no tienes nada adecuado en ${lc(groupOf(cat)!.label)}${o.occasion === 'trabajo' && wfName ? ` (formalidad de tu trabajo: ${lc(wfName)})` : ''}.`), data: ['Reparto de tu semana', 'Ocasiones y formalidad de tus prendas'], weight: os.reduce((x, o) => x + o.pct, 0) + 20 })
  }
  for (const c of categoryCoverage(gs, evals, b)) if ((c.status === 'Sin prendas' || c.status === 'Falta variedad') && !needs.some((n) => n.cat === c.id)) needs.push({ key: `cat:${c.id}`, cat: c.id, need: describe(c.id), why: [`${c.label}: ${lc(c.status)}. ${c.why}`], data: ['Inventario activo', temp ? `Paleta ${lc(temp)}` : 'Sin temperatura cromática: colores neutros por defecto'], weight: c.status === 'Sin prendas' ? 40 : 15 })
  for (const s of seasonCoverage(gs, b)) {
    const same = needs.find((n) => n.cat === s.group && n.key.startsWith('cat:'))
    if (same) { same.need = s.group === 'outerwear' ? `${same.need.replace(/^Chaqueta o abrigo/, 'Abrigo o chaqueta para invierno')}` : same.need; same.why.push(s.why); continue }
    needs.push({ key: `season:${s.key}`, cat: s.group, need: s.need, why: [s.why], data: ['Clima', 'Temporadas de tus prendas'], weight: 12 })
  }
  const seen = new Set<string>()
  return needs.sort((a, z) => z.weight - a.weight).filter((n) => (seen.has(n.need) ? false : (seen.add(n.need), true))).slice(0, 6)
}

// ── Auditoria completa ──
export interface AuditInput { active: G[]; drafts: G[]; archived: number; evals: Map<string, Evaluation>; bundle: Bundle; wears?: WearRow[]; now?: Date }
export function buildAudit({ active, drafts, archived, evals, bundle: b, wears = [], now = new Date() }: AuditInput) {
  const findings: AuditFinding[] = []
  const use = usageStats(active, wears, now)
  const ev = (g: G) => evals.get(g.id)
  // 6.1 Clasificacion por estado
  const byDecision = { keep: 0, modify: 0, review: 0, replace: 0, donate_sell: 0, none: 0 } as Record<string, number>
  for (const g of active) byDecision[g.decision ?? 'none']++
  // Por revisar: borradores, fichas incompletas, propuestas de la IA, decision «revisar» o sin decidir con datos pendientes
  for (const g of [...drafts, ...active]) {
    const reasons = [
      g.wardrobe_status === 'draft' ? 'es un borrador' : null, !g.complete ? `ficha incompleta (${(g.missing ?? []).join(', ').toLowerCase()})` : null,
      g.pending_review ? 'tiene una propuesta de la IA sin revisar' : null, g.decision === 'review' ? 'la marcaste para revisar' : null,
      !g.decision && g.wardrobe_status === 'active' && ev(g)?.compat.score == null ? 'faltan datos para valorarla' : null,
    ].filter(Boolean) as string[]
    if (reasons.length) findings.push({ key: `review:${g.id}`, kind: 'review', title: `Por revisar: «${garmentTitle(g)}»`, body: `${reasons.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()), why: ['Con la información completa la auditoría y las recomendaciones son más fiables.'], data_used: ['Estado y ficha de la prenda'], garment_ids: [g.id], recommendation: null, priority: 4 })
  }
  // Arreglos
  for (const g of active) {
    const e = ev(g)
    if (g.decision === 'modify' || (!g.decision && e?.proposal.decision === 'modify'))
      findings.push({ key: `alter:${g.id}`, kind: 'alteration', title: `Necesita un arreglo: «${garmentTitle(g)}»`, body: g.decision === 'modify' ? 'La marcaste para modificar.' : e!.proposal.why, why: ['Un arreglo de sastrería suele salir más a cuenta que sustituirla.'], data_used: ['Fit Assessment', 'Decisión'], garment_ids: [g.id], recommendation: g.decision === 'modify' ? null : { decision: 'modify', garment_id: g.id }, priority: 3 })
  }
  // Sustituir / donar (decididas o propuestas sin decidir)
  for (const g of active) {
    const e = ev(g)
    const d = g.decision && OUT.has(g.decision) ? g.decision : !g.decision && e && OUT.has(e.proposal.decision) ? e.proposal.decision : null
    if (d) findings.push({ key: `replace:${g.id}:${d}`, kind: 'replace', title: `${g.decision ? 'Marcada para' : 'Propuesta para'} ${lc(decisionLabel(d))}: «${garmentTitle(g)}»`, body: g.decision ? `Lo decidiste${g.decision_at ? ` el ${new Date(g.decision_at).toLocaleDateString('es-ES')}` : ''}. Cuando salga de tu armario, archívala.` : e!.proposal.why, why: [`Compatibilidad ${fmt(e?.compat.score)}, ajuste ${fmt(e?.fit.score)}, valor ${fmt(e?.value.score)}.`], data_used: ['Evaluación personal (2C)'], garment_ids: [g.id], recommendation: g.decision ? null : { decision: d as DecisionId, garment_id: g.id }, priority: 3 })
  }
  // 6.2 Duplicados
  const dups = duplicateGroups(active.filter((g) => !OUT.has(g.decision)), evals)
  for (const d of dups) findings.push(duplicateFinding(d.members, d.pairs, evals, use))
  // Frecuencia de uso: prendas que no te pones (solo con registro suficiente)
  for (const u of use.unused) if (!OUT.has(active.find((g) => g.id === u.id)?.decision)) findings.push({ key: `unused:${u.id}`, kind: 'unused', title: `Sin usar: «${u.title}»`, body: `No te la has puesto en los ${use.days} días que llevas registrando tu uso (${use.events} usos). ¿Sigue teniendo sitio en tu armario?`, why: ['Una prenda que no se usa ocupa espacio y suele indicar que algo no encaja (ajuste, estilo, ocasión). Revísala antes de decidir.'], data_used: ['Registro de uso de Outfit Studio'], garment_ids: [u.id], recommendation: { decision: 'review', garment_id: u.id }, priority: 3 })
  for (const u of use.dormant) findings.push({ key: `dormant:${u.id}`, kind: 'unused', title: `Hace tiempo que no la usas: «${u.title}»`, body: `Te la pusiste ${u.count} ${u.count === 1 ? 'vez' : 'veces'}; la última, el ${new Date(u.last!).toLocaleDateString('es-ES')} (hace más de ${DORMANT_DAYS} días).`, why: ['Puede ser de temporada; si no lo es, conviene revisar por qué ha dejado de funcionar.'], data_used: ['Registro de uso de Outfit Studio'], garment_ids: [u.id], recommendation: null, priority: 4 })
  // Conservacion
  for (const g of active) if (['desgastado', 'danado'].includes(g.condition)) findings.push({ key: `cond:${g.id}`, kind: 'condition', title: `${CONDITIONS.find((c) => c.id === g.condition)!.label}: «${garmentTitle(g)}»`, body: g.condition === 'danado' ? 'Está dañada: valora arreglarla o sustituirla.' : 'Está desgastada: tenlo en cuenta para reponerla.', why: ['Estado de conservación indicado en la ficha.'], data_used: ['Conservación'], garment_ids: [g.id], recommendation: { decision: g.condition === 'danado' ? 'modify' : 'review', garment_id: g.id }, priority: 4 })
  // 6.3 Huecos y necesidades prioritarias
  const categories = categoryCoverage(active, evals, b)
  const occasions = occasionCoverage(active, b)
  const needs = priorityNeeds(active, evals, b)
  needs.forEach((n, i) => findings.push({ key: `need:${n.key}`, kind: 'need', title: `${i + 1}. ${n.need}`, body: n.why.join(' '), why: n.why, data_used: n.data, garment_ids: [], recommendation: { need: n.need }, priority: 1 }))
  for (const c of categories) if (c.status === 'Necesita revisión') findings.push({ key: `gap:${c.id}`, kind: 'gap', title: `${c.label}: necesita revisión`, body: c.why, why: ['Muchas de estas prendas están marcadas para revisar o arreglar, encajan poco contigo o están gastadas.'], data_used: ['Decisiones, compatibilidad y conservación'], garment_ids: c.flagged, recommendation: null, priority: 2 })
  // 6.4 Organizacion
  const seasons = Object.fromEntries(SEASONS.map((s) => [s.id, active.filter((g) => (g.seasons ?? []).includes(s.id)).length]))
  const noSeason = active.filter((g) => !(g.seasons ?? []).length).length
  const locations: Record<string, number> = {}
  for (const g of active) { const l = g.location?.trim() || 'Sin indicar'; locations[l] = (locations[l] ?? 0) + 1 }
  const scores = active.map((g) => ev(g)?.compat.score).filter((x): x is number => x != null)
  const summary = {
    garments: active.length, drafts: drafts.length, archived, byDecision,
    avgCompat: scores.length ? r1(scores.reduce((s, x) => s + x, 0) / scores.length) : null, evaluated: scores.length,
    fitted: active.filter((g) => ev(g)?.fit.score != null).length,
    duplicates: dups.length, categories, occasions, seasons, noSeason, locations,
    usage: {
      tracked: use.tracked, events: use.events, since: use.since, days: use.days, worn: use.worn, unused: use.unused.length, dormant: use.dormant.length,
      top: use.top.map((x) => ({ id: x.id, title: x.title, count: x.count, last: x.last })),
      note: use.tracked ? `Según tu registro de uso de Outfit Studio (${use.events} usos en ${use.days} días), nunca deducido de fotos.` : `Aún hay poco registro de uso (${use.events} usos en ${use.days} días): la frecuencia se tendrá en cuenta a partir de ${MIN_WEAR_EVENTS} usos y ${MIN_TRACK_DAYS} días. Regístralos en la ficha de cada conjunto («Me lo he puesto»).`,
    },
  }
  return { summary, findings: findings.sort((a, z) => a.priority - z.priority) }
}
export type Audit = ReturnType<typeof buildAudit>
export const MIN_AUDIT = MIN_WARDROBE
