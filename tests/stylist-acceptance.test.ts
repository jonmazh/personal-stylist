import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Bundle } from '@/lib/profile/data'
import { evaluateGarment } from '@/lib/wardrobe/compatibility'
import { evaluatePurchase, PURCHASE_WEIGHTS } from '@/lib/shopping/evaluate'
import { buildShopperContext } from '@/lib/shopping/intelligence/context'
import { analyzeWardrobe } from '@/lib/stylist/wardrobe'
import { buildStrategy } from '@/lib/stylist/strategy'
import { matchOpportunity, opportunityFacets } from '@/lib/stylist/discovery'
import { curate, rankStrategic, strategicEvaluation } from '@/lib/stylist/evaluation'
import { FeedbackInput, learn, LEARN_MIN } from '@/lib/stylist/feedback'

/**
 * 2.0H · Validación del Personal Shopper 2.0 con los criterios de aceptación: descubre una oportunidad que el usuario
 * no había pedido, la justifica con perfil + armario + mercado, investiga alternativas y explica por qué una
 * incorporación concreta mejora su forma de vestir; no se limita a categorías que ya tiene ni a sustituir prendas;
 * distingue tendencia de catálogo; nunca recomienda sin talla disponible; un score alto no es una buena decisión.
 */
const NOW = new Date('2026-11-10T12:00:00Z')
const bundle = (x: Record<string, unknown> = {}): Bundle => ({
  profile: { fit_pref: 'Regular', budget_max: 120 }, photos: [], measures: { pecho: { value: 104 }, cintura: { value: 82 } },
  color: { temperature: 'Cálida', temperature_source: 'usuario', temperature_status: 'validado', likes: [], avoids: [] },
  style: { influences: [{ style: 'clean-streetwear', role: 'principal', weight: 70 }, { style: 'urban-casual', role: 'secundario', weight: 30 }] },
  life: { life: { ocio: 100 }, climate: 'Cuatro estaciones marcadas', constraints: [] }, fit: { prefs: {} }, goals: { experimentation: 'Abierto' },
  validated: { a3: true, a4: true }, observations: [], blueprints: [], garments: [], references: [], refRatings: [], styleRefs: [], colorAnalyses: [], chatValidated: false, ...x,
} as unknown as Bundle)
let k = 0
const G = (name: string, category: string, subcategory: string, c: string, x: Record<string, unknown> = {}) => ({ id: `00000000-0000-4000-8000-${String(++k).padStart(12, '4')}`, name, category, subcategory, primary_color: c, formality_level: 2, wardrobe_status: 'active', pattern: 'Liso', occasions: ['ocio'], seasons: ['primavera', 'otono', 'invierno'], silhouette: 'Regular', ...x })
const wardrobe = () => [...['Gris', 'Negro', 'Azul marino', 'Beige', 'Gris', 'Negro', 'Azul marino', 'Beige'].map((c, i) => G(`Pantalón ${i}`, 'bottom', 'chinos', c, { cut: 'Recto' })),
  G('Camiseta blanca', 'top', 'tee', 'Blanco'), G('Camiseta negra', 'top', 'tee', 'Negro'), G('Sudadera gris', 'top', 'sweatshirt', 'Gris'), G('Zapatilla blanca', 'footwear', 'sneakers', 'Blanco')]
const TREND = { id: 'sig-1', key: 'k-wide', name: 'Pantalón amplio con caída', description: 'Pantalones de pierna amplia con caída fluida.', dimension: 'silhouette', kind: 'tendencia_editorial', stage: 'estacional', confidence: 'alta', source_count: 4, presence: { products: 30, brands: 20 } }
const CATALOG_ONLY = { id: 'sig-2', key: 'k-cargo', name: 'Cargo en todos los catálogos', description: 'Pantalones cargo.', dimension: 'garment', kind: 'propuesta_editorial', stage: 'sin_determinar', confidence: 'baja', source_count: 1 }

