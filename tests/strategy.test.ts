import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Bundle } from '@/lib/profile/data'
import { evaluateGarment } from '@/lib/wardrobe/compatibility'
import { analyzeWardrobe } from '@/lib/stylist/wardrobe'
import { buildStrategy, strategyFingerprint, trendTraits, MODES } from '@/lib/stylist/strategy'

const NOW = new Date('2026-11-10T12:00:00Z')
const bundle = (o: { style?: Record<string, unknown>; temp?: string | null; experimentation?: string | null; measures?: Record<string, number> } = {}): Bundle => ({
  profile: { fit_pref: 'Regular', budget_max: 90 }, photos: [],
  measures: Object.fromEntries(Object.entries(o.measures ?? { pecho: 104, cintura: 82 }).map(([k, v]) => [k, { value: v, at: '2026-01-01', source: 'manual' }])),
  color: o.temp === null ? { likes: [], avoids: [] } : { temperature: o.temp ?? 'Cálida', temperature_source: 'usuario', temperature_status: 'validado', likes: [], avoids: [] },
  style: o.style ?? { influences: [{ style: 'clean-streetwear', role: 'principal', weight: 70 }, { style: 'urban-casual', role: 'secundario', weight: 30 }] },
  life: { life: { ocio: 100 }, climate: 'Cuatro estaciones marcadas', constraints: [] },
  fit: { prefs: {} }, goals: { experimentation: o.experimentation === undefined ? 'Abierto' : o.experimentation }, validated: { a3: true, a4: true }, observations: [], blueprints: [], garments: [], references: [], refRatings: [], styleRefs: [], colorAnalyses: [], chatValidated: false,
} as unknown as Bundle)
let k = 0
const G = (name: string, category: string, subcategory: string, c: string, x: Record<string, unknown> = {}) => ({ id: `00000000-0000-4000-8000-${String(++k).padStart(12, '5')}`, name, category, subcategory, primary_color: c, formality_level: 2, wardrobe_status: 'active', pattern: 'Liso', occasions: ['ocio'], seasons: ['primavera', 'otono', 'invierno'], silhouette: 'Regular', ...x })
const tenStraight = () => [
  ...['Gris', 'Negro', 'Azul marino', 'Beige', 'Gris', 'Negro', 'Azul marino', 'Beige', 'Antracita', 'Denim'].map((c, i) => G(`Pantalón ${i}`, 'bottom', i === 9 ? 'jeans' : 'chinos', c, { cut: 'Recto' })),
  G('Camiseta blanca', 'top', 'tee', 'Blanco'), G('Camiseta negra', 'top', 'tee', 'Negro'), G('Sudadera gris', 'top', 'sweatshirt', 'Gris'), G('Camisa azul', 'top', 'shirt', 'Azul marino'),
  G('Zapatilla blanca', 'footwear', 'sneakers', 'Blanco'), G('Mocasín marrón', 'footwear', 'loafers', 'Marrón'),
]
const S = (id: string, name: string, description: string, x: Record<string, unknown> = {}) => ({ id, key: id, name, description, dimension: 'silhouette', kind: 'tendencia_editorial', stage: 'estacional', confidence: 'alta', source_count: 4, presence: { products: 30, brands: 20, websites: 8 }, ...x })
const run = (b = bundle(), signals: Record<string, unknown>[] = [], gs = tenStraight()) => {
  const evals = new Map(gs.map((g) => [g.id, evaluateGarment(g as never, b, { others: gs as never, imageCount: 1 })]))
  const analysis = analyzeWardrobe({ garments: gs, evals, bundle: b, now: NOW })
  return { analysis, s: buildStrategy({ analysis, signals, bundle: b, garments: gs, evals, now: NOW }) }
}
const WIDE = S('t-wide', 'Pantalón amplio con caída', 'Pantalones de pierna amplia y caída fluida con prendas superiores limpias.')

