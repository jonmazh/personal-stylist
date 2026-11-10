// Personal Shopper 2.0 · 2.0D: Style Strategy Engine en la app (Brave de prueba con resultados sintéticos e IA simulada).
// Perfil Clean streetwear con 10 pantalones rectos → oportunidad de silueta amplia respaldada por una tendencia; ideas
// descartadas; «Me interesa»; caché; aislamiento. Mismo arranque de la app que stylist-trends.cjs.
const { chromium, devices } = require('playwright'); const assert = require('assert'); const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const { signup } = require('./lib.cjs')
const U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

;(async () => {
  const br = await chromium.launch()
  const p = await (await br.newContext({ ...devices['iPhone 13'] })).newPage(); p.setDefaultTimeout(60000)
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const pick = (name, value) => p.locator(`.opts label:has(input[name="${name}"][value="${value}"])`).click()
  const api = async (method, path, data, status = 200) => { const r = await p.request[method](U + path, data ? { data } : undefined); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() }
  const save = async (slug, fill) => { await go(`/profile/${slug}`); await fill(); await p.click('main button:has-text("Guardar")'); await p.waitForURL(/saved=1/) }
  const email = await signup(p, U)
  await go('/estilos/clean-streetwear'); await p.selectOption('select[aria-label="Papel en tu identidad"]', 'principal'); await p.click('button:has-text("Añadir a mi identidad")'); await p.waitForURL(/added=1/)
  await save('cuerpo', async () => { await p.fill('input[name=pecho]', '104'); await p.fill('input[name=cintura]', '82') })
  await save('objetivos', async () => { await pick('experimentation', 'Abierto') })
  const G = (name, category, subcategory, primary_color, x = {}) => ({ name, category, subcategory, primary_color, formality_level: 2, status: 'active', occasions: ['ocio'], seasons: ['primavera', 'otono', 'invierno'], silhouette: 'Regular', ...x })
  for (const g of [...['Gris', 'Negro', 'Azul marino', 'Beige', 'Gris', 'Negro', 'Azul marino', 'Beige', 'Antracita', 'Denim'].map((c, i) => G(`Pantalón ${i + 1}`, 'bottom', i === 9 ? 'jeans' : 'chinos', c, { cut: 'Recto' })),
    G('Camiseta blanca', 'top', 'tee', 'Blanco'), G('Camiseta negra', 'top', 'tee', 'Negro'), G('Sudadera gris', 'top', 'sweatshirt', 'Gris'), G('Camisa azul', 'top', 'shirt', 'Azul marino'), G('Zapatilla blanca', 'footwear', 'sneakers', 'Blanco')]) await api('post', '/api/wardrobe/items', g, 201)

  // Sin tendencias: la estrategia existe igualmente (vestir bien no es estar a la moda)
  const s0 = await api('get', '/api/stylist/strategy')
  const w0 = s0.opportunities.find((o) => o.key === 'el:leg-wide')
  assert.ok(w0 && w0.market === null && w0.scores.fashion_relevance === null)
  // Con tendencias investigadas, la misma oportunidad gana respaldo de mercado
  await api('post', '/api/stylist/trends', { force: true })
  await go('/compras/estilista')
  for (const d of await p.locator('#oportunidades details').all()) await d.evaluate((el) => { el.open = true })
  const t = await p.locator('main').innerText()
  assert.match(t, /Dirección de estilo[\s\S]*Desarrollar Clean streetwear/i)
  assert.match(t, /Expansión de estilo[\s\S]*Introducir pantalón de pierna amplia/i)
  assert.match(t, /Mercado: tendencia con evidencia editorial «Pantalón amplio con caída»/i)
  assert.match(t, /Relevancia de moda \d+ · idoneidad personal \d+ · impacto en tu estilo \d+/i)
  assert.match(t, /Por qué encaja contigo:[\s\S]*Clean streetwear/i)
  assert.match(t, /Ideas descartadas \(\d+\)/i)
  assert.ok(t.indexOf('Dirección de estilo'.toUpperCase()) < t.indexOf('Diagnóstico del armario'.toUpperCase()) || /Dirección de estilo[\s\S]*Diagnóstico del armario/i.test(t), 'primero la estrategia, después el diagnóstico')
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  log('estrategia: dirección, oportunidad de silueta amplia (expansión) con respaldo de tendencia, tres criterios separados e ideas descartadas')

  const s1 = await api('get', '/api/stylist/strategy'); assert.equal(s1.cached, true)
  assert.notEqual(s1.strategy.id, s0.strategy.id, 'una nueva investigación de tendencias genera una estrategia nueva')
  const wide = s1.opportunities.find((o) => o.key === 'el:leg-wide')
  assert.equal(wide.market.name, 'Pantalón amplio con caída'); assert.equal(wide.rank, 1)
  await p.locator('.hit', { hasText: 'Introducir pantalón de pierna amplia' }).locator('button:has-text("Me interesa")').click(); await p.waitForURL(/#oportunidades/); await p.waitForLoadState('networkidle')
  assert.equal((await api('get', '/api/stylist/strategy')).opportunities.find((o) => o.key === 'el:leg-wide').status, 'me_interesa')
  assert.match(await p.locator('.hit', { hasText: 'Introducir pantalón de pierna amplia' }).innerText(), /Te interesa/i)
  log('«Me interesa» guardado; caché de la estrategia mientras nada cambia')

  // 2.0E · Búsqueda estratégica desde la oportunidad
  await save('identidad', async () => { await p.fill('input[name=sizes]', 'pantalón 48') })
  await api('post', '/api/shopping/retailers', { name: 'Tienda Test', domains: ['127.0.0.1'], url_policy: 'metadata' }, 201)
  await api('post', '/api/shopping/sources', { name: 'Feed estilista', feed_url: 'http://127.0.0.1:4700/feed-stylist.csv', authorization_note: 'Feed de prueba' }, 201)
  await api('post', `/api/shopping/sources/${(await api('get', '/api/shopping/sources')).sources[0].id}/sync`, {})
  await go('/compras/estilista')
  await p.locator('.hit', { hasText: 'Introducir pantalón de pierna amplia' }).locator('button:has-text("Buscar productos")').click()
  await p.waitForURL(/compras\/buscar\?s=/); await p.waitForLoadState('networkidle')
  for (const d of await p.locator('main details').all()) await d.evaluate((el) => { el.open = true })
  const rt = await p.locator('main').innerText()
  assert.match(rt, /Para la oportunidad de estilo «Introducir pantalón de pierna amplia»/i)
  assert.match(rt, /Propuestas investigadas: Pantalón de pierna amplia · Pantalón wide leg · En [a-z ]+ \(consejo general\) · En [a-z ]+ \(consejo general\)/i)
  assert.match(rt, /Sin colorimetría: uso colores versátiles \(consejo general de estilista\)/i)
  assert.match(rt, /Selección del estilista[\s\S]*Valor estratégico \d+\/100 · (Elección del estilista|Buena opción)[\s\S]*Compatibilidad personal \(4C\): \d+\/100/i)
  assert.match(rt, /Contribución al armario: [^\n]*proporción que tus conjuntos no tienen/i)
  assert.match(rt, /Materializa la oportunidad: corte amplio/i)
  assert.doesNotMatch(rt, /Pantalón slim gris/i, 'el slim no materializa la oportunidad: no se muestra')
  const sres = await api('get', `/api/shopping/search/${new URL(p.url()).searchParams.get('s')}`)
  assert.ok(sres.opportunity_id && sres.query.opportunity.title === 'Introducir pantalón de pierna amplia')
  assert.ok(sres.query.off_target >= 1); assert.equal(sres.query.coverage.channel3_credits, 0)
  const names = sres.results.map((h) => h.product_name)
  const ok = sres.results.filter((h) => h.eligibility?.ok)
  assert.ok(ok.length >= 3, `aptos: ${ok.map((h) => h.product_name)}`)
  assert.equal(sres.results.find((h) => h.product_name === 'Pantalón ancho beige').eligibility.size.status, 'sin_talla_compatible')
  const sel = sres.results.filter((h) => ['eleccion', 'buena_opcion'].includes(h.strategic?.decision))
  assert.ok(sel.length >= 2 && new Set(sel.map((h) => h.brand)).size >= 2, `selección de marcas distintas: ${sel.map((h) => h.brand)}`)
  assert.equal(sres.results.find((h) => h.product_name === 'Pantalón ancho beige').strategic.decision, 'no_elegible')
  assert.ok(sres.results.every((h) => h.strategic && h.strategic.level1.checks.length === 4), 'evaluación estratégica de cada resultado')
  assert.ok(ok.every((h) => h.evaluation && h.evaluation.criteria.length === 6), 'evaluación 4C de cada candidato')
  void names
  log(`búsqueda estratégica: ${sres.query.facets.length} propuestas, ${ok.length} productos aptos que materializan la oportunidad, ${sres.query.off_target} descartados por no hacerlo, marcas diversificadas`)

  const b = await (await br.newContext()).newPage(); const emailB = await signup(b, U)
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  assert.ok(!(await sb.auth.signInWithPassword({ email: emailB, password: 'password123' })).error)
  for (const tb of ['style_strategies', 'style_opportunities']) assert.equal((await sb.from(tb).select('id')).data.length, 0, `RLS ${tb}`)
  const r = await b.request.patch(`${U}/api/stylist/opportunities/${wide.id}`, { data: { status: 'descartada' } }); assert.equal(r.status(), 404)
  log('RLS: cada usuario solo ve y cambia sus estrategias')
  void email
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
