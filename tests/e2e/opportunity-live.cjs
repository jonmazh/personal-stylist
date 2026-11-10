// Búsqueda estratégica (2.0E) con Channel3 REAL (OPPORTUNITY_LIVE=1). Consume ≤4 créditos (1 por faceta, solo mercado ES).
// La app debe arrancar con CHANNEL3_API_KEY (y, tras un proxy, NODE_USE_ENV_PROXY=1 y SHOPPING_FETCH_VIA_PROXY=1).
const { chromium, devices } = require('playwright'); const assert = require('assert')
const { signup } = require('./lib.cjs')
const U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
if (process.env.OPPORTUNITY_LIVE !== '1') { console.log('— omitida: exporta OPPORTUNITY_LIVE=1 para buscar con Channel3 real'); process.exit(0) }

;(async () => {
  const br = await chromium.launch()
  const p = await (await br.newContext({ ...devices['iPhone 13'] })).newPage(); p.setDefaultTimeout(180000)
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const pick = (name, value) => p.locator(`.opts label:has(input[name="${name}"][value="${value}"])`).click()
  const api = async (method, path, data, status = 200) => { const r = await p.request[method](U + path, { ...(data ? { data } : {}), timeout: 300000 }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() }
  const save = async (slug, fill) => { await go(`/profile/${slug}`); await fill(); await p.click('main button:has-text("Guardar")'); await p.waitForURL(/saved=1/) }
  await signup(p, U)
  await go('/estilos/clean-streetwear'); await p.selectOption('select[aria-label="Papel en tu identidad"]', 'principal'); await p.click('button:has-text("Añadir a mi identidad")'); await p.waitForURL(/added=1/)
  await go('/profile/color'); await p.click('.tempask button:has-text("Cálida")'); await p.waitForURL(/temp=set/)
  await save('cuerpo', async () => { await p.fill('input[name=pecho]', '104'); await p.fill('input[name=cintura]', '82') })
  await save('identidad', async () => { await p.fill('input[name=sizes]', 'pantalón 42') })
  await save('objetivos', async () => { await pick('experimentation', 'Abierto') })
  const G = (name, category, subcategory, primary_color, x = {}) => ({ name, category, subcategory, primary_color, formality_level: 2, status: 'active', occasions: ['ocio'], seasons: ['otono', 'invierno'], silhouette: 'Regular', ...x })
  for (const g of [...['Gris', 'Negro', 'Azul marino', 'Beige', 'Gris', 'Negro'].map((c, i) => G(`Pantalón ${i}`, 'bottom', 'chinos', c, { cut: 'Recto' })), G('Camiseta', 'top', 'tee', 'Blanco'), G('Sudadera', 'top', 'sweatshirt', 'Gris'), G('Zapatilla', 'footwear', 'sneakers', 'Blanco')]) await api('post', '/api/wardrobe/items', g, 201)
  const st = await api('get', '/api/stylist/strategy')
  const op = st.opportunities.find((o) => o.key === 'el:leg-wide')
  assert.ok(op, 'oportunidad de silueta amplia')
  const r = await api('post', `/api/stylist/opportunities/${op.id}/search`, { force: true })
  const q = r.query
  console.log(`    facetas: ${q.facets.map((f) => f.label).join(' · ')}`)
  console.log(`    ${r.results.length} candidatos de ${q.coverage.brands} marcas en ${q.coverage.retailers} tiendas · ${q.off_target} descartados por no materializar la oportunidad · ${q.coverage.channel3_credits} créditos`)
  const c3 = r.sources.find((s) => s.label === 'Channel3'); assert.ok(c3 && c3.status !== 'error', c3?.message)
  assert.ok(q.coverage.channel3_credits <= q.facets.length && q.coverage.channel3_credits >= 1)
  const ok = r.results.filter((h) => h.eligibility?.ok)
  for (const h of r.results.slice(0, 10)) console.log(`    · ${h.product_name} (${h.brand} · ${h.raw_attributes?.domain}) ${h.current_price} ${h.currency} — ${h.strategic?.decision} · valor ${h.strategic?.value} · 4C ${h.evaluation?.score ?? '—'} · ${h.eligibility?.label}${h.strategic?.flags?.length ? ` · alertas: ${h.strategic.flags.join('; ')}` : ''}`)
  assert.ok(r.results.every((h) => !h.raw_attributes?.market || h.raw_attributes.market === 'ES'), 'solo mercado español')
  assert.ok(r.results.every((h) => !h.opportunity_match?.misses?.length), 'todos materializan la oportunidad')
  assert.ok(ok.length >= 1, 'al menos un producto real con la talla 42 disponible')
  assert.ok(ok.every((h) => h.eligibility.size.size.original === '42'))
  assert.ok(q.coverage.retailers >= 2 && r.results.every((h) => h.strategic), 'catálogo abierto y evaluación estratégica')
  const seenB = new Set(); const sel = r.results.filter((h) => ['eleccion', 'buena_opcion'].includes(h.strategic.decision) && !seenB.has(h.brand) && seenB.add(h.brand))
  assert.ok(r.results.filter((h) => !h.evaluation).every((h) => h.strategic.value === null), 'sin 4C no hay valor estratégico')
  assert.equal(new Set(r.results.map((h) => `${h.brand}|${h.product_name}`.toLowerCase())).size, r.results.length, 'sin duplicados entre dominios de una marca')
  console.log(`    selección del estilista: ${sel.slice(0, 3).map((h) => `${h.product_name} (${h.brand}, valor ${h.strategic.value})`).join(' · ') || 'ninguna'}`)
  log(`búsqueda real: ${ok.length} productos con tu talla disponible que materializan «${op.title}»`)
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
