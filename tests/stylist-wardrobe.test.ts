import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Bundle } from '@/lib/profile/data'
import { evaluateGarment } from '@/lib/wardrobe/compatibility'
import { analyzeWardrobe, wardrobeFingerprint, EXPERIMENTATION } from '@/lib/stylist/wardrobe'
import { QUESTIONS } from '@/lib/profile/questionnaire'

const NOW = new Date('2026-11-10T12:00:00Z')
const bundle = (o: { style?: Record<string, unknown>; temp?: string | null; measures?: Record<string, number>; experimentation?: string | null } = {}): Bundle => ({
  profile: { fit_pref: 'Regular', budget_max: 90 }, photos: [],
  measures: Object.fromEntries(Object.entries(o.measures ?? { pecho: 104, cintura: 82 }).map(([k, v]) => [k, { value: v, at: '2026-01-01', source: 'manual' }])),
  color: o.temp === null ? { likes: [], avoids: [] } : { temperature: o.temp ?? 'Cálida', temperature_source: 'usuario', temperature_status: 'validado', likes: [], avoids: [] },
  style: o.style ?? { influences: [{ style: 'clean-streetwear', role: 'principal', weight: 70 }, { style: 'urban-casual', role: 'secundario', weight: 30 }] },
  life: { life: { trabajo: 50, ocio: 50 }, work_formality: 'Smart casual', climate: 'Cuatro estaciones marcadas', constraints: [] },
  fit: { prefs: { pantalones: 'Recto' } }, goals: { experimentation: o.experimentation === undefined ? 'Abierto' : o.experimentation }, validated: { a3: true, a4: true }, observations: [], blueprints: [], garments: [], references: [], refRatings: [], styleRefs: [], colorAnalyses: [], chatValidated: false,
} as unknown as Bundle)
let k = 0
const G = (name: string, category: string, subcategory: string, c: string, x: Record<string, unknown> = {}) => ({ id: `00000000-0000-4000-8000-${String(++k).padStart(12, '9')}`, name, category, subcategory, primary_color: c, formality_level: 2, wardrobe_status: 'active', pattern: 'Liso', occasions: ['trabajo', 'ocio'], seasons: ['primavera', 'otono', 'invierno'], silhouette: 'Regular', updated_at: '2026-01-01', ...x })
/** Armario con 10 pantalones, todos rectos: la categoría está cubierta, la silueta no. */
const tenStraight = () => [
  ...['Gris', 'Negro', 'Azul marino', 'Beige', 'Gris', 'Negro', 'Azul marino', 'Beige', 'Antracita', 'Denim'].map((c, i) => G(`Pantalón ${i}`, 'bottom', i === 9 ? 'jeans' : 'chinos', c, { cut: 'Recto' })),
  G('Camiseta blanca', 'top', 'tee', 'Blanco'), G('Camiseta negra', 'top', 'tee', 'Negro'), G('Sudadera gris', 'top', 'sweatshirt', 'Gris'), G('Camisa azul', 'top', 'shirt', 'Azul marino', { formality_level: 3 }),
  G('Jersey marino', 'top', 'knit', 'Azul marino', { formality_level: 3 }), G('Zapatilla blanca', 'footwear', 'sneakers', 'Blanco'), G('Mocasín marrón', 'footwear', 'loafers', 'Marrón', { formality_level: 3 }),
]
const run = (gs: Record<string, any>[], b = bundle(), extra: Record<string, unknown> = {}) => analyzeWardrobe({ garments: gs, evals: new Map(gs.map((g) => [g.id, evaluateGarment(g as never, b, { others: gs as never, imageCount: 1 })])), bundle: b, now: NOW, ...extra })

test('una carencia no es una categoría ausente: con 10 pantalones rectos detecta que falta otra silueta', () => {
  const a = run(tenStraight())
  const gap = a.findings.find((f) => f.kind === 'silhouette_gap' && f.key.startsWith('silhouette:leg'))
  assert.ok(gap, 'detecta la silueta que falta')
  assert.match(gap!.title, /amplio/i); assert.match(gap!.diagnosis, /Tienes 10 pantalones y 10 de 10 son de corte recto: la categoría está cubierta/)
  assert.match(gap!.diagnosis, /Clean streetwear/); assert.ok(gap!.evidence.garment_ids.length === 10)
  assert.ok(gap!.evidence.facts.some((x) => /Tu silueta \(v\) admite/.test(x)))
  assert.equal(gap!.confidence, 'alta')
  // Tampoco es «faltan pantalones»: si aparece, es que ninguno tiene la formalidad que pide tu trabajo
  const work = a.findings.find((f) => f.kind === 'formality_gap')
  if (work) assert.match(work.diagnosis, /Trabajo es el 50 % de tu vida y no tienes .*adecuado/)
})

test('la silueta propuesta respeta el cuerpo y lo que rechazas', () => {
  // Silueta «recta»: el pantalón amplio no está entre los cortes que la favorecen → no se propone
  assert.ok(!run(tenStraight(), bundle({ measures: { pecho: 96, cintura: 92 } })).findings.some((f) => f.key === 'silhouette:leg:Wide'))
  // Si rechazas el pantalón amplio, tampoco
  const b = bundle({ style: { influences: [{ style: 'clean-streetwear', role: 'principal', weight: 100 }], rejected_elements: ['leg-wide'] } })
  assert.ok(!run(tenStraight(), b).findings.some((f) => f.key === 'silhouette:leg:Wide'))
  // Sin medidas: se propone con confianza baja y pide los datos
  const nob = run(tenStraight(), bundle({ measures: {} })).findings.find((f) => f.key === 'silhouette:leg:Wide')!
  assert.equal(nob.confidence, 'baja'); assert.ok(nob.missing.length)
})

