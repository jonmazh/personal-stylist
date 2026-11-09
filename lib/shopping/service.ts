import { z } from 'zod'
import { WardrobeError, type Sb } from '@/lib/wardrobe/service'
import { usageStats } from '@/lib/wardrobe/audit'
import { garmentTitle } from '@/lib/wardrobe/display'
import { prepareEngine, type Prepared } from '@/lib/outfits/generate-service'
import { assessNeed, effectivePriority, normalizePriorityWeights, type Assessment } from './priority'
import { detectNeeds } from './detect'
import { budgetStatus } from './budget'
import { BUDGET_PERIODS, NEED_STATUSES, NEED_TYPES, NeedSpec, OPEN_STATUSES, PRIORITIES, RETAILERS } from './taxonomy'

/** Shopping Intelligence y Shopping Planner (fase 4A): necesidades, prioridades, listas, presupuesto y preferencias. */
type Row = Record<string, any>
const ids = <T extends { id: string }>(xs: readonly T[]) => xs.map((x) => x.id) as [string, ...string[]]
const dbErr = (m: string) => new WardrobeError(/schema cache|does not exist/i.test(m) ? 'Ejecuta la migración 0016 en Supabase.' : m, 500)
const zmsg = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || 'necesidad'}: ${i.message}`).join('; ')

export const NeedInput = z.object({
  title: z.string().trim().min(1, 'Ponle un nombre').max(120),
  type: z.enum(ids(NEED_TYPES)).default('need'),
  spec: NeedSpec,
  rationale: z.string().trim().max(600).nullable().optional(),
  price_min: z.number().min(0).max(100000).nullable().optional(),
  price_max: z.number().min(0).max(100000).nullable().optional(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  preferred_retailers: z.array(z.enum(ids(RETAILERS))).max(10).default([]),
  replaces_garment_id: z.string().uuid().nullable().optional(),
  user_priority: z.enum(ids(PRIORITIES)).nullable().optional(),
})
export const NeedPatch = NeedInput.partial().extend({ status: z.enum(ids(NEED_STATUSES)).optional(), discard_reason: z.string().trim().max(300).nullable().optional() })

/** Todo lo que el motor necesita: armario, perfil, evaluaciones (2C), aprendizaje (3D), uso y preferencias. */
export async function shoppingContext(sb: Sb, uid: string) {
  const [prep, { data: wears }, { data: prefs }] = await Promise.all([
    prepareEngine(sb, uid), sb.from('outfit_wear_events').select('worn_on, garment_ids').limit(2000), sb.from('shopping_preferences').select('*').eq('user_id', uid).maybeSingle(),
  ])
  const use = usageStats(prep.garments, wears ?? [])
  return { prep, use, prefs: prefs ?? null }
}
type Ctx = Awaited<ReturnType<typeof shoppingContext>>
const envOf = (c: Ctx) => ({ garments: c.prep.garments, evals: c.prep.evals, bundle: c.prep.bundle, use: c.use, signals: c.prep.signals, weights: c.prefs?.priority_weights ?? null })

async function event(sb: Sb, uid: string, needId: string, kind: string, changes?: Row) { await sb.from('shopping_need_events').insert({ user_id: uid, need_id: needId, kind, changes: changes ?? null }) }

/** Evalua (o reevalua) una necesidad y guarda la evaluacion versionada. */
async function assess(sb: Sb, uid: string, need: Row, c: Ctx): Promise<Assessment> {
  const a = assessNeed({ title: need.title, type: need.type, spec: NeedSpec.parse(need.spec), price_min: need.price_min, price_max: need.price_max, replaces_garment_id: need.replaces_garment_id, target_date: need.target_date }, envOf(c))
  const { error } = await sb.from('shopping_need_assessments').insert({
    user_id: uid, need_id: need.id, engine_version: a.version, weights: a.weights, score: a.score, level: a.level, criteria: a.criteria, confidence: a.confidence,
    expected_wears_month: a.expectedWearsMonth, new_outfits: a.newOutfits, redundancy: a.redundancy, cost_per_wear: a.costPerWear, occasions: a.occasions,
  })
  if (error) throw dbErr(error.message)
  await sb.from('shopping_needs').update({ priority_score: a.score, priority_level: a.level }).eq('id', need.id)
  return a
}

/**
 * Detectar necesidades (POST /api/shopping/needs/analyze). Crea las nuevas como «detectadas» y reevalua las abiertas.
 * Nunca recrea una que descartaste ni una que rechazaste en la auditoria. No crea deseos ni productos.
 */
export async function analyzeNeeds(sb: Sb, uid: string) {
  const c = await shoppingContext(sb, uid)
  const { data: existing, error } = await sb.from('shopping_needs').select('*')
  if (error) throw dbErr(error.message)
  const { data: audit } = await sb.from('wardrobe_audit_findings').select('key, status').eq('kind', 'need').neq('status', 'proposed')
  const auditStatus = new Map((audit ?? []).map((f) => [String(f.key).replace(/^need:/, ''), f.status]))
  const known = new Set((existing ?? []).map((n) => n.detection_key).filter(Boolean))
  const detected = detectNeeds(c.prep.garments, c.prep.evals, c.prep.bundle, c.use)
  let created = 0, skipped = 0
  for (const d of detected) {
    if (known.has(d.key)) continue
    if (auditStatus.get(d.key) === 'rejected') { skipped++; continue }
    const { data: n, error: ie } = await sb.from('shopping_needs').insert({
      user_id: uid, title: d.title.slice(0, 120), type: d.type, origin: auditStatus.get(d.key) === 'accepted' ? 'audit' : 'detected', detection_key: d.key, status: 'detected',
      spec: d.spec, rationale: d.rationale, related_garment_ids: d.related_garment_ids, replaces_garment_id: d.replaces_garment_id ?? null,
    }).select('*').single()
    if (ie) throw dbErr(ie.message)
    await event(sb, uid, n.id, 'created', { origin: n.origin, key: d.key })
    created++
  }
  const { data: open } = await sb.from('shopping_needs').select('*').in('status', OPEN_STATUSES)
  for (const n of open ?? []) await assess(sb, uid, n, c)
  await sb.from('ai_runs').insert({ user_id: uid, kind: 'shopping_analysis', model: 'reglas', meta: { detected: detected.length, created, reassessed: open?.length ?? 0, skipped } })
  return { detected: detected.length, created, reassessed: open?.length ?? 0, skipped }
}

/** Necesidad creada por ti (incluidos los deseos). */
export async function createNeed(sb: Sb, uid: string, raw: unknown) {
  const p = NeedInput.safeParse(raw); if (!p.success) throw new WardrobeError(zmsg(p.error))
  const d = p.data
  if (d.price_min != null && d.price_max != null && d.price_min > d.price_max) throw new WardrobeError('El precio mínimo no puede superar al máximo.')
  if (d.spec.formality_min && d.spec.formality_max && d.spec.formality_min > d.spec.formality_max) throw new WardrobeError('El rango de formalidad no es válido.')
  if (d.replaces_garment_id) { const { data: g } = await sb.from('garments').select('id').eq('id', d.replaces_garment_id).maybeSingle(); if (!g) throw new WardrobeError('La prenda a sustituir no está en tu armario.', 400) }
  if (d.type === 'replacement' && !d.replaces_garment_id) throw new WardrobeError('Indica qué prenda quieres sustituir.')
  const { data: n, error } = await sb.from('shopping_needs').insert({ ...d, user_id: uid, origin: 'user', status: 'detected', related_garment_ids: d.replaces_garment_id ? [d.replaces_garment_id] : [] }).select('*').single()
  if (error) throw dbErr(error.message)
  await event(sb, uid, n.id, 'created', { origin: 'user', type: d.type })
  await assess(sb, uid, n, await shoppingContext(sb, uid))
  return n.id as string
}

/** Editar, fijar prioridad o cambiar el estado (descartar exige motivo). Reevalua si cambia la prenda buscada. */
export async function updateNeed(sb: Sb, uid: string, id: string, raw: unknown) {
  const p = NeedPatch.safeParse(raw); if (!p.success) throw new WardrobeError(zmsg(p.error))
  const { data: cur } = await sb.from('shopping_needs').select('*').eq('id', id).maybeSingle()
  if (!cur) throw new WardrobeError('Necesidad no encontrada', 404)
  // Solo los campos enviados (zod 4 aplica los valores por defecto incluso en .partial())
  const sent = raw && typeof raw === 'object' ? new Set(Object.keys(raw)) : new Set<string>()
  const d = Object.fromEntries(Object.entries(p.data).filter(([k]) => sent.has(k))) as z.infer<typeof NeedPatch>
  if (d.price_min != null && d.price_max != null && d.price_min > d.price_max) throw new WardrobeError('El precio mínimo no puede superar al máximo.')
  if (d.status === 'discarded' && !(d.discard_reason ?? cur.discard_reason)) throw new WardrobeError('Indica por qué la descartas: así no volveré a proponerla por lo mismo.')
  const patch: Row = { ...d }
  if (d.status && d.status !== cur.status) patch.status_changed_at = new Date().toISOString()
  if (d.status && d.status !== 'discarded') patch.discard_reason = null
  const { error } = await sb.from('shopping_needs').update(patch).eq('id', id)
  if (error) throw dbErr(error.message)
  if (d.status && d.status !== cur.status) await event(sb, uid, id, 'status', { from: cur.status, to: d.status, reason: d.discard_reason ?? null })
  if (d.user_priority !== undefined && d.user_priority !== cur.user_priority) await event(sb, uid, id, 'priority', { from: cur.user_priority, to: d.user_priority })
  const edited = ['title', 'spec', 'price_min', 'price_max', 'target_date', 'preferred_retailers', 'type'].filter((k) => k in d)
  if (edited.length) await event(sb, uid, id, 'edited', { fields: edited })
  if (['spec', 'price_min', 'price_max', 'target_date', 'type'].some((k) => k in d)) { const { data: n } = await sb.from('shopping_needs').select('*').eq('id', id).single(); await assess(sb, uid, n, await shoppingContext(sb, uid)) }
  return { id }
}

export async function reassessNeed(sb: Sb, uid: string, id: string) {
  const { data: n } = await sb.from('shopping_needs').select('*').eq('id', id).maybeSingle()
  if (!n) throw new WardrobeError('Necesidad no encontrada', 404)
  return assess(sb, uid, n, await shoppingContext(sb, uid))
}

export async function listNeeds(sb: Sb, opts: { status?: 'open' | 'all' | string } = {}) {
  let q = sb.from('shopping_needs').select('*, shopping_need_assessments(id, score, level, new_outfits, expected_wears_month, redundancy, cost_per_wear, confidence, created_at)')
  if (!opts.status || opts.status === 'open') q = q.in('status', OPEN_STATUSES); else if (opts.status !== 'all') q = q.eq('status', opts.status)
  const { data, error } = await q
  if (error) { if (/schema cache|does not exist/i.test(error.message)) return []; throw dbErr(error.message) }
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 }
  return (data ?? []).map((n) => {
    const last = [...(n.shopping_need_assessments ?? [])].sort((a: Row, z: Row) => z.created_at.localeCompare(a.created_at))[0] ?? null
    const { shopping_need_assessments: _a, ...rest } = n
    return { ...rest, latest: last, priority: effectivePriority(n) }
  }).sort((a, z) => rank[a.priority] - rank[z.priority] || Number(z.priority_score ?? 0) - Number(a.priority_score ?? 0))
}

export async function getNeed(sb: Sb, id: string) {
  const { data: n, error } = await sb.from('shopping_needs').select('*').eq('id', id).maybeSingle()
  if (error) throw dbErr(error.message)
  if (!n) throw new WardrobeError('Necesidad no encontrada', 404)
  const gids = [...new Set([...(n.related_garment_ids ?? []), n.replaces_garment_id].filter(Boolean))] as string[]
  const [{ data: assessments }, { data: events }, { data: items }, { data: gs }] = await Promise.all([
    sb.from('shopping_need_assessments').select('*').eq('need_id', id).order('created_at', { ascending: false }).limit(10),
    sb.from('shopping_need_events').select('*').eq('need_id', id).order('created_at', { ascending: false }).limit(30),
    sb.from('shopping_list_items').select('list_id, shopping_lists(id, name)').eq('need_id', id),
    gids.length ? sb.from('garments').select('*').in('id', gids) : Promise.resolve({ data: [] as Row[] }),
  ])
  return { ...n, assessments: assessments ?? [], events: events ?? [], lists: (items ?? []).map((i: Row) => i.shopping_lists).filter(Boolean), garments: (gs ?? []).map((g) => ({ id: g.id, title: garmentTitle(g), wardrobe_status: g.wardrobe_status })), priority: effectivePriority(n) }
}

// ── Listas ──
export const ListInput = z.object({ name: z.string().trim().min(1, 'Ponle un nombre a la lista').max(80), description: z.string().trim().max(300).nullable().optional(), target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() })
export async function createList(sb: Sb, uid: string, raw: unknown) {
  const p = ListInput.safeParse(raw); if (!p.success) throw new WardrobeError(zmsg(p.error))
  const { data, error } = await sb.from('shopping_lists').insert({ ...p.data, user_id: uid }).select('id').single()
  if (error) throw dbErr(error.message)
  return data.id as string
}
export async function listLists(sb: Sb) {
  const { data, error } = await sb.from('shopping_lists').select('*, shopping_list_items(id, position, note, need_id, shopping_needs(id, title, type, status, priority_level, user_priority, price_max))').eq('status', 'active').order('created_at')
  if (error) { if (/schema cache|does not exist/i.test(error.message)) return []; throw dbErr(error.message) }
  return (data ?? []).map((l) => ({ ...l, items: [...(l.shopping_list_items ?? [])].sort((a: Row, z: Row) => a.position - z.position) }))
}
export async function addToList(sb: Sb, uid: string, listId: string, needId: string, note?: string | null) {
  const [{ data: l }, { data: n }] = await Promise.all([sb.from('shopping_lists').select('id').eq('id', listId).maybeSingle(), sb.from('shopping_needs').select('id').eq('id', needId).maybeSingle()])
  if (!l || !n) throw new WardrobeError('Lista o necesidad no encontrada', 404)
  const { count } = await sb.from('shopping_list_items').select('id', { count: 'exact', head: true }).eq('list_id', listId)
  const { error } = await sb.from('shopping_list_items').insert({ user_id: uid, list_id: listId, need_id: needId, position: count ?? 0, note: note || null })
  if (error) throw new WardrobeError(/duplicate|unique/i.test(error.message) ? 'Ya está en esa lista.' : error.message, 400)
  await event(sb, uid, needId, 'listed', { list_id: listId })
}
export async function removeFromList(sb: Sb, listId: string, needId: string) { await sb.from('shopping_list_items').delete().eq('list_id', listId).eq('need_id', needId) }
export async function archiveList(sb: Sb, listId: string) { const { data } = await sb.from('shopping_lists').update({ status: 'archived' }).eq('id', listId).select('id').maybeSingle(); if (!data) throw new WardrobeError('Lista no encontrada', 404) }

// ── Presupuesto ──
export const BudgetInput = z.object({ period: z.enum(ids(BUDGET_PERIODS)), amount: z.number().min(0).max(100000), currency: z.string().regex(/^[A-Z]{3}$/).default('EUR'), starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
export async function getBudget(sb: Sb) {
  const { data, error } = await sb.from('shopping_budgets').select('*').eq('active', true).maybeSingle()
  if (error) { if (/schema cache|does not exist/i.test(error.message)) return null; throw dbErr(error.message) }
  return data
}
/** Un presupuesto activo cada vez; el anterior queda en el historial (inactivo). Importe 0 o null lo desactiva. */
export async function setBudget(sb: Sb, uid: string, raw: unknown | null) {
  await sb.from('shopping_budgets').update({ active: false }).eq('active', true)
  if (raw === null) return null
  const p = BudgetInput.safeParse(raw); if (!p.success) throw new WardrobeError(zmsg(p.error))
  const { data, error } = await sb.from('shopping_budgets').insert({ ...p.data, user_id: uid, starts_on: p.data.starts_on ?? new Date().toISOString().slice(0, 10), active: true }).select('*').single()
  if (error) throw dbErr(error.message)
  return data
}

// ── Preferencias ──
export const PrefsInput = z.object({
  preferred_retailers: z.array(z.enum(ids(RETAILERS))).max(20).default([]), excluded_retailers: z.array(z.enum(ids(RETAILERS))).max(20).default([]),
  priority_weights: z.record(z.string(), z.number().min(0).max(100)).nullable().optional(), min_priority_to_suggest: z.number().min(0).max(100).default(45),
  quality_over_price: z.boolean().default(true), notes: z.string().trim().max(500).nullable().optional(),
})
export async function getPreferences(sb: Sb) {
  const { data } = await sb.from('shopping_preferences').select('*').maybeSingle()
  return data
}
export async function setPreferences(sb: Sb, uid: string, raw: unknown) {
  const p = PrefsInput.safeParse(raw); if (!p.success) throw new WardrobeError(zmsg(p.error))
  if (p.data.preferred_retailers.some((r) => p.data.excluded_retailers.includes(r))) throw new WardrobeError('Una tienda no puede ser preferida y excluida a la vez.')
  const row = { ...p.data, user_id: uid, priority_weights: p.data.priority_weights ? normalizePriorityWeights(p.data.priority_weights) : null, updated_at: new Date().toISOString() }
  const { error } = await sb.from('shopping_preferences').upsert(row)
  if (error) throw dbErr(error.message)
  return row
}

/** Shopping Planner: necesidades abiertas por prioridad, presupuesto, listas y preferencias. */
export async function plannerView(sb: Sb) {
  const [needs, all, budget, lists, prefs] = await Promise.all([listNeeds(sb), listNeeds(sb, { status: 'all' }), getBudget(sb), listLists(sb), getPreferences(sb)])
  const threshold = Number(prefs?.min_priority_to_suggest ?? 45)
  const worth = needs.filter((n) => n.user_priority ? n.user_priority !== 'low' : Number(n.priority_score ?? 0) >= threshold)
  return { needs, worth, canWait: needs.filter((n) => !worth.includes(n)), budget, budgetStatus: budgetStatus(budget, all), lists, prefs, threshold }
}
export type { Prepared }
