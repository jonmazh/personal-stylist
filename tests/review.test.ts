import { test } from 'node:test'
import assert from 'node:assert/strict'
import { carryReviews, reviewHint } from '@/lib/profile/review'
import { generate, review, sampleBundle } from './helpers'

const F = (title: string, body: string) => ({ title, body, origin: 'o', confidence: 'Media', justification: 'j' })

test('carryReviews: conserva confirmadas y corregidas si el texto no cambia', () => {
  const prev = [
    { title: 'A', body: 'x', status: 'confirmed', corrected_body: null },
    { title: 'B', body: 'y', status: 'corrected', corrected_body: 'mi version' },
    { title: 'C', body: 'z', status: 'pending', corrected_body: null },
  ]
  const out = carryReviews(prev, [F('A', 'x'), F('B', 'y'), F('C', 'z'), F('D', 'nueva')])
  assert.deepEqual(out.map((f) => [f.title, f.status, f.corrected_body]), [
    ['A', 'confirmed', null], ['B', 'corrected', 'mi version'], ['C', 'pending', null], ['D', 'pending', null],
  ])
})

test('carryReviews: si la conclusion cambia, vuelve a pendiente y se descarta la correccion antigua', () => {
  const prev = [{ title: 'A', body: 'x', status: 'corrected', corrected_body: 'mi version' }]
  const [a] = carryReviews(prev, [F('A', 'x cambiada')])
  assert.equal(a.status, 'pending')
  assert.equal(a.corrected_body, null)
})

test('reviewHint: avisa solo cuando una revision anterior quedo invalidada', () => {
  const prev = [{ title: 'A', body: 'x', status: 'confirmed' }, { title: 'B', body: 'y', status: 'pending' }]
  assert.match(reviewHint(prev, { title: 'A', body: 'otra', status: 'pending' }, 1)!, /v1.*confirmado/)
  assert.equal(reviewHint(prev, { title: 'A', body: 'x', status: 'confirmed' }, 1), null)
  assert.equal(reviewHint(prev, { title: 'B', body: 'otra', status: 'pending' }, 1), null)
  assert.equal(reviewHint(undefined, { title: 'A', body: 'otra', status: 'pending' }), null)
})

test('flujo: regenerar sin cambios conserva todas las revisiones', () => {
  let b = generate(sampleBundle())
  b = review(b, 'Proporciones', 'confirm')
  b = review(b, 'Identidad estética', 'correct', 'Clásico relajado, nada rígido')
  b = generate(b)
  const v2 = b.blueprints[1].findings
  assert.equal(v2.find((f) => f.title === 'Proporciones')!.status, 'confirmed')
  const id = v2.find((f) => f.title === 'Identidad estética')!
  assert.equal(id.status, 'corrected')
  assert.equal(id.corrected_body, 'Clásico relajado, nada rígido')
  // la version anterior queda intacta como historico
  assert.equal(b.blueprints[0].findings.find((f) => f.title === 'Proporciones')!.status, 'confirmed')
})

test('flujo: cambiar un dato solo reabre las conclusiones afectadas', () => {
  let b = generate(sampleBundle())
  for (const t of ['Proporciones', 'Colorimetría', 'Paleta']) b = review(b, t, 'confirm')
  b = generate({ ...b, color: { ...b.color, temperature: 'Fría' } }) // el usuario cambia su subtono
  const v2 = b.blueprints[1].findings
  const st = (t: string) => v2.find((f) => f.title === t)!.status
  assert.equal(st('Proporciones'), 'confirmed')
  assert.equal(st('Colorimetría'), 'pending')
  assert.equal(st('Paleta'), 'pending')
  assert.match(reviewHint(b.blueprints[0].findings, v2.find((f) => f.title === 'Paleta')!, 1)!, /Revísala/)
})
