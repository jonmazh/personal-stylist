import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { diversify, facetQuery, matchOpportunity, opportunityFacets, DISCOVERY_C3_BUDGET } from '@/lib/stylist/discovery'
import { ELEMENT_TARGET, type Target } from '@/lib/stylist/strategy'
import { buildSearchBody, channel3Config, channel3Source, Channel3Meter, resetChannel3State } from '@/lib/shopping/catalog/channel3'
import { searchAll } from '@/lib/shopping/catalog/sources'
import { TREND_C3_MAX } from '@/lib/stylist/trend-service'

const tgt = (el: string, x: Partial<Target> = {}): Target => ({ ...ELEMENT_TARGET[el], element: el, color: null, material: null, colors_ok: [], ...x } as Target)
const WIDE = tgt('leg-wide')

test('facetas complementarias sin redundancias: base, variante, colores y material; nunca más de 4', () => {
  const f = opportunityFacets(WIDE, { favorableColors: ['Crudo', 'Camel', 'Oliva'] })
  assert.deepEqual(f.map((x) => x.id), ['base', 'sinonimo', 'color:Crudo', 'color:Camel'])
  assert.deepEqual(f.map((x) => x.text), ['pantalón de pierna amplia hombre', 'pantalón wide leg hombre', 'pantalón de pierna amplia crudo hombre', 'pantalón de pierna amplia camel hombre'])
  assert.ok(f.every((x) => JSON.stringify(x.c3_attributes) === JSON.stringify({ fit: ['Wide'] })), 'el corte va como atributo estructurado de Channel3')
  const mat = opportunityFacets({ category: 'outerwear', subcategory: null, label: 'una pieza de ante (sobrecamisa o cazadora)', element: null, cut: null, silhouette: null, color: null, material: 'ante', colors_ok: [] })
  assert.deepEqual(mat.map((x) => x.id), ['base', 'material:ante'])
  assert.equal(new Set(opportunityFacets(tgt('overshirt', { colors_ok: ['Oliva', 'Oliva'] })).map((x) => x.text)).size, opportunityFacets(tgt('overshirt', { colors_ok: ['Oliva', 'Oliva'] })).length)
  const q = facetQuery({ text: 'x', category: 'bottom', subcategory: 'trousers', colors: ['Gris'], cut: 'Wide', materials: null, price_min: null, price_max: null, retailers: [], excluded: [], need_id: null }, f[2])
  assert.equal(q.facet, 'color:Crudo'); assert.deepEqual(q.colors, []); assert.equal(q.cut, null, 'el corte no se exige como texto: lo decide la comprobación de la oportunidad')
  assert.equal(DISCOVERY_C3_BUDGET + TREND_C3_MAX, 25, '25 créditos por estrategia completa')
})

test('¿materializa la oportunidad? Fallos conocidos excluyen; lo desconocido queda marcado, no excluye', () => {
  assert.equal(matchOpportunity({ category: 'bottom', subcategory: 'chinos', cut: 'Wide' }, WIDE)!.fit, 'materializa')
  assert.equal(matchOpportunity({ category: 'bottom', subcategory: 'trousers', silhouette: 'Amplia' }, WIDE)!.fit, 'materializa', 'holgado también aporta volumen')
  const slim = matchOpportunity({ category: 'bottom', subcategory: 'trousers', cut: 'Slim' }, WIDE)!
  assert.ok(slim.misses.length, 'un pantalón slim no materializa una silueta amplia')
  const unk = matchOpportunity({ category: 'bottom', subcategory: 'jeans', cut: null }, WIDE)!
  assert.equal(unk.misses.length, 0); assert.equal(unk.fit, 'parcial'); assert.ok(unk.unknown.includes('Corte sin confirmar por la tienda'))
  assert.ok(matchOpportunity({ category: 'top', subcategory: 'tee' }, WIDE)!.misses.includes('Otro tipo de prenda'))
  const over = tgt('overshirt')
  assert.ok(matchOpportunity({ category: 'outerwear', subcategory: 'jacket' }, over)!.misses.length, 'para una sobrecamisa, otra prenda no vale')
  const suede = { category: 'outerwear', subcategory: null, label: 'ante', element: null, cut: null, silhouette: null, color: null, material: 'ante', colors_ok: [] } as Target
  assert.equal(matchOpportunity({ category: 'outerwear', product_name: 'Suede overshirt', confirmed_composition: '100 % leather' }, suede)!.fit, 'materializa')
  assert.ok(matchOpportunity({ category: 'outerwear', product_name: 'Jacket', confirmed_composition: '100 % cotton' }, suede)!.misses.length)
  const color = { category: 'top', subcategory: null, label: 'prenda en oliva', element: null, cut: null, silhouette: null, color: 'Oliva', material: null, colors_ok: ['Oliva', 'Camel'] } as Target
  assert.ok(matchOpportunity({ category: 'top', primary_color: 'Negro' }, color)!.misses.length, 'una oportunidad de color exige el color')
  assert.equal(matchOpportunity({ category: 'top', primary_color: 'Camel' }, color)!.fit, 'materializa')
})