test('la oportunidad nace del razonamiento: con 10 pantalones rectos propone una silueta nueva, respaldada por el mercado', () => {
  const { s } = run(bundle(), [WIDE])
  const o = s.opportunities.find((x) => x.key === 'el:leg-wide')!
  assert.ok(o, 'oportunidad de silueta'); assert.equal(o.target!.category, 'bottom'); assert.equal(o.target!.cut, 'Wide')
  assert.equal(o.mode, 'expansion', 'nueva silueta compatible con su identidad')
  assert.match(o.diagnosis, /la categoría está cubierta, pero la silueta no varía/)
  assert.equal(o.market!.name, 'Pantalón amplio con caída'); assert.equal(o.scores.fashion_relevance, 85)
  assert.ok(o.scores.personal_suitability >= 70 && o.scores.stylistic_impact >= 80)
  assert.ok(o.profile_relation.some((r) => /Clean streetwear/.test(r)) && o.profile_relation.some((r) => /silueta \(v\)/.test(r)))
  assert.ok(o.benefits.length && o.drawbacks.length && o.sources.includes('tendencia:t-wide'))
  assert.equal(s.opportunities[0].key, 'el:leg-wide', 'es la prioridad')
  assert.ok(!s.opportunities.some((x) => x.key !== o.key && x.market?.name === WIDE.name), 'la tendencia no se duplica como otra oportunidad')
  assert.match(s.direction, /Desarrollar Clean streetwear/)
})

test('sin tendencias también hay estrategia: vestir bien no es estar a la moda', () => {
  const { s } = run(bundle(), [])
  const o = s.opportunities.find((x) => x.key === 'el:leg-wide')!
  assert.equal(o.market, null); assert.equal(o.scores.fashion_relevance, null)
  assert.equal(s.market_level, 'sin señales de mercado')
})

test('una tendencia no se convierte automáticamente en recomendación: rechazos explicados', () => {
  const b = bundle({ temp: 'Fría', style: { influences: [{ style: 'clean-streetwear', role: 'principal', weight: 100 }], rejected_elements: ['cargo'] } })
  const signals = [
    S('t-cargo', 'Cargo técnico', 'Pantalones cargo con bolsillos.'),
    S('t-sat', 'Pitillo', 'Pantalones slim muy ajustados.', { stage: 'saturada' }),
    S('t-one', 'Chaleco de punto', 'Chalecos de punto.', { kind: 'propuesta_editorial', source_count: 1 }),
    S('t-camel', 'Camel total', 'Conjuntos en camel de la cabeza a los pies.', { dimension: 'color' }),
    S('t-tee', 'Camisetas básicas', 'Camisetas básicas como base.', { dimension: 'garment' }),
    S('t-vague', 'Actitud relajada', 'Una forma más relajada de vestir.', { dimension: 'aesthetic' }),
  ]
  const { s } = run(b, signals)
  const why = (id: string) => s.rejected.find((r) => r.key.includes(id))?.reason ?? ''
  assert.match(why('t-cargo'), /rechazas/); assert.match(why('t-sat'), /saturada o en declive/); assert.match(why('t-one'), /una fuente/)
  assert.match(why('t-camel'), /te favorece poco/); assert.match(why('t-tee'), /Ya tienes 2 prendas/); assert.match(why('t-vague'), /No se traduce/)
  assert.ok(s.rejected.some((r) => r.source === 'armario' && /Otra prenda de este tipo/.test(r.reason)), 'las redundancias también frenan compras')
  for (const id of ['t-cargo', 't-sat', 't-one', 't-camel', 't-tee', 't-vague']) assert.ok(!s.opportunities.some((o) => o.sources.includes(`tendencia:${id}`)))
})

