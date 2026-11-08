import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COLOR_NAMES } from '@/lib/profile/questionnaire'
import { BRAND_UNIVERSES, ELEMENT_IDS, STYLE_CATALOG, STYLE_GROUPS, styleIdFromName } from '@/lib/style/catalog'
import { GARMENT_HEX, OUTFITS, RATINGS, normRating, outfitById, outfitSvg, outfitsOf } from '@/lib/style/references'
import { MIN_RATED, declaredOf, evolution, infer, signalsFrom, snapshotOf, styleFit, styleProfile, styleProfileOf, toPercents } from '@/lib/style/dna'
import { buildIdentity } from '@/lib/style/identity'
import { discoveryOrder, quickDiscovery } from '@/lib/style/view'
import { buildFindings } from '@/lib/profile/blueprint'
import { describeArea } from '@/lib/profile/summary'
import { filled } from '@/lib/profile/data'
import { sampleBundle } from './helpers'

const rate = (pairs: [string, string, string[]?][]) => pairs.map(([reference_id, rating, liked_elements]) => ({ reference_id, rating, liked_elements: liked_elements ?? [] }))
const form = (entries: [string, string][]) => { const f = new FormData(); for (const [k, v] of entries) f.append(k, v); return f }
const ids = new Set(STYLE_CATALOG.map((s) => s.id))

// ── Catalogo ──
test('catalogo: 30 estilos en los 4 grupos de la propuesta, con todos los campos y referencias validas', () => {
  assert.equal(STYLE_CATALOG.length, 30)
  assert.deepEqual(STYLE_GROUPS.map((g) => STYLE_CATALOG.filter((s) => s.group === g.id).length), [10, 6, 7, 7])
  assert.equal(ids.size, STYLE_CATALOG.length)
  for (const s of STYLE_CATALOG) {
    for (const k of ['traits', 'silhouettes', 'garments', 'footwear', 'palette', 'related', 'elements'] as const) assert.ok(s[k].length > 0, `${s.id}.${k} vacio`)
    assert.ok(s.description.length > 20)
    for (const r of s.related) assert.ok(ids.has(r) && r !== s.id, `${s.id}: relacionado ${r} no existe`)
    for (const c of s.palette) assert.ok((COLOR_NAMES as readonly string[]).includes(c), `${s.id}: color ${c}`)
    for (const e of s.elements) assert.ok(ELEMENT_IDS.includes(e), `${s.id}: elemento ${e}`)
  }
  for (const n of ['Urban casual', 'Clean cani', 'Modern cani', 'Quiet luxury', 'Grunge moderno', 'Editorial casual']) assert.ok(STYLE_CATALOG.some((s) => s.name === n), n)
})

test('catalogo: los nombres de versiones anteriores se traducen a ids del catalogo', () => {
  assert.equal(styleIdFromName('Casual sofisticado'), 'elevated-casual')
  assert.equal(styleIdFromName('Preppy / Ivy League'), 'preppy-contemporaneo')
  assert.equal(styleIdFromName('Clean cani'), 'clean-cani')
  assert.equal(styleIdFromName('Inventado'), undefined)
})

test('marcas: son inspiracion con rasgos y estilos afines validos, no estilos', () => {
  for (const n of ['Urban Outfitters', 'Zara', 'Massimo Dutti', 'COS', 'Weekday', 'Bershka', 'Pull&Bear']) assert.ok(BRAND_UNIVERSES.some((b) => b.name === n), n)
  for (const b of BRAND_UNIVERSES) {
    assert.ok(!ids.has(b.id), `${b.id} no puede ser tambien un estilo`)
    for (const e of b.elements) assert.ok(ELEMENT_IDS.includes(e))
    for (const s of Object.keys(b.styles)) assert.ok(ids.has(s), `${b.id}: ${s}`)
  }
})

