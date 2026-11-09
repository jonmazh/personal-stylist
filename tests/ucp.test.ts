import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CATALOG_TOOLS, UcpError, blockFor, callCatalogTool, catalogTools, compositionFromText, discover, normalizeUcpProduct, parseDiscovery, resetUcpState, rpc, takeSlot, ucpSource } from '@/lib/shopping/catalog/ucp'
import { queryFromNeed, queryFromText } from '@/lib/shopping/catalog/query'
import { NeedSpec, RETAILERS } from '@/lib/shopping/taxonomy'

process.env.SHOPPING_FETCH_VIA_PROXY = '1'   // las pruebas no resuelven DNS: la red es simulada
const fx = (f: string) => JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8'))
const PROFILE = fx('grimey-ucp-profile.json'), SEARCH = fx('grimey-search-catalog.json'), DETAIL = fx('grimey-get-product.json'), TOOLS = fx('grimey-tools-list.json')
const GRIMEY = { id: 'r-grimey', slug: 'grimey', name: 'Grimey', domains: ['grimey.com'], url_policy: 'metadata' as const, connector: 'ucp' }
const CFG = { profileUrl: 'https://app.example/.well-known/ucp', market: 'ES', language: 'es', currency: 'EUR' }
const profileFetch = (async () => ({ url: 'https://grimey.com/.well-known/ucp', status: 200, contentType: 'application/json', body: JSON.stringify(PROFILE) })) as never

type Call = { method: string; params: any; headers: Record<string, string> }
/** Servidor MCP simulado con las respuestas reales de Grimey. */
function fakeMcp(handler?: (c: Call) => { status?: number; body?: unknown; headers?: Record<string, string>; raw?: string } | undefined) {
  const calls: Call[] = []
  const f = (async (url: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body)); const c = { method: b.method, params: b.params, headers: init.headers as Record<string, string> }
    calls.push(c)
    const custom = handler?.(c)
    if (custom) return new Response(custom.raw ?? JSON.stringify(custom.body), { status: custom.status ?? 200, headers: { 'content-type': 'application/json', ...(custom.headers ?? {}) } })
    const ok = (result: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id: b.id, result }), { headers: { 'content-type': 'application/json' } })
    if (b.method === 'initialize') return ok({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'universal-commerce', version: '0.1.0' } })
    if (b.method === 'tools/list') return ok(TOOLS)
    const name = b.params.name
    if (name === 'search_catalog') return ok({ content: [], isError: false, structuredContent: SEARCH })
    if (name === 'get_product') return b.params.arguments.catalog.id === DETAIL.product.id ? ok({ isError: false, structuredContent: DETAIL }) : ok({ isError: true, structuredContent: { ucp: {}, messages: [{ type: 'error', code: 'product_not_found', content: 'Product not found', severity: 'unrecoverable' }] } })
    return ok({ isError: true, structuredContent: { messages: [{ type: 'error', code: 'unexpected', content: 'no' }] } })
  }) as unknown as typeof fetch
  return { f, calls }
}
beforeEach(() => resetUcpState())

