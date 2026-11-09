import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ATTRIBUTES, COMPOSITION_SOURCES, CONDITIONS, CUTS, GROUPS, IMAGE_ROLES, STATUSES, SUBS, familyOf } from '@/lib/wardrobe/taxonomy'
import { GarmentInput, ImageInput, completeness, formToGarment, normalizeGarment } from '@/lib/wardrobe/schema'
import { diffAndSources } from '@/lib/wardrobe/service'
import { garmentSubtitle, garmentTitle } from '@/lib/wardrobe/display'

const sql = readFileSync('supabase/migrations/0007_wardrobe_base.sql', 'utf8')
const checkList = (name: string) => [...(sql.match(new RegExp(`${name}[^;]*?in \\(([^)]*)\\)`))?.[1].matchAll(/'([^']+)'/g) ?? [])].map((m) => m[1])

test('taxonomia: grupos y tipos unicos, las seis categorias principales y las de reserva en el modelo', () => {
  assert.equal(new Set(SUBS.map((x) => x.id)).size, SUBS.length)
  assert.deepEqual(GROUPS.filter((g) => g.primary).map((g) => g.label), ['Parte superior', 'Prendas exteriores', 'Parte inferior', 'Calzado', 'Complementos', 'Sastrería y ocasiones'])
  for (const id of ['sport', 'underwear', 'sleepwear']) assert.ok(GROUPS.some((g) => g.id === id && !g.primary))
  for (const f of Object.keys(ATTRIBUTES) as (keyof typeof ATTRIBUTES)[]) for (const d of ATTRIBUTES[f]) assert.ok(d.options.length >= 2, `${f}.${d.key}`)
  // los atributos de pantalon que pide la especificacion
  assert.deepEqual(ATTRIBUTES.bottom.map((d) => d.label), ['Tiro', 'Pernera', 'Bajo', 'Pinzas', 'Raya o pliegue marcado', 'Cintura', 'Largo', 'Estructura del tejido'])
  assert.deepEqual(CUTS.bottom, ['Slim', 'Tapered', 'Recto', 'Wide'])
  assert.equal(familyOf('trousers'), 'bottom'); assert.equal(familyOf('overshirt'), 'shirt'); assert.equal(familyOf('suit'), 'jacket'); assert.equal(familyOf(null, 'footwear'), 'footwear')
})

test('la migracion y la taxonomia tienen las mismas listas cerradas', () => {
  assert.deepEqual(checkList('garments_category_check'), GROUPS.map((g) => g.id))
  assert.deepEqual(checkList('garments_status_check'), STATUSES.map((x) => x.id))
  assert.deepEqual(checkList('garments_condition_check'), CONDITIONS.map((x) => x.id))
  assert.deepEqual(checkList('garments_composition_source_check').filter((x) => x !== 'null'), COMPOSITION_SOURCES.map((x) => x.id))
  assert.deepEqual([...(sql.match(/role text not null default 'front' check \(role in \(([^)]*)\)\)/)?.[1].matchAll(/'([^']+)'/g) ?? [])].map((m) => m[1]), IMAGE_ROLES.map((r) => r.id))
})

const base = { category: 'bottom', subcategory: 'trousers', primary_color: 'Antracita', cut: 'Recto', pattern: 'Liso', formality_level: 4, seasons: ['otono', 'invierno'] }

test('validacion: acepta una ficha correcta y rechaza valores fuera de la taxonomia', () => {
  assert.ok(GarmentInput.safeParse(base).success)
  assert.equal(GarmentInput.safeParse({ ...base, category: 'zapatos' }).success, false)
  assert.equal(GarmentInput.safeParse({ ...base, primary_color: 'Fucsia neón' }).success, false)
  assert.equal(GarmentInput.safeParse({ ...base, formality_level: 7 }).success, false)
  assert.equal(GarmentInput.safeParse({ ...base, purchase_price: -3 }).success, false)
  assert.equal(GarmentInput.safeParse({ ...base, seasons: ['siempre'] }).success, false)
  assert.equal(GarmentInput.safeParse({ ...base, style_tags: ['inventado'] }).success, false)
  assert.equal(GarmentInput.safeParse({ ...base, purchase_date: '12/03/2024' }).success, false)
})

test('coherencia: tipo de otro grupo, corte y atributos que no aplican se quitan con aviso', () => {
  const r1 = normalizeGarment({ category: 'bottom', subcategory: 'blazer' })
  assert.equal(r1.data.subcategory, null); assert.match(r1.warnings.join(), /no pertenece/)
  const r2 = normalizeGarment({ category: 'bottom', subcategory: 'trousers', cut: 'Entallado', attributes: { rise: 'Medio', lapel: 'De pico', leg: 'Gigante' } })
  assert.equal(r2.data.cut, null); assert.deepEqual(r2.data.attributes, { rise: 'Medio' })
  assert.equal(r2.warnings.length, 3)
  const r3 = normalizeGarment({ category: 'outerwear', subcategory: 'blazer', cut: 'Entallado', attributes: { lapel: 'De pico', shoulder: 'Natural' } })
  assert.deepEqual(r3.warnings, []); assert.equal(r3.data.attributes.lapel, 'De pico')
})

test('materiales: composicion confirmada con origen; archivar fecha el archivo', () => {
  assert.equal(normalizeGarment({ category: 'top', confirmed_composition: '100 % algodón' }).data.composition_source, 'usuario')
  assert.equal(normalizeGarment({ category: 'top', confirmed_composition: '100 % algodón', composition_source: 'etiqueta' }).data.composition_source, 'etiqueta')
  assert.equal(normalizeGarment({ category: 'top', confirmed_composition: null }).data.composition_source, null)
  assert.ok(normalizeGarment({ wardrobe_status: 'archived' }, { wardrobe_status: 'active' }).data.archived_at)
  assert.equal(normalizeGarment({ wardrobe_status: 'active' }, { wardrobe_status: 'archived' }).data.archived_at, null)
})

test('formulario → ficha: atributos attr_*, listas y numeros', () => {
  const f = new FormData()
  for (const [k, v] of Object.entries({ name: ' Pantalón gris ', category: 'bottom', subcategory: 'trousers', cut: 'Recto', attr_rise: 'Medio', attr_pleats: 'Sí', formality_level: '4', purchase_price: '89.90', primary_color: 'Antracita', condition: '' })) f.append(k, v)
  f.append('seasons', 'otono'); f.append('seasons', 'invierno')
  const g = formToGarment(f)
  assert.equal(g.name, 'Pantalón gris'); assert.deepEqual(g.attributes, { rise: 'Medio', pleats: 'Sí' }); assert.deepEqual(g.seasons, ['otono', 'invierno'])
  assert.equal(g.formality_level, 4); assert.equal(g.purchase_price, 89.9); assert.equal(g.condition, 'desconocido')
  assert.ok(GarmentInput.safeParse(g).success)
})

test('trazabilidad: al crear solo constan los datos aportados; al editar, solo lo que cambia', () => {
  const created = diffAndSources(null, { ...base, brand: null, seasons: ['otono'], attributes: {}, condition: 'desconocido' })
  assert.deepEqual(Object.keys(created.sources).sort(), ['category', 'cut', 'formality_level', 'pattern', 'primary_color', 'seasons', 'subcategory'])
  assert.ok(Object.values(created.sources).every((s) => s.source === 'usuario' && s.at))
  const cur = { ...base, field_sources: { cut: { source: 'ia', at: '2026-01-01' }, pattern: { source: 'ia', at: '2026-01-01' } } }
  const upd = diffAndSources(cur, { cut: 'Wide', pattern: 'Liso', seasons: ['otono', 'invierno'] })
  assert.deepEqual(upd.changes, { cut: ['Recto', 'Wide'] })
  assert.equal(upd.sources.cut.source, 'usuario'); assert.equal(upd.sources.pattern.source, 'ia') // lo no tocado conserva su origen
})

test('ficha completa, titulo e imagen', () => {
  assert.deepEqual(completeness({ category: 'bottom' }, 0).missing, ['Tipo de prenda', 'Color principal', 'Una foto o un nombre'])
  assert.equal(completeness({ ...base }, 1).complete, true)
  assert.equal(completeness({ category: 'accessories', subcategory: 'watch', name: 'Reloj' }, 0).complete, true)
  assert.equal(garmentTitle({ category: 'bottom', subcategory: 'trousers', primary_color: 'Antracita' }), 'Pantalón de vestir antracita')
  assert.equal(garmentTitle({ name: 'Mi pantalón', category: 'bottom' }), 'Mi pantalón')
  assert.equal(garmentSubtitle({ category: 'bottom', subcategory: 'trousers', cut: 'Recto' }), 'Pantalón de vestir · Recto')
  assert.ok(ImageInput.safeParse({ storage_path: 'u/g/x.jpg', role: 'label', sha256: 'a'.repeat(64) }).success)
  assert.equal(ImageInput.safeParse({ storage_path: 'u/g/x.jpg', role: 'selfie' }).success, false)
})