// ── Galeria ──
test('galeria: al menos dos conjuntos por estilo, ids historicos conservados y etiquetas derivadas validas', () => {
  for (const s of STYLE_CATALOG) assert.ok(outfitsOf(s.id).length >= 2, `${s.name} con menos de 2 conjuntos`)
  assert.equal(new Set(OUTFITS.map((o) => o.id)).size, OUTFITS.length)
  for (const id of ['clasico-1', 'sofisticado-1', 'oldmoney-2', 'street-1', 'italiana-2']) assert.ok(outfitById(id), id)
  for (const o of OUTFITS) {
    assert.ok(ids.has(o.style), `${o.id}: estilo ${o.style}`)
    for (const c of o.colors) assert.ok((COLOR_NAMES as readonly string[]).includes(c), `${o.id}: color ${c}`)
    for (const e of o.elements) assert.ok(ELEMENT_IDS.includes(e), `${o.id}: elemento ${e}`)
    for (const c of [o.top.color, o.top.collar, o.outer?.color, o.bottom.color, o.shoes.color].filter(Boolean) as string[]) assert.ok(GARMENT_HEX[c], `${o.id}: sin muestra para ${c}`)
  }
  const cani = outfitById('cleancani-1')!
  for (const e of ['tracksuit', 'leg-jogger', 'runner', 'chain', 'crossbody', 'technical']) assert.ok(cani.elements.includes(e as never), `cleancani-1 sin ${e}`)
  assert.ok(outfitById('urbanmin-1')!.elements.includes('monochrome'))
  assert.ok(outfitById('hiphop-1')!.elements.includes('leg-baggy'))
})

test('ilustraciones: SVG valido, accesible y con patrones de id unico por conjunto', () => {
  for (const o of OUTFITS) {
    const svg = outfitSvg(o)
    assert.match(svg, /^<svg [^>]*viewBox="0 0 160 300" role="img" aria-label="[^"]+">/)
    assert.doesNotMatch(svg, /undefined|NaN/, o.id)
    for (const m of svg.matchAll(/pattern id="([^"]+)"/g)) assert.ok(m[1].includes(o.id))
  }
})

test('escala de valoracion: las seis opciones de BIS 1 y conversion de las antiguas', () => {
  assert.deepEqual(RATINGS.map((r) => r.label), ['Me encanta', 'Me gusta', 'Me representa', 'Me gusta, pero no me lo pondría', 'No me gusta', 'Me gusta algún elemento, pero no el conjunto'])
  assert.equal(normRating('aspire'), 'represents'); assert.equal(normRating('never'), 'dislike'); assert.equal(normRating('love'), 'love')
})

// ── Inferencia ──
test('inferencia: una sola valoracion no crea un patron; dos conjuntos si', () => {
  const one = infer(signalsFrom(rate([['hiphop-1', 'love']]), []))
  assert.equal(one.patterns.length, 0); assert.equal(one.enough, false); assert.deepEqual(one.proposal, [])
  const two = infer(signalsFrom(rate([['hiphop-1', 'love'], ['hiphop-2', 'love'], ['street-1', 'like'], ['clasico-1', 'dislike']]), []))
  assert.ok(two.patterns.some((p) => p.element === 'leg-baggy' && p.kind === 'prefiere' && p.evidence === 2))
  assert.equal(two.proposal[0].style, 'hip-hop-inspired')
  assert.equal(two.proposal.reduce((a, x) => a + x.weight, 0), 100)
  assert.ok(two.proposal.every((x) => x.weight % 5 === 0))
})

test('inferencia: admirar no es querer vestirlo, y «algun elemento» cuenta solo lo marcado', () => {
  const r = infer(signalsFrom(rate([['oldmoney-1', 'admire'], ['oldmoney-2', 'admire'], ['urbancas-1', 'like'], ['urbancas-2', 'like'],
    ['cleancani-1', 'element', ['chain', 'crossbody', 'inventado']], ['cleancani-2', 'element', ['crossbody']]]), []))
  assert.ok(!r.proposal.some((x) => x.style === 'old-money'))
  assert.deepEqual(r.admiredStyles, ['old-money'])
  assert.ok(!r.proposal.some((x) => x.style === 'clean-cani')) // el conjunto no gusta
  assert.ok(r.patterns.some((p) => p.element === 'crossbody' && p.kind === 'prefiere'))
  assert.ok(!r.patterns.some((p) => p.element === 'leg-jogger'))
})

