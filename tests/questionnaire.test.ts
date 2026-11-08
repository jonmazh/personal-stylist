import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { AREAS } from '@/lib/profile/areas'
import { QUESTIONS, buildAreaPayload, questionsOf } from '@/lib/profile/questionnaire'
import { describeArea } from '@/lib/profile/summary'
import { filled } from '@/lib/profile/data'
import { sampleBundle } from './helpers'

/** Columnas de cada tabla segun las migraciones (create table + alter table add column). */
function schema() {
  const sql = readdirSync('supabase/migrations').sort().map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n')
  const cols: Record<string, Set<string>> = {}
  for (const m of sql.matchAll(/create table (?:if not exists )?public\.(\w+) \(([\s\S]*?)\n\);/g)) {
    const set = (cols[m[1]] ??= new Set())
    for (const part of m[2].split(/,(?![^(]*\))/)) { const c = part.trim().split(/\s+/)[0]; if (c && !/^(primary|unique|check|constraint)$/i.test(c)) set.add(c) }
  }
  for (const m of sql.matchAll(/alter table public\.(\w+)([\s\S]*?);/g))
    for (const c of m[2].matchAll(/add column if not exists (\w+)/g)) (cols[m[1]] ??= new Set()).add(c[1])
  return cols
}
const form = (entries: [string, string][]) => { const f = new FormData(); for (const [k, v] of entries) f.append(k, v); return f }

test('cada pregunta se guarda en una columna que existe en las migraciones', () => {
  const cols = schema()
  for (const q of QUESTIONS) {
    assert.ok(cols[q.store.table], `tabla ${q.store.table} no existe`)
    assert.ok(cols[q.store.table].has(q.store.column), `${q.id}: columna ${q.store.table}.${q.store.column} no existe`)
  }
  for (const c of ['category', 'name', 'measurements', 'notes']) assert.ok(cols.reference_garments.has(c))
  assert.ok(cols.profiles.has('photo_consent_at')); assert.ok(cols.body_photos.has('quality'))
  for (const c of ['reference_id', 'rating']) assert.ok(cols.style_reference_ratings.has(c))
  for (const c of ['storage_path', 'source_url', 'note', 'rating', 'ai_tags']) assert.ok(cols.style_references.has(c))
  assert.ok(cols.profiles.has('delete_photos_after_analysis'))
  for (const c of ['influences', 'liked_elements', 'rejected_elements', 'brand_refs', 'identity_version', 'identity_updated_at']) assert.ok(cols.style_preferences.has(c), c)
  assert.ok(cols.style_reference_ratings.has('liked_elements'))
})

test('especificacion completa: ids unicos, todas las areas, opciones y proposito declarados', () => {
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, QUESTIONS.length)
  for (const a of AREAS) assert.ok(questionsOf(a.id).length > 0, `${a.name} sin preguntas`)
  for (const q of QUESTIONS) {
    if (q.kind === 'single' || q.kind === 'multi') assert.ok(q.options?.length, `${q.id} sin opciones`)
    assert.ok(q.extracts.length > 10 && q.feeds.length > 3, `${q.id} sin proposito`)
  }
})

test('guardado: solo acepta opciones validas y separa las columnas por tabla', () => {
  const { rows } = buildAreaPayload('a3', form([['eye_color', 'Verde'], ['metal', 'Bronce'], ['likes', 'Camel'], ['likes', 'Fucsia'], ['temperature', 'Cálida']]))
  assert.equal(rows.color_profiles!.eye_color, 'Verde')
  assert.equal(rows.color_profiles!.metal, null) // opcion inventada: se descarta
  assert.deepEqual(rows.color_profiles!.likes, ['Camel'])
  assert.equal(rows.color_profiles!.temperature, 'Cálida')
})

test('guardado: el reparto de vida debe sumar 100 % y se guarda en jsonb por clave', () => {
  const bad = buildAreaPayload('a5', form([['l_trabajo', '50'], ['l_ocio', '30'], ['climate', 'Frío y húmedo']]))
  assert.match(bad.warnings.join(), /suma 80 %/)
  assert.equal(bad.rows.lifestyle_profiles!.life.trabajo, 50)
  assert.equal(bad.rows.lifestyle_profiles!.climate, 'Frío y húmedo')
  const ok = buildAreaPayload('a5', form([['l_trabajo', '60'], ['l_ocio', '40']]))
  assert.equal(ok.warnings.length, 0)
})

test('guardado: maximo de tres palabras y medidas fuera de rango', () => {
  const g = buildAreaPayload('a7', form(['Limpia', 'Elegante', 'Segura', 'Discreta'].map((w) => ['image_words', w] as [string, string])))
  assert.deepEqual(g.rows.style_goals!.image_words, ['Limpia', 'Elegante', 'Segura'])
  assert.match(g.warnings.join(), /3 primeras/)
  const m = buildAreaPayload('a2', form([['pecho', '104'], ['cintura', '840'], ['hombros', '']]))
  assert.deepEqual(m.measures, [{ key: 'pecho', value_cm: 104 }])
  assert.match(m.warnings.join(), /Cintura: 840/)
})

test('el chat recibe las respuestas nuevas y las prendas de referencia', () => {
  const b = sampleBundle({
    color: { temperature: 'Cálida', eye_color: 'Verde', vein_color: 'Verdosas', likes: ['Camel', 'Oliva'] },
    life: { life: { trabajo: 60, ocio: 40 }, work_formality: 'Smart casual', constraints: [] },
    goals: { image_words: ['Limpia', 'Segura'], answers: {} },
    references: [{ category: 'pantalon', name: 'Chino azul', measurements: { cintura: 42, tiro: 29 }, notes: 'talla 42' }],
  })
  assert.ok(describeArea('a3', b).includes('Color de ojos: Verde'))
  assert.ok(describeArea('a3', b).includes('Colores que te gusta llevar: Camel, Oliva'))
  assert.equal(describeArea('a5', b)[0], 'Reparto del armario: Trabajo 60 %, Ocio 40 %')
  assert.ok(describeArea('a5', b).includes('Formalidad de tu trabajo: Smart casual'))
  assert.ok(describeArea('a7', b).includes('Hasta tres palabras que quieres que piensen al verte: Limpia, Segura'))
  assert.match(describeArea('a2', { ...b, photos: [{ kind: 'frontal' }, { kind: 'lateral', quality: { ai: { usable: false } } }] }).at(-1)!, /Fotos subidas: frontal, lateral \(no utilizable según la IA\)/)
  assert.ok(describeArea('a6', b).some((l) => /Pantalón · Chino azul: cintura 42 cm, tiro 29 cm \(talla 42\)/.test(l)))
})

test('estado de los capitulos: deslizadores en 50 y 0 % no cuentan como respuesta', () => {
  const b = sampleBundle({ style: { dims: { clasico: 50 }, styles: [] }, life: { life: { trabajo: 0 } }, fit: null })
  assert.equal(filled('a4', b), false)
  assert.equal(filled('a5', b), false)
  assert.equal(filled('a6', b), false)
  assert.equal(filled('a6', { ...b, references: [{ category: 'camisa', name: 'Oxford' }] }), true)
  assert.equal(filled('a3', b), true)
})
