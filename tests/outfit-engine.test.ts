import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Bundle } from '@/lib/profile/data'
import { evaluateGarment } from '@/lib/wardrobe/compatibility'
import { GenerateRequest, INTENTS, TEMPLATES, resolveContext, templatesFor } from '@/lib/outfits/engine/context'
import { DEFAULT_WEIGHTS, normalizeWeights, scoreEnv, scoreOutfit } from '@/lib/outfits/engine/scoring'
import { eligible, generate } from '@/lib/outfits/engine/generate'

const bundle = (): Bundle => ({
  profile: { fit_pref: 'Regular' }, measures: {}, photos: [], color: { temperature: 'Cálida', temperature_source: 'usuario', temperature_status: 'validado', likes: ['Azul marino'], avoids: ['Rosa'] },
  style: { influences: [{ style: 'smart-casual', role: 'principal', weight: 60 }, { style: 'minimalismo-contemporaneo', role: 'secundario', weight: 40 }] },
  life: { life: { trabajo: 60, ocio: 40 }, work_formality: 'Smart casual' }, fit: { prefs: { pantalones: 'Recto' } }, goals: null, validated: {}, observations: [], blueprints: [], garments: [], references: [], refRatings: [], styleRefs: [], colorAnalyses: [], chatValidated: false,
})
let n = 0
const G = (name: string, category: string, subcategory: string, primary_color: string, formality_level: number, extra: Record<string, unknown> = {}): Record<string, any> =>
  ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, title: name, name, category, subcategory, primary_color, formality_level, wardrobe_status: 'active', pattern: 'Liso', silhouette: 'Regular', seasons: ['primavera', 'verano', 'otono', 'invierno'], ...extra })
const W = () => {
  n = 0
  return [
    G('Camisa oxford blanca', 'top', 'shirt', 'Blanco', 3), G('Polo marino', 'top', 'polo', 'Azul marino', 3), G('Camiseta blanca', 'top', 'tee', 'Blanco', 1, { seasons: ['verano'] }), G('Camiseta estampada', 'top', 'tee', 'Mostaza', 1, { pattern: 'Gráfico' }),
    G('Jersey camel', 'top', 'knit', 'Camel', 3, { seasons: ['otono', 'invierno'] }), G('Sudadera gris', 'top', 'sweatshirt', 'Gris', 1, { silhouette: 'Amplia' }),
    G('Chino beige', 'bottom', 'chinos', 'Beige', 3, { cut: 'Recto' }), G('Pantalón gris', 'bottom', 'trousers', 'Gris', 4, { cut: 'Recto' }), G('Vaquero', 'bottom', 'jeans', 'Denim', 2, { cut: 'Slim' }), G('Jogger', 'bottom', 'joggers', 'Negro', 1),
    G('Mocasines', 'footwear', 'loafers', 'Marrón', 4), G('Zapatillas blancas', 'footwear', 'sneakers', 'Blanco', 2), G('Botas', 'footwear', 'boots', 'Marrón', 3),
    G('Blazer marino', 'tailoring', 'blazer', 'Azul marino', 4, { attributes: { structure: 'Desestructurada' } }), G('Abrigo camel', 'outerwear', 'coat', 'Camel', 4, { seasons: ['otono', 'invierno'] }),
    G('Pantalón archivado', 'bottom', 'trousers', 'Negro', 4, { wardrobe_status: 'archived' }), G('Chino para donar', 'bottom', 'chinos', 'Caqui', 3, { decision: 'donate_sell' }),
  ]
}
const run = (r: Record<string, unknown>, gs = W(), b = bundle()) => generate(GenerateRequest.parse(r), gs, new Map(gs.map((g) => [g.id, evaluateGarment(g, b, { others: gs, imageCount: 1 })])), b, new Date('2026-10-15'))

