import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EME_STUDIOS, audienceOf, emeStudiosProductSource, normalizeEmeProduct } from '@/lib/shopping/catalog/eme-studios'
import { connectorSource } from '@/lib/shopping/catalog/registry'
import { CATALOG_TOOLS, parseDiscovery, resetUcpState } from '@/lib/shopping/catalog/ucp'
import { retailerForUrl } from '@/lib/shopping/catalog/normalize'
import { queryFromNeed, queryFromText } from '@/lib/shopping/catalog/query'
import { NeedSpec, RETAILERS } from '@/lib/shopping/taxonomy'

process.env.SHOPPING_FETCH_VIA_PROXY = '1'
const fx = (f: string) => JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8'))
const PROFILE = fx('eme-ucp-profile.json'), SEARCH = fx('eme-search-catalog.json'), DETAIL = fx('eme-get-product.json'), TOOLS = fx('eme-tools-list.json')
const EME = { id: 'r-eme', slug: 'eme-studios', name: 'EME Studios', domains: ['emestudios.com'], url_policy: 'metadata' as const, connector: 'ucp' }
const CFG = { profileUrl: 'https://app.example/.well-known/ucp', market: 'ES', language: 'es', currency: 'EUR' }
let profileUrls: string[] = []
const profileFetch = (async (u: string) => { profileUrls.push(u); return { url: u, status: 200, contentType: 'application/json', body: JSON.stringify(PROFILE) } }) as never
type Call = { url: string; method: string; params: any }
function fakeMcp(on429 = false) {
  const calls: Call[] = []
  const f = (async (url: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body)); calls.push({ url, method: b.method, params: b.params })
    if (on429 && b.method === 'tools/call') return new Response('{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"Rate limit exceeded"}}', { status: 429, headers: { 'retry-after': '20', 'content-type': 'application/json' } })
    const ok = (result: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id: b.id, result }), { headers: { 'content-type': 'application/json' } })
    if (b.method === 'initialize') return ok({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'universal-commerce' } })
    if (b.method === 'tools/list') return ok(TOOLS)
    if (b.params.name === 'search_catalog') return ok({ isError: false, structuredContent: SEARCH })
    if (b.params.name === 'get_product') return ok({ isError: false, structuredContent: DETAIL })
    return ok({ isError: true, structuredContent: { messages: [{ type: 'error', code: 'x' }] } })
  }) as unknown as typeof fetch
  return { f, calls }
}
beforeEach(() => { resetUcpState(); profileUrls = [] })

test('descubrimiento: perfil UCP de checkout.emestudios.com, versiones y capacidades de catálogo', () => {
  const d = parseDiscovery(PROFILE)
  assert.equal(d.version, '2026-08-25'); assert.deepEqual(Object.keys(PROFILE.ucp.supported_versions), ['2026-04-08', '2026-01-23'])
  assert.equal(d.endpoint, 'https://eme-official.myshopify.com/api/ucp/mcp')
  assert.ok(d.capabilities.includes('dev.ucp.shopping.catalog.search') && d.capabilities.includes('dev.ucp.shopping.catalog.lookup'))
  assert.equal(EME_STUDIOS.discoveryOrigin, 'https://checkout.emestudios.com')
  for (const t of ['search_catalog', 'get_product', 'lookup_catalog', 'create_cart', 'create_checkout', 'complete_checkout']) assert.ok(TOOLS.tools.some((x: { name: string }) => x.name === t), `tools/list publica ${t}`)
})

