// Prueba e2e de la fase 4B: Product Discovery con una tienda y un buscador de prueba (tests/e2e/fake-store.mjs, puerto 4700).
// La app debe arrancar con SHOPPING_SEARCH_PROVIDER=brave SHOPPING_SEARCH_KEY=test SHOPPING_SEARCH_URL=http://127.0.0.1:4700/search
// SHOPPING_FETCH_ALLOW_HOSTS=127.0.0.1:4700. Cubre: tiendas y su política, feed autorizado, búsqueda desde una necesidad (sin duplicados,
// solo tiendas conocidas), importación por URL (schema.org, robots.txt, Inditex, SSRF, sin metadatos), importación asistida con capturas,
// procedencia por campo, verificación con historial de precios, descarte con motivo, caché y aislamiento entre usuarios (app y RLS).
const { chromium, devices } = require('playwright'); const assert = require('assert'); const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const { signup, png } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100', STORE = 'http://127.0.0.1:4700'
const log = (...a) => console.log('✔', ...a)
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

;(async () => {
  const br = await chromium.launch()
  const ctx = await br.newContext({ ...devices['iPhone 13'] })
  const p = await ctx.newPage(); p.setDefaultTimeout(30000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const main = () => p.locator('main').innerText()
  const req = (page) => ({
    get: async (path, status = 200) => { const r = await page.request.get(U + path); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
    post: async (path, data, status = 201) => { const r = await page.request.post(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
    patch: async (path, data, status = 200) => { const r = await page.request.patch(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
  })
  const A = req(p)
  const noOverflow = async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sin desbordamiento horizontal')
  const pid = () => p.url().split('?')[0].split('/').pop()
  await fetch(`${STORE}/admin/price?v=89.00`)
  await signup(p, U); log('registro y login (iPhone 13)')

  const need = (await A.post('/api/shopping/needs', { title: 'Pantalón de vestir gris', type: 'need', spec: { category: 'bottom', subcategory: 'trousers', colors: ['Gris'], cut: 'Recto', seasons: ['otono', 'invierno'], occasions: ['trabajo'] }, price_max: 100 })).id

  // ── Tiendas y fuentes ──
  await go('/compras/fuentes'); let t = await main()
  assert.match(t, /Buscador de productos\s*Configurado/i)
  assert.match(t, /Solo enlace y tus datos\s*Zara\s*zara\.com\s*Las condiciones de Inditex prohíben la extracción automatizada/i)
  await p.click('summary:has-text("Añadir una tienda")')
  const rf = p.locator('form:has(input[name=domains])')
  await rf.locator('input[name=name]').fill('Tienda Test'); await rf.locator('input[name=domains]').fill('127.0.0.1'); await rf.locator('select[name=url_policy]').selectOption('metadata')
  await p.click('button:has-text("Añadir tienda")'); await p.waitForURL(/retailer=1/)
  await A.post('/api/shopping/retailers', { name: 'Duplicada', domains: ['127.0.0.1'] }, 400)
  await A.post('/api/shopping/retailers', { name: 'Mala', domains: ['no es un dominio'] }, 400)
  await p.click('summary:has-text("Añadir un feed")')
  const ff = p.locator('form:has(input[name=authorization_note])')
  await ff.locator('input[name=name]').fill('Catálogo de prueba'); await ff.locator('input[name=authorization_note]').fill('Feed de prueba cedido por Tienda Test')
  await ff.locator('input[name=feed_url]').fill(`${STORE}/feed.csv`); await p.click('button:has-text("Guardar y sincronizar")'); await p.waitForURL(/source=1/)
  t = await main(); assert.match(t, /Catálogo de prueba[\s\S]*3 productos/i, 'agrupa variantes: 4 filas → 3 productos')
  await A.post('/api/shopping/sources', { name: 'Sin autorización', feed_url: `${STORE}/feed.csv`, authorization_note: '' }, 400)
  await noOverflow(); await shot('pd-sources')
  log('tiendas con su política (Inditex: solo enlace), tienda propia validada, feed autorizado sincronizado (variantes agrupadas), autorización obligatoria')

  // ── Búsqueda desde la necesidad ──
  await go(`/compras/necesidades/${need}`); await p.click('button:has-text("Buscar productos")'); await p.waitForURL(/compras\/buscar\?s=/); await p.waitForLoadState('networkidle')
  t = await main()
  assert.match(t, /Para «Pantalón de vestir gris»/)
  assert.match(t, /Feed · Catálogo de prueba: 1 resultado/i); assert.match(t, /Buscador de productos: 2 resultados/i)
  const q = await (await fetch(`${STORE}/admin/last-query`)).text()
  assert.match(q, /Pantalón de vestir gris recto hombre/); assert.match(q, /site:zara\.com/); assert.match(q, /site:127\.0\.0\.1/)
  const hits = p.locator('.hit')
  assert.equal(await hits.count(), 2, 'feed + Zara; sin duplicado del buscador, sin tienda desconocida, sin camisa, sin el chino beige ni el de 140 €')
  assert.match(await hits.nth(0).innerText(), /Tienda Test · Feed autorizado[\s\S]*Pantalón recto de lana gris[\s\S]*89,00 €[\s\S]*Disponible[\s\S]*100 % lana[\s\S]*Coincidencia 100\/100/i)
  assert.match(await hits.nth(1).innerText(), /Zara · Buscador de productos[\s\S]*Precio sin comprobar[\s\S]*en esta tienda, a mano/i)
  assert.doesNotMatch(t, /desconocida\.example|Camisa blanca|Chino beige|marengo/i)
  await noOverflow(); await shot('pd-search')
  const sid = new URL(p.url()).searchParams.get('s')
  const again = await A.post('/api/shopping/search', { need_id: need }, 200)
  assert.equal(again.cached, true); assert.equal(again.id, sid, 'misma búsqueda en 24 h → caché')
  assert.equal((await A.post('/api/shopping/search', { need_id: need, force: true }, 200)).cached, false)
  await A.post('/api/shopping/search', { text: 'x' }, 400)
  log('búsqueda desde la necesidad: criterios → consulta, solo tiendas conocidas, sin duplicados (gana el feed), orden por coincidencia, caché 24 h')

  // Guardar el enlace de Zara: sin datos de la tienda, verificación manual
  await hits.nth(1).locator('button:has-text("Guardar como candidato")').click(); await p.waitForURL(/productos\/[0-9a-f-]{36}\?saved=1/); await p.waitForLoadState('networkidle')
  const zara = pid(); t = await main()
  assert.match(t, /Datos sin verificar en la tienda/i); assert.match(t, /Buscador/); assert.match(t, /Composición desconocida/i); assert.match(t, /Precio\s*Sin comprobar/i)
  assert.equal(await p.locator('button:has-text("Volver a comprobar en la fuente")').count(), 0, 'Zara: no se consulta su web')
  await p.fill('input[name=price]', '69,95'); await p.selectOption('select[name=availability]', 'in_stock'); await p.fill('input[name=sizes]', '46, 48')
  await p.click('button:has-text("Lo he comprobado yo")'); await p.waitForURL(/verified=/); t = await main()
  assert.match(t, /Comprobado por ti en la tienda/); assert.match(t, /Precio\s*69,95 €\s*Tú/i); assert.match(t, /46: disponible · 48: disponible/i)
  log('candidato desde el buscador (Zara): sin datos inventados; verificación hecha por ti con fecha y procedencia')

  // ── Importación por URL ──
  await go(`/compras/importar?need=${need}`)
  await p.fill('input[name=url]', `${STORE}/p/pantalon-lana.html?utm_source=newsletter`); await p.click('button:has-text("Importar")'); await p.waitForURL(/productos\/[0-9a-f-]{36}\?imported=1/); await p.waitForLoadState('networkidle')
  const wool = pid(); t = await main()
  assert.match(t, /robots\.txt permite leer esta página[\s\S]*schema\.org/i)
  assert.match(t, /Nombre\s*Pantalón recto de lana gris\s*Tienda/i); assert.match(t, /Composición\s*100 % lana\s*Tienda/i); assert.match(t, /Precio\s*89,00 €\s*Tienda/i)
  assert.match(t, /Tipo\s*Pantalón de vestir\s*Deducido/i); assert.match(t, /Color\s*Antracita\s*Tienda/i)
  assert.match(t, /48 \(Gris oscuro\): disponible · 50 \(Gris oscuro\): agotado/i); assert.match(t, /Para: Pantalón de vestir gris/)
  assert.match(t, /imagen 1[\s\S]*solo enlazadas: no se copian/i)
  assert.doesNotMatch(t, /1,00 €/, 'no se lee el HTML visible')
  await noOverflow(); await shot('pd-product')
  const same = await A.post('/api/shopping/import', { url: `${STORE}/p/pantalon-lana.html#x`, need_id: need }, 201)
  assert.equal(same.id, wool); assert.equal(same.updated, true, 'la misma URL canónica no se duplica')
  log('importación por URL: robots.txt, solo schema.org, procedencia por campo, variantes, imágenes solo enlazadas, sin duplicados')

  // Corrección tuya + verificación con cambio de precio
  await p.click('summary:has-text("Corregir datos")'); await p.selectOption('form:has(input[name=product_name]) select[name=primary_color]', 'Gris'); await p.click('button:has-text("Guardar correcciones")'); await p.waitForURL(/edited=1/)
  assert.match(await main(), /Color\s*Gris(, Antracita)?\s*Tú/i)
  await fetch(`${STORE}/admin/price?v=79.00`)
  await p.click('button:has-text("Volver a comprobar en la fuente")'); await p.waitForURL(/verified=/); t = await main()
  assert.match(t, /Precio\s*79,00 €\s*Tienda/i); assert.match(t, /Color\s*Gris(, Antracita)?\s*Tú/i, 'tu corrección no se pisa al reimportar')
  assert.match(t, /Historial: 79,00 € disponible[\s\S]*89,00 € disponible/i)
  log('verificación: el nuevo precio queda en el historial; tus correcciones no se sobrescriben')

  // Casos que no se descargan
  const imp = async (url) => A.post('/api/shopping/import', { url }, 201)
  let r = await imp('https://www.zara.com/es/es/pantalon-p0123.html'); assert.equal(r.ok, false); assert.equal(r.reason, 'policy'); assert.match(r.message, /Inditex/)
  r = await imp(`${STORE}/privado/oferta.html`); assert.equal(r.ok, false); assert.equal(r.reason, 'robots')
  r = await imp(`${STORE}/redir`); assert.equal(r.ok, false); assert.equal(r.reason, 'blocked'); assert.match(r.message, /direcciones internas/)
  r = await imp('http://localhost:54321/rest/v1/'); assert.equal(r.ok, false); assert.equal(r.reason, 'blocked')
  r = await imp(`${STORE}/p/sin-datos.html`); assert.equal(r.ok, false); assert.equal(r.reason, 'no_metadata')
  r = await imp(`${STORE}/p/camisa-og.html`); assert.equal(r.ok, true)
  assert.equal((await A.get(`/api/shopping/products/${r.id}`)).current_price, 45)
  await A.post('/api/shopping/import', { url: 'ftp://x.com/a' }, 400)
  log('no se descarga: Inditex (condiciones), robots.txt, redirección a IP interna, localhost, página sin metadatos; OpenGraph sí')

  // ── Importación asistida ──
  await go(`/compras/importar?need=${need}`)
  await p.fill('input[name=url]', `${STORE}/privado/oferta.html`); await p.click('button:has-text("Importar")'); await p.waitForURL(/importar\?.*msg=/); await p.waitForLoadState('networkidle')
  t = await main(); assert.match(t, /robots\.txt del sitio no permite leer esta página/i)
  assert.equal(await p.locator('input[name=product_url]').inputValue(), `${STORE}/privado/oferta.html`, 'el enlace pasa a la importación asistida')
  await p.fill('input[name=product_name]', 'Pantalón de franela gris oscuro'); await p.fill('input[name=price]', '95'); await p.fill('input[name=sizes]', '48')
  await p.click('button:has-text("Guardar producto")'); await p.waitForURL(/created=1/); await p.waitForLoadState('networkidle')
  const manual = pid(); t = await main()
  assert.match(t, /Nombre\s*Pantalón de franela gris oscuro\s*Tú/i); assert.match(t, /Composición\s*Composición desconocida/i); assert.match(t, /Tienda\s*Tienda Test/i)
  await p.locator('input[aria-label="Elegir capturas del producto"]').setInputFiles({ name: 'captura.png', mimeType: 'image/png', buffer: png(400, 600, (x, y) => [120 + (x % 40), 120, 125]) })
  await p.waitForSelector('.shots img'); assert.equal(await p.locator('.shots img').count(), 1)
  const img = (await A.get(`/api/shopping/products/${manual}`)).images.find((i) => i.origin === 'user')
  assert.match(img.storage_path, new RegExp(`/${manual}/`)); assert.match(img.signed_url, /token=/)
  log('importación asistida: tus datos (procedencia «tú», sin inventar composición) y capturas privadas con URL firmada')

  // Descartar con motivo; listados
  await A.patch(`/api/shopping/products/${zara}`, { status: 'discarded' }, 400)
  await go(`/compras/productos/${zara}`); await p.fill('input[name=discard_reason]', 'Prefiero lana'); await p.click('button:has-text("Descartar")'); await p.waitForURL(/status=discarded/)
  assert.match(await main(), /Descartado: «Prefiero lana»/)
  const active = await A.get(`/api/shopping/products?need_id=${need}`)
  assert.ok(active.some((x) => x.id === wool) && !active.some((x) => x.id === zara), 'el descartado sale de los activos')
  await go(`/compras/necesidades/${need}`); t = await main(); assert.match(t, /\d candidatos? para esta necesidad[\s\S]*Pantalón recto de lana gris/i)
  await go('/compras/productos'); t = await main(); assert.match(t, /Pantalón de vestir gris[\s\S]*Pantalón recto de lana gris/i); await noOverflow()
  log('descarte con motivo; candidatos por necesidad en su ficha y en el catálogo')

  // ── Aislamiento ──
  const ctxB = await br.newContext(); const b = await ctxB.newPage(); b.setDefaultTimeout(30000)
  const emailB = await signup(b, U); const B = req(b)
  await B.get(`/api/shopping/products/${wool}`, 404); await B.get(`/api/shopping/search/${sid}`, 404)
  assert.equal((await B.get('/api/shopping/products?status=all')).length, 0)
  const rB = await B.get('/api/shopping/retailers'); assert.equal(rB.length, 11, 'B ve el catálogo común (10 tiendas + Grimey por UCP), no la tienda de A')
  assert.equal((await B.get('/api/shopping/sources')).sources.length, 0)
  await B.patch(`/api/shopping/products/${wool}`, { status: 'discarded', discard_reason: 'x' }, 404)
  await B.post('/api/shopping/search', { need_id: need }, 404)
  await B.post('/api/shopping/import', { manual: { product_name: 'x', need_id: need } }, 400)
  log('app: B no ve ni toca productos, búsquedas, tiendas ni feeds de A, ni usa sus necesidades')
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  const { data: au, error: le } = await sb.auth.signInWithPassword({ email: emailB, password: 'password123' }); assert.ok(!le, le?.message)
  for (const tb of ['external_products', 'external_product_variants', 'product_price_history', 'shopping_searches', 'product_sources', 'product_feed_items']) assert.equal((await sb.from(tb).select('id')).data.length, 0, `RLS ${tb}`)
  assert.equal((await sb.from('retailers').select('id')).data.length, 11)
  const e1 = await sb.from('external_products').insert({ user_id: au.user.id, product_name: 'x', source_kind: 'manual', need_id: need }); assert.ok(e1.error && /row-level security/i.test(e1.error.message), 'RLS: necesidad ajena')
  const e2 = await sb.from('retailers').update({ url_policy: 'metadata' }).eq('slug', 'zara').select('id'); assert.equal(e2.data?.length ?? 0, 0, 'RLS: nadie cambia la política de una tienda común')
  const e3 = await sb.from('external_product_variants').insert({ user_id: au.user.id, product_id: wool, size: 'x' }); assert.ok(e3.error, 'RLS: variante en producto ajeno')
  const dl = await sb.storage.from('shopping-private').download(img.storage_path); assert.ok(dl.error, 'Storage: B no descarga capturas de A')
  log('RLS directo: B no lee ni escribe datos de A; las tiendas comunes no se pueden modificar; capturas privadas')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