test('inferencia: lo que se rechaza en varios conjuntos se convierte en «evita»; las marcas orientan sin crear patrones', () => {
  const r = infer(signalsFrom(rate([['hiphop-1', 'dislike'], ['hiphop-2', 'dislike'], ['clasico-1', 'love'], ['clasico-2', 'like']]), []), ['bershka'])
  assert.ok(r.patterns.some((p) => p.element === 'leg-baggy' && p.kind === 'evita'))
  assert.ok(r.rejectedStyles.includes('hip-hop-inspired'))
  const brandOnly = infer(signalsFrom(rate([['clasico-1', 'like'], ['clasico-2', 'like'], ['smart-1', 'like'], ['smart-2', 'like']]), []), ['urban-outfitters'])
  assert.ok(brandOnly.proposal.some((x) => x.style === 'urban-vintage'))
  assert.ok(!brandOnly.patterns.some((p) => p.element === 'vintage'))
})

test('inferencia: referencias propias etiquetadas por la IA cuentan con sus elementos', () => {
  const r = infer(signalsFrom([], [
    { rating: null, ai_tags: { style: 'Clean cani', fit: 'regular', structure: 'relajado', formality: 1, colors: ['Negro'], elements: ['tracksuit', 'runner', 'xx'] } },
    { rating: 'love', ai_tags: { style: 'clean-cani', fit: 'regular', structure: 'relajado', formality: 1, colors: ['Negro'], elements: ['tracksuit', 'runner'] } },
    { rating: 'love', ai_tags: { style: 'Modern cani', elements: ['runner'], colors: [] } }, { rating: 'like', ai_tags: { style: 'Sporty urban', elements: ['runner'], colors: [] } },
  ]))
  assert.equal(r.own, 4); assert.equal(r.proposal[0].style, 'clean-cani')
  assert.ok(r.patterns.some((p) => p.element === 'runner' && p.evidence === 4))
})

test('toPercents: reparte 100 en multiplos de 5 entre los cuatro primeros', () => {
  const p = toPercents([['a', 7], ['b', 3], ['c', 1], ['d', 0.5], ['e', 0.2], ['f', -2]])
  assert.equal(p.length, 4); assert.equal(p.reduce((s, x) => s + x.weight, 0), 100); assert.equal(p[0].style, 'a')
})

// ── Identidad declarada ──
test('identidad: valida estilos, deja un solo principal, avisa si no suma 100 y resuelve contradicciones', () => {
  const v = buildIdentity(form([
    ['inf_style', 'urban-casual'], ['inf_role', 'principal'], ['inf_weight', '45'],
    ['inf_style', 'clean-cani'], ['inf_role', 'principal'], ['inf_weight', '30'],
    ['inf_style', 'inventado'], ['inf_role', 'secundario'], ['inf_weight', '10'],
    ['inf_style', 'minimalismo-contemporaneo'], ['inf_role', 'influencia'], ['inf_weight', '150'],
    ['liked', 'leg-wide'], ['liked', 'chain'], ['rejected', 'chain'], ['rejected', 'leg-slim'], ['brands', 'urban-outfitters'], ['brands', 'shein'],
  ]))
  assert.deepEqual(v.influences.map((i) => [i.style, i.role, i.weight]), [['urban-casual', 'principal', 45], ['clean-cani', 'secundario', 30], ['minimalismo-contemporaneo', 'influencia', 100]])
  assert.deepEqual(v.liked, ['leg-wide']); assert.deepEqual(v.rejected, ['leg-slim']); assert.deepEqual(v.brands, ['urban-outfitters'])
  assert.match(v.warnings.join(' '), /Solo puede haber un estilo principal/)
  assert.match(v.warnings.join(' '), /suman 175 %/)
  assert.match(v.warnings.join(' '), /preferido y rechazado a la vez/)
  const noPrincipal = buildIdentity(form([['inf_style', 'clean-cani'], ['inf_role', 'secundario'], ['inf_weight', '40'], ['inf_style', 'urban-casual'], ['inf_role', 'influencia'], ['inf_weight', '60']]))
  assert.equal(noPrincipal.influences.find((i) => i.role === 'principal')!.style, 'urban-casual')
})

