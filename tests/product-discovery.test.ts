import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canonicalUrl, detectColors, detectKind, mapAvailability, normalizeProduct, parseComposition, parseCurrency, parsePrice, retailerForUrl } from '@/lib/shopping/catalog/normalize'
import { extractProduct } from '@/lib/shopping/catalog/extract'
import { checkUrl, FetchBlocked, isPrivateIp, robotsAllows } from '@/lib/shopping/catalog/net'
import { parseCsv, parseFeed } from '@/lib/shopping/catalog/feed'
import { matchProduct, queryFromNeed, queryFromText } from '@/lib/shopping/catalog/query'
import { feedSource, searchAll, searchProviderSource, urlImportSource, type RetailerRef } from '@/lib/shopping/catalog/sources'
import { AVAILABILITY, FIELD_ORIGINS, PRODUCT_STATUSES, SOURCE_KINDS, URL_POLICIES } from '@/lib/shopping/catalog/taxonomy'
import { NeedSpec, RETAILERS } from '@/lib/shopping/taxonomy'

const SHOPS: RetailerRef[] = RETAILERS.map((r, i) => ({ id: `r${i}`, slug: r.id, name: r.name, domains: r.domains, url_policy: r.url_policy, policy_note: r.note }))

test('tipo de prenda y colores en español e inglés; el nombre manda sobre la categoría de la tienda', () => {
  assert.deepEqual(detectKind('Pantalón de vestir lana gris'), { category: 'bottom', subcategory: 'trousers' })
  assert.deepEqual(detectKind('Slim fit chinos'), { category: 'bottom', subcategory: 'chinos' })
  assert.deepEqual(detectKind('Mocasín piel marrón'), { category: 'footwear', subcategory: 'loafers' })
  assert.deepEqual(detectKind('Camisa oxford'), { category: 'top', subcategory: 'shirt' })
  assert.deepEqual(detectKind('Jersey de punto cuello alto')?.subcategory, 'knit', 'gana la primera palabra que aparece')
  assert.deepEqual(detectKind('Abrigo lana', 'Camisas'), { category: 'outerwear', subcategory: 'coat' })
  assert.deepEqual(detectKind('Producto 123', 'Hombre > Pantalones'), { category: 'bottom', subcategory: 'trousers' })
  assert.deepEqual(detectKind('Producto 123'), { category: null, subcategory: null })
  assert.deepEqual(detectColors('Pantalón azul marino'), ['Azul marino'], '«azul marino» no es también «azul»')
  assert.deepEqual(detectColors('Light grey / navy'), ['Gris claro', 'Azul marino'])
  assert.deepEqual(detectColors('Camisa'), [])
})

test('precio, moneda, disponibilidad y composición: sin porcentajes no hay composición confirmada', () => {
  assert.equal(parsePrice('49,95 €'), 49.95); assert.equal(parsePrice('EUR 1.299,00'), 1299); assert.equal(parsePrice('59.99'), 59.99); assert.equal(parsePrice(35), 35)
  assert.equal(parsePrice('1,299'), 1299); assert.equal(parsePrice('gratis'), null); assert.equal(parsePrice(-3), null)
  assert.equal(parseCurrency(null, '29,95 €'), 'EUR'); assert.equal(parseCurrency('gbp'), 'GBP'); assert.equal(parseCurrency('x'), null)
  assert.equal(mapAvailability('https://schema.org/InStock'), 'in_stock'); assert.equal(mapAvailability('OutOfStock'), 'out_of_stock'); assert.equal(mapAvailability('LimitedAvailability'), 'limited'); assert.equal(mapAvailability(null), 'unknown')
  assert.equal(parseComposition('Exterior: 98% algodón, 2% elastano'), '98 % algodon, 2 % elastano')
  assert.equal(parseComposition('Tejido de lana de gran calidad'), null, 'no se inventa la composición')
})

