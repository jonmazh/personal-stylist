// Personal Shopper 2.0 · 2.0C: Trend Intelligence con la Brave de la tienda de prueba (resultados sintéticos) y la IA simulada.
// La app debe arrancar con SHOPPING_SEARCH_PROVIDER=brave, SHOPPING_SEARCH_KEY=test, SHOPPING_SEARCH_URL=http://127.0.0.1:4700/search
// y SHOPPING_FETCH_ALLOW_HOSTS=127.0.0.1:4700 (Brave falsa en el mismo origen). Comprueba recuperación, filtrado, síntesis,
// validación por código, que NO se guardan resultados de Brave, caché semanal, fuentes en vivo y aislamiento.
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
  const api = async (method, path, data, status = 200) => { const r = await p.request[method](U + path, data ? { data } : undefined); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() }
  const email = await signup(p, U)

  await go('/compras/estilista')
  assert.match(await p.locator('#tendencias').innerText(), /Aún no he investigado las tendencias/)
  await p.click('#tendencias button:has-text("Investigar tendencias")'); await p.waitForURL(/trends=1/); await p.waitForLoadState('networkidle')
  for (const d of await p.locator('#tendencias details').all()) await d.evaluate((el) => { el.open = true })
  const t = await p.locator('#tendencias').innerText()
  assert.match(t, /Evidencia editorial \(Brave\) · temporada AW26/i)
  assert.match(t, /Tendencia con evidencia editorial[\s\S]*Pantalón amplio con caída[\s\S]*3 fuentes independientes/i)
  assert.doesNotMatch(t, /40 %|ventas crecieron/i, 'sin cifras de ventas')
  assert.match(t, /Marcas citadas por las fuentes: Auralee/i); assert.doesNotMatch(t, /Marcas citadas por las fuentes:[^\n]*Gucci/i)
  assert.match(t, /Validación:[\s\S]*Marcas descartadas por no aparecer en las fuentes: Gucci/i)
  assert.match(t, /Propuesta editorial aislada \(2\)[\s\S]*(Ante en prendas exteriores|Marrón chocolate)/i)
  assert.doesNotMatch(t, /Sin fuentes/i, 'una señal sin evidencias reales se rechaza')
  assert.match(t, /no se guardan las fuentes: se consultan de nuevo, en vivo/i)
  log('investigación: tendencia con 3 fuentes, propuestas aisladas aparte, marcas y cifras inventadas eliminadas, señal sin evidencias rechazada')

  const r1 = await api('get', '/api/stylist/trends')
  assert.equal(r1.cached, true, 'reutiliza la investigación de la semana')
  assert.equal(r1.research.mode, 'editorial'); assert.equal(r1.research.evidence, null)
  const d = r1.research.stats.discarded
  assert.ok(d.tienda >= 1 && d.nota_de_prensa >= 1 && d.no_masculino >= 1, `descartes: ${JSON.stringify(d)}`)
  assert.ok(r1.research.stats.brave.requests >= 12)
  assert.ok(r1.research.queries.every((q) => !/ventas|sales|best.?sell|popular/i.test(q.q)))
  // Nada de los resultados de Brave queda guardado: ni URL, ni títulos, ni fragmentos
  const dump = JSON.stringify(r1)
  assert.doesNotMatch(dump, /https?:\/\/(menswear-weekly|style-journal|gents-review|elmundo-moda)/); assert.doesNotMatch(dump, /The men's trouser shift|Wide-leg and relaxed trousers with fluid drape/)
  assert.ok(r1.signals.every((s) => s.evidence === null && s.search_query))
  log('caché semanal; consultas propias sin ventas ni popularidad; filtrado registrado; ningún resultado de Brave guardado')

  const wide = r1.signals.find((s) => s.name === 'Pantalón amplio con caída')
  await p.click(`a[href="/compras/estilista/tendencias/${wide.id}"]`); await p.waitForURL(/tendencias\//); await p.waitForLoadState('networkidle')
  const s = await p.locator('main').innerText()
  assert.match(s, /Consultadas ahora mismo en Brave Search con «men's wide leg trousers»\. No se guardan/i)
  assert.match(s, /The men's trouser shift: wide and relaxed — menswear-weekly\.example/i)
  assert.doesNotMatch(s, /shop\.example|openpr|tights/i, 'el filtro también se aplica a las fuentes en vivo')
  const after = await api('get', '/api/stylist/trends'); assert.doesNotMatch(JSON.stringify(after), /The men's trouser shift/, 'ver las fuentes no las guarda')
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  log('fuentes consultadas en vivo al abrir la señal (no se guardan)')

  const forced = await api('post', '/api/stylist/trends', { force: true }); assert.equal(forced.cached, false)

  // Aislamiento
  const b = await (await br.newContext()).newPage()
  const emailB = await signup(b, U)
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  assert.ok(!(await sb.auth.signInWithPassword({ email: emailB, password: 'password123' })).error)
  for (const tb of ['trend_researches', 'trend_signals']) assert.equal((await sb.from(tb).select('id')).data.length, 0, `RLS ${tb}`)
  const r = await b.request.get(`${U}/api/stylist/trends/${wide.id}/sources`); assert.equal(r.status(), 404)
  const sa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  assert.ok(!(await sa.auth.signInWithPassword({ email, password: 'password123' })).error)
  assert.ok((await sa.from('trend_signals').select('id')).data.length >= 3)
  log('RLS: cada usuario solo ve sus investigaciones y señales')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
