// Prueba de aceptación de Personal Shopper Intelligence (tienda de prueba fake-store.mjs, feed /feed-psi.csv).
// 1) El mismo producto se evalúa distinto para dos perfiles. 2) Para un perfil, entre productos parecidos gana el de mejor
// color para él (y que le falta), mejor corte y que aporta más; el favorable pero redundante no gana y aparece como
// «no recomendado» con su motivo. 3) Si cambia el armario, la búsqueda (y su caché) cambia.
const { chromium, devices } = require('playwright'); const assert = require('assert')
const { signup } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100', STORE = 'http://127.0.0.1:4700'
const log = (...a) => console.log('✔', ...a)

;(async () => {
  const br = await chromium.launch()
  async function user(temp, pants, wardrobe) {
    const p = await (await br.newContext({ ...devices['iPhone 13'] })).newPage(); p.setDefaultTimeout(45000)
    const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
    const pick = (name, value) => p.locator(`.opts label:has(input[name="${name}"][value="${value}"])`).click()
    const A = {
      get: async (path) => { const r = await p.request.get(U + path); assert.equal(r.status(), 200, await r.text()); return r.json() },
      post: async (path, data, status = 200) => { const r = await p.request.post(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
    }
    await signup(p, U)
    const save = async (slug, fill) => { await go(`/profile/${slug}`); await fill(); await p.click('main button:has-text("Guardar")'); await p.waitForURL(/saved=1/) }
    await go('/profile/color'); await p.click(`.tempask button:has-text("${temp}")`); await p.waitForURL(/temp=set/)
    await save('vida', async () => { await p.fill('input[name=l_trabajo]', '50'); await p.fill('input[name=l_ocio]', '50'); await pick('work_formality', 'Smart casual'); await pick('climate', 'Cuatro estaciones marcadas') })
    await save('prendas', async () => { await pick('p_pantalones', pants) })
    await save('identidad', async () => { await p.fill('input[name=sizes]', 'sudadera M, pantalón 48') })
    for (const g of wardrobe) await A.post('/api/wardrobe/items', { status: 'active', occasions: ['trabajo', 'ocio'], seasons: ['primavera', 'otono', 'invierno'], silhouette: 'Regular', ...g }, 201)
    await A.post('/api/shopping/retailers', { name: 'Tienda Test', domains: ['127.0.0.1'], url_policy: 'metadata' }, 201)
    await A.post('/api/shopping/sources', { name: 'Feed PSI', feed_url: `${STORE}/feed-psi.csv`, authorization_note: 'Feed de prueba' }, 201)
    const src = (await A.get('/api/shopping/sources')).sources[0]; await A.post(`/api/shopping/sources/${src.id}/sync`, {})
    const top = (await A.post('/api/shopping/needs', { title: 'Sudadera para ocio', type: 'need', spec: { category: 'top', subcategory: 'sweatshirt', occasions: ['ocio'] }, user_priority: 'high' }, 201)).id
    const pantsNeed = (await A.post('/api/shopping/needs', { title: 'Pantalón de vestir gris', type: 'need', spec: { category: 'bottom', subcategory: 'trousers', colors: ['Gris'], occasions: ['trabajo'] }, user_priority: 'high' }, 201)).id
    return { p, A, go, top, pantsNeed }
  }
  const G = (name, category, subcategory, primary_color, formality_level, x = {}) => ({ name, category, subcategory, primary_color, formality_level, ...x })
  const navy = [G('Sudadera marino', 'top', 'sweatshirt', 'Azul marino', 2), G('Jersey marino', 'top', 'knit', 'Azul marino', 3), G('Polo marino', 'top', 'polo', 'Azul marino', 3), G('Camiseta marino', 'top', 'tee', 'Azul marino', 2),
    G('Chino marino', 'bottom', 'chinos', 'Azul marino', 3, { cut: 'Recto' }), G('Vaquero', 'bottom', 'jeans', 'Denim', 2, { cut: 'Recto' }), G('Mocasín marrón', 'footwear', 'loafers', 'Marrón', 3), G('Zapatilla blanca', 'footwear', 'sneakers', 'Blanco', 2)]
  const ecru = [G('Sudadera crudo', 'top', 'sweatshirt', 'Crudo', 2), G('Jersey crudo', 'top', 'knit', 'Crudo', 3), G('Camiseta crudo', 'top', 'tee', 'Crudo', 2), G('Polo blanco', 'top', 'polo', 'Blanco', 3),
    G('Chino gris', 'bottom', 'chinos', 'Gris', 3, { cut: 'Wide' }), G('Vaquero', 'bottom', 'jeans', 'Denim', 2, { cut: 'Wide' }), G('Zapatilla blanca', 'footwear', 'sneakers', 'Blanco', 2), G('Bota negra', 'footwear', 'boots', 'Negro', 3)]
  const a = await user('Cálida', 'Recto', navy), b = await user('Fría', 'Amplio', ecru)
  log('dos perfiles: A cálido, pantalón recto, armario azul marino; B frío, pantalón amplio, armario crudo')

  const byName = (res, name) => res.find((h) => h.product_name === name)
  const sa = await a.A.post('/api/shopping/search', { need_id: a.top, force: true }), sb = await b.A.post('/api/shopping/search', { need_id: b.top, force: true })
  for (const s of [sa, sb]) assert.ok(['Sudadera azul marino', 'Sudadera crudo', 'Sudadera camel'].every((n) => byName(s.results, n)?.evaluation), 'los tres candidatos evaluados')
  const camelA = byName(sa.results, 'Sudadera camel').evaluation, camelB = byName(sb.results, 'Sudadera camel').evaluation
  assert.ok(camelA.score > camelB.score, `camel: A ${camelA.score} > B ${camelB.score}`)
  const ca = camelA.criteria.find((c) => c.key === 'color'), cb = camelB.criteria.find((c) => c.key === 'color')
  assert.ok(ca.points > cb.points, 'el camel favorece al perfil cálido, no al frío')
  console.log(`    Sudadera camel → A ${camelA.score}/100 (${camelA.verdict}) · B ${camelB.score}/100 (${camelB.verdict})`)
  log('1. el mismo producto obtiene evaluaciones distintas para perfiles distintos')

  const navyA = byName(sa.results, 'Sudadera azul marino').evaluation
  assert.equal(navyA.verdict, 'skip'); assert.ok(navyA.discard_reasons.length)
  assert.equal(navyA.color.saturation, 'saturado')
  assert.notEqual(sa.results[0].product_name, 'Sudadera azul marino', 'el favorable pero saturado no gana')
  const ecruB = byName(sb.results, 'Sudadera crudo').evaluation
  assert.equal(ecruB.color.saturation, 'saturado'); assert.notEqual(sb.results[0].product_name, 'Sudadera crudo')
  console.log(`    A: ${sa.results.filter((h) => h.evaluation).map((h) => `${h.product_name} ${h.evaluation.score} (${h.evaluation.verdict})`).join(' · ')}`)
  console.log(`    B: ${sb.results.filter((h) => h.evaluation).map((h) => `${h.product_name} ${h.evaluation.score} (${h.evaluation.verdict})`).join(' · ')}`)
  log('2. el color que ya satura el armario no gana aunque favorezca; queda como no recomendado con motivo')

  // Moda masculina, tu talla y su disponibilidad por variante (condiciones previas al 4C)
  for (const s of [sa, sb]) {
    assert.ok(!s.results.some((h) => /mujer|infantil/i.test(h.product_name) && h.evaluation), 'mujer e infantil: excluidos, sin evaluar')
    assert.ok(s.results.filter((h) => /mujer|infantil/i.test(h.product_name)).every((h) => h.eligibility.excluded && ['female', 'kids'].includes(h.eligibility.gender.class)))
    const grey = byName(s.results, 'Sudadera gris')
    assert.ok(grey.eligibility.excluded && grey.eligibility.size.status === 'agotada_en_tu_talla', 'disponible en L pero agotada en tu M → excluida')
    const camel = byName(s.results, 'Sudadera camel')
    assert.ok(camel.eligibility.ok && camel.eligibility.size.size.original === 'M' && camel.eligibility.size.availability === 'confirmada')
    assert.equal(s.query.gate.excluded_gender, 2); assert.equal(s.query.sizes.principal, 'M')
  }
  await a.go(`/compras/buscar?s=${sa.id}`)
  const ta = await a.p.locator('main').innerText()
  assert.match(ta, /Tu talla de punto y sudaderas: M/i); assert.match(ta, /Talla disponible: M · tu talla principal · disponibilidad confirmada/i)
  assert.match(ta, /Ajuste: confianza (media|baja) \(respaldada por tus datos\)/i)
  await a.p.$$eval('details', (ds) => ds.forEach((d) => { d.open = true }))
  assert.match(await a.p.locator('main').innerText(), /Excluidos por talla, stock o género \(3\)[\s\S]*Agotado en tu talla/i)
  log('moda masculina y talla: mujer e infantil excluidos; agotado en tu talla excluido; solo se recomienda lo disponible en tu talla, comprobado')

  await a.go(`/compras/buscar?s=${sa.id}`)
  const t = await a.p.locator('main').innerText()
  assert.match(t, /Recomendados para ti/i); assert.match(t, /No recomendados \(\d+\) y por qué/i)
  const rec = await a.p.locator('h3:has-text("Recomendados para ti") + p + .combos').innerText()
  assert.doesNotMatch(rec, /Sudadera azul marino/, 'el descartado no está entre los recomendados')
  await a.p.$$eval('details', (ds) => ds.forEach((d) => { d.open = true }))
  assert.match(await a.p.locator('.hit', { hasText: 'Sudadera azul marino' }).innerText(), /Por qué no:/)
  assert.match(t, /Combina con:/); assert.match(t, /conjuntos? nuevos?/)
  if (process.env.SHOTS) await a.p.screenshot({ path: `${S}/psi-search.png`, fullPage: true })
  log('interfaz: recomendados, no recomendados con motivos, qué combina y qué aporta')

  const pa = await a.A.post('/api/shopping/search', { need_id: a.pantsNeed, force: true })
  const straight = byName(pa.results, 'Pantalón de vestir recto gris').evaluation, slim = byName(pa.results, 'Pantalón de vestir slim gris').evaluation
  const cutPts = (e) => e.criteria.find((c) => c.key === 'cut').points
  assert.ok(cutPts(straight) > cutPts(slim) && straight.score > slim.score, `recto ${straight.score} > slim ${slim.score}`)
  assert.equal(pa.results[0].product_name, 'Pantalón de vestir recto gris', 'gana el de mejor corte aunque el slim sea más barato')
  log(`3. entre dos pantalones parecidos gana el de corte adecuado (recto ${straight.score} > slim ${slim.score}), no el más barato`)

  for (const g of [G('Sudadera camel', 'top', 'sweatshirt', 'Camel', 2), G('Jersey camel', 'top', 'knit', 'Camel', 3), G('Camiseta camel', 'top', 'tee', 'Camel', 2)]) await a.A.post('/api/wardrobe/items', { status: 'active', occasions: ['ocio'], seasons: ['otono'], ...g }, 201)
  const sa2 = await a.A.post('/api/shopping/search', { need_id: a.top })
  assert.equal(sa2.cached, false, 'el armario cambió: la caché no sirve'); assert.notEqual(sa2.query.ctx_hash, sa.query.ctx_hash)
  const camelA2 = byName(sa2.results, 'Sudadera camel').evaluation
  assert.ok(camelA2.score < camelA.score, `camel tras añadir tres prendas camel: ${camelA.score} → ${camelA2.score}`); assert.equal(camelA2.color.saturation, 'saturado')
  log(`4. al cambiar el armario cambia la recomendación (camel ${camelA.score} → ${camelA2.score})`)
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