test('contexto: formalidad (deseada > código > ocasión), temporada y capas', () => {
  const c = resolveContext(GenerateRequest.parse({ occasion: 'cena_amigos', dress_code: 'smart_casual' }), new Date('2026-10-15'))
  assert.deepEqual(c.formality, [3, 4]); assert.equal(c.season, 'otono'); assert.equal(c.seasonSource, 'fecha actual'); assert.equal(c.hardMin, 2)
  const hot = resolveContext(GenerateRequest.parse({ occasion: 'dia_a_dia', weather: 'hot' }))
  assert.equal(hot.season, 'verano'); assert.ok(hot.forbiddenRoles.includes('outer_layer') && hot.forbiddenRoles.includes('mid_layer') && hot.forbiddenRoles.includes('third_layer'))
  const cold = resolveContext(GenerateRequest.parse({ weather: 'cold', restrictions: ['no_jacket'] }))
  assert.equal(cold.needsCoat, true); assert.ok(cold.forbiddenRoles.includes('third_layer'))
  assert.ok(templatesFor(cold, new Set(['top_base', 'bottom', 'footwear', 'outer_layer'])).templates.every((t) => t.coat), 'con frío y abrigo disponible, siempre abrigo')
  assert.equal(templatesFor(cold, new Set(['top_base', 'bottom', 'footwear'])).coatMissing, true)
  assert.ok(TEMPLATES.every((t) => t.slots.includes('footwear')), 'toda plantilla lleva calzado')
  assert.equal(GenerateRequest.safeParse({ occasion: 'gala_lunar' }).success, false)
})

test('filtros obligatorios: archivadas, descartadas, excluidas, restricciones y dress code', () => {
  const ctx = resolveContext(GenerateRequest.parse({ dress_code: 'formal', restrictions: ['no_sneakers'], exclude_categories: ['outerwear'] }))
  const { ok, excluded } = eligible(W(), ctx)
  const names = ok.map((g) => g.name)
  for (const x of ['Pantalón archivado', 'Chino para donar', 'Zapatillas blancas', 'Abrigo camel', 'Jogger', 'Camiseta blanca']) assert.ok(!names.includes(x), x)
  assert.ok(excluded.some((e) => e.garment === 'Chino para donar' && /sustituir o donar/.test(e.reason)))
  assert.ok(excluded.some((e) => e.garment === 'Jogger' && /demasiado informal/.test(e.reason)))
})

test('el motor nunca inventa prendas y respeta las funciones y las restricciones', () => {
  const gs = W(), ids = new Set(gs.filter((g) => g.wardrobe_status === 'active' && !g.decision).map((g) => g.id))
  for (const r of [{ occasion: 'cena_amigos', dress_code: 'smart_casual', number_of_outfits: 5 }, { occasion: 'reunion_trabajo', weather: 'cold', restrictions: ['no_jacket'] }, { occasion: 'dia_a_dia', weather: 'hot' }, { occasion: 'boda', dress_code: 'formal' }]) {
    const out = run(r, gs)
    for (const p of out.proposals) {
      assert.ok(p.items.every((i) => ids.has(i.garment_id)), `${JSON.stringify(r)}: solo prendas activas y no descartadas`)
      assert.ok(p.items.some((i) => i.role === 'footwear'))
      if (r.restrictions?.includes('no_jacket')) assert.ok(!p.items.some((i) => i.role === 'third_layer'))
      if (r.weather === 'cold') assert.ok(p.items.some((i) => i.role === 'outer_layer'), 'con frío lleva abrigo')
      if (r.weather === 'hot') assert.ok(!p.items.some((i) => ['outer_layer', 'mid_layer'].includes(i.role)) && !p.items.some((i) => i.title === 'Jersey camel'), 'con calor sin capas de abrigo')
    }
  }
})

test('propuestas variadas: intenciones distintas y sin repetir siempre las mismas prendas', () => {
  const out = run({ occasion: 'cena_amigos', dress_code: 'smart_casual', number_of_outfits: 5 })
  assert.equal(out.proposals.length, 5)
  assert.deepEqual(new Set(out.proposals.map((p) => p.intent)).size, 5)
  const sets = out.proposals.map((p) => new Set(p.items.map((i) => i.garment_id)))
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
    const shared = [...sets[i]].filter((x) => sets[j].has(x)).length
    assert.ok(shared / Math.max(sets[i].size, sets[j].size) <= 0.5, `propuestas ${i + 1} y ${j + 1} demasiado parecidas`)
  }
  const uses = new Map<string, number>()
  for (const s of sets) for (const id of s) uses.set(id, (uses.get(id) ?? 0) + 1)
  assert.ok(Math.max(...uses.values()) <= 3, 'ninguna prenda acapara las propuestas')
  const pref = run({ occasion: 'cena_amigos', preferred_style: 'relajada', number_of_outfits: 2 })
  assert.equal(pref.proposals[0].intent, 'relajada', 'la intención pedida va primero')
  assert.equal(INTENTS.length, 5)
})

