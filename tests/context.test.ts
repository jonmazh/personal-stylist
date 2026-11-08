import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildContext } from '@/lib/ai/context'
import { generate, review, sampleBundle } from './helpers'

const part = (text: string, header: string) => {
  const i = text.indexOf(header)
  assert.ok(i >= 0, `falta la seccion ${header}`)
  const rest = text.slice(i + header.length)
  const j = rest.search(/\n\n[A-ZÁÉÍÓÚ ]{6,}/)
  return j < 0 ? rest : rest.slice(0, j)
}

test('el chat recibe los DATOS de las areas validadas, no solo su nombre', () => {
  const { text, hasValidated } = buildContext(sampleBundle())
  const val = part(text, 'PERFIL VALIDADO POR EL USUARIO')
  assert.match(val, /Estudio antropométrico/)
  assert.match(val, /Pecho: 104 cm \(medida por el usuario, 2026-11-01\)/)
  assert.match(val, /Reparto del armario: Trabajo 50 %/)
  assert.match(val, /Restricciones prácticas: Camino mucho/)
  assert.ok(hasValidated)
})

test('lo no validado va aparte, como provisional', () => {
  const { text } = buildContext(sampleBundle())
  const val = part(text, 'PERFIL VALIDADO POR EL USUARIO')
  const prov = part(text, 'DATOS DECLARADOS SIN VALIDAR')
  assert.doesNotMatch(val, /Temperatura/)
  assert.match(prov, /Temperatura: Cálida/)
  assert.match(prov, /Clásico ↔ Contemporáneo: 70\/100 \(tira a contemporáneo\)/)
  assert.doesNotMatch(prov, /Minimalista ↔ Expresivo: 50/) // estructurado=50 es neutro y no se envia
  assert.match(prov, /¿Qué imagen quieres proyectar\? → Una imagen limpia y profesional/)
})

test('las conclusiones revisadas siguen en el chat tras regenerar el Blueprint', () => {
  let b = generate(sampleBundle())
  b = review(b, 'Proporciones', 'confirm')
  b = review(b, 'Identidad estética', 'correct', 'Clásico relajado, nada rígido')
  b = generate(b) // antes del arreglo, esto dejaba el chat sin conclusiones validadas
  const { text } = buildContext(b)
  const rev = part(text, 'CONCLUSIONES CONFIRMADAS O CORREGIDAS POR EL USUARIO')
  assert.match(rev, /Proporciones:/)
  assert.match(rev, /Identidad estética: Clásico relajado, nada rígido \(corregida por el usuario\)/)
  const prov = part(text, 'CONCLUSIONES PROVISIONALES')
  assert.doesNotMatch(prov, /Proporciones|Identidad estética/)
  assert.match(prov, /Colorimetría: Subtono cálido/)
})

test('las conclusiones vacias no se envian como provisionales', () => {
  const b = generate(sampleBundle({ fit: null }))
  const { text } = buildContext(b)
  assert.doesNotMatch(part(text, 'CONCLUSIONES PROVISIONALES'), /Cortes que funcionan/)
  assert.match(text, /ÁREAS SIN DATOS: Preferencias de vestuario/)
})

test('perfil vacio: el chat sabe que no hay nada validado y que areas faltan', () => {
  const empty = sampleBundle({ profile: null, measures: {}, color: null, style: null, life: null, fit: null, goals: null,
    validated: { a1: false, a2: false, a3: false, a4: false, a5: false, a6: false, a7: false } })
  const { text, hasValidated } = buildContext(empty)
  assert.equal(hasValidated, false)
  assert.match(text, /\(ninguna área validada todavía\)/)
  assert.match(text, /ÁREAS SIN DATOS: Identidad y datos, Estudio antropométrico, Estudio cromático/)
})
