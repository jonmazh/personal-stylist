import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Bundle } from '@/lib/profile/data'
import { WEIGHTS, combines, compatibility, duplicatesOf, evaluateGarment, fitScore, garmentElements, occasionsOf, proposeDecision, strategicValue } from '@/lib/wardrobe/compatibility'
import { FIT_ASSESSOR, FitAISchema, buildFitPrompt, dimensionsFor, fitGuidance, normalizeFit } from '@/lib/wardrobe/fit'

const empty = (): Bundle => ({ profile: null, measures: {}, photos: [], color: null, style: null, life: null, fit: null, goals: null, validated: {}, observations: [], blueprints: [], garments: [], references: [], refRatings: [], styleRefs: [], colorAnalyses: [], chatValidated: false })
const full = (): Bundle => ({
  ...empty(),
  profile: { fit_pref: 'Regular', height_cm: 180 },
  measures: { pecho: { value: 100, at: '', source: 'usuario' }, cintura: { value: 86, at: '', source: 'usuario' } },
  color: { temperature: 'Cálida', temperature_source: 'usuario', temperature_status: 'validado', likes: ['Azul marino'], avoids: ['Rosa'] },
  style: { influences: [{ style: 'smart-casual', role: 'principal', weight: 60 }, { style: 'quiet-luxury', role: 'secundario', weight: 40 }], never_wear: 'pantalón pitillo' },
  life: { life: { trabajo: 50, ocio: 30, citas: 20 }, work_formality: 'Smart casual', climate: 'Cuatro estaciones marcadas', constraints: [] },
  fit: { prefs: { pantalones: 'Recto', camisas: 'Regular', chaquetas: 'Desestructurada' } },
  validated: { a3: true, a4: true, a5: true, a6: true },
})
const src = (fields: string[]) => Object.fromEntries(fields.map((f) => [f, { source: 'usuario', at: '' }]))
const trousers = { id: 't1', category: 'bottom', subcategory: 'trousers', primary_color: 'Azul marino', cut: 'Recto', silhouette: 'Regular', pattern: 'Liso', formality_level: 4, seasons: ['otono', 'invierno', 'primavera'], occasions: ['trabajo', 'citas'], field_sources: src(['category', 'subcategory', 'primary_color', 'cut', 'silhouette', 'pattern', 'formality_level', 'seasons']) }

test('rasgos de estilo de la prenda: tipo, corte, silueta y estampado', () => {
  assert.deepEqual(garmentElements(trousers).sort(), ['leg-straight', 'tailoring'])
  assert.ok(garmentElements({ category: 'top', subcategory: 'tee', pattern: 'Gráfico' }).includes('graphic-tee'))
  assert.ok(garmentElements({ category: 'top', subcategory: 'shirt', pattern: 'Cuadros', silhouette: 'Amplia' }).includes('top-oversize'))
})

test('sin perfil todo queda pendiente, nunca cero', () => {
  const c = compatibility(trousers, empty(), 1)
  assert.equal(c.score, null); assert.match(c.note!, /Pendiente/)
  for (const k of ['style', 'color', 'cut', 'needs']) { const x = c.criteria.find((y) => y.id === k)!; assert.equal(x.score, null, k); assert.ok(x.missing.length, k) }
  assert.notEqual(c.criteria.find((x) => x.id === 'info')!.score, null, 'la calidad de la información siempre se puede medir')
  assert.equal(fitScore(null).score, null)
})

test('compatibilidad con perfil completo: pesos de la especificación, justificación y datos usados', () => {
  assert.deepEqual(Object.values(WEIGHTS), [25, 25, 25, 15, 10])
  const c = compatibility(trousers, full(), 2)
  assert.ok(c.score! >= 7, `score ${c.score}`); assert.equal(c.coverage, 1); assert.equal(c.provisional, false)
  const by = Object.fromEntries(c.criteria.map((x) => [x.id, x]))
  assert.ok(by.style.why.some((w) => /Smart casual/.test(w)))
  assert.ok(by.color.why.some((w) => /Azul marino/.test(w))); assert.ok(by.color.data_used.some((d) => /validada/.test(d))); assert.equal(by.color.confidence, 'alta')
  assert.ok(by.cut.why.some((w) => /corte que prefieres/.test(w)))
  assert.ok(by.needs.why.some((w) => /70 %/.test(w)), by.needs.why.join(' | '))
  for (const x of c.criteria) assert.ok(x.why.length && x.data_used.length, x.id)
})