test('puntuación auditable: 6 criterios con los pesos de la especificación, razones y datos', () => {
  assert.deepEqual(Object.values(DEFAULT_WEIGHTS), [20, 20, 20, 15, 15, 10])
  const w = normalizeWeights({ occasion: 40 }); assert.equal(Math.round(Object.values(w).reduce((a, b) => a + b, 0)), 100); assert.ok(w.occasion > 30)
  const out = run({ occasion: 'cena_amigos', dress_code: 'smart_casual' })
  const p = out.proposals[0]
  assert.equal(p.criteria.length, 6)
  assert.equal(Math.round(p.criteria.reduce((a, c) => a + c.points, 0)), p.score)
  for (const c of p.criteria) { assert.ok(c.reasons.length > 0, c.key); assert.ok(c.data_used.length > 0, c.key); assert.ok(c.points <= c.weight + 0.01) }
  assert.ok(['alta', 'media', 'baja'].includes(p.confidence)); assert.ok(p.why.length > 0)
  assert.ok(p.why.every((w) => !p.criteria.some((c) => c.cons.includes(w))), '«por qué funciona» no incluye matices negativos')
  assert.ok(out.stats.evaluated > 0 && out.stats.candidates > 0)
})

test('criterio experto: penaliza mezclas incoherentes y respeta lo que evitas', () => {
  const gs = W(), b = bundle(), by = (x: string) => gs.find((g) => g.name === x)!
  const env = scoreEnv(resolveContext(GenerateRequest.parse({ occasion: 'cena_amigos' })), b, new Map(), undefined)
  const good = scoreOutfit([{ role: 'top_base', g: by('Camisa oxford blanca') }, { role: 'third_layer', g: by('Blazer marino') }, { role: 'bottom', g: by('Pantalón gris') }, { role: 'footwear', g: by('Mocasines') }], env)
  const clash = scoreOutfit([{ role: 'top_base', g: by('Sudadera gris') }, { role: 'third_layer', g: by('Blazer marino') }, { role: 'bottom', g: by('Jogger') }, { role: 'footwear', g: by('Mocasines') }], env)
  assert.ok(good.total > clash.total + 10, `${good.total} vs ${clash.total}`)
  assert.ok(clash.criteria.find((c) => c.key === 'aesthetic')!.cons.some((x) => /deportivo.*sastrería/.test(x)))
  const pink = scoreOutfit([{ role: 'top_base', g: G('Camisa rosa', 'top', 'shirt', 'Rosa', 3) }, { role: 'bottom', g: by('Chino beige') }, { role: 'footwear', g: by('Mocasines') }], env)
  assert.ok(pink.criteria.find((c) => c.key === 'color')!.cons.some((x) => /evitas/.test(x)))
})

test('prenda obligatoria y sin combinaciones: avisos claros', () => {
  const gs = W()
  const blazer = gs.find((g) => g.name === 'Blazer marino')!
  const out = run({ occasion: 'cena_amigos', required_garment_ids: [blazer.id], number_of_outfits: 3 }, gs)
  assert.ok(out.proposals.length > 0 && out.proposals.every((p) => p.items.some((i) => i.garment_id === blazer.id)))
  const archived = gs.find((g) => g.name === 'Pantalón archivado')!
  assert.match(run({ required_garment_ids: [archived.id] }, gs).notes[0], /no está disponible/)
  const onlyTops = gs.filter((g) => g.category === 'top')
  assert.match(run({}, onlyTops).notes[0], /No he encontrado combinaciones/)
})

test('migración 0012: historial auditable con RLS', () => {
  const sql = readFileSync('supabase/migrations/0012_outfit_generator.sql', 'utf8')
  assert.equal((sql.match(/enable row level security/g) ?? []).length, 2)
  for (const c of ['engine_version', 'request jsonb', 'context jsonb', 'weights jsonb', 'stats jsonb', 'breakdown jsonb', 'garment_ids uuid', 'compatibility_score', 'confidence_level', 'generation_result_id']) assert.match(sql, new RegExp(c), c)
  assert.match(sql, /'elegante','minimalista','relajada','personalidad','versatil'/)
})
