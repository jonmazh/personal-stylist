// Prueba e2e de la fase 4C: Product Analyzer (IA simulada) y Purchase Evaluator, con la tienda de prueba (fake-store.mjs, 4700)
// y la IA simulada (mock-ai.mjs). Análisis con procedencia (sin composición inventada, calidad documentada solo con cita),
// qué imágenes se envían a la IA, evaluación de compra explicable, redundancia («no lo compraría»), talla con medidas,
// comparación y aislamiento entre usuarios (app y RLS). La app arranca con las mismas variables que product-discovery.cjs.
const { chromium, devices } = require('playwright'); const assert = require('assert'); const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const { signup, png } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100', STORE = 'http://127.0.0.1:4700'
const LAST = process.env.MOCK_LAST || '/tmp/e2e/lastreq.json'
const log = (...a) => console.log('✔', ...a)
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

;(async () => {
  const br = await chromium.launch()
  const ctx = await br.newContext({ ...devices['iPhone 13'] })
  const p = await ctx.newPage(); p.setDefaultTimeout(45000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const main = () => p.locator('main').innerText()
  const sec = (id) => p.locator(`section#${id}`).innerText()
  const req = (page) => ({
    get: async (path, status = 200) => { const r = await page.request.get(U + path); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
    post: async (path, data, status = 201) => { const r = await page.request.post(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
    put: async (path, data, status = 200) => { const r = await page.request.put(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
  })
  const A = req(p)
  const pick = (name, value) => p.locator(`.opts label:has(input[name="${name}"][value="${value}"])`).click()
  const noOverflow = async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sin desbordamiento horizontal')
  const lastAI = () => JSON.parse(fs.readFileSync(LAST, 'utf8'))
  await fetch(`${STORE}/admin/price?v=89.00`)
  await signup(p, U); log('registro y login (iPhone 13)')

  // Perfil y armario
  const save = async (slug, fill) => { await go(`/profile/${slug}`); await fill(); await p.click('main button:has-text("Guardar")'); await p.waitForURL(/saved=1/) }
  await go('/profile/color'); await p.click('.tempask button:has-text("Cálida")'); await p.waitForURL(/temp=set/)
  await save('vida', async () => { await p.fill('input[name=l_trabajo]', '60'); await p.fill('input[name=l_ocio]', '40'); await pick('work_formality', 'Smart casual'); await pick('climate', 'Cuatro estaciones marcadas') })
  await save('prendas', async () => { await pick('p_pantalones', 'Recto') })
  const item = async (g) => (await A.post('/api/wardrobe/items', { status: 'active', occasions: ['trabajo', 'ocio'], seasons: ['primavera', 'otono', 'invierno'], ...g })).id
  const chino = await item({ name: 'Chino beige', category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', cut: 'Recto', formality_level: 3, brand: 'Tienda Test', size_fit: '48' })
  await item({ name: 'Chino beige 2', category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', cut: 'Recto', formality_level: 3 })
  await item({ name: 'Camisa blanca', category: 'top', subcategory: 'shirt', primary_color: 'Blanco', formality_level: 3 })
  await item({ name: 'Polo marino', category: 'top', subcategory: 'polo', primary_color: 'Azul marino', formality_level: 3 })
  await item({ name: 'Jersey gris', category: 'top', subcategory: 'knit', primary_color: 'Gris', formality_level: 3 })
  await item({ name: 'Mocasín marrón', category: 'footwear', subcategory: 'loafers', primary_color: 'Marrón', formality_level: 3 })
  const need = (await A.post('/api/shopping/needs', { title: 'Pantalón de vestir gris', type: 'need', spec: { category: 'bottom', subcategory: 'trousers', colors: ['Gris'], cut: 'Recto', seasons: ['otono', 'invierno'], occasions: ['trabajo'] }, price_max: 100, user_priority: 'high' })).id
  await A.post('/api/shopping/needs', { title: 'Abrigo camel', type: 'need', spec: { category: 'outerwear', subcategory: 'coat', colors: ['Camel'] }, user_priority: 'high' })
  await A.post('/api/shopping/retailers', { name: 'Tienda Test', domains: ['127.0.0.1'], url_policy: 'metadata' })
  const wool = (await A.post('/api/shopping/import', { url: `${STORE}/p/pantalon-lana.html`, need_id: need })).id
  log('perfil, armario (dos chinos beige), necesidades y producto importado por URL')

  // ── Análisis ──
  await go(`/compras/productos/${wool}`); await p.click('button:has-text("Analizar con IA")'); await p.waitForURL(/analyzed=1/); await p.waitForLoadState('networkidle')
  let r = lastAI(); const sys = r.messages.find((m) => m.role === 'system').content
  assert.match(sys, /Eres Product Analyst/)
  const userMsg = r.messages.find((m) => m.role === 'user').content
  assert.equal(typeof userMsg, 'string', 'producto importado de una página: sus imágenes NO se envían a la IA (solo se enlazan)')
  assert.match(userMsg, /Descripción de la tienda: """Pantalón de vestir de pernera recta/); assert.match(userMsg, /NO hay fotografías/)
  let t = await sec('analisis')
  assert.match(t, /Estilo: Smart casual\./); assert.match(t, /Calidad documentada\s*Composición publicada: 100 % lana\s*«100% lana» según la tienda/i)
  assert.match(t, /sin cita literal de la tienda/); assert.match(t, /Estilo «estilo-inventado» fuera del catálogo/)
  assert.match(t, /Sin fotos analizadas/)
  t = await main()
  assert.match(t, /Composición\s*100 % lana\s*Tienda/i, 'la composición de la tienda no la toca la IA'); assert.match(t, /Color\s*Antracita\s*Tienda/i, 'ni el color publicado')
  const prod = await A.get(`/api/shopping/products/${wool}`)
  assert.equal(prod.cut, 'Recto'); assert.equal(prod.field_sources.cut.source, 'ai'); assert.equal(prod.formality_level, 4); assert.deepEqual(prod.style_tags, ['smart-casual'])
  assert.equal(prod.field_sources.subcategory.source, 'ai', 'el tipo deducido del nombre pasa a «IA» con su confianza')
  const cached = await A.post(`/api/shopping/products/${wool}/analyze`, {}, 200); assert.equal(cached.cached, true, 'mismo análisis → caché')
  log('análisis: solo texto (imágenes de la página no se envían), composición y color de la tienda intactos, sin cita no es «documentada», estilo del catálogo, caché')

  await p.locator('input[aria-label="Elegir capturas del producto"]').setInputFiles({ name: 'cap.png', mimeType: 'image/png', buffer: png(400, 600, () => [110, 110, 115]) })
  await p.waitForSelector('.shots img')
  await go(`/compras/productos/${wool}`)
  await p.click('button:has-text("Volver a analizar")'); await p.waitForURL(/analyzed=1/); await p.waitForLoadState('networkidle')
  r = lastAI(); const um = r.messages.find((m) => m.role === 'user').content
  assert.ok(Array.isArray(um) && um.filter((x) => x.type === 'image_url').length === 1, 'tu captura sí se envía'); assert.match(um[0].text, /captura o foto del usuario/)
  t = await sec('analisis'); assert.match(t, /Calidad aparente \(fotos\)\s*Tejido con buena caída/i); assert.match(t, /Hay fotos con modelo: su ajuste no es el tuyo/)
  log('con tu captura: se envía (y solo ella), calidad aparente separada de la documentada, aviso de fotos con modelo')

  // ── Evaluación ──
  await go(`/compras/productos/${wool}`)
  await p.click('button:has-text("Evaluar la compra")'); await p.waitForURL(/evaluated=1/); await p.waitForLoadState('networkidle')
  t = await sec('evaluacion')
  assert.match(t, /Comprar · \d+\/100/); assert.match(t, /Lo compraría:[\s\S]*cubre «Pantalón de vestir gris»/)
  for (const c of ['Compatibilidad con tu estilo', 'Corte y proporciones', 'Compatibilidad cromática', 'Combinabilidad con tu armario', 'Adecuación a tus necesidades', 'Calidad y materiales documentados', 'Relación calidad-precio']) assert.match(t, new RegExp(c))
  assert.match(t, /Riesgo de duplicidad\s*Bajo/i); assert.match(t, /Combinaciones\s*\d+/i); assert.match(t, /Composición publicada: 100 % lana/)
  assert.match(t, /Las fotos son con modelo: su ajuste no es el tuyo/)
  assert.match(t, /No ordena por precio, popularidad ni tendencia/)
  await noOverflow(); await shot('pc-evaluation')
  log('evaluación: 7 criterios explicados, indicadores independientes, veredicto «Comprar» argumentado, riesgos visibles')

  // ── Talla ──
  await go(`/compras/productos/${wool}`)
  t = await sec('talla'); assert.match(t, /Talla 48 · confianza baja[\s\S]*comparada|Sin medidas comparables: es la talla que te funciona en «Chino beige» \(Tienda Test\)/)
  await p.click('summary:has-text("Medidas de una prenda tuya que te queda bien")')
  const mf = p.locator('form:has(input[name=m_cintura])').first()
  await mf.locator('select[name=garment_id]').selectOption(chino)
  for (const [k, v] of [['cintura', '41'], ['cadera', '51'], ['muslo', '31'], ['entrepierna', '80']]) await mf.locator(`input[name=m_${k}]`).fill(v)
  await mf.locator('button').click(); await p.waitForURL(/evaluated=1/); await p.waitForLoadState('networkidle')
  await go(`/compras/productos/${wool}`)
  await p.click('summary:has-text("Guía de medidas de la tienda")')
  const sf = p.locator('form:has(input[name=size_0])')
  assert.equal(await sf.locator('input[name=size_0]').inputValue(), '48', 'tallas importadas de la tienda')
  for (const [i, vals] of [[0, ['41', '51.5', '31', '80']], [1, ['43', '53', '32', '81']]]) for (const [j, k] of ['cintura', 'cadera', 'muslo', 'entrepierna'].entries()) await sf.locator(`input[name=r${i}_${k}]`).fill(vals[j])
  await sf.locator('button').click(); await p.waitForURL(/evaluated=1/); await p.waitForLoadState('networkidle')
  t = await sec('talla')
  assert.match(t, /Talla 48 · confianza alta · comparada con «Chino beige»/); assert.match(t, /no una garantía/)
  assert.match(t, /Tu referencia\s*41\s*51\s*31/); assert.match(t, /48 ★\s*41 \(0\)\s*51\.5 \(\+0\.5\)/)
  assert.match(await sec('evaluacion'), /Talla recomendada: 48 \(confianza alta\), disponible/)
  await A.put(`/api/shopping/references/${chino}`, { measurements: { cintura: 999 } }, 400)
  log('talla: medidas de tu prenda de referencia frente a la guía de la tienda → 48 con confianza alta y sin garantías')

  // ── Redundancia: un chino beige más ──
  const dup = (await A.post('/api/shopping/import', { manual: { product_name: 'Chino beige recto', subcategory: 'chinos', color: 'Beige', price: 39 } })).id
  await A.post(`/api/shopping/products/${dup}/evaluate`, {})
  await go(`/compras/productos/${dup}`); t = await sec('evaluacion')
  assert.match(t, /No comprar · \d+\/100/)
  assert.match(t, /Ya tienes 2 prendas que cumplen prácticamente la misma función \((«Chino beige», «Chino beige 2»|«Chino beige 2», «Chino beige»)\)/)
  assert.match(t, /Priorizaría invertir en «(Abrigo camel|Pantalón de vestir gris)», donde hay una necesidad mayor/)
  assert.match(t, /Lo que ya tienes parecido[\s\S]*Chino beige/i); assert.match(t, /Composición desconocida/)
  await shot('pc-redundant')
  log('redundancia (con pocos datos): «no lo compraría», qué tienes ya y dónde invertir en su lugar')

  // ── Comparar ──
  await go('/compras/productos')
  assert.match(await main(), /Comprar[\s\S]*No comprar/, 'ordenados por puntuación de compra, con su veredicto')
  for (const id of [wool, dup]) await p.locator(`input[name=ids][value="${id}"]`).check()
  await p.click('button:has-text("Comparar seleccionados")'); await p.waitForURL(/comparar\?/); await p.waitForLoadState('networkidle')
  t = await main(); assert.match(t, /Mejor opción: Pantalón recto de lana gris/)
  assert.match(t, /Veredicto\s*Comprar\s*No comprar/); assert.match(t, /Composición\s*100 % lana\s*Desconocida/)
  await noOverflow(); await shot('pc-compare')
  await A.post('/api/shopping/compare', { ids: [wool] }, 400)
  log('comparar: lado a lado, mejor opción explicada, límites visibles')

  // ── Aislamiento ──
  const ctxB = await br.newContext(); const b = await ctxB.newPage(); b.setDefaultTimeout(30000)
  const emailB = await signup(b, U); const B = req(b)
  await B.post(`/api/shopping/products/${wool}/analyze`, {}, 404); await B.post(`/api/shopping/products/${wool}/evaluate`, {}, 404)
  await B.get(`/api/shopping/products/${wool}/evaluate`, 404); await B.put(`/api/shopping/references/${chino}`, { measurements: { cintura: 40 } }, 404)
  await B.put(`/api/shopping/products/${wool}/size-chart`, [{ size: '48', measurements: { cintura: 1 } }], 404)
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  const { data: au, error: le } = await sb.auth.signInWithPassword({ email: emailB, password: 'password123' }); assert.ok(!le, le?.message)
  for (const tb of ['product_analyses', 'purchase_evaluations', 'garment_measurements']) assert.equal((await sb.from(tb).select('id')).data.length, 0, `RLS ${tb}`)
  const e1 = await sb.from('purchase_evaluations').insert({ user_id: au.user.id, product_id: wool, engine_version: 'x', weights: {}, score: 99, confidence: 'alta', criteria: [], indicators: {}, redundancy: {}, verdict: 'buy', verdict_text: 'x' })
  assert.ok(e1.error && /row-level security/i.test(e1.error.message), 'RLS: evaluación en producto ajeno')
  const e2 = await sb.from('garment_measurements').insert({ user_id: au.user.id, garment_id: chino, measurements: { cintura: 1 } }); assert.ok(e2.error, 'RLS: medidas de prenda ajena')
  log('aislamiento: B no analiza, evalúa ni mide nada de A (app y RLS)')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