test('lo que rechazas y lo que evitas baja la compatibilidad, con motivo', () => {
  const slim = { ...trousers, cut: 'Slim', primary_color: 'Rosa' }
  const c = compatibility(slim, full(), 2)
  const by = Object.fromEntries(c.criteria.map((x) => [x.id, x]))
  assert.ok(by.cut.why.some((w) => /nunca te pondrías/.test(w)))
  assert.ok(by.color.why.some((w) => /evitas/.test(w)))
  assert.ok(c.score! < compatibility(trousers, full(), 2).score!)
})

test('un dato propuesto por la IA sin confirmar cuenta como hipótesis', () => {
  const g = { ...trousers, field_sources: { ...trousers.field_sources, primary_color: { source: 'ia', at: '' } } }
  assert.equal(compatibility(g, full(), 2).criteria.find((x) => x.id === 'color')!.confidence, 'baja')
  const ok = { ...trousers, field_sources: { ...trousers.field_sources, primary_color: { source: 'ia', confirmed_by: 'usuario', at: '' } } }
  assert.equal(compatibility(ok, full(), 2).criteria.find((x) => x.id === 'color')!.confidence, 'alta')
})

test('ocasiones: las indicadas o deducidas de la formalidad (marcadas)', () => {
  assert.deepEqual(occasionsOf(trousers), { ids: ['trabajo', 'citas'], inferred: false })
  assert.equal(occasionsOf({ formality_level: 2 }).inferred, true)
  assert.deepEqual(occasionsOf({}).ids, [])
})

test('valor estratégico: pendiente con armario pequeño; combinaciones y duplicados', () => {
  const b = full()
  assert.equal(strategicValue(trousers, [], b).score, null)
  const shirt = { id: 's', category: 'top', subcategory: 'shirt', primary_color: 'Blanco', formality_level: 4 }
  const tee = { id: 'tee', category: 'top', subcategory: 'tee', primary_color: 'Negro', formality_level: 1 }
  const twin = { id: 'tw', category: 'bottom', subcategory: 'trousers', primary_color: 'Azul marino', cut: 'Recto', formality_level: 4 }
  const shoes = { id: 'z', category: 'footwear', subcategory: 'loafers', primary_color: 'Marrón', formality_level: 4 }
  const coat = { id: 'c', category: 'outerwear', subcategory: 'coat', primary_color: 'Camel', formality_level: 4 }
  assert.ok(combines(trousers, shirt)); assert.ok(!combines(trousers, tee), 'formalidad demasiado distinta'); assert.ok(!combines(trousers, twin), 'mismo grupo')
  assert.deepEqual(duplicatesOf(trousers, [shirt, twin]).map((x) => x.id), ['tw'])
  const v = strategicValue(trousers, [shirt, tee, twin, shoes, coat], b)
  assert.notEqual(v.score, null); assert.equal(v.combos.length, 3); assert.deepEqual(v.duplicates.map((x) => x.id), ['tw'])
  assert.ok(v.criteria.find((x) => x.id === 'unique')!.why[0].includes('Se parece'))
  assert.equal(v.provisional, true)
})

test('decisión propuesta: revisar sin datos, modificar si hay un arreglo, conservar con buen ajuste', () => {
  const pend = { score: null, provisional: true, coverage: 0, confidence: null, criteria: [] }
  const s = (n: number) => ({ ...pend, score: n, provisional: false, coverage: 1 })
  assert.equal(proposeDecision(pend, pend, pend).decision, 'review')
  assert.equal(proposeDecision(s(8), s(6), s(7), { dimensions: [{ label: 'Largo del pantalón', score: 5, fixable: true }] }).decision, 'modify')
  assert.equal(proposeDecision(s(8), s(8.5), s(7)).decision, 'keep')
  assert.equal(proposeDecision(s(8), pend, s(7)).decision, 'review', 'sin prueba de ajuste no se da por buena')
  assert.equal(proposeDecision(s(4), pend, s(3)).decision, 'donate_sell')
  assert.equal(proposeDecision(s(8), s(4), s(7)).decision, 'replace')
})