test('URL canónica sin seguimiento y tienda por dominio (también subdominios)', () => {
  assert.equal(canonicalUrl('https://www.COS.com/es/p/x.html?utm_source=a&color=2#top'), 'https://cos.com/es/p/x.html?color=2')
  assert.equal(canonicalUrl('javascript:alert(1)'), null)
  assert.equal(retailerForUrl('https://shop.arket.com/x', SHOPS)?.slug, 'arket')
  assert.equal(retailerForUrl('https://www.zara.com/es/p1.html', SHOPS)?.url_policy, 'manual_only')
  assert.equal(retailerForUrl('https://notzara.com/x', SHOPS), null, 'un dominio que solo termina igual no cuenta')
})

test('normalización: procedencia por campo, sin inventar; color deducido del nombre se marca como deducido', () => {
  const p = normalizeProduct({ name: 'Pantalón recto lana gris', price: '79,95 €', url: 'https://cos.com/p?utm_source=x', availability: 'InStock', material: '100% lana' }, 'url', 'store', new Date('2026-11-09'))!
  assert.equal(p.subcategory, 'trousers'); assert.equal(p.primary_color, 'Gris'); assert.equal(p.current_price, 79.95); assert.equal(p.currency, 'EUR')
  assert.equal(p.confirmed_composition, '100 % lana'); assert.equal(p.canonical_url, 'https://cos.com/p')
  assert.equal(p.field_sources.product_name.source, 'store'); assert.equal(p.field_sources.current_price.source, 'store')
  assert.equal(p.field_sources.subcategory.source, 'derived'); assert.equal(p.field_sources.primary_color.source, 'derived', 'del nombre, no declarado')
  assert.equal(p.field_sources.description, undefined); assert.equal(p.description, null)
  assert.equal(normalizeProduct({ name: '  ' }, 'manual', 'user'), null)
  const u = normalizeProduct({ name: 'Camisa', color: 'Blanco' }, 'manual', 'user')!
  assert.equal(u.field_sources.primary_color.source, 'user'); assert.equal(u.confirmed_composition, null); assert.equal(u.availability_status, 'unknown')
})

