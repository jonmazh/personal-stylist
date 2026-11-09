import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CONTEXT_PARSER, OUTFIT_STYLIST, ParsedSchema, STYLIST_CHAT, applyChanges, chatPrompt, keywordParse, normalizeParsed, parserUserPrompt, selectionPrompt, validateSelection } from '@/lib/outfits/stylist/contracts'

const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b', C = '00000000-0000-4000-8000-00000000000c', X = '00000000-0000-4000-8000-999999999999'

test('prompt Outfit Stylist: los 12 principios de la especificación', () => {
  for (const r of ['Utiliza exclusivamente prendas cuyos identificadores', 'Nunca inventes ropa', 'filtros obligatorios', 'Diferencia entre compatibilidad estimada y ajuste', 'No fuerces la incorporacion de accesorios', 'Busca variedad', 'No recomiendes una compra', 'Discrepa', 'No presentes puntuaciones como verdades objetivas', 'esquema JSON']) assert.ok(OUTFIT_STYLIST.includes(r), r)
  assert.ok(STYLIST_CHAT.startsWith(OUTFIT_STYLIST)); assert.match(STYLIST_CHAT, /SOLO ids de PRENDAS DISPONIBLES/)
  assert.match(CONTEXT_PARSER, /No inventes/)
  const p = parserUserPrompt('Cena el viernes', [{ id: A, title: 'Camisa blanca' }])
  assert.match(p, /cena_amigos \(Cena con amigos\)/); assert.match(p, new RegExp(`${A}: Camisa blanca`))
})

test('intérprete: valores fuera de lista e ids inventados se descartan y se dicen', () => {
  const n = normalizeParsed(ParsedSchema.parse({ occasion: 'cena_amigos', dress_code: 'smart_casual', preferred_style: 'gotico', weather: 'tormenta', restrictions: ['no_jacket', 'sin_calcetines'], required_garment_ids: [A, X], assumptions: ['x'] }), new Set([A]))
  assert.equal(n.request.occasion, 'cena_amigos'); assert.equal(n.request.dress_code, 'smart_casual')
  assert.equal(n.request.preferred_style, null); assert.equal(n.request.weather, null)
  assert.deepEqual(n.request.restrictions, ['no_jacket']); assert.deepEqual(n.request.required_garment_ids, [A])
  assert.ok(n.dropped.some((d) => /gotico/.test(d)) && n.dropped.some((d) => /no está en tu armario/.test(d)) && n.dropped.some((d) => /sin_calcetines/.test(d)))
})

test('intérprete sin IA: palabras clave evidentes', () => {
  const k = keywordParse('Mañana tengo una cena con compañeros en un restaurante elegante. Hará frío y prefiero no llevar americana')
  assert.equal(k.occasion, 'cena_amigos'); assert.equal(k.weather, 'cold'); assert.equal(k.time_of_day, 'evening'); assert.equal(k.dress_code, 'smart_casual'); assert.deepEqual(k.restrictions, ['no_jacket'])
  assert.equal(keywordParse('Necesito algo para una entrevista').occasion, 'entrevista')
  assert.equal(keywordParse('hola').occasion, null)
})

test('selección: solo candidatas existentes, sin repetir y como máximo las pedidas', () => {
  const v = validateSelection({ intro: '', proposals: [{ candidate: 'C9', name: 'x', why: '', when: '', limitations: null }, { candidate: 'C2', name: 'a', why: '', when: '', limitations: null }, { candidate: 'C2', name: 'b', why: '', when: '', limitations: null }, { candidate: 'C1', name: 'c', why: '', when: '', limitations: null }, { candidate: 'C3', name: 'd', why: '', when: '', limitations: null }] }, ['C1', 'C2', 'C3'], 2)
  assert.deepEqual(v.proposals.map((p) => p.candidate), ['C2', 'C1']); assert.match(v.dropped[0], /C9/)
  const sp = selectionPrompt({ request: 'cena', context: 'x', profile: 'y', n: 2, candidates: [{ key: 'C1', intent: 'elegante', score: 90, confidence: 'alta', items: [{ garment_id: A, role: 'top_base', title: 'Camisa' }], why: ['a'], cons: [] }] })
  assert.match(sp, /No cambies ni añadas prendas/); assert.match(sp, /orientativa, no objetiva/)
})

test('conversación: cambios validados contra el inventario y las funciones', () => {
  const avail = new Map<string, Record<string, any>>([[A, { id: A, title: 'Camisa', category: 'top', subcategory: 'shirt' }], [B, { id: B, title: 'Mocasines', category: 'footwear', subcategory: 'loafers' }], [C, { id: C, title: 'Zapatillas', category: 'footwear', subcategory: 'sneakers' }]])
  const items = [{ garment_id: A, role: 'top_base' }, { garment_id: B, role: 'footwear' }]
  assert.deepEqual(applyChanges(items, [{ role: 'footwear', garment_id: C }], avail).items, [{ garment_id: A, role: 'top_base' }, { garment_id: C, role: 'footwear' }], 'sustituye conservando el resto')
  const bad = applyChanges(items, [{ role: 'footwear', garment_id: X }], avail)
  assert.deepEqual(bad.items, items); assert.match(bad.errors[0], /no está en tu armario/)
  assert.match(applyChanges(items, [{ role: 'bottom', garment_id: C }], avail).errors[0], /no puede ser parte inferior/)
  assert.match(applyChanges(items, [{ role: 'capa_magica', garment_id: C }], avail).errors[0], /Función desconocida/)
  assert.deepEqual(applyChanges(items, [{ role: 'footwear', garment_id: null }], avail).items, [{ garment_id: A, role: 'top_base' }], 'quitar una función')
  const cp = chatPrompt({ context: 'c', profile: 'p', proposals: [{ n: 1, name: 'Uno', score: 88, items: [{ garment_id: A, role: 'top_base', title: 'Camisa' }] }], available: [{ id: C, title: 'Zapatillas', roles: ['footwear'] }], history: [{ role: 'user', content: 'hola' }], message: 'cambia los zapatos' })
  assert.match(cp, /P1 «Uno» \(88\/100\)/); assert.match(cp, new RegExp(`${C}: Zapatillas · footwear`)); assert.match(cp, /Usuario: hola/)
})

test('migración 0013: sesiones y mensajes con RLS; versiones de propuestas', () => {
  const sql = readFileSync('supabase/migrations/0013_outfit_stylist.sql', 'utf8')
  assert.equal((sql.match(/enable row level security/g) ?? []).length, 2)
  for (const c of ['stylist_sessions', 'stylist_messages', 'parent_result_id', "'engine','stylist_edit'", 'interpretation jsonb', 'current jsonb']) assert.ok(sql.includes(c), c)
})
