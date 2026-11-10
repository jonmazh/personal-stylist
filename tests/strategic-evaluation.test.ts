import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { curate, median, rankStrategic, strategicEvaluation, STRATEGIC_WEIGHTS, type StrategicContext } from '@/lib/stylist/evaluation'
import { generalColors, opportunityFacets, GENERAL_COLORS } from '@/lib/stylist/discovery'
import { ELEMENT_TARGET, type Target } from '@/lib/stylist/strategy'
import { PURCHASE_WEIGHTS } from '@/lib/shopping/evaluate'
import { buildSearchBody, channel3Config, channel3Source, Channel3Meter, resetChannel3State } from '@/lib/shopping/catalog/channel3'

const WIDE = { ...ELEMENT_TARGET['leg-wide'], element: 'leg-wide', color: null, material: null, colors_ok: [] } as Target
const SC: StrategicContext = { opportunity: { title: 'Introducir pantalón de pierna amplia', target: WIDE, scores: { fashion_relevance: 85 }, market: { name: 'Pantalón amplio con caída', kind: 'tendencia_editorial' } }, proportions: ['Regular|Recto', 'Amplia|Recto'], islands: ['isla-1'], currency: 'EUR' }
const crit = (color: number, cut: number, style: number) => [{ key: 'color', label: 'Color', weight: 25, value: color }, { key: 'cut', label: 'Corte', weight: 20, value: cut }, { key: 'style', label: 'Estética', weight: 15, value: style }]
const H = (x: Record<string, any> = {}) => ({
  product_name: 'Pantalón wide', brand: 'COS', category: 'bottom', subcategory: 'trousers', cut: 'Wide', current_price: 79, currency: 'EUR', raw_attributes: { domain: 'cos.com' },
  eligibility: { ok: true, excluded: false, label: 'Disponible en tu talla', gender: { ok: true, reason: 'male' }, size: { status: 'disponible' } },
  opportunity_match: { fit: 'materializa', matches: ['Corte amplio'], misses: [], unknown: [] },
  evaluation: { score: 78, verdict: 'buy', redundancy_score: 10, criteria: crit(0.8, 0.9, 0.8), combines_with: [{ id: 'g1' }, { id: 'isla-1' }], wva: { total_outfits: 20, new_outfits: 8 } },
  ...x,
})

test('nivel 1 · elegibilidad: género, talla comprobada, información comercial y que materialice la oportunidad', () => {
  const ok = strategicEvaluation(H(), SC)
  assert.equal(ok.level1.ok, true); assert.deepEqual(ok.level1.checks.map((c) => c.ok), [true, true, true, true])
  const noSize = strategicEvaluation(H({ eligibility: { ok: false, excluded: false, label: 'Tu talla existe, pero su disponibilidad no está comprobada', gender: { ok: true }, size: { status: 'stock_desconocido' } } }), SC)
  assert.equal(noSize.decision, 'no_elegible'); assert.match(noSize.decision_text, /disponibilidad no está comprobada/)
  assert.equal(strategicEvaluation(H({ currency: 'GBP' }), SC).level1.checks.find((c) => c.key === 'comercial')!.ok, false)
  assert.equal(strategicEvaluation(H({ current_price: null }), SC).decision, 'no_elegible')
  assert.equal(strategicEvaluation(H({ evaluation: null, eligibility: { ok: false, excluded: true, label: 'No hay ninguna de tus tallas', gender: { ok: true }, size: { status: 'sin_talla_compatible' } } }), SC).value, null, 'sin 4C no hay valor que mostrar')
  assert.equal(strategicEvaluation(H({ opportunity_match: { fit: 'parcial', matches: [], misses: ['Corte slim'], unknown: [] } }), SC).decision, 'no_elegible')
})

test('nivel 2 · valor estratégico: proporción nueva, conexión de prendas aisladas, conjuntos y mercado; lo desconocido no cuenta', () => {
  const e = strategicEvaluation(H(), SC)
  const w = e.components.find((c) => c.key === 'wardrobe')!
  assert.ok(w.reasons.some((r) => /proporción que tus conjuntos no tienen/.test(r))); assert.ok(w.reasons.some((r) => /Conecta 1 prenda/.test(r)))
  assert.equal(e.decision, 'eleccion'); assert.ok(e.value! >= 70); assert.match(e.decision_text, /Elección del estilista/)
  // Sin respaldo de mercado: el componente queda sin datos y no penaliza
  const noMarket = strategicEvaluation(H(), { ...SC, opportunity: { ...SC.opportunity, scores: { fashion_relevance: null }, market: null } })
  assert.equal(noMarket.components.find((c) => c.key === 'market')!.value, null); assert.ok(noMarket.value! >= 70)
  // Un pantalón recto no aporta una proporción nueva
  assert.ok(!strategicEvaluation(H({ cut: 'Recto' }), SC).components.find((c) => c.key === 'wardrobe')!.reasons.some((r) => /proporción/.test(r)))
  assert.deepEqual({ ...STRATEGIC_WEIGHTS }, { opportunity: 25, wardrobe: 25, personal: 25, outfits: 15, market: 10 })
  assert.deepEqual({ ...PURCHASE_WEIGHTS }, { color: 25, cut: 20, style: 15, wardrobe: 20, need: 10, quality: 10 }, 'el 4C no cambia')
})

