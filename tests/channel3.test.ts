import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Bundle } from '@/lib/profile/data'
import { evaluateGarment } from '@/lib/wardrobe/compatibility'
import { evaluatePurchase, PURCHASE_WEIGHTS } from '@/lib/shopping/evaluate'
import { buildShopperContext } from '@/lib/shopping/intelligence/context'
import { discoveryQueries } from '@/lib/shopping/intelligence/discovery'
import { rankHits } from '@/lib/shopping/intelligence/rank'
import { VIRTUAL_ID } from '@/lib/shopping/priority'
import { queryFromText } from '@/lib/shopping/catalog/query'
import { searchAll } from '@/lib/shopping/catalog/sources'
import {
  Channel3Error, Channel3Meter, buildSearchBody, c3request, channel3Config, channel3Source, forEvaluation, hexOf, marketFor, nearestColor,
  normalizeChannel3Product, offerUrlOf, resetChannel3State, type C3Meta,
} from '@/lib/shopping/catalog/channel3'

/**
 * Channel3 con respuestas REALES guardadas (tests/fixtures/channel3-*.json, capturadas de la API el 10-11-2026).
 * Estas pruebas verifican el conector y la integración con el motor 4C; NO sustituyen a la prueba real con la API
 * (tests/e2e/channel3-live.cjs, CHANNEL3_LIVE=1).
 */
const fx = (f: string) => JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8'))
const WEBSITES = fx('channel3-websites.json'), ZARA_ES = fx('channel3-search-zara-es.json'), BERSHKA_GB = fx('channel3-search-bershka-gb.json'), PULL_US = fx('channel3-search-pullandbear-us.json')
const ZARA_PRODUCT = fx('channel3-product-zara.json'), BERSHKA_PRODUCT = fx('channel3-product-bershka-gb.json')
const KEY = 'c3-test-key-NOT-REAL'
const CFG = { ...channel3Config({} as NodeJS.ProcessEnv), key: KEY }
const shop = (slug: string, name: string, domain: string) => ({ id: `r-${slug}`, slug, name, domains: [domain], url_policy: 'manual_only' as const })
const SHOPS = [shop('zara', 'Zara', 'zara.com'), shop('bershka', 'Bershka', 'bershka.com'), shop('pull-and-bear', 'Pull&Bear', 'pullandbear.com')]
const noSleep = async () => {}

type Call = { url: URL; method: string; body: any; headers: Record<string, string> }
/** API de Channel3 simulada con las respuestas reales. */
function fakeApi(handler?: (c: Call) => Response | undefined) {
  const calls: Call[] = []
  const f = (async (u: URL | string, init: RequestInit = {}) => {
    const c: Call = { url: new URL(String(u)), method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null, headers: init.headers as Record<string, string> }
    calls.push(c)
    const custom = handler?.(c); if (custom) return custom
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
    if (c.url.pathname === '/v1/websites/search') return json(WEBSITES[c.url.searchParams.get('query')!] ?? { websites: [] })
    if (c.url.pathname === '/v1/search') {
      const d = c.body.filters.website_ids as string[]
      const out = [...(d.includes('zara.com') ? ZARA_ES.products : []), ...(d.includes('bershka.com') ? BERSHKA_GB.products : []), ...(d.includes('pullandbear.com') ? PULL_US.products : [])]
      return json({ products: out, next_page_token: null })
    }
    if (c.url.pathname === `/v1/products/${ZARA_PRODUCT.id}`) return json(ZARA_PRODUCT)
    if (c.url.pathname === `/v1/products/${BERSHKA_PRODUCT.id}`) return json(BERSHKA_PRODUCT)
    return json({ detail: 'Not found' }, 404)
  }) as unknown as typeof fetch
  return { f, calls }
}
beforeEach(() => resetChannel3State())