function pipeline(learned?: ReturnType<typeof learn>) {
  const b = bundle(), gs = wardrobe()
  const evals = new Map(gs.map((g) => [g.id, evaluateGarment(g as never, b, { others: gs as never, imageCount: 1 })]))
  const analysis = analyzeWardrobe({ garments: gs, evals, bundle: b, now: NOW })
  const strategy = buildStrategy({ analysis, signals: [TREND, CATALOG_ONLY], bundle: b, garments: gs, evals, now: NOW, learned })
  return { b, gs, evals, analysis, strategy }
}
const product = (name: string, brand: string, x: Record<string, unknown> = {}) => ({
  product_name: name, brand, canonical_url: `channel3:${name}`, category: 'bottom', subcategory: 'trousers', cut: 'Wide', primary_color: 'Camel', colors: ['Camel'], current_price: 79, currency: 'EUR',
  confirmed_composition: '100 % algodón', images: [], field_sources: {}, raw_attributes: { domain: `${brand.toLowerCase()}.com` }, variants: [{ size: '42', availability: 'in_stock' }],
  eligibility: { ok: true, excluded: false, label: 'Disponible en tu talla', gender: { ok: true }, size: { status: 'disponible', size: { original: '42', system: 'eu_num', role: 'principal' } } }, ...x,
})

test('descubre una oportunidad no pedida, justificada con perfil, armario y mercado; no se limita a categorías ni a sustituir', () => {
  const { strategy: s } = pipeline()
  const o = s.opportunities[0]
  assert.equal(o.key, 'el:leg-wide', 'la prioridad es una silueta nueva, no otro pantalón recto')
  assert.match(o.diagnosis, /la categoría está cubierta, pero la silueta no varía/)
  assert.ok(o.profile_relation.some((r) => /Clean streetwear/.test(r)), 'perfil'); assert.ok(o.wardrobe_evidence.garment_ids.length === 8, 'armario'); assert.equal(o.market?.name, TREND.name, 'mercado')
  assert.ok(!s.opportunities.some((x) => /sustitu/i.test(x.title)), 'no se limita a sustituir')
  assert.ok(s.rejected.some((r) => r.key === 'trend:k-cargo' && /una fuente/.test(r.reason)), 'lo que solo está en catálogos o en una fuente no es tendencia')
})

test('investiga alternativas reales y elige por valor estratégico; nunca sin talla; un 4C alto no basta', () => {
  const { b, gs, evals, analysis, strategy } = pipeline()
  const o = strategy.opportunities[0]
  assert.ok(opportunityFacets(o.target!, { favorableColors: ['Camel', 'Oliva'] }).length >= 3, 'varias consultas complementarias')
  const ctx = buildShopperContext({ bundle: b, garments: gs as never, evals: evals as never })
  const env = { garments: gs, evals, bundle: b, ctx, staleDays: 0, analyzed: false }
  const sc = { opportunity: { title: o.title, target: o.target, scores: o.scores, market: o.market }, proportions: analysis.proportions.distribution.map((d) => d.signature), islands: [], currency: 'EUR' }
  const hits = [
    product('Wide Camel', 'Atelier'), product('Wide Oliva', 'Nord', { primary_color: 'Oliva', colors: ['Oliva'], current_price: 59 }),
    product('Wide Sin Talla', 'Sur', { eligibility: { ok: false, excluded: true, label: 'Agotado en tu talla', gender: { ok: true }, size: { status: 'agotada_en_tu_talla' } } }),
    product('Recto Gris', 'Atelier', { cut: 'Recto', primary_color: 'Gris' }),
  ].filter((h) => !matchOpportunity(h, o.target!)!.misses.length)
    .map((h) => ({ ...h, opportunity_match: matchOpportunity(h, o.target!), evaluation: h.eligibility.excluded ? null : evaluatePurchase(h as never, env as never) }))
  assert.ok(!hits.some((h) => h.product_name === 'Recto Gris'), 'un pantalón recto no materializa la oportunidad')
  const ranked = rankStrategic(hits.map((h) => ({ ...h, strategic: strategicEvaluation(h, sc) })))
  const c = curate(ranked)
  assert.ok(c.selection.length >= 1); assert.ok(c.selection.every((i) => ranked[i].eligibility.ok), 'nunca sin talla disponible')
  assert.equal(ranked.find((h) => h.product_name === 'Wide Sin Talla')!.strategic.decision, 'no_elegible')
  assert.ok(ranked[c.selection[0]].strategic.decision_text.length > 20, 'explica por qué mejora su forma de vestir')
  // Un 4C muy alto no es una buena decisión si hay una incompatibilidad
  const dup = strategicEvaluation({ ...hits[0], evaluation: { ...hits[0].evaluation, score: 95, redundancy_score: 85 } }, sc)
  assert.equal(dup.decision, 'no_recomendado')
  assert.deepEqual({ ...PURCHASE_WEIGHTS }, { color: 25, cut: 20, style: 15, wardrobe: 20, need: 10, quality: 10 })
})

