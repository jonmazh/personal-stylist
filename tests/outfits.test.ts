import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ITEM_ROLES, OUTFIT_OCCASIONS, OUTFIT_SOURCES, OUTFIT_STATUSES, checkComposition, defaultRole, rolesFor, snapshotOf } from '@/lib/outfits/taxonomy'
import { ItemsInput, OutfitMeta } from '@/lib/outfits/service'
import { SUBS } from '@/lib/wardrobe/taxonomy'

const sql = readFileSync('supabase/migrations/0011_outfits.sql', 'utf8')
const checkList = (col: string) => [...(sql.match(new RegExp(`${col}[^\\n]*?in \\(([^)]*)\\)`))?.[1].matchAll(/'([^']+)'/g) ?? [])].map((m) => m[1])

test('la migración 0011 usa las mismas listas que la taxonomía de outfits', () => {
  assert.deepEqual(checkList('item_role text not null check \\(item_role'), ITEM_ROLES.map((r) => r.id))
  assert.deepEqual(checkList('occasion is null or occasion'), OUTFIT_OCCASIONS.map((o) => o.id))
  assert.deepEqual(checkList("status text not null default 'draft' check \\(status"), OUTFIT_STATUSES.map((s) => s.id))
  assert.deepEqual(checkList("source text not null default 'manual' check \\(source"), [...OUTFIT_SOURCES])
})

test('migración 0011: RLS que exige conjunto y prenda propios, instantánea y conservación al borrar la prenda', () => {
  assert.equal((sql.match(/enable row level security/g) ?? []).length, 2)
  assert.match(sql, /exists \(select 1 from public\.outfits o where o\.id = outfit_id and o\.user_id = \(select auth\.uid\(\)\)\)/)
  assert.match(sql, /exists \(select 1 from public\.garments g where g\.id = garment_id and g\.user_id = \(select auth\.uid\(\)\)\)/)
  assert.match(sql, /references public\.garments\(id\) on delete set null/)
  assert.match(sql, /attribute_snapshot jsonb not null/); assert.match(sql, /unique \(outfit_id, garment_id\)/)
  assert.match(sql, /outfits_touch before update/); assert.doesNotMatch(sql, /create table[^;]*garment_images/i, 'no duplica fotos')
})

test('roles: cada tipo de prenda tiene al menos uno y nunca uno imposible', () => {
  for (const s of SUBS) assert.ok(rolesFor({ category: s.group, subcategory: s.id }).length >= 1, s.id)
  assert.deepEqual(rolesFor({ category: 'footwear', subcategory: 'loafers' }), ['footwear'])
  assert.deepEqual(rolesFor({ category: 'bottom', subcategory: 'jeans' }), ['bottom'])
  assert.equal(defaultRole({ category: 'outerwear', subcategory: 'coat' }), 'outer_layer')
  assert.equal(defaultRole({ category: 'outerwear', subcategory: 'blazer' }), 'third_layer')
  assert.equal(defaultRole({ category: 'tailoring', subcategory: 'suit' }), 'full_body')
  assert.ok(rolesFor({ category: 'top', subcategory: 'knit' }).includes('mid_layer'), 'un jersey puede ir sobre una camisa')
})

const G = (id: string, category: string, subcategory: string, extra: Record<string, unknown> = {}) => [id, { id, category, subcategory, wardrobe_status: 'active', ...extra }] as const
const garments = new Map<string, Record<string, any>>([
  G('shirt', 'top', 'shirt'), G('knit', 'top', 'knit'), G('chino', 'bottom', 'chinos'), G('jeans', 'bottom', 'jeans'), G('shoes', 'footwear', 'loafers'),
  G('suit', 'tailoring', 'suit'), G('coat', 'outerwear', 'coat'), G('old', 'top', 'tee', { wardrobe_status: 'archived' }), G('give', 'top', 'polo', { decision: 'donate_sell' }),
])
const errs = (items: { garment_id: string; role: string }[]) => checkComposition(items, garments).filter((p) => p.level === 'error').map((p) => p.text)
const warns = (items: { garment_id: string; role: string }[]) => checkComposition(items, garments).filter((p) => p.level === 'aviso').map((p) => p.text)

test('composición: conjunto completo sin errores ni avisos; capas válidas', () => {
  const ok = [{ garment_id: 'shirt', role: 'top_base' }, { garment_id: 'knit', role: 'mid_layer' }, { garment_id: 'chino', role: 'bottom' }, { garment_id: 'coat', role: 'outer_layer' }, { garment_id: 'shoes', role: 'footwear' }]
  assert.deepEqual(errs(ok), []); assert.deepEqual(warns(ok), [])
})

test('composición: errores que impiden guardar', () => {
  assert.match(errs([{ garment_id: 'shoes', role: 'bottom' }])[0], /no puede ser parte inferior/)
  assert.ok(errs([{ garment_id: 'chino', role: 'bottom' }, { garment_id: 'jeans', role: 'bottom' }]).some((e) => /Solo cabe una prenda como parte inferior/.test(e)))
  assert.ok(errs([{ garment_id: 'suit', role: 'full_body' }, { garment_id: 'chino', role: 'bottom' }]).some((e) => /pieza completa/.test(e)))
  assert.ok(errs([{ garment_id: 'shirt', role: 'top_base' }, { garment_id: 'shirt', role: 'third_layer' }]).some((e) => /dos veces/.test(e)))
  assert.ok(errs([{ garment_id: 'inventada', role: 'top_base' }]).some((e) => /no existe en tu armario/.test(e)), 'no se inventan prendas')
  assert.ok(errs([{ garment_id: 'shirt', role: 'capa_magica' }]).some((e) => /Función no válida/.test(e)))
})

test('composición: avisos que no impiden guardar', () => {
  const w = warns([{ garment_id: 'shirt', role: 'top_base' }, { garment_id: 'old', role: 'mid_layer' }, { garment_id: 'give', role: 'top_base' }].slice(0, 2))
  assert.ok(w.some((x) => /Falta la parte inferior/.test(x))); assert.ok(w.some((x) => /Falta el calzado/.test(x))); assert.ok(w.some((x) => /archivada/.test(x)))
  assert.ok(warns([{ garment_id: 'give', role: 'top_base' }]).some((x) => /donar o vender/.test(x)))
  assert.deepEqual(warns([{ garment_id: 'suit', role: 'full_body' }, { garment_id: 'shoes', role: 'footwear' }]), [], 'un traje cubre arriba y abajo')
  assert.deepEqual(checkComposition([], garments), [])
})

test('instantánea: atributos relevantes, sin vacíos y con título y fecha', () => {
  const s = snapshotOf({ name: null, category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', cut: 'Recto', seasons: [], notes: 'privado', purchase_price: 50 }, 'Chino beige')
  assert.equal(s.title, 'Chino beige'); assert.equal(s.primary_color, 'Beige'); assert.ok(typeof s.at === 'string')
  assert.ok(!('seasons' in s) && !('name' in s), 'sin vacíos'); assert.ok(!('notes' in s) && !('purchase_price' in s), 'solo atributos de estilo')
})

test('validación de datos del conjunto', () => {
  assert.equal(OutfitMeta.safeParse({ name: '' }).success, false)
  assert.equal(OutfitMeta.safeParse({ name: 'Cena', occasion: 'gala_espacial' }).success, false)
  assert.equal(OutfitMeta.safeParse({ name: 'Cena', formality_level: 7 }).success, false)
  assert.equal(OutfitMeta.safeParse({ name: 'Cena', tags: Array(9).fill('x') }).success, false)
  assert.equal(OutfitMeta.safeParse({ name: 'Cena', occasion: 'cena_amigos', formality_level: 3, seasons: ['otono'], tags: ['noche'] }).success, true)
  assert.equal(ItemsInput.safeParse([{ garment_id: 'no-uuid', role: 'bottom' }]).success, false)
})