test('búsqueda por necesidad: contexto ES/EUR, perfil del agente, filtro de precio; solo herramientas de catálogo; sin prendas solo de mujer', async () => {
  const { f, calls } = fakeMcp()
  const q = queryFromNeed({ spec: NeedSpec.parse({ category: 'bottom', subcategory: 'jeans' }), price_max: 90 })
  const hits = await emeStudiosProductSource(EME, CFG, { fetch: f, fetchProfile: profileFetch }).searchProducts!(q)
  assert.deepEqual(profileUrls, ['https://checkout.emestudios.com/.well-known/ucp'], 'no se consulta emestudios.com (Cloudflare)')
  assert.ok(calls.every((c) => c.url === 'https://eme-official.myshopify.com/api/ucp/mcp'), 'endpoint anunciado en el perfil')
  const call = calls.find((c) => c.method === 'tools/call')!.params
  assert.equal(call.name, 'search_catalog'); assert.deepEqual(call.arguments.meta, { 'ucp-agent': { profile: CFG.profileUrl } })
  assert.deepEqual(call.arguments.catalog.context, { address_country: 'ES', language: 'es', currency: 'EUR' }); assert.deepEqual(call.arguments.catalog.filters, { price: { max: 9000 } })
  assert.ok(calls.filter((c) => c.method === 'tools/call').every((c) => (CATALOG_TOOLS as readonly string[]).includes(c.params.name)))
  assert.equal(SEARCH.products.length, 2)
  assert.deepEqual(hits.map((h) => h.product_name), ['Solan Denim Pants', 'Ledger Raw Denim Pants'])
  assert.deepEqual(hits[0].raw_attributes.audience, { value: 'unisex', source: 'store' }, '«mujer» + «FOR EVERYONE»: la tienda lo publica para todos')
  const womenOnly = structuredClone(SEARCH); womenOnly.products[0].tags = womenOnly.products[0].tags.filter((t: string) => t !== 'FOR EVERYONE')
  resetUcpState()
  const wf = fakeMcp(); const orig = wf.f
  const onlyWomen = (async (u: string, init: RequestInit) => { const b = JSON.parse(String(init.body)); if (b.params?.name === 'search_catalog') return new Response(JSON.stringify({ jsonrpc: '2.0', id: b.id, result: { isError: false, structuredContent: womenOnly } }), { headers: { 'content-type': 'application/json' } }); return orig(u, init) }) as unknown as typeof fetch
  const hits2 = await emeStudiosProductSource(EME, CFG, { fetch: onlyWomen, fetchProfile: profileFetch }).searchProducts!(q)
  assert.deepEqual(hits2.map((h) => h.product_name), ['Ledger Raw Denim Pants'], 'una prenda etiquetada solo «mujer» no se propone')
  assert.equal(hits[0].source_label, 'EME Studios (UCP)'); assert.equal(hits[0].source_kind, 'api')
})

test('normalización con datos reales: precio, precio anterior, tallas, sin composición ni marca inventadas, público de la tienda, procedencia', () => {
  const now = new Date('2026-11-09T21:00:00Z')
  const p = normalizeEmeProduct(SEARCH.products[1], EME, now)!
  assert.equal(p.product_name, 'Ledger Raw Denim Pants'); assert.equal(p.product_url, 'https://checkout.emestudios.com/products/ledger-raw-denim-pants')
  assert.equal(p.current_price, 65); assert.equal(p.currency, 'EUR'); assert.deepEqual(p.raw_attributes.previous_price, { amount: 89, currency: 'EUR', source: 'store' })
  assert.deepEqual(p.variants.map((v) => v.size), ['34', '36', '38', '40', '42', '44', '46']); assert.ok(p.variants.every((v) => v.availability === 'in_stock' || v.availability === 'out_of_stock'))
  assert.equal(p.confirmed_composition, null, 'la descripción solo indica la talla del modelo: composición desconocida')
  assert.equal(p.brand, null, 'el nombre no incluye la marca: desconocida, no inventada'); assert.equal(p.field_sources.brand, undefined)
  assert.deepEqual(p.raw_attributes.audience, { value: 'hombre', source: 'store' })
  assert.equal(p.subcategory, 'jeans'); assert.equal(p.field_sources.subcategory.source, 'derived'); assert.equal(p.field_sources.current_price.source, 'store')
  assert.match(p.description!, /Modelo \(hombre\) 188 cm/)
  assert.ok(p.images.length && p.images.every((i) => i.permission === 'link_only' && /cdn\.shopify\.com/.test(i.url)))
  assert.equal(p.raw_attributes.fetched_at, now.toISOString()); assert.equal(p.external_product_id, 'gid://shopify/Product/10769808294222')
  assert.equal(retailerForUrl(p.product_url, [EME]), EME, 'los enlaces de checkout.emestudios.com son de la tienda')
  assert.equal(audienceOf(['FOR EVERYONE', 'mujer']), 'unisex'); assert.equal(audienceOf(['mujer']), 'mujer'); assert.equal(audienceOf([]), null)
  const detail = normalizeEmeProduct(DETAIL.product, EME)!
  assert.equal(detail.variants.length, 7); assert.ok(detail.variants.every((v) => v.availability === 'unknown'), 'el detalle sin selección no publica disponibilidad por talla')
})

