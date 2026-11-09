import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { diagnosisDoc, protocolDoc, questionnaireDoc, styleDnaDoc, wardrobeDoc } from '../scripts/docs'

test('docs/CUESTIONARIO.md esta al dia con el codigo (npm run docs)', () => {
  assert.equal(readFileSync('docs/CUESTIONARIO.md', 'utf8'), questionnaireDoc())
})
test('docs/PROTOCOLO-FOTOGRAFICO.md esta al dia con el codigo (npm run docs)', () => {
  assert.equal(readFileSync('docs/PROTOCOLO-FOTOGRAFICO.md', 'utf8'), protocolDoc())
})
test('docs/MOTOR-DIAGNOSTICO.md esta al dia con el codigo (npm run docs)', () => {
  assert.equal(readFileSync('docs/MOTOR-DIAGNOSTICO.md', 'utf8'), diagnosisDoc())
})
test('docs/STYLE-DNA.md esta al dia con el codigo (npm run docs)', () => {
  assert.equal(readFileSync('docs/STYLE-DNA.md', 'utf8'), styleDnaDoc())
})
test('docs/ARMARIO.md esta al dia con el codigo (npm run docs)', () => {
  assert.equal(readFileSync('docs/ARMARIO.md', 'utf8'), wardrobeDoc())
})
