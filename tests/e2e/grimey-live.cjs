// Verificación REAL del conector UCP de Grimey (red externa; solo se ejecuta con GRIMEY_LIVE=1).
// La app debe arrancar con SHOPPING_UCP_PROFILE_URL (perfil UCP público del agente), y en entornos con proxy de salida,
// SHOPPING_FETCH_VIA_PROXY=1 y NODE_USE_ENV_PROXY=1. Usa la IA simulada (mock-ai.mjs) para el análisis.
// Comprueba: búsqueda por necesidad en el catálogo real, normalización (precio, precio anterior, tallas, composición,
// procedencia), consulta individual por URL, verificación de precio, Product Analyzer y evaluación de compra.
const { chromium, devices } = require('playwright'); const assert = require('assert')
const { signup } = require('./lib.cjs')
const U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
if (process.env.GRIMEY_LIVE !== '1') { console.log('— omitida: exporta GRIMEY_LIVE=1 para consultar el catálogo real de Grimey'); process.exit(0) }

;(async () => {
  const br = await chromium.launch()
  const ctx = await br.newContext({ ...devices['iPhone 13'] })
  const p = await ctx.newPage(); p.setDefaultTimeout(60000)
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const main = () => p.locator('main').innerText()
  const A = {
    get: async (path) => { const r = await p.request.get(U + path); assert.equal(r.status(), 200, await r.text()); return r.json() },
    post: async (path, data, status = 200) => { const r = await p.request.post(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
  }
  await signup(p, U); log('registro')
  await go('/compras/fuentes'); assert.match(await main(), /Grimey[\s\S]*Conector UCP activo/i); log('Grimey aparece como tienda con conector UCP activo')

  const need = (await A.post('/api/shopping/needs', { title: 'Pantalón de chándal negro', type: 'need', spec: { category: 'bottom', subcategory: 'joggers', colors: ['Negro'], seasons: ['otono', 'invierno'], occasions: ['ocio'] }, price_max: 90 }, 201)).id
  const s = await A.post('/api/shopping/search', { need_id: need, force: true })
  const grimeySrc = s.sources.find((x) => x.label === 'Grimey (UCP)')
  assert.ok(grimeySrc, JSON.stringify(s.sources)); assert.equal(grimeySrc.status, 'ok', JSON.stringify(grimeySrc))
  const hits = s.results.filter((h) => h.source_label === 'Grimey (UCP)')
  // Personal Shopper Intelligence: cada producto real evaluado con el perfil y ordenado por esa evaluación
  assert.ok(s.results.every((h) => h.evaluation && h.evaluation.criteria.length === 6), 'todos los candidatos evaluados')
  assert.ok(s.query.plan.length >= 1 && s.query.ctx_hash, 'búsqueda planificada desde el perfil')
  const order = s.results.map((h) => (h.evaluation.verdict === 'skip' ? -200 : h.evaluation.verdict === 'wait' ? -100 : 0) + h.evaluation.score)
  assert.ok(order.every((x, i) => i === 0 || order[i - 1] >= x - 1), 'ordenados por evaluación personal')
  console.log('   evaluación personal: ' + s.results.slice(0, 3).map((h) => `${h.product_name} ${h.evaluation.score}/100 ${h.evaluation.verdict}`).join(' · '))
  assert.ok(hits.length > 0, 'resultados reales de Grimey')
  for (const h of hits) {
    assert.match(h.product_url, /^https:\/\/grimey\.com\/products\//); assert.equal(h.currency, 'EUR'); assert.ok(h.current_price > 0 && h.current_price <= 90, `precio dentro del límite: ${h.current_price}`)
    assert.equal(h.subcategory, 'joggers'); assert.equal(h.field_sources.product_name.source, 'store')
    assert.ok(h.variants.length > 0 && h.variants.every((v) => v.size)); assert.match(h.external_product_id, /^gid:\/\/shopify\/Product\//)
    assert.ok(h.images.every((i) => i.permission === 'link_only'))
  }
  assert.ok(hits.some((h) => h.colors.includes('Negro')), 'el color pedido se sigue buscando (pero ya no filtra)')
  console.log('   ', hits.slice(0, 3).map((h) => `${h.product_name} · ${h.current_price} €${h.raw_attributes.previous_price ? ` (antes ${h.raw_attributes.previous_price.amount})` : ''} · ${h.confirmed_composition ?? 'composición desconocida'} · tallas ${h.variants.filter((v) => v.availability === 'in_stock').map((v) => v.size).join('/')}`).join('\n    '))
  log(`búsqueda por necesidad en el catálogo real: ${hits.length} productos normalizados (precio, tallas, procedencia)`)

  await go(`/compras/buscar?s=${s.id}`)
  assert.match(await main(), /Grimey \(UCP\): \d+ resultados?/)
  const idx = s.results.findIndex((h) => h.source_label === 'Grimey (UCP)')
  await p.locator('.hit').nth(idx).locator('button:has-text("Guardar como candidato")').click(); await p.waitForURL(/productos\/[0-9a-f-]{36}\?saved=1/); await p.waitForLoadState('networkidle')
  const pid = p.url().split('?')[0].split('/').pop()
  let t = await main()
  assert.match(t, /Nombre[\s\S]*Tienda/i); assert.match(t, /Precio\s*\d+,\d{2} €/); assert.match(t, /Tallas/i)
  log('guardado como candidato: ficha con procedencia «Tienda»')

  await p.click('button:has-text("Volver a comprobar en la fuente")'); await p.waitForURL(/verified=/); await p.waitForLoadState('networkidle')
  t = await main(); assert.match(t, /comprobados en Grimey|catálogo oficial de Grimey/i)
  log('verificación de precio y disponibilidad con get_product')

  const url = hits[hits.length - 1].product_url
  const imp = await A.post('/api/shopping/import', { url, need_id: need }, 201)
  assert.equal(imp.ok, true, JSON.stringify(imp)); assert.match(imp.note, /catálogo oficial de Grimey \(UCP\/MCP\)/)
  const prod = await A.get(`/api/shopping/products/${imp.id}`)
  assert.equal(prod.source_kind, 'api'); assert.ok(prod.variants.length > 0); assert.ok(prod.raw_attributes.ucp_id)
  log(`consulta individual por URL: ${prod.product_name} (${prod.variants.length} tallas)`)

  const bad = await A.post('/api/shopping/import', { url: 'https://grimey.com/products/este-producto-no-existe-ps' }, 201)
  assert.equal(bad.ok, false); log('URL inexistente: se informa sin inventar datos')

  const an = await A.post(`/api/shopping/products/${pid}/analyze`, {}, 200)
  assert.ok(an.analysis.id); const ev = await A.post(`/api/shopping/products/${pid}/evaluate`, {}, 201)
  assert.ok(['buy', 'consider', 'wait', 'skip'].includes(ev.verdict)); assert.ok(ev.score >= 0)
  log(`Product Analyzer y evaluación de compra sobre un producto real: ${ev.verdict} · ${ev.score}/100`)
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
