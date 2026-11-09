import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DISLIKE_HINT, DislikesSchema, TASTE_EXTRACTOR, TASTE_HINT, TastesSchema, extractorPrompt, isEmpty, learnedSentence, normalizeDislikes, normalizeTastes } from '@/lib/profile/tastes'
import { ChatSchema, STYLIST_CHAT, chatPrompt } from '@/lib/outfits/stylist/contracts'
import { detectPatterns, toSignals } from '@/lib/outfits/learning'

const A = '00000000-0000-4000-8000-00000000000a', X = '00000000-0000-4000-8000-0000000000ff'
const inv = new Map([[A, { title: 'Zapatillas blancas' }]])

test('solo se extrae del chat libre cuando el mensaje expresa un gusto o un rechazo', () => {
  for (const m of ['No me gustan las zapatillas blancas', 'odio el rosa', 'Nunca me pondría unos pitillo', 'no me convence la camisa', 'No soporto los estampados']) assert.ok(DISLIKE_HINT.test(m), m)
  for (const m of ['¿Qué pantalón me conviene?', 'Tengo una cena el viernes', '¿Qué me pongo mañana?']) assert.ok(!DISLIKE_HINT.test(m), m)
})

test('normalización: prendas del inventario, rasgos y colores de las listas; lo demás se descarta', () => {
  const n = normalizeDislikes(DislikesSchema.parse({ garment_ids: [A, X, A], elements: ['leg-slim', 'capa-magica'], colors: ['rosa', 'Fucsia', 'Antracita'] }), inv)
  assert.deepEqual(n.garments, [A]); assert.deepEqual(n.elements, ['leg-slim']); assert.deepEqual(n.colors, ['Rosa', 'Gris'])
  assert.equal(n.dropped.length, 3)
  assert.ok(isEmpty(normalizeDislikes(DislikesSchema.parse({}), inv)))
})

test('frase al usuario: qué se ha anotado en su perfil', () => {
  const s = learnedSentence([{ kind: 'garment', ref: A, label: 'Zapatillas blancas', polarity: 'dislike' }, { kind: 'element', ref: 'leg-slim', label: 'Pantalón slim', polarity: 'dislike' }, { kind: 'color', ref: 'Rosa', label: 'Rosa', polarity: 'dislike' }])
  assert.equal(s, 'He anotado en tu perfil de gustos: «Zapatillas blancas» (no te la volveré a proponer); rechazas pantalón slim; evitas el rosa.')
  assert.equal(learnedSentence([]), '')
})

test('prompts: la conversación y el extractor piden «dislikes» con listas cerradas', () => {
  assert.match(STYLIST_CHAT, /GUSTOS: Si el usuario expresa CLARAMENTE un gusto general o un rechazo/)
  assert.match(TASTE_EXTRACTOR, /no un «hoy no», ni una duda, ni su opinion sobre una propuesta concreta/)
  const p = extractorPrompt('no me gustan', [{ id: A, title: 'Zapatillas blancas' }])
  assert.match(p, /leg-slim: Pantalón slim/); assert.match(p, /COLORES: Negro, Blanco/); assert.match(p, new RegExp(`${A}: Zapatillas blancas`))
  assert.match(chatPrompt({ context: '', profile: '', proposals: [], available: [], history: [], message: 'x' }), /RASGOS \(id: nombre\)/)
  assert.deepEqual(ChatSchema.parse({ reply: 'ok', action: 'answer' }).dislikes, { garment_ids: [], elements: [], colors: [], cuts: [] })
  assert.deepEqual(ChatSchema.parse({ reply: 'ok', action: 'answer' }).likes, { garment_ids: [], elements: [], colors: [], cuts: [] })
  assert.match(TASTE_EXTRACTOR, /CORTES|cuts/); assert.match(extractorPrompt('x', []), /CORTES \(clave: valores\): camisetas: Regular \| Relaxed \| Ajustada; camisas/)
})

test('un rechazo dicho al estilista es un patrón confirmado aunque no haya valoraciones', () => {
  const ps = detectPatterns([], [], new Map(), [{ key: `garment_dislike:${A}`, status: 'confirmed', label: 'No te gusta «Zapatillas blancas»', evidence: { source: 'conversation', message: 'no me gustan las zapatillas blancas' } }])
  assert.equal(ps.length, 1); assert.equal(ps[0].weight, 1); assert.match(ps[0].explanation, /Se lo dijiste al estilista: «no me gustan las zapatillas blancas»/)
  assert.ok(toSignals(ps).exclude.has(A), 'el motor deja de proponerla')
  assert.equal(detectPatterns([], [], new Map(), [{ key: `garment_dislike:${A}`, status: 'dismissed', label: 'x' }]).length, 0, 'descartado y sin evidencia: no aparece')
})

test('gustos: también lo que te gusta (rasgo, color, prenda y corte por tipo de prenda)', () => {
  for (const m of ['Me gustan los pantalones anchos', 'me encanta el verde bosque', 'Prefiero las camisas regulares', 'me quedan bien los mocasines']) assert.ok(TASTE_HINT.test(m), m)
  const n = normalizeTastes(TastesSchema.parse({ likes: { elements: ['leg-wide'], colors: ['verde bosque'], cuts: [{ key: 'pantalones', value: 'Amplio' }, { key: 'pantalones', value: 'Recto' }, { key: 'faldas', value: 'Larga' }, { key: 'camisas', value: 'Ancha' }], garment_ids: [A] } }), inv)
  assert.deepEqual(n.likes.elements, ['leg-wide']); assert.deepEqual(n.likes.colors, ['Verde bosque']); assert.deepEqual(n.likes.garments, [A])
  assert.deepEqual(n.likes.cuts, [{ key: 'pantalones', value: 'Amplio' }], 'solo valores de la lista y uno por tipo de prenda')
  assert.ok(n.dropped.some((d) => /faldas/.test(d)) && n.dropped.some((d) => /Ancha/.test(d)))
  const both = normalizeTastes(TastesSchema.parse({ likes: { elements: ['leg-wide'] }, dislikes: { elements: ['leg-wide'], cuts: [{ key: 'pantalones', value: 'Recto' }] } }), inv)
  assert.deepEqual(both.likes.elements, []); assert.deepEqual(both.dislikes.elements, []); assert.deepEqual(both.dislikes.cuts, [], 'los cortes solo se anotan como gusto')
  assert.ok(!isEmpty(n)); assert.ok(isEmpty(both))
  assert.equal(learnedSentence([{ kind: 'element', ref: 'leg-wide', label: 'Pantalón amplio (wide leg)', polarity: 'like' }, { kind: 'cut', ref: 'pantalones:Amplio', label: 'pantalones: Amplio', polarity: 'like' }, { kind: 'color', ref: 'Verde bosque', label: 'Verde bosque', polarity: 'like' }]),
    'He anotado en tu perfil de gustos: te gustan: pantalón amplio (wide leg); te gusta el verde bosque; corte preferido en pantalones: amplio.')
  assert.ok(DISLIKE_HINT === TASTE_HINT)
})