test('perfil: la identidad declarada manda; sin ella se usa la propuesta y se marca como tal', () => {
  const ratings = rate([['hiphop-1', 'love'], ['hiphop-2', 'love'], ['street-1', 'like'], ['street-2', 'like']])
  const proposal = styleProfileOf({ style: {}, refRatings: ratings })
  assert.equal(proposal.identity.source, 'propuesta'); assert.equal(proposal.identity.principal, 'hip-hop-inspired')
  const declared = styleProfileOf({ style: { influences: [{ style: 'urban-casual', role: 'principal', weight: 45 }, { style: 'clean-cani', role: 'secundario', weight: 30 }, { style: 'urban-vintage', role: 'influencia', weight: 25 }], rejected_elements: ['leg-baggy'] }, refRatings: ratings })
  assert.equal(declared.identity.source, 'declarada'); assert.equal(declared.identity.principal, 'urban-casual'); assert.deepEqual(declared.identity.secondaries, ['clean-cani'])
  // el usuario rechaza el baggy aunque sus valoraciones lo prefieran: no aparece como preferido inferido
  assert.ok(!declared.elements.liked.some((e) => e.element === 'leg-baggy'))
  assert.ok(declared.elements.rejected.some((e) => e.element === 'leg-baggy' && e.source === 'declarado'))
  assert.ok(declared.inferred.patterns.some((p) => p.element === 'leg-baggy')) // lo inferido se conserva, separado
})

test('styleFit: puntua con la identidad hibrida, combina secundarios y explica por que', () => {
  const p = styleProfile(declaredOf({ influences: [{ style: 'urban-casual', role: 'principal', weight: 45 }, { style: 'clean-cani', role: 'secundario', weight: 30 }], liked_elements: ['crossbody'], rejected_elements: ['leg-slim'] }), infer([]))
  const cani = styleFit(p, outfitById('cleancani-2')!)
  assert.equal(cani.match, 'clean-cani'); assert.ok(cani.score > 70); assert.match(cani.reasons.join(), /Clean cani \(30 %\)/); assert.match(cani.reasons.join(), /bandolera/)
  const related = styleFit(p, outfitById('contcas-1')!) // contemporary-casual es relacionado de urban-casual
  assert.equal(related.match, 'urban-casual'); assert.ok(related.score > 50 && related.score < cani.score)
  const indie = styleFit(p, outfitById('indie-1')!) // slim rechazado
  assert.ok(indie.score < 50); assert.match(indie.reasons.join(), /rechazas: pantalón slim/)
})

test('evolucion: detecta cambios de peso entre instantaneas', () => {
  const ch = evolution({ influences: [{ style: 'urban-casual', role: 'principal', weight: 60 }, { style: 'clean-cani', role: 'secundario', weight: 40 }] },
    { influences: [{ style: 'urban-casual', role: 'principal', weight: 45 }, { style: 'clean-cani', role: 'secundario', weight: 35 }, { style: 'urban-vintage', role: 'influencia', weight: 20 }] })
  assert.deepEqual(ch.map((c) => [c.style, c.from, c.to]), [['urban-vintage', 0, 20], ['urban-casual', 60, 45]])
})

test('descubrimiento rapido: tandas fijas de estilos distintos, grupos intercalados; avanza al completar la tanda', () => {
  const first = quickDiscovery(new Set(), 12)
  assert.equal(first.length, 12); assert.equal(new Set(first.map((o) => o.style)).size, 12)
  assert.equal(new Set(first.slice(0, 4).map((o) => STYLE_CATALOG.find((s) => s.id === o.style)!.group)).size, 4)
  assert.deepEqual(quickDiscovery(new Set([first[0].id, first[5].id]), 12).map((o) => o.id), first.map((o) => o.id)) // no se reordena al valorar
  const second = quickDiscovery(new Set(first.map((o) => o.id)), 12)
  assert.ok(second.every((o) => !first.includes(o)))
  assert.equal(discoveryOrder().length, OUTFITS.length)
})