test('descubrimiento UCP: endpoint MCP y capacidades de catálogo del perfil real de Grimey; validaciones', async () => {
  const d = parseDiscovery(PROFILE)
  assert.equal(d.version, '2026-08-25'); assert.equal(d.endpoint, 'https://grimeywear.myshopify.com/api/ucp/mcp')
  assert.ok(d.capabilities.includes('dev.ucp.shopping.catalog.search') && d.capabilities.includes('dev.ucp.shopping.catalog.lookup'))
  assert.throws(() => parseDiscovery({ nada: 1 }), /no es válido/)
  assert.throws(() => parseDiscovery({ ucp: { version: 'x', services: {} } }), /endpoint MCP/)
  const noCat = structuredClone(PROFILE); delete noCat.ucp.capabilities['dev.ucp.shopping.catalog.search']
  assert.throws(() => parseDiscovery(noCat), /búsqueda de catálogo/)
  const forged = structuredClone(PROFILE); forged.ucp.capabilities['dev.ucp.shopping.catalog.search'][0].schema = 'https://evil.example/catalog_search.json'
  assert.throws(() => parseDiscovery(forged), /búsqueda de catálogo/, 'un esquema fuera de ucp.dev no vale para dev.ucp.*')
  const http = structuredClone(PROFILE); http.ucp.services['dev.ucp.shopping'][0].endpoint = 'http://grimey.com/api/ucp/mcp'
  assert.throws(() => parseDiscovery(http), /endpoint MCP/, 'solo HTTPS')
  let n = 0; const counting = (async () => { n++; return { url: '', status: 200, contentType: 'application/json', body: JSON.stringify(PROFILE) } }) as never
  await discover('https://grimey.com', counting); await discover('https://grimey.com', counting); assert.equal(n, 1, 'el descubrimiento se cachea')
  await assert.rejects(discover('https://otra.example', (async () => ({ url: '', status: 404, contentType: 'text/html', body: '' })) as never), /respondió 404/)
})

test('búsqueda por necesidad: perfil del agente, contexto ES/EUR, filtro de precio en céntimos y solo herramientas de catálogo', async () => {
  const { f, calls } = fakeMcp()
  const q = queryFromNeed({ id: 'n1', spec: NeedSpec.parse({ category: 'bottom', subcategory: 'joggers', colors: ['Negro'] }), price_min: 20, price_max: 60 })
  const hits = await ucpSource(GRIMEY, CFG, { fetch: f, fetchProfile: profileFetch }).searchProducts!(q)
  assert.deepEqual(calls.map((c) => c.method), ['initialize', 'tools/list', 'tools/call'])
  const call = calls[2].params
  assert.equal(call.name, 'search_catalog')
  assert.deepEqual(call.arguments.meta, { 'ucp-agent': { profile: CFG.profileUrl } })
  assert.equal(call.arguments.catalog.query, q.text); assert.deepEqual(call.arguments.catalog.context, { address_country: 'ES', language: 'es', currency: 'EUR' })
  assert.deepEqual(call.arguments.catalog.filters, { price: { min: 2000, max: 6000 } }); assert.equal(call.arguments.catalog.pagination.limit, 10)
  assert.match(calls[2].headers['user-agent'], /PersonalStylistBot/)
  assert.equal(hits.length, 1, 'el crema no es negro: la coincidencia lo descarta')
  assert.equal(hits[0].product_name, 'PANTALÓN CHANDAL GRIMEY CAUSING PANIC - BLACK | SS24'); assert.equal(hits[0].source_kind, 'api'); assert.equal(hits[0].source_label, 'Grimey (UCP)')
  assert.ok(calls.every((c) => c.method !== 'tools/call' || (CATALOG_TOOLS as readonly string[]).includes(c.params.name)), 'nunca carrito ni checkout')
  await ucpSource(GRIMEY, CFG, { fetch: f, fetchProfile: profileFetch }).searchProducts!(queryFromText('pantalón negro'))
  assert.equal(calls.filter((c) => c.method === 'tools/list').length, 1, 'tools/list se reutiliza')
})