test('una puntuación alta no oculta una incompatibilidad: alertas que limitan la decisión', () => {
  const dup = strategicEvaluation(H({ evaluation: { ...H().evaluation, score: 90, redundancy_score: 80 } }), SC)
  assert.ok(dup.flags.includes('Duplica algo que ya tienes')); assert.equal(dup.decision, 'no_recomendado')
  const color = strategicEvaluation(H({ evaluation: { ...H().evaluation, score: 85, criteria: crit(0.3, 0.9, 0.9) } }), SC)
  assert.ok(color.flags.includes('El color te favorece poco')); assert.equal(color.decision, 'con_reservas')
  const dep = strategicEvaluation(H({ evaluation: { ...H().evaluation, combines_with: [], wva: { total_outfits: 0, new_outfits: 0 } } }), SC)
  assert.ok(dep.flags.includes('Depende de compras futuras para poder usarla')); assert.notEqual(dep.decision, 'eleccion')
  const skip = strategicEvaluation(H({ evaluation: { ...H().evaluation, verdict: 'skip' } }), SC)
  assert.equal(skip.decision, 'no_recomendado')
})

test('selección del estilista: hasta 3 de marcas distintas; alternativas de otras marcas y precios; orden por decisión', () => {
  const hits = rankStrategic([H({ brand: 'COS' }), H({ brand: 'COS', current_price: 120 }), H({ brand: 'Zara', current_price: 39.95 }), H({ brand: 'Mango', current_price: 49 }), H({ brand: 'H&M', evaluation: { ...H().evaluation, criteria: crit(0.3, 0.9, 0.9) } }), H({ brand: 'X', current_price: null })]
    .map((h) => ({ ...h, strategic: strategicEvaluation(h, SC, { medianPrice: median([79, 120, 39.95, 49, 79]) }) })))
  const c = curate(hits)
  assert.equal(c.selection.length, 3); assert.equal(new Set(c.selection.map((i) => hits[i].brand)).size, 3)
  assert.ok(c.alternatives.length >= 2); assert.ok(c.alternatives.some((i) => hits[i].strategic.decision === 'con_reservas'))
  assert.equal(hits[hits.length - 1].strategic.decision, 'no_elegible')
  assert.equal(hits.find((h) => h.brand === 'Zara')!.strategic.price_tier, 'económica'); assert.equal(hits.find((h) => h.current_price === 120)!.strategic.price_tier, 'premium')
})

test('sin colorimetría: colores versátiles por consejo general (los que menos tienes), marcados como tales', () => {
  assert.deepEqual(generalColors('bottom', { Gris: 3, Beige: 2 }), ['Azul marino', 'Oliva'])
  assert.deepEqual(generalColors('footwear', {}), GENERAL_COLORS.footwear.slice(0, 2))
  const f = opportunityFacets(WIDE, { generalColors: ['Azul marino', 'Oliva'] })
  assert.deepEqual(f.filter((x) => x.general).map((x) => x.label), ['En azul marino (consejo general)', 'En oliva (consejo general)'])
  assert.ok(!opportunityFacets(WIDE, { favorableColors: ['Camel'], generalColors: ['Oliva'] }).some((x) => x.general), 'con colorimetría, mandan tus colores')
})

const fx = (f: string) => JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8'))
test('catálogo abierto de Channel3 en tu mercado: sin limitarse a tu lista de tiendas, respetando las excluidas', async () => {
  resetChannel3State()
  const CFG = { ...channel3Config({} as NodeJS.ProcessEnv), key: 'k' }
  const body = buildSearchBody({ text: 'pantalón de pierna amplia hombre', category: 'bottom', subcategory: 'trousers', colors: [], cut: null, materials: null, price_min: null, price_max: null, retailers: [], excluded: [], need_id: null }, 'ES', [], CFG, null, ['zara.com']) as { filters: Record<string, unknown> }
  assert.equal(body.filters.website_ids, undefined); assert.deepEqual(body.filters.exclude_website_ids, ['zara.com'])
  const calls: any[] = []
  const f = (async (u: URL | string, init: RequestInit = {}) => { calls.push({ path: new URL(String(u)).pathname, body: init.body ? JSON.parse(String(init.body)) : null }); return new Response(JSON.stringify({ products: fx('channel3-search-zara-es.json').products })) }) as unknown as typeof fetch
  const shops = [{ id: 'b', slug: 'bershka', name: 'Bershka', domains: ['bershka.com'], url_policy: 'manual_only' as const }]
  const hits = await channel3Source(shops, CFG, { fetch: f, meter: new Channel3Meter() }, { openCatalog: true, localOnly: true }).searchProducts({ text: 'pantalón hombre', category: 'bottom', subcategory: 'trousers', colors: [], cut: null, materials: null, price_min: null, price_max: null, retailers: [], excluded: [], need_id: null })
  assert.equal(calls.filter((c) => c.path === '/v1/websites/search').length, 0, 'sin resolver tiendas: una sola consulta al catálogo')
  assert.equal(calls.length, 1); assert.equal(calls[0].body.filters.website_ids, undefined); assert.equal(calls[0].body.config.country, 'ES')
  assert.ok(hits.length > 0 && hits.every((h) => h.retailer === null && (h.raw_attributes as any).domain === 'zara.com'), 'productos de tiendas fuera de tu lista, con su dominio')
  const excl = await channel3Source([{ id: 'z', slug: 'zara', name: 'Zara', domains: ['zara.com'], url_policy: 'manual_only' as const }], CFG, { fetch: f }, { openCatalog: true }).searchProducts({ text: 'pantalón hombre', category: 'bottom', subcategory: 'trousers', colors: [], cut: null, materials: null, price_min: null, price_max: null, retailers: [], excluded: ['zara'], need_id: null })
  assert.equal(excl.length, 0, 'una tienda excluida no aparece aunque Channel3 la devuelva')
})