test('consulta de producto por enlace de la tienda (localizado), con get_product; enlaces no válidos', async () => {
  const { f, calls } = fakeMcp()
  const s = emeStudiosProductSource(EME, CFG, { fetch: f, fetchProfile: profileFetch })
  const r = await s.getProduct!('https://emestudios.com/es/es/products/ledger-raw-denim-pants')
  assert.equal(r.ok, true)
  if (r.ok) { assert.equal(r.product.external_product_id, 'gid://shopify/Product/10769808294222'); assert.ok(r.product.variants.some((v) => v.availability === 'in_stock'), 'se conservan las tallas con disponibilidad'); assert.match(r.note, /catálogo oficial de EME Studios/) }
  assert.deepEqual(calls.filter((c) => c.method === 'tools/call').map((c) => c.params.name), ['search_catalog', 'get_product'])
  assert.equal((await s.getProduct!('https://emestudios.com/es/es/collections/pantalones')).ok, false)
  assert.equal((await s.getProduct!('https://emestudios.com/es/es/products/no-existe')).ok, false)
})

test('límites y políticas: 429 sin reintentos en bucle, sin perfil no hay llamadas, tienda excluida, registro de conectores', async () => {
  const limited = fakeMcp(true)
  const s = emeStudiosProductSource(EME, CFG, { fetch: limited.f, fetchProfile: profileFetch })
  await assert.rejects(s.searchProducts!(queryFromText('pantalón vaquero')), /limita las consultas: inténtalo en 20 s/)
  const before = limited.calls.length
  await assert.rejects(s.searchProducts!(queryFromText('pantalón vaquero')), /limita las consultas/)
  assert.equal(limited.calls.length, before, 'mientras dura Retry-After no se vuelve a llamar')
  resetUcpState()
  const { f, calls } = fakeMcp()
  const noProfile = emeStudiosProductSource(EME, { ...CFG, profileUrl: null }, { fetch: f, fetchProfile: profileFetch })
  assert.equal(noProfile.available().ok, false); await assert.rejects(noProfile.searchProducts!(queryFromText('pantalón')), /SHOPPING_UCP_PROFILE_URL/)
  assert.deepEqual(await emeStudiosProductSource(EME, CFG, { fetch: f, fetchProfile: profileFetch }).searchProducts!({ ...queryFromText('pantalón'), excluded: ['eme-studios'] }), [])
  assert.equal(calls.length, 0)
  assert.equal(connectorSource(EME).label, 'EME Studios (UCP)'); assert.equal(connectorSource({ ...EME, slug: 'grimey', name: 'Grimey', domains: ['grimey.com'] }).label, 'Grimey (UCP)')
  const r = RETAILERS.find((x) => x.id === 'eme-studios')!
  assert.equal('connector' in r && r.connector, 'ucp')
  const sql = readFileSync('supabase/migrations/0020_eme_studios.sql', 'utf8'); assert.match(sql, /'eme-studios', 'EME Studios'[\s\S]*'ucp'\)/)
  const src = readFileSync('lib/shopping/catalog/eme-studios.ts', 'utf8')
  for (const t of ['create_cart', 'create_checkout', 'update_checkout', 'complete_checkout', 'get_order']) assert.ok(!src.includes(`'${t}'`), `el conector no referencia ${t}`)
})