test('valoraciones: lo concreto se aplica a lo valorado; generalizar exige 2 valoraciones; trazable y sin tocar el Blueprint', () => {
  // Una sola vez «no es mi estilo» sobre un producto con pantalón amplio: se oculta ese producto, pero no se generaliza
  const one = learn([{ id: 'f1', target_kind: 'producto', target_ref: 'channel3:Wide Camel', reason: 'no_mi_estilo', context: { element: 'leg-wide' } }])
  assert.deepEqual(one.hidden_products, ['channel3:Wide Camel']); assert.deepEqual(one.soft_rejected, []); assert.equal(one.pending[0].count, 1)
  assert.equal(pipeline(one).strategy.opportunities[0].key, 'el:leg-wide', 'una valoración aislada no cambia la estrategia')
  // Dos veces: el rasgo deja de proponerse y queda explicado y trazable
  const two = learn([...[1, 2].map((i) => ({ id: `f${i}`, target_kind: 'producto', target_ref: `p${i}`, reason: 'no_mi_estilo', context: { element: 'leg-wide' } }))])
  assert.deepEqual(two.soft_rejected, ['leg-wide']); assert.deepEqual(two.applied[0].feedback_ids, ['f1', 'f2']); assert.equal(LEARN_MIN, 2)
  const s2 = pipeline(two).strategy
  assert.ok(!s2.opportunities.some((o) => o.key === 'el:leg-wide'), 'deja de proponer el pantalón amplio')
  assert.ok(s2.rejected.some((r) => r.key.startsWith('armario:silhouette') && /has dicho varias veces/.test(r.reason)), 'y explica por qué')
  assert.ok(s2.rejected.some((r) => r.key === 'trend:k-wide' && /varias veces/.test(r.reason)), 'la tendencia relacionada se descarta citando tus valoraciones')
  // Rechazar una tendencia (no el producto) se aplica a esa tendencia
  const tr = learn([{ id: 't1', target_kind: 'tendencia', target_ref: 'k-wide', reason: 'no_mi_estilo', context: {} }])
  assert.ok(pipeline(tr).strategy.rejected.some((r) => r.key === 'trend:k-wide' && /La descartaste tú/.test(r.reason)))
  // …y deja de usarse como respaldo de mercado de las oportunidades del armario
  assert.ok(pipeline(tr).strategy.opportunities.every((o: any) => o.market?.name !== 'Pantalón amplio con caída' && !(o.sources ?? []).some((x: string) => x.startsWith('tendencia:'))))
  // «Me gusta la tendencia, pero no ese producto»: se oculta el producto y la tendencia sigue
  const tp = learn([{ id: 'x', target_kind: 'producto', target_ref: 'p9', reason: 'tendencia_si_producto_no', context: { trend_key: 'k-wide' } }])
  assert.deepEqual(tp.hidden_products, ['p9']); assert.deepEqual(tp.trends_liked, ['k-wide']); assert.deepEqual(tp.trends_rejected, [])
  // «Demasiado arriesgado» dos veces baja la exploración; «ya tengo algo parecido» en una oportunidad la convierte en no-compra
  const risk = learn([1, 2].map((i) => ({ id: `r${i}`, target_kind: 'oportunidad', target_ref: `o${i}`, reason: 'demasiado_arriesgado', context: {} })))
  assert.equal(risk.risk_averse, true)
  const have = pipeline(learn([{ id: 'h', target_kind: 'oportunidad', target_ref: 'el:leg-wide', reason: 'ya_tengo_parecido', context: {} }])).strategy
  const o = have.opportunities.find((x) => x.key === 'el:leg-wide')!
  assert.equal(o.purchase, false); assert.ok(o.profile_relation.some((r) => /ya tienes algo parecido/.test(r)))
  // Contrato de entrada: motivos solo donde aplican
  assert.equal(FeedbackInput.safeParse({ target_kind: 'tendencia', target_ref: 'k', reason: 'ya_tengo_parecido' }).success, false)
  assert.equal(FeedbackInput.safeParse({ target_kind: 'producto', target_ref: 'k', reason: 'prenda_si_corte_no', context: { element: 'leg-wide', cut: 'Wide' } }).success, true)
})
