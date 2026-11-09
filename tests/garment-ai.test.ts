import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GARMENT_ANALYST, GarmentAnalysisSchema, PROMPT_VERSION, applyDecisions, buildUserPrompt, inputKey, level, normalizeAnalysis } from '@/lib/wardrobe/analysis'
import { GarmentInput } from '@/lib/wardrobe/schema'

const ai = (o: Record<string, unknown> = {}) => GarmentAnalysisSchema.parse({
  category: { value: 'bottom', confidence: 0.97 }, subcategory: { value: 'trousers', confidence: 0.9 },
  primary_color: { value: 'gris', confidence: 0.88 }, secondary_colors: [{ value: 'Fucsia neón', confidence: 0.3 }],
  pattern: { value: 'Liso', confidence: 0.95 }, cut: { value: 'Recto', confidence: 0.8 }, silhouette: { value: 'Regular', confidence: 0.4 },
  apparent_material: { value: 'Sarga de aspecto lanoso', confidence: 0.6 },
  composition: { value: '98 % lana, 2 % elastano', confidence: 0.9, source: 'label' }, label: { brand: 'Marca', size: '48', confidence: 0.85 },
  attributes: [{ key: 'rise', value: 'Medio', confidence: 0.7 }, { key: 'shoulder', value: 'Natural', confidence: 0.9 }, { key: 'leg', value: 'Campana', confidence: 0.5 }],
  formality: { value: 4, confidence: 0.85 }, seasons: ['otono', 'invierno', 'verano-tropical'],
  unknown: [{ field: 'composition', reason: 'Sin etiqueta', photo: 'label' }], additional_photos_requested: ['label', 'inventada'],
  ...o,
})
const byField = (n: ReturnType<typeof normalizeAnalysis>) => Object.fromEntries(n.fields.map((f) => [f.field, f]))

test('prompt: reglas de la especificacion, version y taxonomia', () => {
  for (const r of ['No inventes marcas', 'material aparente', 'No evalues el ajuste real', 'value null', 'UNICAMENTE el JSON', '"observations"']) assert.ok(GARMENT_ANALYST.includes(r), r)
  assert.match(PROMPT_VERSION, /^garment-analyst@\d+$/)
  const sinEtiqueta = buildUserPrompt({ roles: ['front', 'back'] })
  assert.match(sinEtiqueta, /NO hay foto de etiqueta: composition debe ser null/)
  assert.match(sinEtiqueta, /1\) Frontal|1\) .*rontal/)
  assert.match(sinEtiqueta, /trousers/)
  const conPista = buildUserPrompt({ roles: ['front', 'label'], hint: { subcategory: 'trousers' }, family: 'bottom' })
  assert.match(conPista, /Hay foto de etiqueta/); assert.match(conPista, /El usuario ha indicado que es/)
  assert.match(conPista, /attributes\.rise/); assert.doesNotMatch(conPista, /attributes\.shoulder/)
})

test('normalizacion: lista cerrada, atributos de su familia y nada fuera de la taxonomia', () => {
  const n = normalizeAnalysis(ai(), { field_sources: {} }, { hasLabelPhoto: false })
  const f = byField(n)
  assert.equal(f.category.value, 'bottom'); assert.equal(f.subcategory.value, 'trousers'); assert.equal(n.family, 'bottom')
  assert.equal(f.primary_color.value, 'Gris', 'normaliza mayusculas')
  assert.ok(!f.secondary_colors, 'color inventado descartado')
  assert.equal(f['attr:rise'].value, 'Medio'); assert.equal(f['attr:rise'].label, 'Tiro')
  assert.ok(!f['attr:shoulder'] && !f['attr:leg'])
  assert.ok(n.discarded.some((d) => /shoulder/.test(d)) && n.discarded.some((d) => /Campana/.test(d)))
  assert.deepEqual(f.seasons.value, ['otono', 'invierno'])
  assert.ok(n.discarded.some((d) => /Fucsia neón/.test(d)) && n.discarded.some((d) => /verano-tropical/.test(d)))
  assert.equal(f.apparent_material.note, 'Estimación visual: no es la composición')
  assert.deepEqual(n.requested, ['label'])
  assert.ok(n.overall! > 0 && n.overall! <= 1)
})

