import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Bundle } from '@/lib/profile/data'
import { evaluateGarment } from '@/lib/wardrobe/compatibility'
import { ProductAnalysisSchema, applyAnalysis, buildProductPrompt, normalizeProductAnalysis, PRODUCT_ANALYST } from '@/lib/shopping/analyzer'
import { PURCHASE_WEIGHTS, VERDICTS, evaluatePurchase, productAsGarment } from '@/lib/shopping/evaluate'
import { isStretch, recommendSize } from '@/lib/shopping/sizing'

const bundle = (): Bundle => ({
  profile: { fit_pref: 'Regular', budget_max: 90 }, measures: {}, photos: [], color: { temperature: 'Cálida', temperature_source: 'usuario', temperature_status: 'validado', likes: [], avoids: [] },
  style: { influences: [{ style: 'smart-casual', role: 'principal', weight: 70 }] }, life: { life: { trabajo: 60, ocio: 30, deporte: 10 }, work_formality: 'Smart casual', climate: 'Cuatro estaciones marcadas', constraints: [] },
  fit: { prefs: { pantalones: 'Recto' } }, goals: null, validated: {}, observations: [], blueprints: [], garments: [], references: [], refRatings: [], styleRefs: [], colorAnalyses: [], chatValidated: false,
} as unknown as Bundle)
let n = 0
const G = (name: string, category: string, subcategory: string, primary_color: string, f: number, x: Record<string, unknown> = {}) => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, '1')}`, name, category, subcategory, primary_color, formality_level: f, wardrobe_status: 'active', pattern: 'Liso', occasions: ['trabajo', 'ocio'], seasons: ['primavera', 'otono', 'invierno'], ...x })
const wardrobe = () => [G('Camisa blanca', 'top', 'shirt', 'Blanco', 3), G('Polo marino', 'top', 'polo', 'Azul marino', 3), G('Chino beige', 'bottom', 'chinos', 'Beige', 3, { cut: 'Recto' }), G('Chino beige 2', 'bottom', 'chinos', 'Beige', 3, { cut: 'Recto' }), G('Mocasín', 'footwear', 'loafers', 'Marrón', 3), G('Jersey gris', 'top', 'knit', 'Gris', 3)]
const NEED = { id: 'n1', title: 'Pantalón de vestir gris', type: 'need', spec: { category: 'bottom', subcategory: 'trousers', occasions: ['trabajo'], seasons: ['otono'] }, priority_level: 'high', price_max: 100 }
const COAT = { id: 'n2', title: 'Abrigo camel', type: 'need', spec: { category: 'outerwear', subcategory: 'coat' }, priority_level: 'high', priority_score: 80 }
const env = (extra: Record<string, unknown> = {}) => { const gs = wardrobe(), b = bundle(); return { garments: gs, evals: new Map(gs.map((g) => [g.id, evaluateGarment(g, b, { others: gs, imageCount: 1 })])), bundle: b, openNeeds: [NEED, COAT], staleDays: 0, analyzed: true, now: new Date('2026-10-15'), ...extra } }
const WOOL = { product_name: 'Pantalón recto lana gris', category: 'bottom', subcategory: 'trousers', primary_color: 'Gris', colors: ['Gris'], cut: 'Recto', formality_level: 4, seasons: ['otono', 'invierno'], confirmed_composition: '100 % lana', current_price: 89, availability_status: 'in_stock', field_sources: {}, images: [] }
const CHINO = { product_name: 'Chino beige recto', category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', colors: ['Beige'], cut: 'Recto', formality_level: 3, seasons: ['primavera', 'otono'], current_price: 39, availability_status: 'in_stock', field_sources: {}, images: [] }

test('puntuación de compra: pesos de la especificación y explicación por criterio', () => {
  assert.deepEqual({ ...PURCHASE_WEIGHTS }, { style: 20, cut: 20, color: 15, combos: 20, needs: 10, quality: 10, value: 5 })
  assert.equal(Object.values(PURCHASE_WEIGHTS).reduce((s, x) => s + x, 0), 100)
  const e = evaluatePurchase(WOOL, env({ need: NEED }))
  assert.equal(e.criteria.length, 7)
  for (const c of e.criteria) { assert.ok(c.points <= c.weight + 0.01); assert.ok(c.reasons.length || c.missing.length, c.key) }
  assert.ok(Math.abs(e.criteria.reduce((s, c) => s + c.points, 0) - e.score) <= 1)
  assert.equal(e.verdict, 'buy', e.verdict_text); assert.ok(e.score >= 75); assert.match(e.verdict_text, /cubre «Pantalón de vestir gris»/)
  assert.ok(e.indicators.combinations.count > 0, 'combinaciones simuladas con el Outfit Engine'); assert.equal(e.redundancy.level, 'baja')
  assert.ok(VERDICTS.some((v) => v.id === e.verdict))
})

test('redundancia: compatible pero no lo compraría; dice qué ya tienes y dónde invertir', () => {
  const e = evaluatePurchase(CHINO, env())
  assert.equal(e.verdict, 'skip'); assert.equal(e.redundancy.level, 'alta')
  assert.match(e.verdict_text, /Es compatible con tu estilo, pero no lo compraría\. Ya tienes 2 prendas que cumplen prácticamente la misma función \(«Chino beige», «Chino beige 2»\)/)
  assert.match(e.verdict_text, /No ampliaría tus combinaciones|Apenas ampliaría/); assert.match(e.verdict_text, /Priorizaría invertir en «Abrigo camel»/)
  assert.ok(e.redundancy.adds.length > 0); assert.ok(e.risks.some((r) => /duplicar/.test(r)))
  assert.match(e.criteria.find((c) => c.key === 'needs')!.reasons[0], /sería un deseo/)
})

test('redundancia con pocos datos: dos prendas del mismo tipo y color ya bastan para «duplicidad alta»', () => {
  const sparse = { product_name: 'Chino beige', category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', colors: ['Beige'], current_price: 39, availability_status: 'unknown', field_sources: { product_name: { source: 'user' } }, images: [] }
  const e = evaluatePurchase(sparse, env({ analyzed: false }))
  assert.equal(e.redundancy.level, 'alta'); assert.equal(e.verdict, 'skip'); assert.match(e.verdict_text, /Ya tienes 2 prendas/)
  const one = evaluatePurchase(sparse, env({ analyzed: false, garments: wardrobe().filter((g) => g.name !== 'Chino beige 2') }))
  assert.notEqual(one.redundancy.level, 'baja'); assert.match(one.verdict_text, /se parece a «Chino beige»|Ya tienes una prenda/)
})

test('no oculta límites: composición desconocida, sin analizar, datos sin verificar, precio sin comprobar', () => {
  const p = { ...WOOL, confirmed_composition: null, current_price: null, field_sources: { subcategory: { source: 'derived' }, primary_color: { source: 'ai' } } }
  const e = evaluatePurchase(p, env({ need: NEED, analyzed: false, staleDays: null }))
  for (const re of [/Composición desconocida/, /Precio sin comprobar/, /sin analizar/, /sin verificar recientemente/, /proceden de la IA o del nombre/]) assert.ok(e.limitations.some((l) => re.test(l)), String(re))
  assert.equal(e.criteria.find((c) => c.key === 'quality')!.missing[0], 'Composición desconocida')
  assert.notEqual(e.confidence, 'alta')
})

test('esperar: agotado, talla agotada, necesidad más urgente o precio muy por encima', () => {
  assert.equal(evaluatePurchase({ ...WOOL, availability_status: 'out_of_stock' }, env({ need: NEED })).verdict, 'wait')
  const size = { size: '48', confidence: 'alta' as const, available: false, reference: null, table: [], notes: [], basis: 'medidas' as const }
  const w = evaluatePurchase(WOOL, env({ need: NEED, size }))
  assert.equal(w.verdict, 'wait'); assert.equal(w.indicators.sizes.status, 'out')
  const jacket = { product_name: 'Cazadora', category: 'outerwear', subcategory: 'jacket', primary_color: 'Azul marino', colors: ['Azul marino'], formality_level: 3, current_price: 80, availability_status: 'in_stock', field_sources: {}, images: [] }
  const j = evaluatePurchase(jacket, env({ openNeeds: [NEED] }))
  assert.equal(j.verdict, 'wait'); assert.match(j.verdict_text, /ahora mismo es más importante «Pantalón de vestir gris»/)
  assert.equal(evaluatePurchase({ ...WOOL, current_price: 200 }, env({ need: NEED })).verdict, 'wait')
})

test('la calidad no sale del precio: mismo producto más caro no puntúa más en calidad', () => {
  const a = evaluatePurchase({ ...WOOL, current_price: 40 }, env({ need: NEED })), b = evaluatePurchase({ ...WOOL, current_price: 95 }, env({ need: NEED }))
  assert.equal(a.criteria.find((c) => c.key === 'quality')!.points, b.criteria.find((c) => c.key === 'quality')!.points)
  assert.ok(a.criteria.find((c) => c.key === 'value')!.points >= b.criteria.find((c) => c.key === 'value')!.points)
  const synth = evaluatePurchase({ ...WOOL, confirmed_composition: '100 % poliester' }, env({ need: NEED }))
  assert.ok(synth.criteria.find((c) => c.key === 'quality')!.points < a.criteria.find((c) => c.key === 'quality')!.points)
})

test('producto como prenda virtual: procedencia IA → confianza baja en compatibilidad; ocasiones de la necesidad', () => {
  const v = productAsGarment({ ...WOOL, field_sources: { primary_color: { source: 'ai' }, cut: { source: 'user' } } }, NEED)
  assert.equal(v.field_sources.primary_color.source, 'ia'); assert.equal(v.field_sources.cut.source, 'usuario'); assert.deepEqual(v.occasions, ['trabajo'])
  assert.equal(v.wardrobe_status, 'active'); assert.equal(v.id, '00000000-0000-4000-8000-000000000000')
})

test('Product Analyzer: sin composición inventada, estilos del catálogo, calidad documentada solo con cita literal, procedencia', () => {
  const ai = ProductAnalysisSchema.parse({
    category: { value: 'bottom', confidence: 0.95 }, subcategory: { value: 'trousers', confidence: 0.9 }, primary_color: { value: 'Gris', confidence: 0.8 }, pattern: { value: 'Liso', confidence: 0.9 },
    cut: { value: 'Recto', confidence: 0.8 }, silhouette: { value: 'Regular', confidence: 0.7 }, apparent_material: { value: 'Lana peinada', confidence: 0.6 },
    composition: { value: '80% lana 20% cachemir', confidence: 0.9, source: 'label' }, formality: { value: 4, confidence: 0.85 }, seasons: ['otono', 'invierno', 'monzon'],
    field_origins: { subcategory: 'text', primary_color: 'photo', cut: 'inference' }, style_tags: [{ id: 'smart-casual', confidence: 0.8 }, { id: 'inventado', confidence: 0.9 }],
    quality: { documented: ['«100% lana» según la tienda', 'Tejido premium'], apparent: ['Buena caída'], unknown: ['Costuras'] }, model_photos: true,
  })
  const product = { product_name: 'Pantalón', description: 'Pantalón de vestir. Composición: 100% lana.', confirmed_composition: '100 % lana', field_sources: { primary_color: { source: 'store' }, product_name: { source: 'store' } }, primary_color: 'Antracita' }
  const nn = normalizeProductAnalysis(ai, product, true)
  assert.ok(!nn.fields.some((f) => f.field === 'confirmed_composition'), 'la IA nunca confirma composición')
  assert.deepEqual(nn.style_tags.map((t) => t.id), ['smart-casual']); assert.ok(nn.discarded.some((d) => /inventado/.test(d)))
  assert.deepEqual(nn.quality.documented, ['Composición publicada: 100 % lana', '«100% lana» según la tienda'], 'sin cita literal no es documentada')
  assert.ok(nn.discarded.some((d) => /sin cita literal/.test(d))); assert.ok(nn.discarded.some((d) => /monzon/i.test(d)))
  assert.equal(nn.fields.find((f) => f.field === 'primary_color')!.origin, 'photo'); assert.equal(nn.fields.find((f) => f.field === 'cut')!.origin, 'ai')
  const textOnly = normalizeProductAnalysis(ai, product, false)
  assert.equal(textOnly.fields.find((f) => f.field === 'primary_color')!.origin, 'ai', 'sin fotos nada es «foto»'); assert.deepEqual(textOnly.quality.apparent, []); assert.equal(textOnly.model_photos, false)
  const patch = applyAnalysis(product, nn, 'a1', '2026-11-09T00:00:00Z')
  assert.equal(patch.primary_color, undefined, 'no pisa el color publicado por la tienda')
  assert.equal(patch.cut, 'Recto'); assert.equal(patch.field_sources.cut.source, 'ai'); assert.equal(patch.field_sources.cut.analysis_id, 'a1')
  assert.equal(patch.formality_level, 4); assert.deepEqual(patch.seasons, ['otono', 'invierno']); assert.deepEqual(patch.style_tags, ['smart-casual']); assert.equal(patch.attributes, undefined)
  assert.match(PRODUCT_ANALYST, /No inventes composición, tallas, medidas, precio/)
  assert.match(buildProductPrompt({ product_name: 'X', field_sources: {} }, []), /NO hay fotografías/)
})

test('tallas: gana la más parecida; elasticidad; confianza; sin datos no inventa; talla habitual como último recurso', () => {
  const ref = { id: 'g1', title: 'Chino que me queda bien', measurements: { cintura: 41, cadera: 51, muslo: 31, entrepierna: 80 } }
  const chart = [{ size: '46', measurements: { cintura: 39, cadera: 49, muslo: 30, entrepierna: 80 } }, { size: '48', measurements: { cintura: 41, cadera: 51.5, muslo: 31, entrepierna: 80 } }, { size: '50', measurements: { cintura: 43, cadera: 53, muslo: 32, entrepierna: 82 }, availability: 'out_of_stock' }]
  const r = recommendSize({ subcategory: 'trousers', reference: ref, chart })
  assert.equal(r.size, '48'); assert.equal(r.confidence, 'alta'); assert.equal(r.basis, 'medidas'); assert.ok(r.notes.some((x) => /no una garantía/.test(x)))
  const tight = recommendSize({ subcategory: 'trousers', reference: ref, chart: [chart[0], chart[2]] })
  assert.equal(tight.size, '50', 'sin elasticidad, quedarse corto pesa más que sobrar'); assert.equal(tight.available, false)
  assert.equal(isStretch('98% algodón, 2% elastano'), true)
  assert.equal(recommendSize({ subcategory: 'trousers', reference: ref, chart: [chart[0], chart[2]], composition: '98% algodón 2% elastano' }).size, '46', 'con elasticidad la más justa vale')
  assert.equal(recommendSize({ subcategory: 'trousers', reference: null, chart }).size, null)
  assert.equal(recommendSize({ subcategory: 'trousers', reference: ref, chart: [{ size: '48', measurements: {} }] }).size, null)
  const usual = recommendSize({ subcategory: 'trousers', reference: null, chart: [{ size: '48', measurements: {} }], usualSize: { size: '48', from: '«Chino» (COS)' } })
  assert.equal(usual.size, '48'); assert.equal(usual.confidence, 'baja'); assert.equal(usual.basis, 'talla habitual')
  assert.equal(recommendSize({ subcategory: 'belt', reference: ref, chart }).size, null, 'complementos: no se comparan medidas')
})

test('migración 0018: tablas, CHECK de veredictos y RLS con relaciones propias', () => {
  const sql = readFileSync('supabase/migrations/0018_product_analyzer.sql', 'utf8')
  assert.ok(sql.includes(`verdict in (${VERDICTS.map((v) => `'${v.id}'`).join(',')})`))
  for (const t of ['product_analyses', 'purchase_evaluations', 'garment_measurements']) assert.match(sql, new RegExp(`'${t}'`))
  assert.match(sql, /garment_measurements[\s\S]*exists \(select 1 from public\.garments g where g\.id = garment_id and g\.user_id/)
  assert.match(sql, /purchase_evaluations[\s\S]*shopping_needs n where n\.id = need_id/)
})