// ── Configuración y errores ──
test('configuración: sin clave no está disponible y no se llama a la API; los valores por defecto son ES/es/EUR', async () => {
  const cfg = channel3Config({} as NodeJS.ProcessEnv)
  assert.equal(cfg.key, null); assert.equal(cfg.country, 'ES'); assert.equal(cfg.language, 'es'); assert.equal(cfg.currency, 'EUR'); assert.equal(cfg.mode, 'default')
  const { f, calls } = fakeApi()
  const src = channel3Source(SHOPS, cfg, { fetch: f })
  assert.equal(src.available().ok, false)
  await assert.rejects(c3request(cfg, 'search', 'v1/search', {}, { fetch: f }), (e: Channel3Error) => e.code === 'unconfigured')
  assert.equal(calls.length, 0)
  assert.equal(channel3Source(SHOPS, CFG).available().ok, true)
})

test('autenticación: la clave va en x-api-key, solo a la API oficial, y nunca aparece en los errores', async () => {
  const { f, calls } = fakeApi(() => new Response('{"detail":"Invalid API key"}', { status: 401 }))
  await assert.rejects(c3request(CFG, 'websites', 'v1/websites/search', { query: { query: 'zara.com' } }, { fetch: f }), (e: Channel3Error) => e.code === 'auth' && !e.message.includes(KEY))
  assert.equal(calls[0].headers['x-api-key'], KEY); assert.equal(calls[0].url.origin, 'https://api.trychannel3.com')
  // Una URL base distinta de la oficial (y no permitida para pruebas) se rechaza ANTES de enviar la clave
  const other = fakeApi()
  await assert.rejects(c3request({ ...CFG, baseUrl: 'https://evil.example' }, 'search', 'v1/search', {}, { fetch: other.f }), (e: Channel3Error) => e.code === 'unconfigured')
  assert.equal(other.calls.length, 0)
})

