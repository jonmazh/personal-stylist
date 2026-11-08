import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STYLES } from '@/lib/profile/areas'
import { COLOR_NAMES } from '@/lib/profile/questionnaire'
import { GARMENT_HEX, OUTFITS, RATINGS, outfitSvg } from '@/lib/style/references'
import { MIN_RATED, signalsFrom, styleDNA } from '@/lib/style/dna'
import { buildFindings } from '@/lib/profile/blueprint'
import { describeArea } from '@/lib/profile/summary'
import { filled } from '@/lib/profile/data'
import { sampleBundle } from './helpers'

const rate = (pairs: [string, string][]) => pairs.map(([reference_id, rating]) => ({ reference_id, rating }))

test('catalogo: ids unicos, al menos dos conjuntos por estilo y colores validos', () => {
  assert.equal(new Set(OUTFITS.map((o) => o.id)).size, OUTFITS.length)
  for (const st of STYLES) assert.ok(OUTFITS.filter((o) => o.style === st).length >= 2, `${st} con menos de 2 conjuntos`)
  for (const o of OUTFITS) {
    for (const c of o.colors) assert.ok((COLOR_NAMES as readonly string[]).includes(c), `${o.id}: color ${c} fuera de la paleta`)
    for (const c of [o.top.color, o.top.collar, o.outer?.color, o.bottom.color, o.shoes.color].filter(Boolean) as string[]) assert.ok(GARMENT_HEX[c], `${o.id}: sin muestra para ${c}`)
  }
  assert.deepEqual(RATINGS.map((r) => r.label), ['Me encanta', 'Me gusta', 'Me gustaría conseguir algo parecido', 'Me gusta, pero no para mí', 'No me lo pondría'])
})

test('ilustraciones: cada conjunto genera un SVG valido y accesible', () => {
  for (const o of OUTFITS) {
    const svg = outfitSvg(o)
    assert.match(svg, /^<svg [^>]*viewBox="0 0 160 300" role="img" aria-label="[^"]+">/)
    assert.doesNotMatch(svg, /undefined|NaN/, o.id)
    assert.ok(svg.endsWith('</svg>'))
    assert.ok((svg.match(/<polygon/g) ?? []).length >= 5, `${o.id} con pocas formas`)
  }
})

test('Style DNA: pondera las valoraciones y separa aspiraciones, admiracion y descartes', () => {
  const dna = styleDNA(signalsFrom(rate([['clasico-1', 'love'], ['clasico-2', 'like'], ['sofisticado-1', 'like'], ['oldmoney-2', 'aspire'], ['street-1', 'never'], ['italiana-2', 'admire']]), []))
  assert.equal(dna.rated, 6)
  assert.equal(dna.topStyles[0], 'Clásico contemporáneo') // 2 + 1
  assert.deepEqual(dna.avoidStyles, ['Streetwear contemporáneo'])
  assert.deepEqual(dna.aspire, ['Old money'])
  assert.deepEqual(dna.admire, ['Elegancia italiana'])
  assert.ok(!dna.topStyles.includes('Elegancia italiana')) // admirar no suma
  assert.equal(dna.structure, 'estructurado')
  assert.ok(dna.colors.includes('Azul marino'))
  assert.ok(dna.formality! >= 3.5 && dna.formality! <= 4.5)
})

test('Style DNA: las referencias propias analizadas cuentan (sin valorar = «Me gusta»)', () => {
  const dna = styleDNA(signalsFrom([], [
    { rating: null, ai_tags: { style: 'Workwear', fit: 'amplio', structure: 'relajado', formality: 2, colors: ['Oliva'] } },
    { rating: 'love', ai_tags: { style: 'Workwear', fit: 'amplio', structure: 'relajado', formality: 1, colors: ['Oliva', 'Marrón'] } },
    { rating: 'love', ai_tags: null }, // sin analizar: no cuenta
  ]))
  assert.equal(dna.rated, 2); assert.equal(dna.own, 2)
  assert.deepEqual(dna.topStyles, ['Workwear']); assert.equal(dna.fit, 'amplio'); assert.equal(dna.colors[0], 'Oliva')
})

test('diagnostico: Style DNA con pocas valoraciones es sin_datos; con 8 aparece y detecta contradicciones', () => {
  const few = buildFindings(sampleBundle({ refRatings: rate([['clasico-1', 'love']]) })).find((f) => f.key === 'dna')!
  assert.equal(few.confidence, 'sin_datos'); assert.match(few.missing.join(), new RegExp(`al menos ${MIN_RATED}`))
  const many = sampleBundle({
    style: { styles: ['Streetwear contemporáneo'], dims: {} },
    refRatings: rate([['clasico-1', 'love'], ['clasico-2', 'love'], ['oldmoney-2', 'like'], ['preppy-1', 'like'], ['italiana-1', 'aspire'], ['street-1', 'never'], ['street-2', 'never'], ['workwear-2', 'admire']]),
  })
  const f = buildFindings(many).find((x) => x.key === 'dna')!
  assert.match(f.body, /Te atraen sobre todo clásico contemporáneo/)
  assert.match(f.why, /Ojo: marcaste streetwear contemporáneo, pero lo que eliges apunta a clásico contemporáneo/)
  assert.match(f.action, /Dejaría fuera streetwear contemporáneo/)
  assert.ok(['media', 'alta'].includes(f.confidence))
  assert.match(describeArea('a4', many).at(-1)!, /Style DNA \(de 8 referencias valoradas\): le atraen Clásico contemporáneo/)
})

test('sin estilos marcados, la direccion de estilo sale del Style DNA', () => {
  const b = sampleBundle({ style: null, refRatings: rate([['workwear-1', 'love'], ['workwear-2', 'love'], ['sofisticado-1', 'like'], ['minimal-1', 'like']]) })
  const d = buildFindings(b).find((x) => x.key === 'direccion')!
  assert.notEqual(d.confidence, 'sin_datos'); assert.match(d.body, /^Workwear/)
  assert.equal(filled('a4', b), true)
})