test('sin foto de etiqueta no se aceptan composicion, marca ni talla', () => {
  const sin = byField(normalizeAnalysis(ai(), {}, { hasLabelPhoto: false }))
  assert.ok(!sin.confirmed_composition && !sin.brand && !sin.size_label)
  const con = byField(normalizeAnalysis(ai(), {}, { hasLabelPhoto: true }))
  assert.equal(con.confirmed_composition.value, '98 % lana, 2 % elastano'); assert.equal(con.brand.value, 'Marca'); assert.equal(con.size_label.value, '48')
  const noLeida = byField(normalizeAnalysis(ai({ composition: { value: 'Lana', confidence: 0.4, source: 'none' } }), {}, { hasLabelPhoto: true }))
  assert.ok(!noLeida.confirmed_composition, 'una composicion supuesta nunca es confirmada')
})

test('tipo que no pertenece a la categoria y corte de otra familia se descartan', () => {
  const n = normalizeAnalysis(ai({ subcategory: { value: 'shirt', confidence: 0.9 }, cut: { value: 'Slim', confidence: 0.9 } }), {}, { hasLabelPhoto: false })
  assert.ok(!byField(n).subcategory); assert.ok(n.discarded.some((d) => /no pertenece/.test(d)))
})

test('preseleccion: confianza media o alta, sin pisar lo que puso el usuario', () => {
  const g = { primary_color: 'Negro', pattern: 'Liso', field_sources: { primary_color: { source: 'usuario' } } }
  const f = byField(normalizeAnalysis(ai(), g, { hasLabelPhoto: false }))
  assert.equal(level(0.9), 'alta'); assert.equal(level(0.7), 'media'); assert.equal(level(0.3), 'baja')
  assert.equal(f.category.preselect, true)
  assert.equal(f.silhouette.preselect, false, 'confianza baja')
  assert.equal(f.primary_color.preselect, false, 'dato del usuario'); assert.equal(f.primary_color.currentSource, 'usuario')
  assert.equal(f.pattern.same, true); assert.equal(f.pattern.preselect, false)
})

test('confirmacion: solo lo aceptado o corregido llega a la ficha, con su origen', () => {
  const g = { attributes: { pleats: 'Sí' }, field_sources: {} }
  const n = normalizeAnalysis(ai(), g, { hasLabelPhoto: true })
  const r = applyDecisions(n, {
    category: { action: 'accept' }, subcategory: { action: 'accept' }, primary_color: { action: 'correct', value: 'Antracita' },
    pattern: { action: 'reject' }, 'attr:rise': { action: 'accept' }, confirmed_composition: { action: 'accept' },
  }, 'a1', g)
  assert.deepEqual(r.patch.category, 'bottom'); assert.equal(r.patch.primary_color, 'Antracita')
  assert.ok(!('pattern' in r.patch) && !('silhouette' in r.patch), 'rechazado o sin decision no cambia nada')
  assert.deepEqual(r.patch.attributes, { pleats: 'Sí', rise: 'Medio' }, 'conserva los atributos existentes')
  assert.equal(r.patch.composition_source, 'etiqueta')
  assert.equal(r.sources.category.source, 'ia'); assert.equal(r.sources.category.confirmed_by, 'usuario'); assert.equal(r.sources.category.analysis_id, 'a1')
  assert.equal(r.sources.primary_color.source, 'usuario')
  assert.equal(r.record.pattern.action, 'reject'); assert.equal(r.record.primary_color.value, 'Antracita')
  assert.equal(r.status, 'partially_accepted')
  assert.equal(applyDecisions(n, {}, 'a1', g).status, 'rejected')
  assert.ok(GarmentInput.partial().safeParse(r.patch).success, 'el parche es una ficha valida')
})

test('deduplicacion: misma version y mismas fotos en cualquier orden = misma clave', () => {
  assert.equal(inputKey(['b', 'a'], 'trousers'), inputKey(['a', 'b'], 'trousers'))
  assert.notEqual(inputKey(['a', 'b']), inputKey(['a', 'c']))
  assert.notEqual(inputKey(['a']), inputKey(['a'], 'shirt'))
  assert.ok(inputKey(['a']).startsWith(PROMPT_VERSION))
})

test('migracion 0008: analisis versionados con RLS, borradores sin categoria y eventos de IA', () => {
  const sql = readFileSync('supabase/migrations/0008_garment_ai.sql', 'utf8')
  for (const c of ['model_id', 'prompt_version', 'schema_version', 'image_ids', 'input_key', 'analysis_result', 'normalized', 'overall_confidence', 'decisions', 'reviewed_at', 'usage']) assert.match(sql, new RegExp(`\\b${c}\\b`), c)
  assert.match(sql, /enable row level security/); assert.match(sql, /'proposed','accepted','partially_accepted','rejected','superseded'/)
  assert.match(sql, /category is not null or wardrobe_status = 'draft'/)
  assert.match(sql, /'analyzed','analysis_reviewed'/)
  assert.ok(GarmentInput.safeParse({ category: null }).success)
})