test('límites: 429 espera Retry-After y reintenta una vez; si persiste, error claro; 402 (créditos), 422 y tiempo agotado', async () => {
  let n = 0; const waits: number[] = []
  const once = fakeApi(() => (n++ === 0 ? new Response('', { status: 429, headers: { 'retry-after': '5' } }) : undefined))
  const meter = new Channel3Meter()
  const r = await c3request(CFG, 'websites', 'v1/websites/search', { query: { query: 'zara.com' } }, { fetch: once.f, sleep: async (ms) => { waits.push(ms) }, meter })
  assert.ok((r as { websites: unknown[] }).websites.length); assert.deepEqual(waits, [5000]); assert.equal(once.calls.length, 2)
  assert.equal(meter.summary().errors, 1)
  const always = fakeApi(() => new Response('', { status: 429, headers: { 'retry-after': '5' } }))
  await assert.rejects(c3request(CFG, 'search', 'v1/search', { method: 'POST', body: { query: 'x' } }, { fetch: always.f, sleep: noSleep }), (e: Channel3Error) => e.code === 'rate_limited' && e.retryAfter === 5)
  assert.equal(always.calls.length, 2, 'un único reintento')
  await assert.rejects(c3request(CFG, 'search', 'v1/search', {}, { fetch: fakeApi(() => new Response('', { status: 402 })).f }), (e: Channel3Error) => e.code === 'credits')
  await assert.rejects(c3request(CFG, 'search', 'v1/search', {}, { fetch: fakeApi(() => new Response('', { status: 422 })).f }), (e: Channel3Error) => e.code === 'invalid')
  const hang = (async (_u: unknown, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as unknown as typeof fetch
  await assert.rejects(c3request({ ...CFG, timeoutMs: 30 }, 'product', 'v1/products/x', {}, { fetch: hang }), (e: Channel3Error) => e.code === 'timeout')
  await assert.rejects(c3request(CFG, 'product', 'v1/products/x', {}, { fetch: fakeApi(() => new Response('<html>', { status: 200 })).f }), (e: Channel3Error) => e.code === 'protocol')
})

// ── Mercados y consultas ──
test('mercados: Zara en España; Bershka (GB/US) y Pull&Bear (US) en su mercado indexado, o ninguno si no se permiten otros mercados', () => {
  const c = (d: string) => WEBSITES[d].websites.find((w: { url: string }) => w.url === d).countries
  assert.equal(marketFor(c('zara.com'), CFG), 'ES')
  assert.equal(marketFor(c('bershka.com'), CFG), 'GB')
  assert.equal(marketFor(c('pullandbear.com'), CFG), 'US')
  assert.equal(marketFor(c('bershka.com'), { ...CFG, foreignMarkets: false }), null)
  assert.equal(marketFor([], CFG), null)
})

test('consulta: solo criterios comerciales; un color por consulta en hex; categoría verificada; precio solo en tu moneda; texto en inglés fuera de España', () => {
  const q = { ...queryFromText('pantalón beige hasta 60', null), text: 'pantalón beige hombre' }
  const es = buildSearchBody(q, 'ES', ['zara.com'], CFG)
  assert.deepEqual(Object.keys(es).sort(), ['config', 'filters', 'limit', 'query'])
  assert.equal(es.query, 'pantalón beige hombre')
  assert.deepEqual(es.filters, { gender: 'male', website_ids: ['zara.com'], category_ids: ['pants'], colors: { palette: [{ hex: hexOf('Beige') }], match: 'loose' }, price: { max_price: 60 } })
  assert.deepEqual(es.config, { country: 'ES', mode: 'default', language: 'es', currency: 'EUR' })
  const gb = buildSearchBody(q, 'GB', ['bershka.com'], CFG)
  assert.equal(gb.query, 'beige trousers men'); assert.equal((gb.filters as Record<string, unknown>).price, undefined, 'sin rango en € para precios en £')
  assert.deepEqual(gb.config, { country: 'GB', mode: 'default' })
  // Sin color en el texto no hay filtro cromático; cada color va en su propia consulta (la paleta es AND)
  assert.equal((buildSearchBody({ ...q, text: 'pantalón hombre' }, 'ES', ['zara.com'], CFG).filters as Record<string, unknown>).colors, undefined)
  const two = buildSearchBody({ ...q, text: 'pantalón beige crudo' }, 'ES', ['zara.com'], CFG).filters as { colors: { palette: unknown[] } }
  assert.equal(two.colors.palette.length, 1)
  // Las categorías no se cruzan: una camisa usa la taxonomía de camisas
  assert.deepEqual((buildSearchBody({ ...queryFromText('camisa blanca', null) }, 'ES', ['zara.com'], CFG).filters as { category_ids: string[] }).category_ids, ['shirts-2'])
  assert.ok(!JSON.stringify(es).match(/medid|measure|photo|foto|blueprint|temperatur/i), 'no se envía nada del perfil')
})

test('búsqueda por tiendas: agrupa por mercado (1 crédito por mercado), solo ofertas de las tiendas pedidas, Bershka y Pull&Bear por separado', async () => {
  const { f, calls } = fakeApi(); const meter = new Channel3Meter()
  const src = channel3Source(SHOPS, CFG, { fetch: f, meter })
  const all = await src.searchProducts({ ...queryFromText('pantalón', null), text: 'pantalón hombre' })
  const searches = calls.filter((c) => c.url.pathname === '/v1/search')
  assert.deepEqual(searches.map((c) => c.body.config.country).sort(), ['ES', 'GB', 'US'])
  assert.equal(meter.summary().credits, 3); assert.equal(meter.summary().by_op.websites, 3)
  assert.ok(all.some((h) => h.retailer?.slug === 'zara') && all.some((h) => h.retailer?.slug === 'bershka') && all.some((h) => h.retailer?.slug === 'pull-and-bear'))
  for (const h of all) assert.equal(h.category, 'bottom', 'solo pantalones')
  const bershka = await channel3Source(SHOPS, CFG, { fetch: f }).searchProducts({ ...queryFromText('pantalón', null), retailers: ['bershka'] })
  assert.ok(bershka.length > 0); assert.ok(bershka.every((h) => h.retailer?.slug === 'bershka' && (h.raw_attributes as unknown as C3Meta).market === 'GB' && h.currency === 'GBP'))
  const pull = await channel3Source(SHOPS, CFG, { fetch: f }).searchProducts({ ...queryFromText('pantalón', null), retailers: ['pull-and-bear'] })
  assert.ok(pull.length > 0); assert.ok(pull.every((h) => h.retailer?.slug === 'pull-and-bear' && (h.raw_attributes as unknown as C3Meta).market === 'US' && (h.raw_attributes as unknown as C3Meta).foreign_market))
  // La caché de tiendas evita volver a resolverlas (endpoint gratuito, pero innecesario)
  assert.equal(calls.filter((c) => c.url.pathname === '/v1/websites/search').length, 3)
})

test('varias consultas cromáticas: se unen y se quitan duplicados por el ID de Channel3', async () => {
  const { f } = fakeApi()
  const src = channel3Source(SHOPS.slice(0, 1), CFG, { fetch: f })
  const q = queryFromText('pantalón', null)
  const a = await searchAll({ ...q, text: 'pantalón beige hombre' }, [src]), b = await searchAll({ ...q, text: 'pantalón crudo hombre' }, [src])
  const byKey = new Map([...a.results, ...b.results].map((h) => [h.canonical_url, h]))
  assert.equal(byKey.size, a.results.length, 'el mismo producto en dos consultas cuenta una vez')
  assert.ok([...byKey.keys()].every((k) => k!.startsWith('channel3:')))
})

// ── Normalización ──
test('normalización (Zara, España): precio, composición publicada, corte del atributo «fit», procedencia y sin datos inventados', () => {
  const n = normalizeChannel3Product(ZARA_ES.products[0], { market: 'ES', cfg: CFG })!
  assert.equal(n.product_name, 'COMFORT RELAXED FIT PANTS'); assert.equal(n.brand, 'Zara'); assert.equal(n.source_kind, 'api')
  assert.equal(n.current_price, 29.95); assert.equal(n.currency, 'EUR'); assert.equal(n.availability_status, 'in_stock')
  assert.equal(n.confirmed_composition, '63 % cotton, 32 % polyester, 5 % elastane'); assert.equal(n.field_sources.confirmed_composition.source, 'channel3')
  assert.equal(n.subcategory, 'trousers'); assert.equal(n.silhouette, 'Amplia'); assert.equal(n.field_sources.silhouette.source, 'channel3'); assert.equal(n.cut ?? null, null, '«Relaxed» no es un corte concreto: no se inventa')
  assert.equal(n.primary_color, 'Beige'); assert.equal(n.field_sources.primary_color.source, 'derived', 'el color sale de la descripción, no de un dato publicado')
  assert.deepEqual(n.variants, [], 'sin tallas publicadas no se inventa disponibilidad por talla')
  assert.equal(n.canonical_url, `channel3:${ZARA_ES.products[0].id}`); assert.equal(n.product_url, null, 'el enlace de oferta es temporal: no se guarda')
  assert.ok(n.images.length > 0 && n.images.every((i) => i.permission === 'link_only'))
  const m = n.raw_attributes as unknown as C3Meta
  assert.equal(m.provider, 'channel3'); assert.equal(m.domain, 'zara.com'); assert.equal(m.foreign_market, false); assert.ok(m.fetched_at)
  assert.ok(!JSON.stringify(n).includes('commission'), 'la comisión no se guarda ni influye')
  assert.ok(!JSON.stringify(n).includes('buy.trychannel3.com'), 'ningún enlace de oferta temporal')
})

test('normalización (Bershka, Reino Unido): tallas con disponibilidad, corte recto, 100 % algodón, precio en £ de otro mercado', () => {
  const n = normalizeChannel3Product(BERSHKA_PRODUCT, { market: 'GB', cfg: CFG, domain: 'bershka.com' })!
  assert.equal(n.subcategory, 'jeans'); assert.equal(n.cut, 'Recto'); assert.equal(n.confirmed_composition, '100 % cotton')
  assert.equal(n.currency, 'GBP'); assert.equal(n.current_price, 39.99)
  assert.ok(n.variants.length >= 5); assert.ok(n.variants.every((v) => v.size && v.availability === 'in_stock'))
  const m = n.raw_attributes as unknown as C3Meta
  assert.equal(m.market, 'GB'); assert.equal(m.market_name, 'Reino Unido'); assert.equal(m.foreign_market, true)
  assert.match(offerUrlOf(BERSHKA_PRODUCT, 'bershka.com')!, /^https:\/\//)
})

test('normalización: sin precio, sin composición y sin color quedan desconocidos; datos inválidos se descartan', () => {
  const p = structuredClone(ZARA_ES.products[0]); p.offers = []; p.materials = []; p.description = 'Pantalón.'; p.colors = []
  const n = normalizeChannel3Product(p, { market: 'ES', cfg: CFG })!
  assert.equal(n.current_price, null); assert.equal(n.availability_status, 'unknown'); assert.equal(n.confirmed_composition, null); assert.equal(n.primary_color, null)
  assert.equal(n.field_sources.current_price, undefined); assert.equal(n.field_sources.confirmed_composition, undefined)
  assert.equal(normalizeChannel3Product({ title: 'sin id' }, { market: 'ES', cfg: CFG }), null)
  // Color solo deducible de la imagen: procedencia «Foto» (inferencia visual), nunca «Channel3»
  const q = structuredClone(p); q.colors = [{ hex: '#1f2a44', percentage: 0.8 }]
  const nq = normalizeChannel3Product(q, { market: 'ES', cfg: CFG })!
  assert.equal(nq.primary_color, nearestColor('#1f2a44')); assert.equal(nq.field_sources.primary_color.source, 'photo')
  assert.equal(nearestColor('#ff00ff'), null, 'sin un color cercano no se asigna ninguno')
})

// ── Evaluación personal (motor 4C sin cambios) ──
const bundle = (temp: string, fit: Record<string, string> = { pantalones: 'Recto' }): Bundle => ({
  profile: { fit_pref: 'Regular', budget_max: 90 }, measures: {}, photos: [], color: { temperature: temp, temperature_source: 'usuario', temperature_status: 'validado', likes: [], avoids: [] },
  style: { influences: [{ style: 'smart-casual', role: 'principal', weight: 70 }] }, life: { life: { trabajo: 50, ocio: 50 }, work_formality: 'Smart casual', climate: 'Cuatro estaciones marcadas', constraints: [] },
  fit: { prefs: fit }, goals: null, validated: { a3: true }, observations: [], blueprints: [], garments: [], references: [], refRatings: [], styleRefs: [], colorAnalyses: [], chatValidated: false,
} as unknown as Bundle)
let k = 0
const G = (name: string, category: string, subcategory: string, c: string, f: number, x: Record<string, unknown> = {}) => ({ id: `00000000-0000-4000-8000-${String(++k).padStart(12, '3')}`, name, category, subcategory, primary_color: c, formality_level: f, wardrobe_status: 'active', pattern: 'Liso', occasions: ['trabajo', 'ocio'], seasons: ['primavera', 'otono', 'invierno'], silhouette: 'Regular', ...x })
const wardrobe = () => [G('Camisa blanca', 'top', 'shirt', 'Blanco', 3), G('Jersey marino', 'top', 'knit', 'Azul marino', 3), G('Camiseta gris', 'top', 'tee', 'Gris', 2), G('Polo negro', 'top', 'polo', 'Negro', 3),
  G('Vaquero', 'bottom', 'jeans', 'Denim', 2, { cut: 'Recto' }), G('Chaqueta marino', 'outerwear', 'jacket', 'Azul marino', 3), G('Mocasín marrón', 'footwear', 'loafers', 'Marrón', 3), G('Zapatilla blanca', 'footwear', 'sneakers', 'Blanco', 2)]
const NEED = { id: 'n-pants', title: 'Pantalón para el día a día', type: 'need', spec: { category: 'bottom' }, priority_level: 'high' }
const envFor = (b: Bundle, gs: Record<string, any>[]) => {
  const evals = new Map(gs.map((g) => [g.id, evaluateGarment(g as never, b, { others: gs as never, imageCount: 1 })]))
  return { garments: gs, evals, bundle: b, openNeeds: [NEED], staleDays: 0, analyzed: false, ctx: buildShopperContext({ bundle: b, garments: gs as never, evals: evals as never, needs: [NEED] as never }) }
}

test('Channel3 → normalización → evaluatePurchase: pesos 25/20/15/20/10/10 intactos, perfiles distintos, WVA con IDs reales y precio extranjero neutro', () => {
  const zara = normalizeChannel3Product(ZARA_ES.products[0], { market: 'ES', cfg: CFG })!
  const gs = wardrobe(); const ids = new Set(gs.map((g) => g.id))
  const warm = evaluatePurchase(zara as never, envFor(bundle('Cálida'), gs) as never), cool = evaluatePurchase(zara as never, envFor(bundle('Fría'), gs) as never)
  assert.deepEqual(warm.weights, { ...PURCHASE_WEIGHTS })
  assert.notEqual(warm.score, cool.score, 'mismo producto, perfiles distintos'); assert.equal(zara.current_price, 29.95, 'los datos comerciales no cambian')
  assert.ok(warm.wva.total_outfits > 0, 'el Outfit Engine forma conjuntos con la prenda virtual')
  for (const o of warm.wva.outfit_samples) for (const id of o.garment_ids) assert.ok(ids.has(id) || id === VIRTUAL_ID, `ID real o la prenda candidata: ${id}`)
  assert.ok(warm.combines_with.every((g) => ids.has(g.id)))
  // Precio en £ (Bershka, Reino Unido): para el motor queda desconocido y no se compara con 90 € de presupuesto
  const jeans = normalizeChannel3Product(BERSHKA_PRODUCT, { market: 'GB', cfg: CFG, domain: 'bershka.com' })!
  const { product, foreign } = forEvaluation(jeans)
  assert.equal(foreign, true); assert.equal(product.current_price, null); assert.equal(jeans.current_price, 39.99)
  const e = evaluatePurchase(product as never, envFor(bundle('Cálida'), wardrobe()) as never)
  assert.ok(e.criteria.find((c) => c.key === 'quality')!.missing.includes('Precio sin comprobar'))
  assert.ok(!e.criteria.find((c) => c.key === 'quality')!.reasons.some((r) => r.includes('€')))
})

test('cambio de preferencia de corte y de armario: cambia la evaluación del mismo producto de Channel3', () => {
  const jeans = forEvaluation(normalizeChannel3Product(BERSHKA_PRODUCT, { market: 'GB', cfg: CFG, domain: 'bershka.com' })!).product
  const straight = evaluatePurchase(jeans as never, envFor(bundle('Cálida', { pantalones: 'Recto' }), wardrobe()) as never)
  const wide = evaluatePurchase(jeans as never, envFor(bundle('Cálida', { pantalones: 'Amplio' }), wardrobe()) as never)
  const cut = (e: typeof straight) => e.criteria.find((c) => c.key === 'cut')!.points
  assert.ok(cut(straight) > cut(wide), `corte recto preferido ${cut(straight)} > ${cut(wide)}`)
  // Con dos vaqueros rectos de denim ya en el armario, el mismo vaquero aporta menos y se detecta duplicidad
  const more = [...wardrobe(), G('Vaquero recto 2', 'bottom', 'jeans', 'Denim', 2, { cut: 'Recto' }), G('Vaquero recto 3', 'bottom', 'jeans', 'Denim', 2, { cut: 'Recto' })]
  const dup = evaluatePurchase(jeans as never, envFor(bundle('Cálida'), more) as never)
  assert.ok(dup.redundancy_score > straight.redundancy_score); assert.ok(dup.wva.score <= straight.wva.score)
  assert.ok(rankHits([{ id: 'dup', evaluation: dup }, { id: 'ok', evaluation: straight }])[0].id === 'ok')
})

test('el planificador genera consultas por categoría y colores que alimentan a Channel3 (una por color)', () => {
  const b = bundle('Cálida'); const gs = wardrobe()
  const ctx = buildShopperContext({ bundle: b, garments: gs as never, evals: new Map(gs.map((g) => [g.id, evaluateGarment(g as never, b, { others: gs as never, imageCount: 1 })])) as never, needs: [NEED] as never })
  const plan = discoveryQueries(queryFromText('Necesito pantalones', null), ctx)
  assert.ok(plan.queries.length >= 2)
  const bodies = plan.queries.map((q) => buildSearchBody(q, 'ES', ['zara.com'], CFG))
  for (const b2 of bodies) { assert.deepEqual((b2.filters as { category_ids: string[] }).category_ids, ['pants']); const c = (b2.filters as { colors?: { palette: unknown[] } }).colors; assert.ok(!c || c.palette.length === 1) }
  assert.ok(bodies.some((b2) => (b2.filters as { colors?: unknown }).colors), 'al menos una consulta cromática')
})