test('diversidad de marcas: como mucho 2 por marca antes de repetir; los no aptos siguen al final', () => {
  const h = (brand: string, ok = true) => ({ brand, eligibility: { ok } })
  const out = diversify([h('Zara'), h('Zara'), h('Zara'), h('Mango'), h('COS'), h('Zara', false)])
  assert.deepEqual(out.map((x) => x.brand), ['Zara', 'Zara', 'Mango', 'COS', 'Zara', 'Zara'])
  assert.equal(out[5].eligibility.ok, false)
})

const fx = (f: string) => JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8'))
const WEBSITES = fx('channel3-websites.json'), ZARA = fx('channel3-search-zara-es.json')
const CFG = { ...channel3Config({} as NodeJS.ProcessEnv), key: 'k' }
const SHOPS = [{ id: 'z', slug: 'zara', name: 'Zara', domains: ['zara.com'], url_policy: 'manual_only' as const }, { id: 'b', slug: 'bershka', name: 'Bershka', domains: ['bershka.com'], url_policy: 'manual_only' as const }, { id: 'p', slug: 'pull-and-bear', name: 'Pull&Bear', domains: ['pullandbear.com'], url_policy: 'manual_only' as const }]
const fake = () => {
  const calls: { path: string; body: any }[] = []
  const f = (async (u: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(u)); const body = init.body ? JSON.parse(String(init.body)) : null; calls.push({ path: url.pathname, body })
    if (url.pathname === '/v1/websites/search') return new Response(JSON.stringify(WEBSITES[url.searchParams.get('query')!] ?? { websites: [] }))
    return new Response(JSON.stringify({ products: ZARA.products }))
  }) as unknown as typeof fetch
  return { f, calls }
}

test('Channel3 en la búsqueda estratégica: solo tu mercado, atributo de corte y tope de créditos', async () => {
  resetChannel3State()
  const { f, calls } = fake(); const meter = new Channel3Meter()
  let left = 2
  const src = channel3Source(SHOPS, CFG, { fetch: f, meter }, { localOnly: true, budget: () => left - meter.summary().credits })
  const base = { text: 'pantalón de pierna amplia hombre', category: 'bottom', subcategory: 'trousers', colors: [], cut: null, materials: null, price_min: null, price_max: null, retailers: [], excluded: [], need_id: null, c3_attributes: { fit: ['Wide'] } }
  await src.searchProducts(base)
  const searches = calls.filter((c) => c.path === '/v1/search')
  assert.deepEqual(searches.map((c) => c.body.config.country), ['ES'], 'Bershka (GB) y Pull&Bear (US) no se consultan: su stock no se puede confirmar para España')
  assert.deepEqual(searches[0].body.filters.attributes, { fit: ['Wide'] })
  await src.searchProducts(base)
  const r = await searchAll(base, [src])
  assert.equal(calls.filter((c) => c.path === '/v1/search').length, 2, 'con el presupuesto agotado no se gasta ni un crédito más')
  assert.match(r.statuses[0].message ?? '', /Presupuesto de Channel3/)
  left = 0
  // Fuera de tu mercado, el atributo de corte no se envía (lo mismo que el de tallas)
  const gb = buildSearchBody(base, 'GB', ['bershka.com'], CFG) as { filters: Record<string, unknown> }
  assert.equal(gb.filters.attributes, undefined)
})
