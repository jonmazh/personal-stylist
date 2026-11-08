import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFindings, colorimetry, silhouette, type Finding } from '@/lib/profile/blueprint'
import { RULES } from '@/lib/diagnosis/rules'
import { sampleBundle } from './helpers'
import { EXAMPLE } from '../scripts/docs'
import type { Bundle } from '@/lib/profile/data'

const at = '2026-11-01T10:00:00Z'
const withMeasures = (m: Record<string, number>, extra: Partial<Bundle> = {}) =>
  sampleBundle({ measures: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { value: v, at, source: 'manual' }])), ...extra })
const find = (fs: Finding[], key: string) => fs.find((f) => f.key === key)!
const EMPTY = sampleBundle({ profile: null, measures: {}, color: null, style: null, life: null, fit: null, goals: null,
  validated: { a1: false, a2: false, a3: false, a4: false, a5: false, a6: false, a7: false } })

test('formato: toda conclusion tiene conclusion, por que, que haria un estilista, origen y confianza valida', () => {
  for (const b of [EXAMPLE, sampleBundle(), EMPTY]) for (const f of buildFindings(b)) {
    for (const k of ['key', 'section', 'title', 'body', 'why', 'action', 'origin'] as const) assert.ok(String(f[k]).trim().length > 2, `${f.key}.${k} vacio`)
    assert.ok(['alta', 'media', 'baja', 'sin_datos'].includes(f.confidence), `${f.key}: ${f.confidence}`)
    assert.ok(Array.isArray(f.data_used) && Array.isArray(f.missing))
    assert.equal(f.justification, f.why)
    assert.doesNotMatch(`${f.body} ${f.why} ${f.action}`, /undefined|NaN|null|\[object/, `${f.key} con texto roto`)
  }
})

test('las secciones del README 4.5 estan presentes y en orden', () => {
  const keys = buildFindings(EXAMPLE).map((f) => f.key)
  assert.deepEqual(keys, ['direccion', 'dna', 'objetivo', 'proporciones', 'cortes', 'precaucion', 'colorimetria', 'paleta', 'vida', 'prioridades', 'pasos'])
})

test('sin datos: nunca inventa; dice que falta y la confianza es sin_datos', () => {
  const fs = buildFindings(EMPTY)
  for (const k of ['direccion', 'dna', 'proporciones', 'colorimetria', 'paleta', 'vida']) {
    const f = find(fs, k)
    assert.equal(f.confidence, 'sin_datos', k)
    assert.ok(f.missing.length > 0, `${k} sin lista de lo que falta`)
  }
  assert.doesNotMatch(find(fs, 'proporciones').body, /cm/)
  assert.match(find(fs, 'pasos').body, /^1\. Completar/)
})

test('silueta: reglas de drop, cadera y pierna', () => {
  assert.equal(silhouette(withMeasures({ pecho: 104, cintura: 84 }))!.shape, 'v')
  assert.equal(silhouette(withMeasures({ pecho: 100, cintura: 88 }))!.shape, 'equilibrada')
  assert.equal(silhouette(withMeasures({ pecho: 96, cintura: 92 }))!.shape, 'recta')
  assert.equal(silhouette(withMeasures({ pecho: 96, cintura: 100 }))!.shape, 'cintura')
  assert.equal(silhouette(withMeasures({ pecho: 96, cintura: 88, cadera: 101 }))!.hips, true)
  const short = silhouette(withMeasures({ pecho: 100, cintura: 88, entrepierna: 74 }, { profile: { height_cm: 180 } }))!
  assert.equal(short.legs, 'cortas')
  const f = find(buildFindings(withMeasures({ pecho: 100, cintura: 88, entrepierna: 74 }, { profile: { height_cm: 180 } })), 'proporciones')
  assert.match(f.body, /Silueta equilibrada \(pecho − cintura = 12 cm\) y piernas cortas/)
  assert.match(f.action, /tiro medio-alto/)
  assert.ok(f.why.includes(RULES.drop.text) && f.why.includes(RULES.pierna.text))
  assert.equal(silhouette(withMeasures({ pecho: 100 })), null)
})

test('confianza: medidas validadas → alta; sin validar → media', () => {
  const b = withMeasures({ pecho: 104, cintura: 84 })
  assert.equal(find(buildFindings({ ...b, validated: { ...b.validated, a2: true } }), 'proporciones').confidence, 'alta')
  assert.equal(find(buildFindings({ ...b, validated: { ...b.validated, a2: false } }), 'proporciones').confidence, 'media')
})

test('colorimetria: deduce el subtono de las pistas si no se declara (hipotesis)', () => {
  const b = sampleBundle({ color: { vein_color: 'Azuladas o violetas', metal: 'Plata', hair_color: 'Negro', skin_tone: 'Clara' } })
  const c = colorimetry(b)
  assert.equal(c.temp, 'Fría'); assert.equal(c.declared, undefined); assert.equal(c.contrast, 'Alto')
  const f = find(buildFindings(b), 'colorimetria')
  assert.equal(f.confidence, 'baja'); assert.equal(f.origin, 'Deducido de tus respuestas')
  assert.match(f.body, /Subtono frío, contraste alto/); assert.match(f.action, /tarjeta «Temperatura cromática»/)
})

test('colorimetria: avisa si lo declarado contradice las pistas', () => {
  const f = find(buildFindings(sampleBundle({ color: { temperature: 'Fría', vein_color: 'Verdosas', metal: 'Oro' } })), 'colorimetria')
  assert.match(f.body, /Ojo: tus pistas apuntan a cálida/); assert.equal(f.confidence, 'baja')
})

test('paleta: respeta lo que evitas y manda lejos de la cara lo que te gusta y no te favorece', () => {
  const f = find(buildFindings(sampleBundle({ color: { temperature: 'Cálida', avoids: ['Mostaza'], likes: ['Azul claro'] } })), 'paleta')
  const groups = (f.details as { groups: Record<string, string[]> }).groups
  assert.ok(!Object.values(groups).flat().includes('Mostaza'))
  assert.match(f.why, /He quitado lo que evitas \(mostaza\)/)
  assert.match(f.action, /Azul claro te gusta: llévalo lejos de la cara/)
  assert.ok(groups.neutros.length >= 3 && groups.cara.length >= 3)
})

test('cortes con precaucion: cruza preferencias con silueta y respeta los limites', () => {
  const b = withMeasures({ pecho: 96, cintura: 100 }, { fit: { prefs: { camisetas: 'Ajustada', pantalones: 'Amplio', camisas: 'Oversize' } } })
  const f = find(buildFindings(b), 'precaucion')
  assert.match(f.body, /volumen amplio arriba y abajo/i); assert.match(f.body, /marcan la cintura/)
  const g = find(buildFindings(sampleBundle({ style: { styles: ['Workwear'], never_wear: 'Pantalón pitillo' } })), 'precaucion')
  assert.match(g.action, /nada de pantalón pitillo/)
})

test('vida y prioridades: formalidad, clima, lavado y reparto que no suma 100', () => {
  const b = sampleBundle({ life: { life: { trabajo: 50, ocio: 20 }, work_formality: 'Muy formal (traje)', climate: 'Frío y húmedo', laundry: 'Cada dos semanas o más' } })
  const fs = buildFindings(b)
  const v = find(fs, 'vida')
  assert.match(v.body, /suma 70 %/); assert.match(v.action, /Dos trajes/); assert.match(v.action, /impermeable/); assert.match(v.action, /10 o más camisetas/)
  assert.ok(v.missing.includes('Ajustar el reparto a 100 %'))
  const p = find(fs, 'prioridades')
  assert.match(p.body, /^1\. Inventariar/); assert.match(p.body, /2\. Cubrir el trabajo/)
})

test('observaciones de la IA: nunca superan confianza media y van a su seccion', () => {
  const fs = buildFindings(sampleBundle({ observations: [
    { title: 'Hombros rectos', body: 'Se ven rectos', confidence: 'alta', area: 'antropometria', source_photo: 'frontal', justification: 'Linea de hombros' },
    { title: 'Contraste', body: 'Contraste alto', confidence: 'media', area: 'colorimetria', source_photo: 'rostro', justification: 'Pelo oscuro' },
  ] }))
  assert.equal(find(fs, 'ia:Hombros rectos').confidence, 'media'); assert.equal(find(fs, 'ia:Hombros rectos').section, 'cuerpo')
  assert.equal(find(fs, 'ia:Contraste').confidence, 'baja'); assert.equal(find(fs, 'ia:Contraste').section, 'color')
})

test('determinista: los mismos datos producen exactamente el mismo diagnostico', () => {
  assert.deepEqual(buildFindings(EXAMPLE), buildFindings(structuredClone(EXAMPLE)))
})