test('estética del armario frente a la identidad, proporciones de los conjuntos reales y paleta', () => {
  const a = run(tenStraight())
  assert.ok(a.aesthetic.transmits.length > 0); assert.ok(a.aesthetic.identity.some((i) => i.style === 'clean-streetwear'))
  const aes = a.findings.find((f) => f.kind === 'aesthetic_gap')
  assert.ok(aes && /Clean streetwear/.test(aes.diagnosis) && /oversize|amplio/i.test(aes.diagnosis))
  assert.ok(a.counts.outfits > 0, 'el Outfit Engine forma conjuntos reales')
  const mono = a.findings.find((f) => f.kind === 'proportion_monotony')
  assert.ok(mono, 'detecta que los conjuntos repiten la misma proporción'); assert.match(mono!.diagnosis, /pantalón recto/)
  const col = a.findings.find((f) => f.kind === 'color_monotony')
  assert.ok(col, 'paleta 100 % neutra'); assert.ok(a.colors.neutral_share >= 85)
  assert.equal(a.experimentation, 'Abierto')
})

test('prendas aisladas, redundancias reutilizadas de la auditoría y potencial infrautilizado con registro de uso', () => {
  const gs = [...tenStraight(), G('Pantalón traje', 'tailoring', 'suit', 'Gris', { formality_level: 5, occasions: ['eventos'], seasons: ['verano'] })]
  const a = run(gs)
  assert.ok(a.findings.some((f) => f.kind === 'redundancy'), 'duplicados (auditoría existente)')
  // Uso: 10 registros durante 60 días sin el jersey (muy combinable) → potencial sin aprovechar
  const jersey = gs.find((g) => g.name === 'Jersey marino')!
  const others = gs.filter((g) => g !== jersey).map((g) => g.id)
  const wears = Array.from({ length: 12 }, (_, i) => ({ worn_on: new Date(NOW.getTime() - (60 - i * 5) * 864e5).toISOString().slice(0, 10), garment_ids: [others[i % others.length], others[(i + 3) % others.length]] }))
  const u = run(gs, bundle(), { wears })
  assert.equal(u.usage.tracked, true)
  const under = u.findings.find((f) => f.kind === 'underused_potential')
  assert.ok(under && under.evidence.garment_ids.includes(jersey.id))
  assert.ok(!run(gs).findings.some((f) => f.kind === 'underused_potential')); assert.ok(run(gs).limitations.some((l) => /registro de uso/.test(l)))
})

test('los hallazgos son diagnósticos con evidencias e hipótesis, no compras ni tendencias', () => {
  const a = run(tenStraight())
  for (const f of a.findings) {
    assert.ok(f.diagnosis.length > 20 && f.data_used.length > 0 && ['alta', 'media', 'baja'].includes(f.confidence))
    assert.doesNotMatch(`${f.title} ${f.diagnosis} ${f.direction ?? ''}`, /tendencia|trend|compra (esto|ya)|€/i)
  }
  assert.ok(a.findings.every((f, i, xs) => i === 0 || xs[i - 1].weight >= f.weight), 'ordenados por relevancia')
})

test('sin identidad ni colorimetría: lo dice como límite y no inventa', () => {
  const a = run(tenStraight(), bundle({ style: {}, temp: null, experimentation: null }))
  assert.ok(a.limitations.some((l) => /identidad/.test(l))); assert.ok(a.limitations.some((l) => /colorimetría/.test(l)))
  assert.equal(a.aesthetic.coherence, null); assert.ok(!a.findings.some((f) => f.kind === 'aesthetic_gap' || f.kind === 'color_unfavorable'))
  assert.equal(a.experimentation, null); assert.match(a.summary, /se asume abierto/)
})

test('la huella cambia con el armario, la identidad, el ajuste, los objetivos o el uso (la caché se invalida)', () => {
  const gs = tenStraight(), b = bundle()
  const base = wardrobeFingerprint(gs, b, 0)
  assert.equal(base, wardrobeFingerprint(gs, bundle(), 0))
  assert.notEqual(base, wardrobeFingerprint([...gs, G('Nueva', 'top', 'tee', 'Blanco')], b, 0))
  assert.notEqual(base, wardrobeFingerprint(gs, bundle({ experimentation: 'Explorador' }), 0))
  assert.notEqual(base, wardrobeFingerprint(gs, bundle({ style: { influences: [{ style: 'urban-casual', role: 'principal', weight: 100 }] } }), 0))
  assert.notEqual(base, wardrobeFingerprint(gs, b, 3))
  assert.notEqual(base, wardrobeFingerprint(gs, b, 0, { [gs[0].id]: 4 }))
})

test('pregunta de grado de experimentación en Objetivos de imagen (tres niveles, editable)', () => {
  const q = QUESTIONS.find((x) => x.id === 'experimentation')!
  assert.equal(q.area, 'a7'); assert.equal(q.kind, 'single'); assert.deepEqual([...q.options!], [...EXPERIMENTATION])
  assert.deepEqual(q.store, { table: 'style_goals', column: 'experimentation' })
})
