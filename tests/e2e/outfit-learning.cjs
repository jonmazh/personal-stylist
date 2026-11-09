// Prueba e2e de la fase 3D: valoraciones con motivos, registro de uso, aprendizaje (patrón detectado, confirmado y
// aplicado por el motor), fórmulas (detectada, guardada, probada), evaluación teórica y visual con foto, aislamiento.
const { chromium, devices } = require('playwright'); const assert = require('assert')
const { until, png, signup } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
const photo = () => png(600, 900, (x, y) => (((x >> 5) + (y >> 5)) % 2 ? [60, 70, 110] : [200, 190, 170]))

;(async () => {
  const br = await chromium.launch()
  const ctx = await br.newContext({ ...devices['iPhone 13'] })
  const p = await ctx.newPage(); p.setDefaultTimeout(45000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const post = async (page, path, data, status = 201) => { const r = await page.request.post(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() }
  const noOverflow = async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sin desbordamiento horizontal')
  const pick = (scope, name, value) => p.locator(`${scope} .opts label:has(input[name="${name}"][value="${value}"])`).click()
  await signup(p, U); log('registro y login (iPhone 13)')

  const all = ['primavera', 'verano', 'otono', 'invierno']
  const ids = {}
  for (const [k, g] of Object.entries({
    polo: { name: 'Polo marino', category: 'top', subcategory: 'polo', primary_color: 'Azul marino', formality_level: 3 },
    polo2: { name: 'Polo crudo', category: 'top', subcategory: 'polo', primary_color: 'Crudo', formality_level: 3 },
    shirt: { name: 'Camisa blanca', category: 'top', subcategory: 'shirt', primary_color: 'Blanco', formality_level: 3 },
    chino: { name: 'Chino beige', category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', formality_level: 3, cut: 'Recto' },
    chino2: { name: 'Chino marrón', category: 'bottom', subcategory: 'chinos', primary_color: 'Marrón', formality_level: 3, cut: 'Recto' },
    loafers: { name: 'Mocasines', category: 'footwear', subcategory: 'loafers', primary_color: 'Marrón', formality_level: 4 },
    sneakers: { name: 'Zapatillas blancas', category: 'footwear', subcategory: 'sneakers', primary_color: 'Blanco', formality_level: 2 },
    boots: { name: 'Botas', category: 'footwear', subcategory: 'boots', primary_color: 'Marrón', formality_level: 3 },
  })) ids[k] = (await post(p, '/api/wardrobe/items', { status: 'active', pattern: 'Liso', silhouette: 'Regular', seasons: all, ...g })).id
  const outfit = async (name, items, occasion = 'cena_amigos') => (await post(p, '/api/outfits', { name, occasion, status: 'saved', items })).id
  const A = await outfit('Polo y mocasines', [{ garment_id: ids.polo, role: 'top_base' }, { garment_id: ids.chino, role: 'bottom' }, { garment_id: ids.loafers, role: 'footwear' }])
  const B = await outfit('Camisa y zapatillas', [{ garment_id: ids.shirt, role: 'top_base' }, { garment_id: ids.chino, role: 'bottom' }, { garment_id: ids.sneakers, role: 'footwear' }])
  const C = await outfit('Polo crudo y mocasines', [{ garment_id: ids.polo2, role: 'top_base' }, { garment_id: ids.chino, role: 'bottom' }, { garment_id: ids.loafers, role: 'footwear' }])
  log('armario y tres conjuntos guardados')

  // ── Valorar y registrar uso desde la ficha ──
  await go(`/outfits/${A}`)
  await pick('.fbform', 'rating', 'love'); await pick('.fbform', 'flags', 'would_repeat')
  await p.click('.fbform button:has-text("Guardar valoración")'); await p.waitForURL(/rated=1/); await p.waitForLoadState('networkidle')
  let t = await p.locator('main').innerText()
  assert.match(t, /Valoración guardada/); assert.match(t, /Me encanta[^\n]*lo repetiría/i)
  await p.check('.wearform input[name=comfortable]'); await p.check('.wearform input[name=well_dressed]'); await p.fill('.wearform input[name=note]', 'Cena con el equipo')
  await p.click('.wearform button:has-text("Me lo he puesto")'); await p.waitForURL(/worn=1/); await p.waitForLoadState('networkidle')
  t = await p.locator('main').innerText()
  assert.match(t, /Te lo has puesto 1 vez/); assert.match(t, /cómodo · bien vestido · Cena con el equipo/)
  await noOverflow(); await shot('learn-ficha')
  await go(`/armario/${ids.loafers}`); assert.match(await p.locator('main').innerText(), /Te la has puesto 1 vez \(última: /)
  log('valoración (me encanta + lo repetiría) y uso real con comodidad y confianza; la prenda muestra su frecuencia de uso')

  // ── Validaciones de la API ──
  await post(p, `/api/outfits/${A}/feedback`, {}, 400)
  await post(p, `/api/outfits/${A}/feedback`, { rating: 'like', reasons: ['colors'] }, 400)
  await post(p, `/api/outfits/${A}/feedback`, { rating: 'dislike', reasons: ['garment'], garment_id: ids.boots }, 400)
  const future = new Date(Date.now() + 864e5 * 3).toISOString().slice(0, 10)
  await post(p, `/api/outfits/${A}/wear`, { worn_on: future }, 400)
  log('API: sin valoración, motivos con «me gusta», prenda ajena al conjunto y fecha futura rechazados')

  // ── Aprendizaje: una valoración no cambia nada; dos proponen un patrón; confirmarlo lo aplica ──
  await post(p, `/api/outfits/${B}/feedback`, { rating: 'dislike', reasons: ['garment'], garment_id: ids.sneakers })
  await go('/outfits/aprendizaje'); assert.doesNotMatch(await p.locator('main').innerText(), /No te convence «Zapatillas blancas»/)
  await post(p, `/api/outfits/${B}/feedback`, { rating: 'dislike', reasons: ['garment', 'too_formal'], garment_id: ids.sneakers })
  await go('/outfits/aprendizaje'); t = await p.locator('main').innerText()
  assert.match(t, /Detectado · aún sin efecto[\s\S]*No te convence «Zapatillas blancas»/i); assert.match(t, /La has señalado 2 veces/)
  assert.match(t, /Tu Style Blueprint no se modifica/)
  let gen = await post(p, '/api/outfits/generate', { occasion: 'dia_a_dia', number_of_outfits: 3 })
  assert.ok(!gen.stats.excluded.some((e) => /Zapatillas/.test(e.garment)), 'sin confirmar, no se excluye')
  await p.locator('.pattern:has-text("Zapatillas blancas") button:has-text("Confirmar")').click(); await p.waitForURL(/decided=confirm/); await p.waitForLoadState('networkidle')
  assert.match(await p.locator('.pattern:has-text("Zapatillas blancas")').innerText(), /Confirmado por ti/i)
  gen = await post(p, '/api/outfits/generate', { occasion: 'dia_a_dia', number_of_outfits: 3 })
  assert.ok(gen.stats.excluded.some((e) => e.garment === 'Zapatillas blancas' && /confirmaste que no te convence/.test(e.reason)), 'confirmado: el motor la deja fuera')
  assert.ok(gen.results.every((r) => !r.garment_ids.includes(ids.sneakers)))
  await shot('learn-patrones'); log('una valoración no cambia nada; dos detectan el patrón; confirmado, el motor deja de proponer la prenda')
  const back = await (await p.request.post(`${U}/api/outfits/learning`, { data: { key: `garment_dislike:${ids.sneakers}`, action: 'reset' } })).json(); assert.equal(back.status, 'detected')

  // ── Fórmulas: detectada en conjuntos que te gustaron, guardada, probada y «probada» al ponértela ──
  await post(p, `/api/outfits/${C}/feedback`, { rating: 'like' })
  await go('/outfits/formulas'); t = await p.locator('main').innerText()
  assert.match(t, /Fórmulas que repites[\s\S]*Polo \+ chinos recto \+ mocasines[\s\S]*En: (Polo y mocasines, Polo crudo y mocasines|Polo crudo y mocasines, Polo y mocasines)/i)
  await p.fill('form:has(input[name=signature]) input[name=name]', 'Casual sofisticado')
  await p.click('button:has-text("Guardar esta fórmula")'); await p.waitForURL(/formulas\/[0-9a-f-]{36}\?created=1/); await p.waitForLoadState('networkidle')
  t = await p.locator('main').innerText()
  assert.match(t, /Casual sofisticado/); assert.match(t, /Pendiente de probar · creada por el estilista/i); assert.match(t, /Polo \+ chinos recto \+ mocasines/)
  assert.match(t, /He evaluado \d+ combinaciones/); assert.ok((await p.locator('.combos .prop-card').count()) >= 2, 'varias variaciones distintas')
  assert.match(t, /Chino marrón/, 'la fórmula funciona con prendas que no estaban en los conjuntos originales')
  await shot('learn-formula')
  await p.locator('.combos .prop-card').first().locator('button:has-text("Guardar como conjunto")').click(); await p.waitForURL(/outfits\/[0-9a-f-]{36}\?saved=1/); await p.waitForLoadState('networkidle')
  const fOutfit = p.url().split('?')[0].split('/').pop()
  await p.click('.wearform button:has-text("Me lo he puesto")'); await p.waitForURL(/worn=1/)
  const fl = await (await p.request.get(`${U}/api/style-formulas`)).json()
  assert.equal(fl.formulas[0].status, 'tested', 'al ponerte un conjunto de la fórmula pasa a «probada»'); assert.equal(fl.suggestions.length, 0, 'ya no se sugiere: la tienes')
  const manual = await post(p, '/api/style-formulas', { name: 'Smart casual', slots: [{ role: 'top_base', subcategories: ['shirt'] }, { role: 'bottom', subcategories: ['chinos'] }, { role: 'footwear', subcategories: ['boots'] }] })
  assert.ok(manual.id); await post(p, '/api/style-formulas', { name: 'Mala', slots: [{ role: 'top_base' }] }, 400)
  void fOutfit
  log('fórmula detectada → guardada (por tipo de prenda), variaciones con otras prendas, guardada como conjunto y «probada» al ponértela; fórmula manual por API')

  // ── Evaluación teórica ──
  await go(`/outfits/${A}`); await p.click('button:has-text("Evaluación teórica")'); await p.waitForURL(/evaluaciones\/[0-9a-f-]{36}/); await p.waitForLoadState('networkidle')
  t = await p.locator('main').innerText()
  assert.match(t, /Qué opino de este conjunto/i); assert.match(t, /Es un conjunto coherente/); assert.match(t, /Sugerencias con tu armario[\s\S]*Calzado: (Zapatillas blancas|Botas)/i)
  assert.match(t, /Validación: Una sugerencia citaba una prenda que no está en tu armario/)
  assert.equal(await p.locator('table.usage tbody tr').count(), 6)
  await go('/outfits/evaluar')
  for (const gid of [ids.shirt, ids.chino2, ids.boots]) await p.check(`input[name=garment][value="${gid}"]`)
  await p.click('button:has-text("Evaluar la combinación")'); await p.waitForURL(/evaluaciones\//); await p.waitForLoadState('networkidle')
  assert.match(await p.locator('main').innerText(), /Base superior: Camisa blanca[\s\S]*Parte inferior: Chino marrón[\s\S]*Calzado: Botas/i)
  log('evaluación teórica de un conjunto y de una selección libre: motor + estilista; sugerencia inventada descartada')

  // ── Evaluación visual con foto (se borra tras el análisis) ──
  await go(`/outfits/${A}`); await p.click('summary:has-text("Evaluación con una foto tuya")')
  await p.locator('input[aria-label="Elegir foto del conjunto puesto"]').setInputFiles({ name: 'look.png', mimeType: 'image/png', buffer: photo() })
  await p.click('button:has-text("Evaluar con la foto")'); await until(p.locator('.visualeval [role=alert]'), /Confirma que entiendes/)
  await p.check('text=Entiendo que la foto se guarda'); await p.click('button:has-text("Evaluar con la foto")')
  await p.waitForURL(/evaluaciones\/[0-9a-f-]{36}/, { timeout: 60000 }); await p.waitForLoadState('networkidle')
  const evalId = p.url().split('/').pop()
  t = await p.locator('main').innerText()
  assert.match(t, /Cómo te queda el conjunto/i); assert.match(t, /Corresponde al conjunto previsto\? Sí/i)
  assert.match(t, /Largo de las prendas\s*No observable/i); assert.match(t, /Lo que la foto no permite verificar[\s\S]*largo del pantalón/i)
  assert.match(t, /La foto se borró tras el análisis/); assert.doesNotMatch(t, /inventado/)
  const ev = await (await p.request.get(`${U}/api/outfits/evaluations/${evalId}`)).json(); assert.equal(ev.photo_path, null); assert.ok(ev.photo_deleted_at)
  await go('/outfits/evaluar')
  await p.locator('input[aria-label="Elegir foto del conjunto puesto"]').setInputFiles({ name: 'look2.png', mimeType: 'image/png', buffer: photo() })
  await p.check('text=Entiendo que la foto se guarda'); await p.check('text=Conservar la foto después del análisis')
  await p.click('button:has-text("Evaluar con la foto")'); await p.waitForURL(/evaluaciones\/[0-9a-f-]{36}/, { timeout: 60000 }); await p.waitForLoadState('networkidle')
  assert.match(await p.locator('img.evalphoto').getAttribute('src'), /outfits-private\/.*token=/, 'foto privada firmada')
  assert.match(await p.locator('main').innerText(), /Sin conjunto previsto/)
  await p.click('button:has-text("Borrar la foto")'); await p.waitForURL(/photo_deleted=1/)
  assert.equal(await p.locator('img.evalphoto').count(), 0)
  await shot('learn-visual'); log('evaluación visual: lo no observable se indica, la foto se borra tras el análisis (o se conserva privada y firmada hasta que la borras)')

  // ── Propuestas valorables y métricas ──
  const g2 = await post(p, '/api/outfits/generate', { occasion: 'cena_amigos', number_of_outfits: 1 })
  const fbp = await post(p, '/api/outfits/feedback', { result_id: g2.results[0].id, rating: 'like', flags: ['worn'] })
  assert.ok(fbp.outfit_id && fbp.wear_id, '«me lo he puesto» en una propuesta la guarda como conjunto y registra el uso')
  await go('/outfits/aprendizaje'); t = await p.locator('.metrics').innerText()
  assert.match(t, /\d+ %\s*Te gustan/i); assert.match(t, /1\/\d+\s*Propuestas del estilista que te has puesto/i)
  await go('/outfits'); assert.match(await p.locator('.ozones').innerText(), /te gustan · \d+ puestos · \d+ repetirías/i)
  assert.match(await p.locator('.ocard:has-text("Polo y mocasines")').innerText(), /Puesto 1 vez/)
  log('valorar una propuesta («me lo he puesto» la guarda y registra el uso); métricas de gustos, uso y repetición')

  // ── Aislamiento ──
  const ctxB = await br.newContext(); const b = await ctxB.newPage(); await signup(b, U)
  assert.equal((await b.request.get(`${U}/api/outfits/evaluations/${evalId}`)).status(), 404)
  assert.equal((await b.request.post(`${U}/api/outfits/${A}/feedback`, { data: { rating: 'like' } })).status(), 404)
  assert.equal((await b.request.post(`${U}/api/outfits/${A}/wear`, { data: {} })).status(), 404)
  assert.equal((await (await b.request.get(`${U}/api/style-formulas`)).json()).formulas.length, 0)
  assert.equal((await (await b.request.get(`${U}/api/outfits/learning`)).json()).patterns.length, 0)
  log('aislamiento: B no ve evaluaciones, fórmulas ni patrones de A, ni puede valorar o registrar sus conjuntos')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
