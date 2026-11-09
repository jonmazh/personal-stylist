import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Bundle } from '@/lib/profile/data'
import { DUP_THRESHOLD, MIN_TRACK_DAYS, MIN_WEAR_EVENTS, usageStats, buildAudit, categoryCoverage, duplicateGroups, occasionCoverage, priorityNeeds, similarity } from '@/lib/wardrobe/audit'
import { evaluateGarment } from '@/lib/wardrobe/compatibility'

const bundle = (): Bundle => ({
  profile: { fit_pref: 'Regular' }, measures: {}, photos: [], color: { temperature: 'Cálida', temperature_source: 'usuario', temperature_status: 'validado', likes: [], avoids: [] },
  style: null, life: { life: { trabajo: 60, ocio: 30, deporte: 10 }, work_formality: 'Smart casual', climate: 'Cuatro estaciones marcadas', constraints: [] },
  fit: { prefs: { pantalones: 'Recto' } }, goals: null, validated: {}, observations: [], blueprints: [], garments: [], references: [], refRatings: [], styleRefs: [], colorAnalyses: [], chatValidated: false,
})
const G = (id: string, g: Record<string, any>): Record<string, any> => ({ id, complete: true, missing: [], image_count: 1, wardrobe_status: 'active', ...g })
const wardrobe = () => [
  G('t1', { name: 'Pantalón beige A', category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', cut: 'Slim', formality_level: 3, occasions: ['trabajo', 'ocio'], apparent_material: 'Sarga de algodón', seasons: ['primavera', 'otono'] }),
  G('t2', { name: 'Pantalón beige B', category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', cut: 'Recto', formality_level: 3, occasions: ['trabajo', 'ocio'], apparent_material: 'Algodón', seasons: ['primavera', 'otono'], is_favorite: true }),
  G('s1', { name: 'Camisa blanca', category: 'top', subcategory: 'shirt', primary_color: 'Blanco', formality_level: 3, occasions: ['trabajo'], seasons: ['primavera', 'verano'] }),
  G('s2', { name: 'Camiseta gris', category: 'top', subcategory: 'tee', primary_color: 'Gris', formality_level: 2, occasions: ['ocio'], seasons: ['verano'], condition: 'desgastado' }),
  G('c1', { name: 'Chaqueta', category: 'outerwear', subcategory: 'jacket', primary_color: 'Azul marino', formality_level: 3, occasions: ['trabajo', 'ocio'], seasons: ['otono'] }),
  G('j1', { name: 'Vaquero', category: 'bottom', subcategory: 'jeans', primary_color: 'Denim', cut: 'Recto', formality_level: 2, occasions: ['ocio'] }),
]
const evalsOf = (gs: Record<string, any>[], b: Bundle) => new Map(gs.map((g) => [g.id, evaluateGarment(g, b, { others: gs, imageCount: 1 })]))

test('similitud: misma función por encima del umbral; categorías distintas nunca', () => {
  const [a, z] = wardrobe()
  const s = similarity(a, z)
  assert.ok(s.score >= DUP_THRESHOLD, `score ${s.score}`)
  assert.ok(s.same.includes('mismo tipo') && s.same.some((x) => /mismo color/.test(x)))
  assert.ok(s.diffs.some((d) => /corte slim.*recto/.test(d)), s.diffs.join(' | '))
  assert.equal(similarity(a, wardrobe()[2]).score, 0)
  assert.ok(similarity(a, wardrobe()[5]).score < DUP_THRESHOLD, 'chino beige y vaquero no son duplicados')
})

test('duplicados: grupo con diferencias y recomendación por utilidad real', () => {
  const gs = wardrobe(), b = bundle()
  const groups = duplicateGroups(gs, evalsOf(gs, b))
  assert.equal(groups.length, 1); assert.deepEqual(groups[0].members.map((m) => m.id).sort(), ['t1', 't2'])
  const audit = buildAudit({ active: gs, drafts: [], archived: 0, evals: evalsOf(gs, b), bundle: b })
  const dup = audit.findings.find((f) => f.kind === 'duplicate')!
  assert.match(dup.body, /cumplen prácticamente la misma función/)
  assert.match(dup.body, /Recomendaría conservar «Pantalón beige B» porque encaja mejor con tu perfil actual/)
  assert.deepEqual(dup.recommendation, { decision: 'keep', garment_id: 't2' })
  assert.equal(dup.key, 'dup:t1,t2')
  assert.ok(dup.why[0].includes('no en el número'))
})

test('sin razón clara no se recomienda ninguna', () => {
  const b = bundle()
  const gs = [G('a', { category: 'top', subcategory: 'tee', primary_color: 'Blanco', formality_level: 1 }), G('z', { category: 'top', subcategory: 'tee', primary_color: 'Blanco', formality_level: 1 }), ...wardrobe().slice(2)]
  const d = buildAudit({ active: gs, drafts: [], archived: 0, evals: evalsOf(gs, b), bundle: b }).findings.find((f) => f.kind === 'duplicate')!
  assert.equal(d.recommendation, null); assert.match(d.body, /decide tú/)
})

test('cobertura por categoría y por ocasión (no solo una prenda de cada)', () => {
  const gs = wardrobe(), b = bundle()
  const cov = Object.fromEntries(categoryCoverage(gs, evalsOf(gs, b), b).map((c) => [c.id, c]))
  assert.equal(cov.footwear.status, 'Sin prendas'); assert.equal(cov.top.status, 'Falta variedad'); assert.equal(cov.bottom.status, 'Bien cubierta')
  assert.equal(cov.outerwear.status, 'Falta variedad', 'con cuatro estaciones conviene más de una prenda exterior')
  const occ = occasionCoverage(gs, b)
  assert.deepEqual(occ.map((o) => o.occasion), ['trabajo', 'ocio', 'deporte'])
  assert.deepEqual(occ[0].missing, ['footwear'])
  assert.deepEqual(occ[2].missing, ['top', 'bottom', 'footwear'])
  // formalidad del trabajo: smart casual (3-4) excluye formalidad 2
  const casual = occasionCoverage([G('x', { category: 'top', occasions: ['trabajo'], formality_level: 1 })], b)
  assert.ok(casual[0].missing.includes('top'))
})

test('necesidades prioritarias concretas: color de tu paleta, tu corte preferido y la ocasión', () => {
  const gs = wardrobe(), b = bundle()
  const needs = priorityNeeds(gs, evalsOf(gs, b), b)
  assert.ok(needs.length >= 3 && needs.length <= 6)
  assert.match(needs[0].need, /Calzado versátil para smart casual/)
  assert.match(needs[0].why[0], /trabajo \(60 % de tu semana\)/); assert.match(needs[0].why[1], /ocio \(30 %/)
  assert.ok(needs.some((n) => /^Ropa de deporte \(parte superior, parte inferior, calzado\)$/.test(n.need)))
  assert.equal(new Set(needs.map((n) => n.need)).size, needs.length, 'sin repetidas')
  assert.ok(needs.some((n) => /^Abrigo o chaqueta para invierno en camel$/.test(n.need)), needs.map((n) => n.need).join(' | '))
  // con los pantalones de vestir marcados para donar, el pantalón pasa a ser una necesidad con tu corte preferido
  const sinPantalon = gs.map((g) => (g.category === 'bottom' ? { ...g, decision: 'donate_sell' } : g))
  assert.ok(priorityNeeds(sinPantalon, evalsOf(sinPantalon, b), b).some((n) => /^Pantalón (marrón|azul marino|oliva|beige|gris) de corte recto$/.test(n.need)))
})

test('auditoría completa: estados, arreglos, conservación, organización y uso pendiente', () => {
  const b = bundle()
  const gs = wardrobe().map((g) => (g.id === 'c1' ? { ...g, decision: 'modify' } : g.id === 'j1' ? { ...g, decision: 'donate_sell' } : g))
  const draft = G('d1', { wardrobe_status: 'draft', category: null, complete: false, missing: ['Categoría'] })
  const a = buildAudit({ active: gs, drafts: [draft], archived: 2, evals: evalsOf(gs, b), bundle: b })
  assert.equal(a.summary.byDecision.modify, 1); assert.equal(a.summary.byDecision.donate_sell, 1); assert.equal(a.summary.byDecision.none, 4)
  assert.ok(a.findings.some((f) => f.kind === 'alteration' && f.garment_ids[0] === 'c1' && !f.recommendation), 'ya decidida: sin recomendación')
  assert.ok(a.findings.some((f) => f.kind === 'replace' && f.garment_ids[0] === 'j1'))
  assert.ok(a.findings.some((f) => f.kind === 'condition' && f.garment_ids[0] === 's2'))
  assert.ok(a.findings.some((f) => f.kind === 'review' && f.garment_ids[0] === 'd1' && /borrador/.test(f.body)))
  assert.equal(a.findings[0].kind, 'need', 'las necesidades van primero')
  assert.equal(a.summary.seasons.otono, 3); assert.equal(a.summary.noSeason, 1)
  assert.equal(a.summary.usage.tracked, false); assert.match(a.summary.usage.note, /poco registro de uso[\s\S]*nunca|poco registro de uso/)
  // el vaquero para donar no cuenta para cubrir ocasiones ni duplicados
  assert.ok(!a.summary.categories.find((c) => c.id === 'bottom')!.flagged.includes('j1'))
})

test('migración 0010: auditorías versionadas y hallazgos con RLS y memoria', () => {
  const sql = readFileSync('supabase/migrations/0010_wardrobe_audit.sql', 'utf8')
  assert.equal((sql.match(/enable row level security/g) ?? []).length, 2)
  assert.match(sql, /unique \(user_id, version\)/); assert.match(sql, /'proposed','accepted','rejected'/)
  assert.match(sql, /'review','alteration','replace','duplicate','gap','need','condition'/)
  assert.match(sql, /carried boolean/)
})

test('frecuencia de uso: solo con registro suficiente; prendas sin usar, poco usadas y preferencia en duplicados', () => {
  const b = bundle(), now = new Date('2026-06-30')
  const gs = wardrobe().map((g) => ({ ...g, created_at: '2026-01-01T00:00:00Z' }))
  const w = (d: string, ids: string[]) => ({ worn_on: d, garment_ids: ids })
  const few = [w('2026-06-20', ['t1', 's1'])]
  assert.equal(usageStats(gs, few, now).tracked, false, 'poco registro: no se concluye nada')
  const wears = [w('2026-02-01', ['t2', 's1', 'c1']), w('2026-02-10', ['t2', 's1']), w('2026-02-20', ['t2', 's2']), w('2026-03-01', ['t2', 's1']), w('2026-06-25', ['j1', 's2'])]
  assert.ok(wears.length >= MIN_WEAR_EVENTS)
  const u = usageStats(gs, wears, now)
  assert.equal(u.tracked, true); assert.ok(u.days >= MIN_TRACK_DAYS)
  assert.deepEqual(u.unused.map((x) => x.id), ['t1'], 'el chino A nunca se ha usado')
  assert.deepEqual(u.dormant.map((x) => x.id), ['t2', 's1', 'c1'], 'más de 90 días sin usar')
  assert.equal(u.top[0].id, 't2'); assert.equal(u.top[0].count, 4)
  const a = buildAudit({ active: gs, drafts: [], archived: 0, evals: evalsOf(gs, b), bundle: b, wears, now })
  assert.equal(a.summary.usage.tracked, true); assert.match(a.summary.usage.note, /registro de uso de Outfit Studio[\s\S]*nunca deducido de fotos/)
  const unused = a.findings.find((f) => f.key === 'unused:t1')!
  assert.match(unused.title, /Sin usar: «Pantalón beige A»/); assert.deepEqual(unused.recommendation, { decision: 'review', garment_id: 't1' })
  assert.ok(a.findings.some((f) => f.key === 'dormant:t2'))
  const dup = a.findings.find((f) => f.kind === 'duplicate')!
  assert.match(dup.body, /te la pones más \(4 veces frente a 0\)/); assert.ok(dup.data_used.includes('Tu registro de uso'))
  // Una prenda que entra en el armario después de empezar a registrar no cuenta como «sin usar»
  const late = usageStats([{ ...gs[0], created_at: '2026-06-01T00:00:00Z' }], wears, now)
  assert.equal(late.unused.length, 0)
})
