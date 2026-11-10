// Channel3 con la API REAL (consume créditos: ~1 por consulta y mercado). Solo con CHANNEL3_LIVE=1.
// La app debe arrancar con CHANNEL3_API_KEY (y, tras un proxy de salida, NODE_USE_ENV_PROXY=1).
// Comprueba: Bershka (Reino Unido) y Pull&Bear (EE. UU.) por separado, Zara (España), normalización, evaluación 4C con el
// perfil real de cada usuario, grupos en la interfaz, enlace de oferta generado en el clic, verificación y caché con refresco.
const { chromium, devices } = require('playwright'); const assert = require('assert')
const { signup } = require('./lib.cjs')
const U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
if (process.env.CHANNEL3_LIVE !== '1') { console.log('— omitida: exporta CHANNEL3_LIVE=1 para consultar la API real de Channel3'); process.exit(0) }
const KEY = process.env.CHANNEL3_API_KEY || ''

;(async () => {
  const br = await chromium.launch()
  const bodies = []
  async function user(temp, pants, wardrobe) {
    const p = await (await br.newContext({ ...devices['iPhone 13'] })).newPage(); p.setDefaultTimeout(60000)
    p.on('response', async (r) => { if (r.url().startsWith(U)) { try { bodies.push(await r.text()) } catch { /* binario o redirección */ } } })
    const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
    const pick = (name, value) => p.locator(`.opts label:has(input[name="${name}"][value="${value}"])`).click()
    const A = {
      get: async (path) => { const r = await p.request.get(U + path); assert.equal(r.status(), 200, await r.text()); return r.json() },
      post: async (path, data, status = 200) => { const r = await p.request.post(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
      put: async (path, data) => { const r = await p.request.put(U + path, { data }); assert.equal(r.status(), 200, `${path}: ${await r.text()}`); return r.json() },
    }
    await signup(p, U)
    const save = async (slug, fill) => { await go(`/profile/${slug}`); await fill(); await p.click('main button:has-text("Guardar")'); await p.waitForURL(/saved=1/) }
    await go('/profile/color'); await p.click(`.tempask button:has-text("${temp}")`); await p.waitForURL(/temp=set/)
    await save('vida', async () => { await p.fill('input[name=l_trabajo]', '50'); await p.fill('input[name=l_ocio]', '50'); await pick('work_formality', 'Smart casual'); await pick('climate', 'Cuatro estaciones marcadas') })
    await save('prendas', async () => { await pick('p_pantalones', pants) })
    await save('identidad', async () => { await p.fill('input[name=sizes]', 'pantalón 42, vaqueros 42') })
    for (const g of wardrobe) await A.post('/api/wardrobe/items', { status: 'active', occasions: ['trabajo', 'ocio'], seasons: ['primavera', 'otono', 'invierno'], silhouette: 'Regular', ...g }, 201)
    const need = (await A.post('/api/shopping/needs', { title: 'Pantalón para el día a día', type: 'need', spec: { category: 'bottom', subcategory: 'trousers', occasions: ['trabajo', 'ocio'] }, user_priority: 'high', price_max: 90 }, 201)).id
    const shops = async (slugs) => A.put('/api/shopping/preferences', { preferred_retailers: slugs, excluded_retailers: [], quality_over_price: true })
    return { p, A, go, need, shops }
  }
  const G = (name, category, subcategory, primary_color, formality_level, x = {}) => ({ name, category, subcategory, primary_color, formality_level, ...x })
  const warmWardrobe = [G('Camisa blanca', 'top', 'shirt', 'Blanco', 3), G('Jersey marino', 'top', 'knit', 'Azul marino', 3), G('Camiseta gris', 'top', 'tee', 'Gris', 2), G('Polo negro', 'top', 'polo', 'Negro', 3),
    G('Vaquero', 'bottom', 'jeans', 'Denim', 2, { cut: 'Recto' }), G('Chaqueta marino', 'outerwear', 'jacket', 'Azul marino', 3), G('Mocasín marrón', 'footwear', 'loafers', 'Marrón', 3), G('Zapatilla blanca', 'footwear', 'sneakers', 'Blanco', 2)]
  const coolWardrobe = [G('Sudadera crudo', 'top', 'sweatshirt', 'Crudo', 2), G('Jersey beige', 'top', 'knit', 'Beige', 3), G('Camiseta crudo', 'top', 'tee', 'Crudo', 2),
    G('Chino beige', 'bottom', 'chinos', 'Beige', 3, { cut: 'Wide' }), G('Pantalón beige', 'bottom', 'trousers', 'Beige', 3, { cut: 'Wide' }), G('Zapatilla blanca', 'footwear', 'sneakers', 'Blanco', 2), G('Bota negra', 'footwear', 'boots', 'Negro', 3)]
  const a = await user('Cálida', 'Recto', warmWardrobe)
  const c3 = (s) => s.results.filter((h) => h.raw_attributes?.provider === 'channel3')
  const src = (s) => s.sources.find((x) => x.label === 'Channel3')
  const c3e = (s) => c3(s).filter((h) => h.evaluation)

  // 1) Bershka (Channel3 no la tiene en España: Reino Unido)
  await a.shops(['bershka'])
  const sb = await a.A.post('/api/shopping/search', { text: 'pantalón beige', force: true })
  assert.ok(src(sb), 'Channel3 participa en la búsqueda'); assert.notEqual(src(sb).status, 'error', src(sb).message)
  if (!c3(sb).length) console.log('    ⚠ Channel3 no devuelve hoy pantalones de hombre de Bershka en Reino Unido (su índice cambia): se comprueba solo que la consulta no falla')
  assert.ok(c3(sb).every((h) => h.retailer?.slug === 'bershka' && h.raw_attributes.domain === 'bershka.com'), 'solo ofertas de Bershka')
  assert.ok(c3(sb).every((h) => h.raw_attributes.market === 'GB' && h.raw_attributes.foreign_market && h.currency === 'GBP'))
  assert.ok(c3(sb).every((h) => h.eligibility && h.eligibility.gender.class === 'male'), 'moda masculina (dato de Channel3)')
  assert.ok(c3(sb).every((h) => !h.eligibility.ok), 'Bershka (Reino Unido): nunca disponible confirmado en España')
  for (const h of c3(sb)) console.log(`    ${h.product_name}: ${h.eligibility.label} — ${h.eligibility.reasons.join(' ')}`)
  assert.ok(c3e(sb).every((h) => h.evaluation.criteria.length === 6 && h.evaluation.verdict !== 'buy'))
  if (c3e(sb).length) { assert.deepEqual(c3e(sb)[0].evaluation.criteria.map((c) => c.weight), [25, 20, 15, 20, 10, 10]); assert.ok(c3e(sb).every((h) => !h.evaluation.criteria.find((c) => c.key === 'quality').reasons.some((r) => /€/.test(r))), 'el precio en £ no se compara con el presupuesto en €') }
  assert.ok(c3(sb).every((h) => h.product_url === null && h.canonical_url.startsWith('channel3:')), 'sin enlaces de oferta guardados')
  log(`Bershka (Reino Unido): consulta correcta, ${c3(sb).length} productos de hombre; ninguno recomendable como disponible en España`)

  // 2) Pull&Bear (EE. UU.), por separado
  await a.shops(['pull-and-bear'])
  const sp = await a.A.post('/api/shopping/search', { text: 'pantalón', force: true })
  assert.ok(c3(sp).length > 0, 'productos reales de Pull&Bear'); assert.ok(c3(sp).every((h) => h.retailer?.slug === 'pull-and-bear' && h.raw_attributes.market === 'US' && h.currency === 'USD'))
  assert.ok(c3(sp).every((h) => !h.eligibility.ok))
  log(`Pull&Bear (EE. UU.): ${c3(sp).length} productos reales · ${Object.entries(c3(sp).reduce((m, h) => ({ ...m, [h.eligibility.label]: (m[h.eligibility.label] ?? 0) + 1 }), {})).map(([k, v]) => `${k}: ${v}`).join(' · ')}`)

  // 3) Zara (España, euros) para la necesidad: búsqueda ampliada desde el perfil + normalización
  await a.shops(['zara'])
  const sz = await a.A.post('/api/shopping/search', { need_id: a.need, force: true })
  assert.ok(c3(sz).length > 0, 'productos reales de Zara'); assert.ok(c3(sz).every((h) => h.raw_attributes.market === 'ES' && h.currency === 'EUR' && !h.raw_attributes.foreign_market))
  assert.ok(sz.query.plan.length >= 2, `consultas generadas desde el perfil: ${sz.query.plan.join(' | ')}`)
  const fields = (k) => c3(sz).filter((h) => h[k] != null && h[k] !== '' && !(Array.isArray(h[k]) && !h[k].length)).length
  console.log(`    campos obtenidos (de ${c3(sz).length}): precio ${fields('current_price')}, composición ${fields('confirmed_composition')}, color ${fields('primary_color')}, corte ${fields('cut')}, silueta ${fields('silhouette')}, tallas ${fields('variants')}, imágenes ${fields('images')}, descripción ${fields('description')}`)
  const avail = c3(sz).filter((h) => h.eligibility.ok)
  assert.ok(avail.length > 0, 'Zara España: productos con tu talla disponible y comprobada')
  for (const h of avail) { assert.equal(h.eligibility.size.size.original, '42'); assert.equal(h.eligibility.size.availability, 'confirmada'); assert.equal(h.raw_attributes.market, 'ES'); assert.ok(h.variants.some((v) => v.size === '42' && v.availability === 'in_stock')) }
  console.log(`    elegibilidad Zara: ${Object.entries(c3(sz).reduce((m, h) => ({ ...m, [h.eligibility.label]: (m[h.eligibility.label] ?? 0) + 1 }), {})).map(([k, v]) => `${k}: ${v}`).join(' · ')}`)
  console.log(`    disponibles en 42: ${avail.slice(0, 4).map((h) => `${h.product_name} (${h.evaluation.score}/100, ajuste ${h.eligibility.size.fit_confidence})`).join(' · ')}`)
  for (const h of c3e(sz)) if (!h.confirmed_composition) assert.ok(h.evaluation.missing_info.concat(h.evaluation.criteria.flatMap((c) => c.missing)).some((m) => /composici/i.test(m)), 'sin composición → «Composición desconocida»')
  log(`Zara (España): ${c3(sz).length} productos · plan: ${sz.query.plan.join(' | ')}`)

  // 4) El mismo producto real, dos perfiles: datos comerciales iguales, evaluación distinta
  const b = await user('Fría', 'Amplio', coolWardrobe)
  await b.shops(['zara'])
  const sz2 = await b.A.post('/api/shopping/search', { need_id: b.need, force: true })
  const common = c3e(sz).map((h) => [h, c3e(sz2).find((x) => x.canonical_url === h.canonical_url)]).filter(([, x]) => x)
  assert.ok(common.length, 'productos comunes a ambos perfiles')
  for (const [x, y] of common) assert.equal(x.product_name, y.product_name)
  const diff = common.filter(([x, y]) => x.evaluation.score !== y.evaluation.score)
  assert.ok(diff.length, 'el mismo producto real se evalúa distinto según el perfil')
  for (const [x, y] of diff.slice(0, 3)) console.log(`    ${x.product_name} (${x.current_price} €) → A ${x.evaluation.score}/100 ${x.evaluation.verdict} · B ${y.evaluation.score}/100 ${y.evaluation.verdict}`)
  log(`${common.length} productos comunes; ${diff.length} con evaluación distinta según el perfil`)

  // 5) Interfaz: grupos, mercado y enlace de oferta generado en el momento del clic
  await a.go(`/compras/buscar?s=${sp.id}`)
  for (const d of await a.p.locator('main details').all()) await d.evaluate((el) => { el.open = true })
  const body = await a.p.locator('main').innerText()
  assert.match(body, /Mercado: EE\. UU\. · precio de otro mercado, no verificado para España/)
  assert.match(body, /Pendientes de comprobar tu talla|Excluidos por talla/i)
  const href = await a.p.locator('a:has-text("Ver oferta actual")').first().getAttribute('href')
  assert.match(href, /^\/api\/shopping\/channel3\/offer\?search=/)
  const r = await a.p.request.get(U + href, { maxRedirects: 0 })
  assert.equal(r.status(), 302); const loc = r.headers().location
  assert.match(loc, /^https:\/\//); log(`enlace de oferta generado al hacer clic → ${new URL(loc).host}`)

  // 6) Guardar como candidato → ficha con mercado y verificación con la ficha actual (gratis)
  await a.p.locator('.hit').first().locator('button:has-text("Guardar como candidato")').click()
  await a.p.waitForURL(/\/compras\/productos\/[0-9a-f-]{36}/)
  const pid = a.p.url().match(/productos\/([0-9a-f-]{36})/)[1]
  const page = await a.p.locator('main').innerText()
  assert.match(page, /Mercado\s*EE\. UU\./); assert.match(page, /Ver oferta actual en Pull&Bear/)
  const v = await a.A.post(`/api/shopping/products/${pid}/verify`, {})
  assert.ok(v.ok, v.note); assert.equal(v.how, 'channel3'); log(`verificación: ${v.note}`)
  const ev = await a.A.post(`/api/shopping/products/${pid}/evaluate`, {}, 201)
  assert.ok(ev.limitations.some((l) => /otro mercado/.test(l))); log(`evaluación de la ficha: ${ev.score}/100 (${ev.verdict})`)

  // 7) Caché: misma búsqueda sin forzar → se reutiliza el descubrimiento, pero precio y stock se vuelven a pedir
  const again = await a.A.post('/api/shopping/search', { need_id: a.need })
  assert.equal(again.cached, true)
  assert.ok(c3(again).every((h) => new Date(h.raw_attributes.fetched_at) > new Date(c3(sz).find((x) => x.canonical_url === h.canonical_url)?.raw_attributes.fetched_at ?? 0)), 'fichas actualizadas antes de mostrarlas')
  log('caché de descubrimiento reutilizada; precios, disponibilidad y tallas actualizados (gratis) antes de mostrarlos')

  // 8) La clave nunca llega al navegador
  if (KEY && KEY.length > 6) assert.ok(!bodies.some((t) => t.includes(KEY)), 'la clave no aparece en ninguna respuesta')
  log('la clave no aparece en ninguna respuesta de la app')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