test('el grado de experimentación ordena, no prohíbe: la exploración existe para todos y sube con Explorador', () => {
  const far = S('t-varsity', 'Cazadora varsity', 'Cazadoras varsity universitarias.', { dimension: 'outerwear' })
  const cons = run(bundle({ experimentation: 'Conservador' }), [WIDE, far]).s, expl = run(bundle({ experimentation: 'Explorador' }), [WIDE, far]).s
  const oc = cons.opportunities.find((o) => o.sources.includes('tendencia:t-varsity')), oe = expl.opportunities.find((o) => o.sources.includes('tendencia:t-varsity'))
  assert.ok(oc && oe, 'presente en ambos'); assert.equal(oc!.mode, oe!.mode)
  assert.ok(oe!.priority > oc!.priority, `${oe!.priority} > ${oc!.priority}`)
  assert.ok(cons.opportunities.indexOf(oc!) >= expl.opportunities.indexOf(oe!))
  assert.deepEqual(MODES.map((m) => m.id), ['evolution', 'expansion', 'exploration'])
})

test('puede concluir que no hace falta comprar: si el armario ya resuelve, lo dice', () => {
  const { analysis } = run()
  const b = bundle()
  const only = { ...analysis, findings: analysis.findings.filter((f) => f.kind === 'strength').concat([{ key: 'underused', kind: 'underused_potential', title: 'Potencial', diagnosis: 'Tienes prendas con potencial que no usas: Jersey (combina con 9).', direction: 'Antes de comprar, construye conjuntos con ellas.', evidence: { garment_ids: [], facts: [] }, data_used: ['Uso'], missing: [], confidence: 'alta', weight: 6 }]) }
  const s = buildStrategy({ analysis: only as never, signals: [], bundle: b, garments: tenStraight(), evals: new Map(), now: NOW })
  assert.equal(s.no_purchase_needed, true); assert.match(s.direction, /No hace falta comprar nada ahora/)
  assert.ok(s.opportunities.every((o) => !o.purchase)); assert.ok(s.opportunities.some((o) => o.title === 'Activa lo que ya tienes'))
})

test('cada oportunidad trae diagnóstico, evidencias, relación con el perfil, mercado, propuesta, beneficios, inconvenientes, confianza y prioridad', () => {
  const { s } = run(bundle(), [WIDE, S('t-suede', 'Ante en prendas exteriores', 'Sobrecamisas y chaquetas de ante para hombre.', { dimension: 'material' })])
  assert.ok(s.opportunities.length >= 2)
  for (const o of s.opportunities) {
    assert.ok(o.title && o.diagnosis && o.proposal && ['alta', 'media', 'baja'].includes(o.confidence) && o.priority >= 0 && o.priority <= 100, o.key)
    assert.ok(Array.isArray(o.benefits) && Array.isArray(o.drawbacks) && Array.isArray(o.profile_relation) && o.sources.length, o.key)
    assert.ok('market' in o && typeof o.scores.personal_suitability === 'number' && typeof o.scores.stylistic_impact === 'number')
  }
  assert.ok(s.opportunities.every((o, i, xs) => i === 0 || xs[i - 1].priority >= o.priority))
  assert.deepEqual(trendTraits('Sobrecamisas y chaquetas de ante').materials, ['ante'])
  assert.ok(trendTraits("Men's wide-leg trousers").elements.includes('leg-wide'))
  assert.ok(trendTraits('Chaquetas boxy oversize').elements.includes('top-oversize'))
})

test('la huella de la estrategia cambia con el armario, las tendencias, la identidad o la experimentación', () => {
  const b = bundle()
  const base = strategyFingerprint('w1', 'r1', b)
  assert.equal(base, strategyFingerprint('w1', 'r1', bundle()))
  assert.notEqual(base, strategyFingerprint('w2', 'r1', b)); assert.notEqual(base, strategyFingerprint('w1', 'r2', b)); assert.notEqual(base, strategyFingerprint('w1', null, b))
  assert.notEqual(base, strategyFingerprint('w1', 'r1', bundle({ experimentation: 'Explorador' })))
})
