// Verificación REAL del conector de EME Studios (UCP/MCP, solo consulta). Red externa: solo con EME_LIVE=1.
// Arranque de la app: SHOPPING_UCP_PROFILE_URL (perfil UCP público del agente) y, tras un proxy de salida,
// SHOPPING_FETCH_VIA_PROXY=1 y NODE_USE_ENV_PROXY=1. IA simulada (mock-ai.mjs) para el análisis.
const { chromium, devices } = require('playwright'); const assert = require('assert')
const { signup } = require('./lib.cjs')
const U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
if (process.env.EME_LIVE !== '1') { console.log('— omitida: exporta EME_LIVE=1 para consultar el catálogo real de EME Studios'); process.exit(0) }

;(async () => {
  const br = await chromium.launch()
  const p = await (await br.newContext({ ...devices['iPhone 13'] })).newPage(); p.setDefaultTimeout(60000)
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const A = {
    get: async (path) => { const r = await p.request.get(U + path); assert.equal(r.status(), 200, await r.text()); return r.json() },
    post: async (path, data, status = 200) => { const r = await p.request.post(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
  }
  await signup(p, U); log('registro')
  await go('/compras/fuentes'); assert.match(await p.locator('main').innerText(), /EME Studios[\s\S]*Conector UCP activo/i); log('EME Studios registrada en el gestor de fuentes con conector UCP activo')

  const need = (await A.post('/api/shopping/needs', { title: 'Vaquero de hombre', type: 'need', spec: { category: 'bottom', subcategory: 'jeans', seasons: ['otono'], occasions: ['ocio'] }, price_max: 120 }, 201)).id
  const s = await A.post('/api/shopping/search', { need_id: need, force: true })
  const src = s.sources.find((x) => x.label === 'EME Studios (UCP)')
  assert.ok(src && src.status === 'ok', JSON.stringify(s.sources))
  const hits = s.results.filter((h) => h.source_label === 'EME Studios (UCP)')
  assert.ok(hits.length > 0)
  for (const h of hits) {
    assert.match(h.product_url, /^https:\/\/checkout\.emestudios\.com\/products\//); assert.equal(h.currency, 'EUR'); assert.ok(h.current_price > 0 && h.current_price <= 120)
    assert.equal(h.subcategory, 'jeans'); assert.ok(h.variants.length > 0); assert.match(h.external_product_id, /^gid:\/\/shopify\/Product\//)
    assert.notEqual(h.raw_attributes.audience?.value, 'mujer', 'nada solo de mujer'); assert.ok(h.images.every((i) => i.permission === 'link_only'))
    assert.equal(h.field_sources.product_name.source, 'store')
  }
  console.log('   respuesta (resumen):\n    ' + hits.slice(0, 4).map((h) => `${h.product_name} · ${h.current_price} €${h.raw_attributes.previous_price ? ` (antes ${h.raw_attributes.previous_price.amount})` : ''} · público ${h.raw_attributes.audience?.value ?? 'sin publicar'} · composición ${h.confirmed_composition ?? 'desconocida'} · tallas ${h.variants.filter((v) => v.availability === 'in_stock').map((v) => v.size).join('/')}`).join('\n    '))
  log(`search_catalog real: ${hits.length} productos de EME Studios normalizados`)

  const idx = s.results.findIndex((h) => h.source_label === 'EME Studios (UCP)')
  const saved = await A.post(`/api/shopping/search/${s.id}/save`, { index: idx }, 201)
  const ver = await A.post(`/api/shopping/products/${saved.id}/verify`, {})
  assert.equal(ver.how, 'ucp', JSON.stringify(ver)); log('guardado y verificado con get_product')

  const handle = hits[0].product_url.split('/products/')[1]
  const imp = await A.post('/api/shopping/import', { url: `https://emestudios.com/es/es/products/${handle}`, need_id: need }, 201)
  assert.equal(imp.ok, true, JSON.stringify(imp)); assert.match(imp.note, /catálogo oficial de EME Studios/)
  const prod = await A.get(`/api/shopping/products/${imp.id}`)
  assert.equal(prod.source_kind, 'api'); assert.equal(prod.retailers.name, 'EME Studios'); assert.ok(prod.variants.length > 0)
  log(`enlace localizado de emestudios.com resuelto por UCP sin leer la web: ${prod.product_name}`)

  const an = await A.post(`/api/shopping/products/${imp.id}/analyze`, {}, 200); assert.ok(an.analysis.id)
  const ev = await A.post(`/api/shopping/products/${imp.id}/evaluate`, {}, 201); assert.ok(['buy', 'consider', 'wait', 'skip'].includes(ev.verdict))
  log(`Product Analyzer y Wardrobe Compatibility (evaluación de compra): ${ev.verdict} · ${ev.score}/100`)
  const garments = await A.get('/api/wardrobe/items')
  assert.ok(!JSON.stringify(garments).includes(prod.product_name), 'los productos externos no entran en el armario')
  log('datos externos separados del armario')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
