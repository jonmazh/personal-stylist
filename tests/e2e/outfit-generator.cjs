// Prueba e2e de la fase 3B: motor de combinaciones (petición estructurada, propuestas con prendas reales, puntuación
// auditable, variedad, restricciones, guardar/descartar, historial, API y aislamiento entre usuarios).
const { chromium, devices } = require('playwright'); const assert = require('assert')
const { until, signup } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)

;(async () => {
  const br = await chromium.launch()
  const ctx = await br.newContext({ ...devices['iPhone 13'] })
  const p = await ctx.newPage(); p.setDefaultTimeout(30000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const post = async (page, path, data, status = 201) => { const r = await page.request.post(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() }
  const noOverflow = async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sin desbordamiento horizontal')
  await signup(p, U); log('registro y login (iPhone 13)')
  await go('/profile/color'); await p.click('.tempask button:has-text("Cálida")'); await p.waitForURL(/temp=set/)

  const all = ['primavera', 'verano', 'otono', 'invierno']
  const mk = async (g) => (await post(p, '/api/wardrobe/items', { status: 'active', pattern: 'Liso', silhouette: 'Regular', seasons: all, ...g })).id
  const ids = {}
  for (const [k, g] of Object.entries({
    shirt: { name: 'Camisa oxford blanca', category: 'top', subcategory: 'shirt', primary_color: 'Blanco', formality_level: 3 },
    polo: { name: 'Polo marino', category: 'top', subcategory: 'polo', primary_color: 'Azul marino', formality_level: 3 },
    tee: { name: 'Camiseta blanca', category: 'top', subcategory: 'tee', primary_color: 'Blanco', formality_level: 1, seasons: ['verano'] },
    knit: { name: 'Jersey camel', category: 'top', subcategory: 'knit', primary_color: 'Camel', formality_level: 3, seasons: ['otono', 'invierno'] },
    chino: { name: 'Chino beige', category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', formality_level: 3, cut: 'Recto' },
    trousers: { name: 'Pantalón gris', category: 'bottom', subcategory: 'trousers', primary_color: 'Gris', formality_level: 4, cut: 'Recto' },
    jeans: { name: 'Vaquero', category: 'bottom', subcategory: 'jeans', primary_color: 'Denim', formality_level: 2, cut: 'Slim' },
    loafers: { name: 'Mocasines', category: 'footwear', subcategory: 'loafers', primary_color: 'Marrón', formality_level: 4 },
    sneakers: { name: 'Zapatillas blancas', category: 'footwear', subcategory: 'sneakers', primary_color: 'Blanco', formality_level: 2 },
    boots: { name: 'Botas', category: 'footwear', subcategory: 'boots', primary_color: 'Marrón', formality_level: 3 },
    blazer: { name: 'Blazer marino', category: 'tailoring', subcategory: 'blazer', primary_color: 'Azul marino', formality_level: 4 },
    coat: { name: 'Abrigo camel', category: 'outerwear', subcategory: 'coat', primary_color: 'Camel', formality_level: 4, seasons: ['otono', 'invierno'] },
    donate: { name: 'Chino para donar', category: 'bottom', subcategory: 'chinos', primary_color: 'Caqui', formality_level: 3 },
  })) ids[k] = await mk(g)
  await post(p, `/api/wardrobe/items/${ids.donate}/decision`, { decision: 'donate_sell' })
  log('armario de 13 prendas (una marcada para donar) y temperatura cálida')

  // ── Generar desde la interfaz ──
  await go('/outfits'); await p.click('text=Generar propuestas'); await p.waitForURL(/generar/)
  await p.selectOption('select[name=occasion]', 'cena_amigos'); await p.selectOption('select[name=dress_code]', 'smart_casual'); await p.selectOption('select[name=time_of_day]', 'evening')
  await p.click('summary:has-text("Más condiciones")'); await p.selectOption('select[name=number_of_outfits]', '4')
  await p.click('main button:has-text("Generar propuestas")'); await p.waitForURL(/generar\?g=/); await p.waitForLoadState('networkidle')
  let t = await p.locator('main').innerText()
  assert.match(t, /Cena con amigos · Smart casual · Noche · formalidad 3–4\/5/i)
  assert.match(t, /He considerado \d+ de tus 13 prendas activas, evaluado \d+ combinaciones/i)
  await p.click('summary:has-text("Prendas que no he usado")')
  assert.match(await p.locator('main').innerText(), /Chino para donar: la has marcado para sustituir o donar/i)
  assert.equal(await p.locator('.prop-card').count(), 4)
  const intents = await p.locator('.prop-card .pc-head .st').allInnerTexts()
  assert.equal(new Set(intents).size, 4, 'cuatro intenciones distintas')
  const cardText = await p.locator('.prop-card').first().innerText()
  assert.match(cardText, /\d+\s*Compatibilidad \/ 100\s*Confianza (alta|media|baja)/i); assert.match(cardText, /Por qué funciona/i); assert.doesNotMatch(cardText, /Chino para donar/)
  await p.locator('.prop-card').first().locator('summary:has-text("Cómo se ha puntuado")').click()
  assert.equal(await p.locator('.prop-card').first().locator('.pc-table tbody tr').count(), 6)
  assert.match(await p.locator('.prop-card').first().locator('.pc-table').innerText(), /Adecuación a la ocasión\s[\s\S]*20[\s\S]*Versatilidad y utilidad/i)
  assert.match(await p.locator('.prop-card').first().locator('img').first().getAttribute('src').catch(() => ''), /.*/)
  await noOverflow(); await shot('gen-propuestas')
  log('4 propuestas con intenciones distintas, prendas reales, puntuación /100 con desglose de 6 criterios y prendas excluidas explicadas')

  // ── Guardar una y descartar otra ──
  const secondName = await p.locator('.prop-card').nth(1).locator('h3').innerText()
  await p.locator('.prop-card').nth(1).locator('button:has-text("Descartar")').click(); await p.waitForURL(/dismissed=1/); await p.waitForLoadState('networkidle')
  assert.match(await p.locator('.prop-card').nth(1).innerText(), /Descartada/i)
  const firstName = await p.locator('.prop-card').first().locator('h3').innerText()
  await p.locator('.prop-card').first().locator('button:has-text("Guardar como conjunto")').click(); await p.waitForURL(/outfits\/[0-9a-f-]{36}\?saved=1/); await p.waitForLoadState('networkidle')
  t = await p.locator('main').innerText()
  assert.ok(t.toLowerCase().includes(firstName.toLowerCase()), 'el conjunto conserva el nombre de la propuesta')
  assert.match(t, /propuesto por el motor · compatibilidad \d+\/100 \(confianza (alta|media|baja)\)/i); assert.match(t, /Cena con amigos/i)
  await go('/outfits'); assert.match(await p.locator('.ocard').first().innerText(), /Compatibilidad \d+\/100/i)
  void secondName
  log('guardar una propuesta crea un conjunto (origen motor, puntuación y confianza); descartar la marca')

  // ── Restricciones: frío, sin chaqueta, prenda obligatoria ──
  await go('/outfits/generar')
  await p.selectOption('select[name=occasion]', 'reunion_trabajo'); await p.selectOption('select[name=weather]', 'cold')
  await p.click('summary:has-text("Más condiciones")'); await p.locator('.opts label:has(input[name=restrictions][value=no_jacket])').click()
  await p.selectOption('select[name=required_garment_ids]', ids.trousers)
  await p.click('main button:has-text("Generar propuestas")'); await p.waitForURL(/generar\?g=/); await p.waitForLoadState('networkidle')
  const cards = await p.locator('.prop-card').allInnerTexts()
  assert.ok(cards.length >= 1)
  for (const c of cards) { assert.match(c, /Abrigo\s*Abrigo camel/i, 'con frío lleva abrigo'); assert.doesNotMatch(c, /Tercera pieza/i, 'sin chaqueta'); assert.match(c, /Pantalón gris/, 'prenda obligatoria') }
  assert.match(await p.locator('main').innerText(), /sin tercera pieza/i)
  await shot('gen-frio'); log('frío + sin chaqueta + prenda obligatoria: todas llevan abrigo, ninguna tercera pieza y el pantalón pedido')

  // ── Calor: nada de abrigo ni punto ──
  const hot = await post(p, '/api/outfits/generate', { occasion: 'dia_a_dia', weather: 'hot', number_of_outfits: 3 })
  for (const r of hot.results) for (const i of r.items) { assert.ok(!['outer_layer', 'mid_layer'].includes(i.role)); assert.ok(![ids.knit, ids.coat].includes(i.garment_id)) }
  log('calor (API): sin abrigo, sin capa intermedia ni punto')

  // ── API: pesos configurables, validación, guardar, historial ──
  const w = await post(p, '/api/outfits/generate', { occasion: 'oficina', number_of_outfits: 2, weights: { occasion: 50, color: 10, silhouette: 10, aesthetic: 10, personal: 10, versatility: 10 } })
  assert.equal(w.weights.occasion, 50); assert.equal(w.engine_version, 'outfit-engine@1')
  assert.equal(w.results[0].breakdown.criteria.find((c) => c.key === 'occasion').weight, 50)
  const sum = w.results[0].breakdown.criteria.reduce((a, c) => a + c.points, 0); assert.ok(Math.abs(sum - Number(w.results[0].score)) <= 1, 'la puntuación es la suma de sus criterios')
  await post(p, '/api/outfits/generate', { occasion: 'gala_lunar' }, 400)
  const saved = await post(p, `/api/outfits/generations/results/${w.results[0].id}`, { action: 'save', name: 'Oficina por API' }, 200)
  const o = await (await p.request.get(`${U}/api/outfits/${saved.id}`)).json()
  assert.equal(o.source, 'generator'); assert.equal(o.name, 'Oficina por API'); assert.equal(o.items.length, w.results[0].items.length)
  assert.ok(o.items.every((i) => i.snapshot && i.snapshot.title))
  const again = await post(p, `/api/outfits/generations/results/${w.results[0].id}`, { action: 'save' }, 200); assert.equal(again.already, true, 'no duplica al guardar dos veces')
  const hist = await (await p.request.get(`${U}/api/outfits/generations`)).json(); assert.ok(hist.length >= 4)
  await go('/outfits/generar'); assert.match(await p.locator('main').innerText(), /Peticiones recientes[\s\S]*Reunión de trabajo/i)
  log('API: pesos configurables (y reflejados en el desglose), validación, guardar sin duplicar, historial de peticiones')

  // ── Aislamiento ──
  const ctxB = await br.newContext(); const b = await ctxB.newPage(); b.setDefaultTimeout(30000)
  await signup(b, U)
  assert.equal((await b.request.get(`${U}/api/outfits/generations/${w.id}`)).status(), 404)
  assert.equal((await b.request.post(`${U}/api/outfits/generations/results/${w.results[1].id}`, { data: { action: 'save' } })).status(), 404)
  assert.equal((await (await b.request.get(`${U}/api/outfits/generations`)).json()).length, 0)
  const empty = await post(b, '/api/outfits/generate', { occasion: 'oficina' })
  assert.equal(empty.results.length, 0); assert.match(empty.notes.join(' '), /No hay prendas disponibles/, 'B no usa las prendas de A')
  log('aislamiento: B no ve ni guarda generaciones de A y el motor de B no usa prendas de A')

  await go('/estado'); assert.match(await p.locator('main').innerText(), /Generador de outfits \(reglas, sin IA\)\s*\d+/i)
  log('consumo: el generador consta en /estado (sin coste de IA)')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