test('normalización con datos reales: precio y precio anterior, tallas con disponibilidad, composición literal, procedencia, imágenes enlazadas', () => {
  const now = new Date('2026-11-09T20:00:00Z')
  const black = normalizeUcpProduct(SEARCH.products[0], GRIMEY, now)!
  assert.equal(black.current_price, 29.9); assert.equal(black.currency, 'EUR')
  assert.deepEqual(black.raw_attributes.previous_price, { amount: 79.9, currency: 'EUR', source: 'store' })
  assert.equal(black.subcategory, 'joggers'); assert.deepEqual(black.colors, ['Negro']); assert.equal(black.field_sources.primary_color.source, 'derived')
  assert.equal(black.confirmed_composition, 'Material: 100% ALGODÓN'); assert.equal(black.field_sources.confirmed_composition.source, 'store')
  assert.equal(black.field_sources.current_price.source, 'store'); assert.equal(black.field_sources.product_name.source, 'store'); assert.equal(black.field_sources.subcategory.source, 'derived')
  assert.equal(black.brand, 'Grimey'); assert.equal(black.field_sources.brand.source, 'derived', 'la marca no la publica UCP: se deduce del nombre')
  assert.equal(black.variants.length, 8); assert.deepEqual(black.variants.map((v) => v.size), ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'])
  assert.ok(black.variants.some((v) => v.availability === 'in_stock') && black.variants.some((v) => v.availability === 'out_of_stock'))
  assert.equal(black.availability_status, 'in_stock')
  assert.equal(black.external_product_id, 'gid://shopify/Product/10137726255434'); assert.equal(black.canonical_url, 'https://grimey.com/products/grimey-causing-panic-sweatpants-black-ss24')
  assert.ok(black.images.length >= 1 && black.images.every((i) => i.permission === 'link_only' && i.origin === 'store'), 'imágenes solo enlazadas')
  assert.equal(black.raw_attributes.fetched_at, now.toISOString())
  assert.ok((black.raw_attributes.collections as string[]).length >= 1)
})

test('agotados, precio ausente, composición desconocida y talla según opciones (get_product)', () => {
  const p = structuredClone(SEARCH.products[0])
  for (const v of p.variants) v.availability = { available: false }
  assert.equal(normalizeUcpProduct(p, GRIMEY)!.availability_status, 'out_of_stock')
  const noPrice = structuredClone(SEARCH.products[0]); delete noPrice.price_range; delete noPrice.list_price_range; for (const v of noPrice.variants) delete v.price
  const np = normalizeUcpProduct(noPrice, GRIMEY)!
  assert.equal(np.current_price, null); assert.equal(np.field_sources.current_price, undefined); assert.equal(np.raw_attributes.previous_price, null)
  const noComp = structuredClone(SEARCH.products[0]); noComp.description = { html: 'Pantalón cómodo de felpa.' }
  const nc = normalizeUcpProduct(noComp, GRIMEY)!
  assert.equal(nc.confirmed_composition, null, 'sin porcentajes publicados, composición desconocida')
  const zeroList = structuredClone(SEARCH.products[0]); zeroList.list_price_range = { min: { amount: 0, currency: 'EUR' }, max: { amount: 0, currency: 'EUR' } }
  assert.equal(normalizeUcpProduct(zeroList, GRIMEY)!.raw_attributes.previous_price, null, 'list_price 0 no es un precio anterior')
  const detail = normalizeUcpProduct(DETAIL.product, GRIMEY)!
  assert.equal(detail.variants.length, 8, 'una variante devuelta, tallas desde options'); assert.ok(detail.variants.every((v) => v.availability === 'unknown'), 'sin disponibilidad publicada: desconocida, no inventada')
  assert.equal(compositionFromText('EXTERIOR: 50% Polyamide / 50% Polyamide INTERIOR: 100% Polyester El modelo mide 1.84m'), 'EXTERIOR: 50% Polyamide / 50% Polyamide INTERIOR: 100% Polyester')
  const withOpts = structuredClone(DETAIL.product); withOpts.options[0].values = withOpts.options[0].values.map((v: any, i: number) => ({ ...v, available: i % 2 === 0, exists: true }))
  assert.deepEqual(normalizeUcpProduct(withOpts, GRIMEY)!.variants.slice(0, 2).map((v) => v.availability), ['in_stock', 'out_of_stock'])
})

test('consulta individual por URL: resuelve el handle con search_catalog y pide el detalle con get_product', async () => {
  const { f, calls } = fakeMcp()
  const s = ucpSource(GRIMEY, CFG, { fetch: f, fetchProfile: profileFetch })
  const r = await s.getProduct!('https://grimey.com/products/grimey-causing-panic-sweatpants-black-ss24?variant=1')
  assert.equal(r.ok, true)
  if (r.ok) { assert.equal(r.how, 'ucp'); assert.equal(r.product.external_product_id, 'gid://shopify/Product/10137726255434'); assert.ok(r.product.variants.some((v) => v.availability === 'in_stock'), 'se quedan las tallas con disponibilidad de la búsqueda'); assert.match(r.note, /catálogo oficial de Grimey/) }
  assert.deepEqual(calls.filter((c) => c.method === 'tools/call').map((c) => c.params.name), ['search_catalog', 'get_product'])
  assert.equal(calls.find((c) => c.params?.name === 'search_catalog')!.params.arguments.catalog.query, 'grimey causing panic sweatpants black ss24')
  const missing = await s.getProduct!('https://grimey.com/products/no-existe')
  assert.equal(missing.ok, false); assert.match((missing as any).message, /No he encontrado ese producto/)
  const notProduct = await s.getProduct!('https://grimey.com/collections/all')
  assert.equal(notProduct.ok, false)
  await assert.rejects(s.getById('gid://shopify/Product/1'), (e: unknown) => e instanceof UcpError && e.code === 'not_found')
  assert.equal((await s.getById(DETAIL.product.id)).product_name, DETAIL.product.title)
})

test('errores: JSON-RPC, herramienta con error, perfil inaccesible (424), 429 con Retry-After, respuesta ilegible y timeout', async () => {
  const ep = 'https://shop.example/api/ucp/mcp'
  await assert.rejects(rpc(ep, 'tools/list', {}, fakeMcp(() => ({ body: { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid params' } } })).f), /Error MCP: Invalid params/)
  await assert.rejects(rpc(ep, 'tools/call', {}, fakeMcp(() => ({ status: 424, raw: '{"code":"profile_unreachable"}' })).f), (e: unknown) => e instanceof UcpError && e.code === 'unavailable' && /URL pública/.test(e.message))
  resetUcpState()
  await assert.rejects(rpc(ep, 'tools/list', {}, fakeMcp(() => ({ status: 429, raw: '{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"Rate limit exceeded"}}', headers: { 'retry-after': '30' } })).f), (e: unknown) => e instanceof UcpError && e.code === 'rate_limited' && e.retryAfter === 30)
  const { f, calls } = fakeMcp()
  await assert.rejects(rpc(ep, 'tools/list', {}, f), (e: unknown) => e instanceof UcpError && e.code === 'rate_limited', 'tras un 429 se espera sin volver a llamar')
  assert.equal(calls.length, 0)
  resetUcpState()
  await assert.rejects(rpc(ep, 'tools/list', {}, fakeMcp(() => ({ raw: 'esto no es json' })).f), /ilegible/)
  const sse = await rpc(ep, 'tools/list', {}, fakeMcp(() => ({ raw: 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n\n', headers: { 'content-type': 'text/event-stream' } })).f)
  assert.deepEqual(sse, { tools: [] }, 'respuestas en SSE')
  const hang = (async (_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' }))))) as unknown as typeof fetch
  await assert.rejects(rpc(ep, 'tools/list', {}, hang, 50), (e: unknown) => e instanceof UcpError && e.code === 'timeout')
  const toolErr = fakeMcp((c) => (c.method === 'tools/call' ? { body: { jsonrpc: '2.0', id: 1, result: { isError: true, structuredContent: { messages: [{ type: 'error', code: 'invalid_input', content: 'Bad filter' }] } } } } : undefined))
  await assert.rejects(callCatalogTool(ep, CFG.profileUrl, 'search_catalog', {}, toolErr.f), /Bad filter/)
  await assert.rejects(rpc('http://127.0.0.1:9/mcp', 'tools/list', {}, fakeMcp().f), /internas/, 'el endpoint pasa la protección SSRF')
})

test('límites y políticas: frecuencia por tienda, sin perfil no hay llamadas, tiendas excluidas, herramientas no publicadas, nada transaccional', async () => {
  resetUcpState()
  const t0 = 1_000_000
  assert.deepEqual(takeSlot('s', t0), { ok: true, wait: 0 })
  const second = takeSlot('s', t0 + 10); assert.ok(second.ok && second.wait > 0, 'espacio mínimo entre llamadas')
  for (let i = 0; i < 18; i++) takeSlot('s', t0 + 20 + i)
  assert.equal(takeSlot('s', t0 + 100).ok, false, 'máximo 20 llamadas por minuto y tienda')
  assert.equal(takeSlot('s', t0 + 70_000).ok, true)
  blockFor('b', 10, t0); assert.deepEqual(takeSlot('b', t0 + 1000), { ok: false, retryAfter: 9 })
  resetUcpState()
  const { f, calls } = fakeMcp()
  const noProfile = ucpSource(GRIMEY, { ...CFG, profileUrl: null }, { fetch: f, fetchProfile: profileFetch })
  assert.equal(noProfile.available().ok, false)
  await assert.rejects(noProfile.searchProducts!(queryFromText('pantalón')), /SHOPPING_UCP_PROFILE_URL/)
  assert.equal(calls.length, 0, 'sin perfil del agente no se llama a la tienda')
  const s = ucpSource(GRIMEY, CFG, { fetch: f, fetchProfile: profileFetch })
  assert.deepEqual(await s.searchProducts!({ ...queryFromText('pantalón'), excluded: ['grimey'] }), [])
  assert.deepEqual(await s.searchProducts!({ ...queryFromText('pantalón'), retailers: ['cos'] }), [])
  assert.equal(calls.length, 0, 'tienda excluida o no preferida: ninguna llamada')
  await assert.rejects(callCatalogTool('https://x.example/mcp', CFG.profileUrl, 'create_checkout' as never, {}, f), /solo consulta el catálogo/)
  resetUcpState()
  const noTools = fakeMcp((c) => (c.method === 'tools/list' ? { body: { jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'create_cart' }] } } } : undefined))
  assert.deepEqual(await catalogTools('https://y.example/mcp', CFG.profileUrl, noTools.f), [])
  await assert.rejects(ucpSource(GRIMEY, CFG, { fetch: noTools.f, fetchProfile: profileFetch }).searchProducts!(queryFromText('pantalón')), /no publica la herramienta search_catalog/)
  const g = RETAILERS.find((r) => r.id === 'grimey')!
  assert.equal('connector' in g && g.connector, 'ucp'); assert.deepEqual([...g.domains], ['grimey.com'])
  const sql = readFileSync('supabase/migrations/0019_ucp_connector.sql', 'utf8'); assert.match(sql, /connector in \('ucp'\)/)
})

test('perfil UCP público de la app: solo capacidades de catálogo y cabeceras exigidas por UCP', async () => {
  const { GET, UCP_AGENT_PROFILE } = await import('@/app/.well-known/ucp/route')
  assert.deepEqual(Object.keys(UCP_AGENT_PROFILE.ucp.capabilities).sort(), ['dev.ucp.shopping.catalog.lookup', 'dev.ucp.shopping.catalog.search'])
  assert.deepEqual(UCP_AGENT_PROFILE.ucp.payment_handlers, {}); assert.ok(UCP_AGENT_PROFILE.ucp.services['dev.ucp.shopping'])
  assert.ok(Object.values(UCP_AGENT_PROFILE.ucp.capabilities).flat().every((c) => c.schema.startsWith('https://ucp.dev/')), 'vinculación de autoridad')
  const res = GET()
  assert.match(res.headers.get('cache-control')!, /public, max-age=(\d{2,})/); assert.ok(Number(res.headers.get('cache-control')!.match(/max-age=(\d+)/)![1]) >= 60)
  assert.equal(parseDiscovery({ ucp: { ...UCP_AGENT_PROFILE.ucp, services: { 'dev.ucp.shopping': [{ ...UCP_AGENT_PROFILE.ucp.services['dev.ucp.shopping'][0], endpoint: 'https://x.example/mcp' }] } } }).capabilities.length, 2)
  const proxy = readFileSync('lib/supabase/proxy.ts', 'utf8'); assert.match(proxy, /path === '\/\.well-known\/ucp'/, 'accesible sin sesión ni redirección')
})