const LD = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"ProductGroup","name":"Pantalón recto de lana","brand":{"@type":"Brand","name":"COS"},"productGroupID":"PG1","description":"Pantalón de lana. Composición: 100% lana.","hasVariant":[
 {"@type":"Product","sku":"PG1-48","size":"48","color":"Gris oscuro","image":"https://img.example/1.jpg","offers":{"@type":"Offer","price":"89.00","priceCurrency":"EUR","availability":"https://schema.org/InStock"}},
 {"@type":"Product","sku":"PG1-50","size":"50","color":"Gris oscuro","offers":{"@type":"Offer","price":"89.00","priceCurrency":"EUR","availability":"https://schema.org/OutOfStock"}}]}</script>
 <script type="application/ld+json">{ roto </script></head><body><span class="price">1 €</span></body></html>`
const OG = `<meta property="og:type" content="product"><meta property="og:title" content="Camisa oxford blanca"><meta property="product:price:amount" content="39,95"><meta property="product:price:currency" content="EUR"><meta property="og:image" content="https://img.example/c.jpg">`

test('extracción: solo schema.org (con variantes) u OpenGraph; nunca el HTML visible', () => {
  const a = extractProduct(LD, 'https://cos.com/p/1')!
  assert.equal(a.how, 'json-ld'); assert.equal(a.product.name, 'Pantalón recto de lana'); assert.equal(a.product.brand, 'COS'); assert.equal(a.product.price, '89.00')
  assert.equal(a.product.variants!.length, 2); assert.equal(a.product.variants![1].availability, 'https://schema.org/OutOfStock'); assert.equal(a.product.color, 'Gris oscuro')
  const n = normalizeProduct(a.product, 'url', 'store')!
  assert.equal(n.primary_color, 'Antracita'); assert.equal(n.confirmed_composition, '100 % lana'); assert.equal(n.variants.filter((v) => v.availability === 'in_stock').length, 1)
  const b = extractProduct(OG, 'https://arket.com/c')!
  assert.equal(b.how, 'opengraph'); assert.equal(normalizeProduct(b.product, 'url', 'store')!.current_price, 39.95)
  assert.equal(extractProduct('<html><h1>Camisa</h1><span>39 €</span></html>', 'https://x.com'), null, 'sin metadatos no se raspa el HTML')
})

test('robots.txt: regla más específica, comodines, grupo propio antes que *', () => {
  const r = 'User-agent: *\nDisallow: /checkout\nDisallow: /*?filter=\nAllow: /checkout/help\n\nUser-agent: PersonalStylistBot\nDisallow: /privado/\n'
  assert.equal(robotsAllows(r, '/es/p/1.html'), true)
  assert.equal(robotsAllows(r, '/privado/x'), false)
  assert.equal(robotsAllows(r, '/checkout'), true, 'nuestro grupo propio sustituye al de *')
  assert.equal(robotsAllows('User-agent: *\nDisallow: /checkout\nAllow: /checkout/help', '/checkout/help/1'), true)
  assert.equal(robotsAllows('User-agent: *\nDisallow: /*?filter=', '/es/list?filter=1'), false)
  assert.equal(robotsAllows('User-agent: *\nDisallow: /', '/x'), false)
  assert.equal(robotsAllows('User-agent: *\nDisallow:', '/x'), true)
  assert.equal(robotsAllows('User-agent: *\nDisallow: /*.pdf$', '/a.pdf'), false); assert.equal(robotsAllows('User-agent: *\nDisallow: /*.pdf$', '/a.pdf?x'), true)
})

test('SSRF: direcciones internas, protocolos y puertos no permitidos se bloquean', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) assert.equal(isPrivateIp(ip), true, ip)
  for (const ip of ['8.8.8.8', '151.101.1.1', '2a00:1450:4003::1']) assert.equal(isPrivateIp(ip), false, ip)
  for (const u of ['http://127.0.0.1/x', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://localhost:3000', 'http://intranet.local/', 'file:///etc/passwd', 'ftp://x.com/a', 'https://user:pw@cos.com/', 'https://cos.com:8443/'])
    await assert.rejects(checkUrl(u), (e: unknown) => e instanceof FetchBlocked, u)
})

const CSV = `id;title;link;price;sale_price;availability;brand;color;size;material;product_type;item_group_id
1;"Chino recto, beige";https://cos.com/p/chino?utm_source=feed;69,00 EUR;59,00 EUR;in stock;COS;Beige;48;98% algodón 2% elastano;Hombre > Pantalones;G1
2;"Chino recto, beige";https://cos.com/p/chino;69,00 EUR;59,00 EUR;out of stock;COS;Beige;50;98% algodón 2% elastano;Hombre > Pantalones;G1
3;Camisa oxford azul claro;https://arket.com/p/oxford;49,00 EUR;;in stock;ARKET;Azul claro;M;100% algodón;Hombre > Camisas;
4;;https://cos.com/sin-nombre;10;;in stock;;;;;;`

test('feeds: CSV con comillas y punto y coma, variantes por grupo, filas sin nombre fuera; JSON y XML', () => {
  assert.equal(parseCsv(CSV).length, 4)
  const items = parseFeed(CSV)
  assert.equal(items.length, 2); assert.equal(items[0].variants!.length, 2); assert.equal(items[0].price, '59,00 EUR', 'precio de oferta')
  const n = normalizeProduct(items[0], 'feed', 'feed')!
  assert.equal(n.subcategory, 'chinos'); assert.equal(n.current_price, 59); assert.equal(n.confirmed_composition, '98 % algodon, 2 % elastano'); assert.equal(n.field_sources.primary_color.source, 'feed')
  const json = parseFeed(JSON.stringify({ products: [{ title: 'Jersey merino gris', link: 'https://uniqlo.com/j', price: 39.9, color: 'Gris' }] }))
  assert.equal(json[0].name, 'Jersey merino gris')
  const xml = parseFeed(`<?xml version="1.0"?><rss xmlns:g="http://base.google.com/ns/1.0"><channel><item><g:id>9</g:id><title><![CDATA[Mocasín piel marrón]]></title><link>https://mango.com/m</link><g:price>79.99 EUR</g:price><g:availability>in_stock</g:availability></item></channel></rss>`)
  assert.equal(xml[0].name, 'Mocasín piel marrón'); assert.equal(normalizeProduct(xml[0], 'feed', 'feed')!.availability_status, 'in_stock')
  assert.throws(() => parseFeed('{roto', 'json'), /JSON válido/)
})

test('búsqueda: desde una necesidad o texto libre; coincidencia explicada, no recomendación', () => {
  const q = queryFromNeed({ id: 'n1', spec: NeedSpec.parse({ category: 'bottom', subcategory: 'chinos', colors: ['Beige'], cut: 'Recto' }), price_max: 70 }, { preferred_retailers: ['cos'], excluded_retailers: ['zara'] })
  assert.match(q.text, /Chinos beige recto hombre/); assert.deepEqual(q.retailers, ['cos']); assert.deepEqual(q.excluded, ['zara'])
  const ok = matchProduct({ product_name: 'Chino recto', description: null, category: 'bottom', subcategory: 'chinos', colors: ['Beige'], current_price: 59, confirmed_composition: null }, q)
  assert.ok(ok.score >= 90 && !ok.misses.length, JSON.stringify(ok))
  const unk = matchProduct({ product_name: 'Chino', description: null, category: 'bottom', subcategory: 'chinos', colors: [], current_price: null, confirmed_composition: null }, q)
  assert.ok(unk.score < ok.score && unk.unknown.includes('Color sin indicar') && unk.unknown.includes('Precio sin comprobar'))
  const bad = matchProduct({ product_name: 'Chino', description: null, category: 'bottom', subcategory: 'chinos', colors: ['Negro'], current_price: 120, confirmed_composition: null }, q)
  assert.equal(bad.misses.length, 2)
  const t = queryFromText('pantalón gris hasta 80 €'); assert.equal(t.subcategory, 'trousers'); assert.deepEqual(t.colors, ['Gris']); assert.equal(t.price_max, 80)
})

test('gestor de fuentes: feed + buscador, sin duplicados (gana el feed), respeta tiendas excluidas y fuentes no disponibles', async () => {
  const q = queryFromNeed({ spec: NeedSpec.parse({ category: 'bottom', subcategory: 'chinos', colors: ['Beige'] }), price_max: 70 }, { excluded_retailers: ['arket'] })
  const items = parseFeed(CSV).map((r) => normalizeProduct(r, 'feed', 'feed')!)
  const feed = feedSource({ id: 's1', name: 'Afiliación' }, items, SHOPS, null)
  let asked = ''
  const fakeFetch = (async (u: URL) => { asked = String(u); return new Response(JSON.stringify({ web: { results: [
    { title: 'Chino recto beige | COS', url: 'https://www.cos.com/p/chino?utm_campaign=x', description: 'Chino de algodón' },
    { title: 'Chino slim beige - Zara', url: 'https://www.zara.com/es/chino-p1.html', description: '' },
    { title: 'Chino beige', url: 'https://random-shop.com/chino', description: '' },
    { title: 'Camisa oxford | ARKET', url: 'https://arket.com/oxford', description: '' }] } }), { status: 200 }) }) as unknown as typeof fetch
  const search = searchProviderSource({ provider: 'brave', key: 'k', url: 'http://mock/search', market: 'ES' }, SHOPS, fakeFetch)
  const none = searchProviderSource({ provider: null, key: null, url: null, market: 'ES' }, SHOPS)
  const { results, statuses } = await searchAll(q, [feed, search, none])
  assert.match(asked, /site%3Acos\.com/); assert.doesNotMatch(asked, /arket/, 'la tienda excluida no se consulta')
  const urls = results.map((r) => r.canonical_url)
  assert.equal(urls.filter((u) => u === 'https://cos.com/p/chino').length, 1, 'sin duplicados')
  assert.equal(results.find((r) => r.canonical_url === 'https://cos.com/p/chino')!.source_kind, 'feed', 'gana la fuente con más datos')
  assert.ok(results.some((r) => r.retailer?.slug === 'zara'), 'del buscador sale el enlace de Zara (enlazar no es extraer)')
  assert.ok(!results.some((r) => /random-shop|arket/.test(r.product_url ?? '')), 'solo tiendas conocidas y no excluidas')
  assert.deepEqual(statuses.map((s) => s.status), ['ok', 'ok', 'unavailable'])
})

test('importación por URL: una tienda con política «solo manual» no se descarga nunca', async () => {
  const r = await urlImportSource(SHOPS).getProduct!('https://www.zara.com/es/es/pantalon-p0123.html')
  assert.equal(r.ok, false); assert.equal((r as { reason: string }).reason, 'policy'); assert.match((r as { message: string }).message, /Inditex prohíben la extracción automatizada/)
  const b = await urlImportSource(SHOPS).getProduct!('http://169.254.169.254/latest')
  assert.equal(b.ok, false); assert.equal((b as { reason: string }).reason, 'blocked')
})

test('migración 0017: CHECK alineados, tiendas sembradas igual que el código, RLS en todas las tablas', () => {
  const sql = readFileSync('supabase/migrations/0017_product_discovery.sql', 'utf8')
  const list = (xs: readonly { id: string }[]) => xs.map((x) => `'${x.id}'`).join(',')
  assert.ok(sql.includes(`(${list(SOURCE_KINDS)})`)); assert.ok(sql.includes(`(${list(AVAILABILITY)})`)); assert.ok(sql.includes(`(${list(PRODUCT_STATUSES)})`)); assert.ok(sql.includes(`(${list(URL_POLICIES)})`))
  assert.ok(FIELD_ORIGINS.length >= 6)
  const sql19 = readFileSync('supabase/migrations/0019_ucp_connector.sql', 'utf8')
  for (const r of RETAILERS) {
    const row = `('${r.id}', '${r.name}', '${r.group}', array[${r.domains.map((d) => `'${d}'`).join(',')}], '${r.url_policy}', '${r.note}'`
    assert.ok('connector' in r ? sql19.includes(`${row}, '${r.connector}')`) : sql.includes(`${row})`), r.id)
  }
  for (const t of ['product_sources', 'product_feed_items', 'shopping_searches', 'external_products', 'external_product_variants', 'product_price_history']) assert.match(sql, new RegExp(`'${t}'`))
  assert.match(sql, /create policy "read retailers"[^;]*user_id is null or user_id = \(select auth\.uid\(\)\)/)
  assert.match(sql, /'shopping-private', 'shopping-private', false/)
})

test('caché de búsquedas: cambia si se configura el buscador, se sincroniza un feed o cambian las tiendas', async () => {
  const { searchCacheKey, sourcesSignature } = await import('@/lib/shopping/catalog-service')
  const q = queryFromText('pantalón gris')
  const shops = [{ id: 'r1', domains: ['cos.com'] }]
  const none = searchCacheKey(q, sourcesSignature({ provider: null, key: null, market: 'ES' }, [], shops))
  const brave = searchCacheKey(q, sourcesSignature({ provider: 'brave', key: 'k', market: 'ES' }, [], shops))
  assert.notEqual(none, brave, 'configurar el buscador invalida la búsqueda guardada sin buscador')
  assert.equal(brave, searchCacheKey(q, sourcesSignature({ provider: 'brave', key: 'otra', market: 'ES' }, [], shops)), 'la clave no forma parte de la caché')
  const feed1 = searchCacheKey(q, sourcesSignature({ provider: 'brave', key: 'k', market: 'ES' }, [{ id: 'f', last_sync_at: '2026-11-01' }], shops))
  assert.notEqual(brave, feed1)
  assert.notEqual(feed1, searchCacheKey(q, sourcesSignature({ provider: 'brave', key: 'k', market: 'ES' }, [{ id: 'f', last_sync_at: '2026-11-09' }], shops)), 'sincronizar el feed invalida')
  assert.notEqual(brave, searchCacheKey(q, sourcesSignature({ provider: 'brave', key: 'k', market: 'ES' }, [], [...shops, { id: 'r2', domains: ['x.com'] }])), 'añadir una tienda invalida')
})