test('evaluación completa: tres valoraciones separadas y veredicto prudente', () => {
  const e = evaluateGarment(trousers, full(), { others: [], imageCount: 1 })
  assert.notEqual(e.compat.score, null); assert.equal(e.fit.score, null); assert.equal(e.value.score, null)
  assert.match(e.verdict, /prueba de ajuste/)
})

test('Fit Assessment: dimensiones según la prenda y guía según su clase', () => {
  assert.deepEqual(dimensionsFor(trousers).map((d) => d.key), ['waist', 'seat', 'leg', 'trouser_length', 'stacking', 'drape', 'proportions'])
  assert.deepEqual(dimensionsFor({ category: 'outerwear', subcategory: 'blazer' }).map((d) => d.key).slice(0, 5), ['shoulders', 'sleeves', 'torso', 'length', 'drape'])
  assert.ok(fitGuidance({ subcategory: 'blazer', attributes: { structure: 'Desestructurada' } }).some((x) => /desestructurada/i.test(x)))
  assert.ok(dimensionsFor({ category: 'footwear', subcategory: 'sneakers' }).some((d) => !d.ai), 'la comodidad solo la valora el usuario')
  const p = buildFitPrompt({ ...trousers, attributes: { pleats: 'Sí' } }, 2)
  assert.match(p, /trouser_length/); assert.match(p, /pinzas/); assert.doesNotMatch(p, /shoulders/)
  for (const r of ['No opines sobre el cuerpo', 'score null', 'arrugas', 'Hombros y talla general no son arreglables']) assert.ok(FIT_ASSESSOR.includes(r), r)
})

test('Fit Assessment: normalización prudente de la propuesta de la IA', () => {
  const ai = FitAISchema.parse({
    photo_quality: { suitable: true, issues: [] }, limitations: ['Postura'], summary: 'ok',
    dimensions: [{ key: 'waist', score: 8, observation: 'bien', fixable: false, confidence: 0.9 }, { key: 'trouser_length', score: 5, observation: 'largo', fixable: true, confidence: 0.8 },
      { key: 'stacking', score: null, observation: 'no se ve', fixable: false, confidence: 0.2 }, { key: 'shoulders', score: 3, observation: 'x', fixable: true, confidence: 0.9 }],
  })
  const n = normalizeFit(ai, trousers)
  assert.deepEqual(n.discarded, ['shoulders'])
  assert.equal(n.dimensions.find((d) => d.key === 'trouser_length')!.fixable, true)
  assert.equal(n.dimensions.find((d) => d.key === 'stacking')!.score, null)
  assert.equal(n.dimensions.find((d) => d.key === 'seat')!.score, null, 'lo que no evalúa queda no observable')
  assert.equal(n.provisional, true); assert.equal(n.overall, 6.5)
  const bad = normalizeFit({ ...ai, photo_quality: { suitable: false, issues: ['Oscura'] } }, trousers)
  assert.ok(bad.dimensions.every((d) => d.score === null), 'con fotos no aptas no se puntúa')
  const f = fitScore({ dimensions: n.dimensions, provisional: n.provisional, source: 'ia', image_ids: ['x'] })
  assert.equal(f.score, 6.5); assert.equal(f.provisional, true)
})

test('migración 0009: ajuste, decisiones con RLS y eventos', () => {
  const sql = readFileSync('supabase/migrations/0009_garment_evaluation.sql', 'utf8')
  for (const t of ['garment_fit_reviews', 'garment_decisions']) assert.match(sql, new RegExp(`create table if not exists public\\.${t}`))
  assert.equal((sql.match(/enable row level security/g) ?? []).length, 2)
  assert.match(sql, /'keep','modify','review','replace','donate_sell'/)
  assert.match(sql, /'fit_reviewed','decided'/)
  assert.match(sql, /add column if not exists decision text/)
})
