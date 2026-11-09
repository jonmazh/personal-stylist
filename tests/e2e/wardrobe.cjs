// Prueba e2e de la fase 2A: armario digital (alta con varias fotos, ficha, edicion, filtros, estados, aislamiento entre usuarios).
const { chromium, devices } = require('playwright'); const fs = require('fs'); const assert = require('assert')
const { until, png, signup } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
const photo = (rgb, k = 0) => png(600, 800, (x, y) => (((x >> 5) + (y >> 5) + k) % 2 ? rgb : rgb.map((c) => Math.round(c * 0.7))))

;(async () => {
  const br = await chromium.launch()
  const ctx = await br.newContext({ ...devices['iPhone 13'] })
  const p = await ctx.newPage(); p.setDefaultTimeout(30000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const pick = (name, value) => p.locator(`.opts label:has(input[name="${name}"][value="${value}"])`).click()
  await signup(p, U); log('registro y login (iPhone 13)')

  await go('/armario')
  assert.match(await p.locator('main').innerText(), /Tu armario está vacío/)
  assert.match(await p.locator('.stats').innerText(), /0\s*PRENDAS/i)

  // ── Alta: varias fotos (camara y galeria) + ficha manual ──
  await p.click('text=Añadir prenda'); await p.waitForURL(/armario\/nueva/)
  assert.equal(await p.locator('input[aria-label="Hacer foto de la prenda"]').getAttribute('capture'), 'environment')
  await p.locator('input[aria-label="Hacer foto de la prenda"]').setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: photo([70, 72, 76]) })
  await p.locator('input[aria-label="Elegir fotos de la prenda"]').setInputFiles([
    { name: 'back.png', mimeType: 'image/png', buffer: photo([70, 72, 76], 1) },
    { name: 'label.png', mimeType: 'image/png', buffer: photo([240, 240, 235]) },
  ])
  assert.equal(await p.locator('.staged figure').count(), 3)
  assert.deepEqual(await p.locator('.staged select').evaluateAll((s) => s.map((x) => x.value)), ['front', 'back', 'detail'])
  await p.locator('.staged select').nth(2).selectOption('label')
  await p.selectOption('select[name=category]', 'bottom'); await p.selectOption('select[name=subcategory]', 'trousers')
  const tech = await p.locator('section:has(h3:text("Características técnicas"))').innerText()
  for (const re of [/Tiro/, /Pernera/, /Pinzas/, /Cintura/]) assert.match(tech, re)
  await pick('cut', 'Recto'); await pick('attr_rise', 'Medio'); await pick('attr_pleats', 'Sí'); await pick('pattern', 'Liso'); await pick('formality_level', '4')
  await pick('seasons', 'otono'); await pick('seasons', 'invierno'); await pick('occasions', 'trabajo')
  await p.selectOption('select[name=primary_color]', 'Antracita')
  await p.fill('input[name=apparent_material]', 'Parece sarga de lana')
  await p.fill('input[name=confirmed_composition]', '98 % lana, 2 % elastano'); await p.selectOption('select[name=composition_source]', 'etiqueta')
  await p.fill('input[name=brand]', 'Sastrería Norte'); await p.fill('input[name=size_label]', '42'); await p.fill('input[name=size_fit]', 'En esta marca, una menos')
  await p.fill('input[name=purchase_price]', '89.90')
  await shot('w-nueva')
  await p.click('button:has-text("Guardar en el armario")'); await p.waitForURL(/armario\/[0-9a-f-]{36}\?/)
  const trousersUrl = p.url().split('?')[0]; const trousersId = trousersUrl.split('/').pop()
  await until(p.locator('main'), /Prenda creada en tu armario/)
  const t = await p.locator('main').innerText()
  assert.match(t, /Pantalón de vestir antracita/i); assert.match(t, /98 % lana, 2 % elastano · confirmada \(etiqueta\)/); assert.match(t, /Parece sarga de lana/)
  assert.match(t, /Tiro\s*Medio/); assert.match(t, /Etiqueta 42 · te funciona: En esta marca, una menos/)
  assert.equal(await p.locator('.wimgs figure').count(), 3)
  assert.deepEqual(await p.locator('.wimgs select').evaluateAll((s) => s.map((x) => x.value)), ['front', 'back', 'label'])
  const srcs = await p.locator('.wimgs img').evaluateAll((i) => i.map((x) => x.src))
  assert.ok(srcs.every((s) => /wardrobe-thumbnails\/.*token=/.test(s)), 'miniaturas firmadas')
  await shot('w-ficha'); log('alta con 3 fotos (cámara + galería) y sus funciones; ficha técnica, composición confirmada ≠ material aparente; miniaturas firmadas')

  // ── Borrador sin fotos y confirmacion posterior ──
  await go('/armario/nueva')
  await p.selectOption('select[name=category]', 'top'); await p.selectOption('select[name=subcategory]', 'shirt')
  await p.fill('input[name=name]', 'Camisa oxford'); await p.selectOption('select[name=primary_color]', 'Blanco'); await pick('attr_collar', 'Button-down')
  await p.click('button:has-text("Guardar como borrador")'); await p.waitForURL(/nuevo=1/)
  const shirtId = p.url().split('?')[0].split('/').pop()
  await until(p.locator('main'), /creada como borrador/)
  await go('/armario'); assert.equal(await p.locator('.wcard').count(), 1); assert.match(await p.locator('.stats').innerText(), /1\s*POR REVISAR/i)
  await go('/armario?status=draft'); assert.match(await p.locator('.wgrid').innerText(), /Camisa oxford/)
  await go(`/armario/${shirtId}?tab=caracteristicas`)
  await pick('cut', 'Regular'); await pick('attr_cuff', 'De botón'); await p.fill('input[name=brand]', 'Oxford & Co')
  await p.click('button:has-text("Guardar y confirmar en el armario")'); await p.waitForURL(/saved=1/)
  await until(p.locator('main'), /En el armario/i)
  await go(`/armario/${shirtId}?tab=historial`)
  const h = await p.locator('.events').innerText()
  assert.match(h, /Incorporada/); assert.match(h, /Ficha editada/); assert.match(h, /Corte: — → Regular/); assert.match(h, /Marca: — → Oxford & Co/); assert.match(h, /Cambio de estado/)
  assert.match(h, /Origen actual de los datos: .*Nombre \(tú\)/)
  log('borrador sin fotos → edición → confirmado; historial campo a campo con origen')

  // ── Foto repetida, funcion y borrado de foto ──
  await go(`/armario/${shirtId}`)
  await p.locator('input[aria-label="Elegir fotos de la prenda"]').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: photo([240, 240, 235]) })
  await p.click('button:has-text("Subir 1 foto")'); await until(p.locator('.msg'), /ya estaba en tu armario/)
  await p.waitForTimeout(800); await go(`/armario/${shirtId}`)
  assert.equal(await p.locator('.wimgs figure').count(), 1)
  await p.locator('.wimgs select').selectOption('worn'); await p.click('.wimgs button:has-text("Guardar")'); await p.waitForURL(/tab=resumen/)
  assert.equal(await p.locator('.wimgs select').inputValue(), 'worn')
  await go(`/armario/${shirtId}?tab=ajuste`); assert.match(await p.locator('main').innerText(), /1 foto llevándola puesta/)
  await go(`/armario/${shirtId}`); await p.click('.wimgs button:has-text("Quitar foto")'); await p.waitForURL(/tab=resumen/)
  assert.equal(await p.locator('.wimgs figure').count(), 0)
  log('foto repetida detectada por hash; función editable («llevándola puesta» queda lista para el Fit Assessment); quitar foto')

  // ── Busqueda, filtros, orden y favoritas ──
  await go('/armario?q=sarga'); assert.equal(await p.locator('.wcard').count(), 1); assert.match(await p.locator('.wgrid').innerText(), /antracita/i)
  await go('/armario?category=top'); assert.equal(await p.locator('.wcard').count(), 1); assert.match(await p.locator('.wgrid').innerText(), /Camisa oxford/)
  await go('/armario?sort=name'); assert.match((await p.locator('.wbody b').allInnerTexts())[0], /Camisa oxford/)
  await p.locator('.wcard', { hasText: 'antracita' }).locator('.fav button').click(); await until(p.locator('.wcard', { hasText: 'antracita' }).locator('.fav button'), /★/)
  await go('/armario?favorite=1'); assert.equal(await p.locator('.wcard').count(), 1); assert.equal(await p.locator('.fav button').innerText(), '★')
  await shot('w-dashboard'); log('búsqueda, filtro por categoría, orden por nombre y favoritas')

  // ── Archivar y recuperar; borrado definitivo con confirmacion ──
  await go(`/armario/${trousersId}`); await p.click('button:has-text("Archivar")'); await p.waitForURL(/status=archived/)
  await go('/armario'); assert.equal(await p.locator('.wcard').count(), 1)
  await go('/armario?status=archived'); assert.equal(await p.locator('.wcard').count(), 1)
  await go(`/armario/${trousersId}`); await p.click('button:has-text("Recuperar al armario")'); await p.waitForURL(/status=active/)
  await go('/armario'); assert.equal(await p.locator('.wcard').count(), 2)
  log('archivar (reversible) y recuperar')

  // ── Chat: armario real con ids; borradores fuera ──
  await go('/stylist'); await p.waitForTimeout(800)
  await p.fill('input', '¿Qué me pongo?'); await p.click('button:has-text("Preguntar")'); await p.waitForSelector('text=Respuesta simulada del estilista')
  const sys = JSON.parse(fs.readFileSync(S + '/lastreq.json', 'utf8')).messages[0].content
  assert.match(sys, new RegExp(`\\[${trousersId.slice(0, 8)}\\] Pantalón de vestir antracita \\(Pantalón de vestir, Antracita, Recto, formalidad 4/5, otono/invierno, composición 98 % lana, 2 % elastano, compatibilidad (pendiente|[0-9.]+/10)`))
  assert.match(sys, /No afirmes como le queda una prenda/)
  log('el chat recibe el armario real con ids y la regla de no afirmar el ajuste')

  // ── API y aislamiento entre usuarios ──
  const api = await p.request.get(U + '/api/wardrobe/items?status=all'); assert.equal((await api.json()).items.length, 2)
  const ficha = await (await p.request.get(`${U}/api/wardrobe/items/${trousersId}`)).json()
  const original = ficha.images[0].url; assert.match(original, /wardrobe-originals\/.*token=/)
  const patch = await p.request.patch(`${U}/api/wardrobe/items/${trousersId}`, { data: { cut: 'Entallado' } })
  assert.match((await patch.json()).warnings.join(), /no aplica/)
  const bad = await p.request.post(U + '/api/wardrobe/items', { data: { category: 'zapatos' } }); assert.equal(bad.status(), 400)
  const p2 = await (await br.newContext()).newPage(); await signup(p2, U)
  assert.equal((await (await p2.request.get(U + '/api/wardrobe/items?status=all')).json()).items.length, 0)
  assert.equal((await p2.request.get(`${U}/api/wardrobe/items/${trousersId}`)).status(), 404)
  assert.equal((await p2.request.patch(`${U}/api/wardrobe/items/${trousersId}`, { data: { name: 'mía' } })).status(), 404)
  assert.equal((await p2.request.delete(`${U}/api/wardrobe/items/${trousersId}?mode=permanent`)).status(), 404)
  const path = original.split('/sign/')[1].split('?')[0]
  assert.ok((await p2.request.get(`http://127.0.0.1:54321/storage/v1/object/public/${path}`)).status() >= 400, 'el bucket no es público')
  log('API REST; otro usuario no ve, no edita, no borra ni accede a las fotos (bucket privado)')

  // ── Eliminacion definitiva ──
  await go(`/armario/${shirtId}`); await p.click('summary:has-text("Eliminar definitivamente")'); await p.click('button:has-text("Eliminar prenda")')
  await until(p.locator('.note'), /Marca la casilla/)
  await p.click('summary:has-text("Eliminar definitivamente")'); await p.check('input[name=confirm]'); await p.click('button:has-text("Eliminar prenda")'); await p.waitForURL(/deleted=1/)
  assert.equal(await p.locator('.wcard').count(), 1)
  log('eliminar exige confirmación explícita')

  for (const path of ['/armario', '/armario/nueva', `/armario/${trousersId}`, `/armario/${trousersId}?tab=caracteristicas`, `/armario/${trousersId}?tab=historial`]) {
    await go(path); const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    assert.ok(over <= 0, `${path} se desborda ${over}px en móvil`)
  }
  log('móvil: ninguna pantalla del armario se desborda')
  await br.close()
})().catch((e) => { console.error('✘', e.message); process.exit(1) })
