import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Bundle } from '@/lib/profile/data'
import { FLAGS, FORMULA_STATUSES, RATINGS, REASONS } from '@/lib/outfits/feedback'
import { AUTO_EVIDENCE, MIN_EVIDENCE, detectPatterns, metrics, toSignals } from '@/lib/outfits/learning'
import { coverage, detectFormulas, formulaText, matches, signatureOf, slotsFromItems, tryFormula } from '@/lib/outfits/formulas'
import { ASPECTS, EVALUATOR, VISUAL, normalizeVisual, VisualSchema } from '@/lib/outfits/evaluator'
import { GenerateRequest, resolveContext } from '@/lib/outfits/engine/context'
import { generate, learnedContext } from '@/lib/outfits/engine/generate'
import { scoreEnv, scoreOutfit } from '@/lib/outfits/engine/scoring'

const sql = readFileSync('supabase/migrations/0014_outfit_learning.sql', 'utf8')
const arr = (name: string) => [...(sql.match(new RegExp(`${name} <@ array\\[([^\\]]*)\\]`))?.[1].matchAll(/'([^']+)'/g) ?? [])].map((m) => m[1])

test('migración 0014: listas iguales a la taxonomía, RLS en las 6 tablas y filas hijas propias', () => {
  assert.deepEqual(arr('flags'), FLAGS.map((f) => f.id)); assert.deepEqual(arr('reasons'), REASONS.map((r) => r.id))
  assert.match(sql, new RegExp(`rating in \\(${RATINGS.map((r) => `'${r.id}'`).join(',')}\\)`))
  assert.match(sql, new RegExp(`status in \\(${FORMULA_STATUSES.map((r) => `'${r.id}'`).join(',')}\\)`))
  for (const t of ['outfit_feedback', 'outfit_wear_events', 'outfit_evaluations', 'style_formulas', 'style_formula_slots', 'style_learning']) assert.ok(sql.includes(`'${t}'`), t)
  assert.match(sql, /exists \(select 1 from public\.style_formulas f where f\.id = formula_id/); assert.match(sql, /exists \(select 1 from public\.outfits o where o\.id = outfit_id/)
  assert.match(sql, /Nada de esto modifica el Style Blueprint/)
})

const g = (id: string, extra: Record<string, unknown>) => [id, { id, title: id, ...extra }] as const
const garments = new Map<string, Record<string, any>>([g('shirt', { primary_color: 'Blanco' }), g('chino', { primary_color: 'Beige' }), g('pink', { primary_color: 'Rosa' }), g('olive', { primary_color: 'Oliva' }), g('shoes', { primary_color: 'Marrón' })])
const fb = (i: number, x: Record<string, unknown>) => ({ id: `f${i}`, flags: [], reasons: [], garment_ids: [], ...x })

test('una valoración sola no cambia nada; un patrón consistente influye suave; confirmado del todo; descartado, nunca', () => {
  const one = detectPatterns([fb(1, { rating: 'dislike', reasons: ['garment'], garment_id: 'pink', garment_ids: ['pink', 'chino'] })], [], garments)
  assert.equal(one.length, 0, 'una sola valoración no es un patrón')
  const two = [1, 2].map((i) => fb(i, { rating: 'dislike', reasons: ['garment'], garment_id: 'pink', garment_ids: ['pink', 'chino'] }))
  const p2 = detectPatterns(two, [], garments)
  assert.equal(p2[0].key, 'garment_dislike:pink'); assert.equal(p2[0].evidence, MIN_EVIDENCE); assert.equal(p2[0].weight, 0, 'detectado con 2: se propone, aún sin efecto')
  const three = [1, 2, 3].map((i) => fb(i, { rating: 'dislike', reasons: ['garment'], garment_id: 'pink', garment_ids: ['pink'] }))
  assert.equal(detectPatterns(three, [], garments)[0].weight, 0.5, `con ${AUTO_EVIDENCE} influye de forma suave`)
  const confirmed = detectPatterns(two, [], garments, [{ key: 'garment_dislike:pink', status: 'confirmed' }])
  assert.equal(confirmed[0].weight, 1); assert.ok(toSignals(confirmed).exclude.has('pink'), 'confirmado: no se vuelve a proponer')
  const dismissed = detectPatterns(three, [], garments, [{ key: 'garment_dislike:pink', status: 'dismissed' }])
  assert.equal(dismissed[0].weight, 0); assert.equal(toSignals(dismissed).garment.size, 0)
})

test('patrones de formalidad por ocasión, parejas de color y prendas que funcionan', () => {
  const f = [1, 2, 3].map((i) => fb(i, { rating: 'dislike', reasons: ['too_formal', 'colors'], occasion: 'cena_amigos', garment_ids: ['pink', 'olive', 'chino'] }))
  const ps = detectPatterns(f, [], garments)
  assert.ok(ps.some((p) => p.key === 'too_formal:cena_amigos' && /más informal/.test(p.label)))
  assert.ok(ps.some((p) => p.key === 'color_pair:Oliva|Rosa'))
  const s = toSignals(ps)
  assert.equal(s.formalityShift.get('cena_amigos'), -0.5)
  const ctx = learnedContext(resolveContext(GenerateRequest.parse({ occasion: 'cena_amigos' })), s)
  assert.deepEqual(ctx.formality, [1, 3]); assert.match(ctx.formalitySource, /ajustada por tus valoraciones/)
  const wears = [1, 2, 3].map((i) => ({ id: `w${i}`, outfit_id: 'o1', garment_ids: ['shoes'] }))
  assert.ok(detectPatterns([], wears, garments).some((p) => p.key === 'garment_favorite:shoes' && p.weight === 0.5))
})

test('las señales aprendidas cambian la puntuación del motor con su motivo', () => {
  const b: Bundle = { profile: null, measures: {}, photos: [], color: null, style: null, life: null, fit: null, goals: null, validated: {}, observations: [], blueprints: [], garments: [], references: [], refRatings: [], styleRefs: [], colorAnalyses: [], chatValidated: false }
  const items = [{ role: 'top_base', g: { id: 'pink', title: 'Camisa rosa', category: 'top', subcategory: 'shirt', primary_color: 'Rosa', formality_level: 3 } }, { role: 'bottom', g: { id: 'olive', title: 'Chino oliva', category: 'bottom', subcategory: 'chinos', primary_color: 'Oliva', formality_level: 3 } }, { role: 'footwear', g: { id: 'shoes', title: 'Mocasines', category: 'footwear', subcategory: 'loafers', primary_color: 'Marrón', formality_level: 3 } }]
  const ctx = resolveContext(GenerateRequest.parse({ occasion: 'cena_amigos' }))
  const base = scoreOutfit(items, scoreEnv(ctx, b, new Map()))
  const sig = toSignals(detectPatterns([1, 2].map((i) => fb(i, { rating: 'dislike', reasons: ['colors'], garment_ids: ['pink', 'olive'] })), [], garments, [{ key: 'color_pair:Oliva|Rosa', status: 'confirmed' }]))
  const learned = scoreOutfit(items, scoreEnv(ctx, b, new Map(), undefined, sig))
  assert.ok(learned.total < base.total); assert.ok(learned.criteria.find((c) => c.key === 'color')!.cons.some((x) => /no te gustan juntos oliva y rosa/.test(x)))
  const out = generate(GenerateRequest.parse({}), items.map((x) => ({ ...x.g, wardrobe_status: 'active' })), new Map(), b, new Date(), toSignals(detectPatterns([1, 2].map((i) => fb(i, { rating: 'dislike', reasons: ['garment'], garment_id: 'pink', garment_ids: ['pink'] })), [], garments, [{ key: 'garment_dislike:pink', status: 'confirmed' }])))
  assert.ok(out.stats.excluded.some((e) => /confirmaste que no te convence/.test(e.reason)))
})

test('métricas: cuántos te gustan, te pones y repetirías', () => {
  const m = metrics([fb(1, { rating: 'love', outfit_id: 'a' }), fb(2, { rating: 'dislike', outfit_id: 'b' }), fb(3, { flags: ['would_repeat'], outfit_id: 'a' })], [{ id: 'w', outfit_id: 'a' }], [{ id: 'a', source: 'generator' }, { id: 'b', source: 'manual' }])
  assert.equal(m.rated, 2); assert.equal(m.likedPct, 50); assert.equal(m.wornOutfits, 1); assert.equal(m.repeat, 1); assert.equal(m.proposalsWorn, 1); assert.equal(m.wornPct, 50)
})

const G = (id: string, category: string, subcategory: string, extra: Record<string, unknown> = {}) => ({ id, title: id, category, subcategory, primary_color: 'Gris', formality_level: 3, ...extra })
test('fórmulas: por tipo de prenda (no por prenda concreta), cobertura, variaciones y detección', () => {
  const polo = G('polo1', 'top', 'polo'), chino = G('chino1', 'bottom', 'chinos', { cut: 'Recto' }), loafer = G('loafer1', 'footwear', 'loafers', { formality_level: 4 })
  const slots = slotsFromItems([{ role: 'top_base', g: polo }, { role: 'bottom', g: chino }, { role: 'footwear', g: loafer }])
  assert.equal(formulaText(slots), 'Polo + chinos recto + mocasines')
  assert.deepEqual(slots[1].cuts, ['Recto']); assert.deepEqual(slots[0].colors, [], 'el color no fija la fórmula')
  const polo2 = G('polo2', 'top', 'polo', { primary_color: 'Azul marino' }), chinoSlim = G('chino2', 'bottom', 'chinos', { cut: 'Slim' })
  assert.ok(matches(slots[0], polo2), 'otro polo de otro color también la cumple'); assert.ok(!matches(slots[1], chinoSlim), 'el corte sí cuenta')
  const cov = coverage(slots, [polo, polo2, chino, chinoSlim, loafer])
  assert.equal(cov.variations, 2); assert.equal(cov.missing.length, 0)
  assert.equal(coverage(slots, [polo, chino]).variations, 0)
  assert.equal(signatureOf(slots), signatureOf(slotsFromItems([{ role: 'footwear', g: loafer }, { role: 'bottom', g: chino }, { role: 'top_base', g: polo2 }])))
  const det = detectFormulas([{ id: 'o1', name: 'Uno', positive: true, items: [{ role: 'top_base', g: polo }, { role: 'bottom', g: chino }, { role: 'footwear', g: loafer }] }, { id: 'o2', name: 'Dos', positive: true, items: [{ role: 'top_base', g: polo2 }, { role: 'bottom', g: chino }, { role: 'footwear', g: loafer }] }], new Set())
  assert.equal(det.length, 1); assert.deepEqual(det[0].outfits.map((o) => o.name), ['Uno', 'Dos'])
  assert.equal(detectFormulas([{ id: 'o1', name: 'Uno', positive: false, items: [] }], new Set()).length, 0)
  const b = { profile: null, measures: {}, photos: [], color: null, style: null, life: null, fit: null, goals: null, validated: {}, observations: [], blueprints: [], garments: [], references: [], refRatings: [], styleRefs: [], colorAnalyses: [], chatValidated: false } as Bundle
  const t = tryFormula(slots, [polo, polo2, chino, loafer], scoreEnv(resolveContext(GenerateRequest.parse({})), b, new Map()))
  assert.equal(t.combos.length, 1, 'las dos variantes comparten casi todo: se muestra una distinta'); assert.ok(t.evaluated >= 2)
})

test('evaluador: prompts con las reglas y normalización de la evaluación visual', () => {
  assert.match(EVALUATOR, /No valores como le queda/); assert.match(EVALUATOR, /SOLO ids de PRENDAS DISPONIBLES/)
  for (const r of ['no permite verificar con precision', 'No opines sobre el cuerpo', '"visible": false']) assert.ok(VISUAL.includes(r), r)
  const ai = VisualSchema.parse({ photo_quality: { suitable: true, issues: [] }, aspects: [{ key: 'harmony', observation: 'ok', score: 9, visible: true }, { key: 'lengths', observation: 'no se ve', score: 6, visible: false }, { key: 'x', observation: 'y', score: 1, visible: true }], matches_plan: { value: 'si' }, summary: 's' })
  const n = normalizeVisual(ai)
  assert.equal(n.aspects.length, ASPECTS.length); assert.equal(n.aspects.find((a) => a.key === 'lengths')!.score, null, 'lo no visible no puntúa')
  assert.equal(n.overall, 9); assert.equal(n.provisional, true)
  assert.ok(normalizeVisual({ ...ai, photo_quality: { suitable: false, issues: ['oscura'] } }).aspects.every((a) => a.score === null))
})
