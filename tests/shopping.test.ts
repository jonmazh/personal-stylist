import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Bundle } from '@/lib/profile/data'
import { evaluateGarment } from '@/lib/wardrobe/compatibility'
import { detectNeeds } from '@/lib/shopping/detect'
import { DEFAULT_PRIORITY_WEIGHTS, assessNeed, effectivePriority, levelOf, normalizePriorityWeights } from '@/lib/shopping/priority'
import { budgetStatus, currentWindow } from '@/lib/shopping/budget'
import { BUDGET_PERIODS, NEED_ORIGINS, NEED_STATUSES, NEED_TYPES, NeedSpec, OPEN_STATUSES, PRIORITIES } from '@/lib/shopping/taxonomy'

const bundle = (): Bundle => ({
  profile: { fit_pref: 'Regular', budget_max: 90 }, measures: {}, photos: [], color: { temperature: 'Cálida', temperature_source: 'usuario', temperature_status: 'validado', likes: [], avoids: [] },
  style: null, life: { life: { trabajo: 60, ocio: 30, deporte: 10 }, work_formality: 'Smart casual', climate: 'Cuatro estaciones marcadas', constraints: [] },
  fit: { prefs: { pantalones: 'Recto' } }, goals: null, validated: {}, observations: [], blueprints: [], garments: [], references: [], refRatings: [], styleRefs: [], colorAnalyses: [], chatValidated: false,
} as unknown as Bundle)
let n = 0
const G = (name: string, g: Record<string, any>) => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, name, title: name, wardrobe_status: 'active', pattern: 'Liso', occasions: ['trabajo', 'ocio'], seasons: ['primavera', 'otono', 'invierno'], ...g })
const wardrobe = () => [
  G('Camisa blanca', { category: 'top', subcategory: 'shirt', primary_color: 'Blanco', formality_level: 3 }),
  G('Polo marino', { category: 'top', subcategory: 'polo', primary_color: 'Azul marino', formality_level: 3 }),
  G('Chino beige', { category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', cut: 'Recto', formality_level: 3 }),
  G('Vaquero', { category: 'bottom', subcategory: 'jeans', primary_color: 'Denim', cut: 'Recto', formality_level: 2, occasions: ['ocio'] }),
  G('Zapatillas rotas', { category: 'footwear', subcategory: 'sneakers', primary_color: 'Blanco', formality_level: 2, occasions: ['ocio'], condition: 'danado' }),
]
const env = (gs = wardrobe(), extra: Record<string, unknown> = {}) => { const b = bundle(); return { garments: gs, evals: new Map(gs.map((g) => [g.id, evaluateGarment(g, b, { others: gs, imageCount: 1 })])), bundle: b, now: new Date('2026-10-15'), ...extra } }
const spec = (s: Record<string, unknown>) => NeedSpec.parse(s)

test('pesos de prioridad: por defecto suman 100; los tuyos se normalizan; todo a cero vuelve al defecto', () => {
  assert.equal(Object.values(DEFAULT_PRIORITY_WEIGHTS).reduce((s, x) => s + x, 0), 100)
  assert.deepEqual(normalizePriorityWeights(null), { ...DEFAULT_PRIORITY_WEIGHTS })
  const w = normalizePriorityWeights({ need: 60, usage: 20, outfits: 20, profile: 0, urgency: 0, confidence: 0 })
  assert.equal(w.need, 60); assert.equal(w.profile, 0)
  const doubled = normalizePriorityWeights({ need: 60, usage: 40, outfits: 40, profile: 30, urgency: 20, confidence: 10 })
  assert.equal(Math.round(Object.values(doubled).reduce((s, x) => s + x, 0)), 100); assert.equal(doubled.need, 30)
  assert.deepEqual(normalizePriorityWeights({ need: 0, usage: 0, outfits: 0, profile: 0, urgency: 0, confidence: 0 }), { ...DEFAULT_PRIORITY_WEIGHTS })
  assert.equal(levelOf(70), 'high'); assert.equal(levelOf(69), 'medium'); assert.equal(levelOf(45), 'medium'); assert.equal(levelOf(44), 'low')
  assert.equal(effectivePriority({ user_priority: 'high', priority_level: 'low' }), 'high', 'la tuya manda')
  assert.equal(effectivePriority({ priority_level: 'medium' }), 'medium')
})

test('evaluación explicable: 6 criterios, puntos = valor × peso, suma = puntuación; usa tus pesos', () => {
  const e = env()
  const a = assessNeed({ title: 'Mocasines', type: 'need', spec: spec({ category: 'footwear', subcategory: 'loafers', colors: ['Marrón'], formality_min: 3, formality_max: 4, seasons: ['otono'], occasions: ['trabajo'] }) }, e)
  assert.deepEqual(a.criteria.map((c) => c.key), ['need', 'usage', 'outfits', 'profile', 'urgency', 'confidence'])
  for (const c of a.criteria) { assert.ok(c.reasons.length && c.data_used.length, c.key); assert.ok(c.points <= c.weight + 0.01) }
  assert.ok(Math.abs(a.criteria.reduce((s, c) => s + c.points, 0) - a.score) <= 1)
  assert.equal(a.level, levelOf(a.score)); assert.ok(a.score >= 70, `faltan zapatos de trabajo: ${a.score}`)
  assert.ok(a.newOutfits > 0, 'abre conjuntos nuevos con el motor de outfits'); assert.equal(a.redundancy.level, 'baja')
  const w = assessNeed({ title: 'Mocasines', type: 'need', spec: spec({ category: 'footwear', subcategory: 'loafers' }) }, { ...e, weights: { need: 100, usage: 0, outfits: 0, profile: 0, urgency: 0, confidence: 0 } })
  assert.equal(w.weights.need, 100); assert.equal(w.criteria.find((c) => c.key === 'usage')!.points, 0)
})

test('un deseo redundante queda en prioridad baja y señala la prenda parecida; una sustitución no se penaliza por parecerse', () => {
  const gs = wardrobe(), e = env(gs)
  const s = spec({ category: 'bottom', subcategory: 'chinos', colors: ['Beige'], cut: 'Recto', formality_min: 3, formality_max: 3, occasions: ['trabajo'] })
  const desire = assessNeed({ title: 'Otro chino', type: 'desire', spec: s }, e)
  assert.equal(desire.level, 'low'); assert.equal(desire.redundancy.level, 'alta'); assert.equal(desire.redundancy.garments[0].id, gs[2].id)
  const asNeed = assessNeed({ title: 'Otro chino', type: 'need', spec: s }, e)
  assert.ok(desire.score < asNeed.score, 'el deseo cuenta menos que una necesidad')
  const repl = assessNeed({ title: 'Sustituir chino', type: 'replacement', spec: s, replaces_garment_id: gs[2].id }, e)
  assert.ok(repl.score > asNeed.score, `una sustitución no es redundante con lo que sustituye: ${repl.score} vs ${asNeed.score}`)
})

test('coste por uso: precio objetivo, si no tu presupuesto por prenda, si no sin precio', () => {
  const e = env()
  const s = spec({ category: 'footwear', subcategory: 'loafers', occasions: ['trabajo'] })
  const a = assessNeed({ title: 'x', type: 'need', spec: s, price_max: 120 }, e)
  assert.equal(a.costPerWear.price, 120); assert.ok(a.costPerWear.uses >= 1); assert.equal(a.costPerWear.value, Math.round((120 / a.costPerWear.uses) * 100) / 100)
  assert.match(a.costPerWear.basis, /precio objetivo/)
  const one = assessNeed({ title: 'x', type: 'need', spec: spec({ category: 'footwear', subcategory: 'loafers', occasions: ['trabajo'], seasons: ['invierno'] }), price_max: 120 }, e)
  assert.equal(one.expectedWearsMonth, a.expectedWearsMonth, 'en su temporada se usa igual')
  assert.ok(one.costPerWear.uses < a.costPerWear.uses && one.costPerWear.value! > a.costPerWear.value!, 'una prenda de una sola temporada tiene menos usos en su vida: más coste por uso')
  assert.equal(assessNeed({ title: 'x', type: 'need', spec: s }, e).costPerWear.price, 90, 'presupuesto máximo del perfil')
  const nb = env(); (nb.bundle as any).profile = {}
  const none = assessNeed({ title: 'x', type: 'need', spec: s }, nb)
  assert.equal(none.costPerWear.value, null); assert.equal(none.costPerWear.basis, 'sin precio')
})

test('urgencia: temporada actual > siguiente > lejana; fecha objetivo cercana sube', () => {
  const e = env() // 15 de octubre: otoño
  const urg = (s: Record<string, unknown>, extra = {}) => assessNeed({ title: 'x', type: 'need', spec: spec({ category: 'outerwear', ...s }), ...extra }, e).criteria.find((c) => c.key === 'urgency')!.value
  assert.ok(urg({ seasons: ['otono'] }) > urg({ seasons: ['invierno'] })); assert.ok(urg({ seasons: ['invierno'] }) > urg({ seasons: ['verano'] }))
  assert.ok(urg({ seasons: ['verano'] }, { target_date: '2026-10-25' }) >= 0.9)
})

test('detección: claves estables alineadas con la auditoría, tipos correctos y nunca deseos', () => {
  const gs = wardrobe(), e = env(gs)
  const d = detectNeeds(gs, e.evals, e.bundle, null)
  assert.ok(d.length >= 2)
  assert.ok(d.every((x) => x.type !== 'desire'), 'el detector no inventa deseos')
  assert.ok(d.every((x) => /^(occ|cat|season|repl|impr):/.test(x.key)), d.map((x) => x.key).join(' '))
  assert.equal(new Set(d.map((x) => x.key)).size, d.length, 'claves únicas')
  const repl = d.find((x) => x.type === 'replacement'); assert.ok(repl, 'sustituye la prenda dañada'); assert.equal(repl!.replaces_garment_id, gs[4].id); assert.equal(repl!.key, `repl:${gs[4].id}`)
  assert.ok(d.every((x) => NeedSpec.safeParse(x.spec).success && x.rationale), 'cada necesidad trae especificación válida y razón')
  assert.deepEqual(detectNeeds(gs, e.evals, e.bundle, null).map((x) => x.key), d.map((x) => x.key), 'determinista')
})

test('presupuesto: ventanas por periodo, comprometido, avisos y «no hace falta gastar»', () => {
  assert.deepEqual(currentWindow({ period: 'monthly', starts_on: '2026-01-10' }, new Date('2026-03-15')), { from: '2026-03-10', to: '2026-04-09' })
  assert.deepEqual(currentWindow({ period: 'quarterly', starts_on: '2026-01-01' }, new Date('2026-05-20')), { from: '2026-04-01', to: '2026-06-30' })
  assert.deepEqual(currentWindow({ period: 'season', starts_on: '2026-03-01' }, new Date('2026-10-01')), { from: '2026-09-01', to: '2027-02-28' })
  const now = new Date('2026-03-15'), b = { period: 'monthly', starts_on: '2026-03-01', amount: 100, currency: 'EUR' }
  assert.equal(budgetStatus(null, []), null)
  const empty = budgetStatus(b, [], now)!
  assert.equal(empty.available, 100); assert.match(empty.advice!, /no hace falta gastar/i, 'tener presupuesto no obliga a comprar')
  const needs = [
    { status: 'approved', price_max: 60, status_changed_at: '2026-03-05T10:00:00Z' },
    { status: 'purchased', price_max: 30, status_changed_at: '2026-02-20T10:00:00Z' }, // fuera de la ventana
    { status: 'detected', priority_level: 'high', price_max: 70 },
    { status: 'detected', priority_level: 'low', price_max: 500 },
  ]
  const s = budgetStatus(b, needs, now)!
  assert.equal(s.committed, 60); assert.equal(s.available, 40); assert.equal(s.plannedHigh, 70); assert.equal(s.usedPct, 60); assert.equal(s.advice, null)
  assert.ok(s.warnings.some((w) => /superan lo disponible/.test(w)))
  const over = budgetStatus(b, [{ status: 'approved', price_max: 150, status_changed_at: '2026-03-02' }], now)!
  assert.ok(over.warnings.some((w) => /supera el presupuesto/.test(w))); assert.equal(over.usedPct, 100)
  assert.ok(budgetStatus(b, [{ status: 'detected', user_priority: 'high' }], now)!.warnings.some((w) => /sin precio/.test(w)))
})

test('migración 0016: CHECK alineados con la taxonomía, RLS en las 7 tablas y en las relaciones', () => {
  const sql = readFileSync('supabase/migrations/0016_shopping_intelligence.sql', 'utf8')
  const list = (xs: readonly { id: string }[]) => xs.map((x) => `'${x.id}'`).join(',')
  for (const xs of [NEED_TYPES, NEED_STATUSES, NEED_ORIGINS, PRIORITIES, BUDGET_PERIODS]) assert.ok(sql.includes(`(${list(xs)})`), list(xs))
  for (const t of ['shopping_needs', 'shopping_need_assessments', 'shopping_need_events', 'shopping_lists', 'shopping_list_items', 'shopping_budgets', 'shopping_preferences']) assert.match(sql, new RegExp(`'${t}'`))
  assert.match(sql, /enable row level security/)
  assert.match(sql, /shopping_list_items[\s\S]*shopping_lists l where l\.id = list_id and l\.user_id[\s\S]*shopping_needs n where n\.id = need_id and n\.user_id/)
  assert.match(sql, /replaces_garment_id is null or exists \(select 1 from public\.garments g/)
  assert.match(sql, /unique index if not exists shopping_budgets_active_idx[^;]*where active/)
  assert.match(sql, /unique index if not exists shopping_needs_key_idx[^;]*where detection_key is not null/)
  assert.ok(OPEN_STATUSES.every((s) => NEED_STATUSES.some((x) => x.id === s)) && !OPEN_STATUSES.includes('discarded') && !OPEN_STATUSES.includes('purchased'))
})