// ── Integracion ──
test('diagnostico: Dirección de estilo usa la identidad; Style DNA separa lo inferido, detecta choques y evolucion', () => {
  const style = { dims: {}, influences: [{ style: 'classic-contemporary', role: 'principal', weight: 60 }, { style: 'quiet-luxury', role: 'secundario', weight: 40 }], identity_version: 3 }
  const ratings = rate([['hiphop-1', 'love'], ['hiphop-2', 'love'], ['street-1', 'love'], ['street-2', 'like'], ['clasico-1', 'admire']])
  const b = sampleBundle({ style, refRatings: ratings })
  const fs = buildFindings(b)
  const dir = fs.find((f) => f.key === 'direccion')!
  assert.match(dir.body, /^Classic contemporary \(60 %\) como base, con Quiet luxury \(40 %\)/)
  assert.match(dir.why, /identidad que construiste \(versión 3\)/); assert.equal(dir.origin, 'Declarado por ti')
  const dna = fs.find((f) => f.key === 'dna')!
  assert.equal(dna.origin, 'Inferido de tus valoraciones')
  assert.match(dna.why, /Ojo: declaraste classic contemporary como principal, pero tus valoraciones apuntan a hip-hop inspired/)
  assert.match(dna.why, /Admiras sin querer llevarlo: classic contemporary/)
  // evolucion: con una version anterior cuya instantanea era distinta
  const prev = { id: 'bp1', version: 1, created_at: '2026-11-01', validated_areas: 0, findings: [{ key: 'dna', details: snapshotOf(styleProfileOf({ style: { influences: [{ style: 'hip-hop-inspired', role: 'principal', weight: 100 }] } })) }] }
  const dna2 = buildFindings({ ...b, blueprints: [prev] }).find((f) => f.key === 'dna')!
  assert.match(dna2.why, /Desde la v1: .*hip-hop inspired 100 % → 0 %/)
  assert.ok((dna2.details as { influences: unknown[] }).influences.length === 2)
})

test('diagnostico: sin identidad declarada, la direccion es la propuesta (hipotesis) y pide confirmarla', () => {
  const b = sampleBundle({ style: { dims: {} }, refRatings: rate([['cleancani-1', 'love'], ['cleancani-2', 'represents'], ['moderncani-1', 'like'], ['sporty-1', 'like']]) })
  const dir = buildFindings(b).find((f) => f.key === 'direccion')!
  assert.equal(dir.confidence, 'baja'); assert.equal(dir.origin, 'Inferido de tus valoraciones')
  assert.match(dir.body, /^Clean cani/); assert.match(dir.action, /Confírmala o ajústala/)
  assert.ok(dir.missing.includes('Confirmar tu identidad'))
  assert.equal(filled('a4', b), true)
})

test('diagnostico: con pocas valoraciones el Style DNA es sin_datos y lo dice', () => {
  const dna = buildFindings(sampleBundle({ refRatings: rate([['clasico-1', 'love']]) })).find((f) => f.key === 'dna')!
  assert.equal(dna.confidence, 'sin_datos'); assert.match(dna.missing.join(), new RegExp(`al menos ${MIN_RATED}`))
})

test('chat: recibe la identidad declarada y lo inferido por separado', () => {
  const b = sampleBundle({ style: { dims: {}, influences: [{ style: 'urban-casual', role: 'principal', weight: 70 }, { style: 'clean-cani', role: 'influencia', weight: 30 }], identity_version: 1, liked_elements: ['crossbody'], brand_refs: ['urban-outfitters'] },
    refRatings: rate([['hiphop-1', 'love'], ['hiphop-2', 'love'], ['street-1', 'like'], ['street-2', 'like']]) })
  const lines = describeArea('a4', b)
  assert.ok(lines.includes('Identidad declarada (versión 1): Urban casual 70 % (principal), Clean cani 30 % (influencia). Los % son orientativos, no una restricción.'))
  assert.ok(lines.includes('Elementos que declara que le gustan: Bandolera'))
  assert.ok(lines.includes('Marcas de referencia (inspiración, no estilos): Urban Outfitters'))
  assert.match(lines.find((l) => l.startsWith('INFERIDO'))!, /INFERIDO de 4 valoraciones \(no declarado\): apunta a Hip-hop inspired/)
})
