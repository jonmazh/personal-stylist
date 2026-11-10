// Personal Shopper Intelligence con productos REALES (Grimey y EME Studios por UCP). Solo con PSI_LIVE=1.
// Dos perfiles opuestos buscan lo mismo: el mismo producto real recibe evaluaciones distintas y el orden cambia.
// La app debe arrancar como para grimey-live.cjs (SHOPPING_UCP_PROFILE_URL y, tras un proxy, SHOPPING_FETCH_VIA_PROXY=1 y NODE_USE_ENV_PROXY=1).
const { chromium, devices } = require('playwright'); const assert = require('assert')
const { signup } = require('./lib.cjs')
const U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
if (process.env.PSI_LIVE !== '1') { console.log('— omitida: exporta PSI_LIVE=1 para evaluar productos reales'); process.exit(0) }

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
    for (const g of wardrobe) await A.post('/api/wardrobe/items', { status: 'active', occasions: ['trabajo', 'ocio'], seasons: ['primavera', 'otono', 'invierno'], silhouette: 'Regular', ...g }, 201)
    const need = (await A.post('/api/shopping/needs', { title: 'Pantalón de chándal', type: 'need', spec: { category: 'bottom', subcategory: 'joggers', occasions: ['ocio'] }, user_priority: 'high', price_max: 120 }, 201)).id
    return { p, A, go, need }
  }
  const G = (name, category, subcategory, primary_color, formality_level, x = {}) => ({ name, category, subcategory, primary_color, formality_level, ...x })
  const navy = [G('Sudadera marino', 'top', 'sweatshirt', 'Azul marino', 2), G('Jersey marino', 'top', 'knit', 'Azul marino', 3), G('Polo marino', 'top', 'polo', 'Azul marino', 3), G('Camiseta marino', 'top', 'tee', 'Azul marino', 2),
    G('Chino marino', 'bottom', 'chinos', 'Azul marino', 3, { cut: 'Recto' }), G('Vaquero', 'bottom', 'jeans', 'Denim', 2, { cut: 'Recto' }), G('Mocasín marrón', 'footwear', 'loafers', 'Marrón', 3), G('Zapatilla blanca', 'footwear', 'sneakers', 'Blanco', 2)]
  const ecru = [G('Sudadera crudo', 'top', 'sweatshirt', 'Crudo', 2), G('Jersey crudo', 'top', 'knit', 'Crudo', 3), G('Camiseta crudo', 'top', 'tee', 'Crudo', 2), G('Polo blanco', 'top', 'polo', 'Blanco', 3),
    G('Chino gris', 'bottom', 'chinos', 'Gris', 3, { cut: 'Wide' }), G('Vaquero', 'bottom', 'jeans', 'Denim', 2, { cut: 'Wide' }), G('Zapatilla blanca', 'footwear', 'sneakers', 'Blanco', 2), G('Bota negra', 'footwear', 'boots', 'Negro', 3)]
  const a = await user('Cálida', 'Recto', navy), b = await user('Fría', 'Amplio', ecru)
  const sa = await a.A.post('/api/shopping/search', { need_id: a.need, force: true }), sb = await b.A.post('/api/shopping/search', { need_id: b.need, force: true })
  const real = (s) => s.results.filter((h) => h.source_kind === 'api' && h.evaluation)
  assert.ok(real(sa).length && real(sb).length, 'productos reales evaluados para ambos perfiles')
  const common = real(sa).map((h) => [h, real(sb).find((x) => x.canonical_url === h.canonical_url)]).filter(([, x]) => x)
  assert.ok(common.length, 'productos reales comunes a ambas búsquedas')
  const diff = common.filter(([x, y]) => x.evaluation.score !== y.evaluation.score)
  assert.ok(diff.length, 'el mismo producto real se evalúa distinto según el perfil')
  for (const [x, y] of diff.slice(0, 4)) console.log(`    ${x.product_name} (${x.retailer?.name}) → A ${x.evaluation.score}/100 ${x.evaluation.verdict} · B ${y.evaluation.score}/100 ${y.evaluation.verdict}`)
  log(`${common.length} productos reales comunes; ${diff.length} con evaluación distinta según el perfil`)
  console.log('    A (cálido, armario azul marino): ' + real(sa).slice(0, 3).map((h) => `${h.product_name} ${h.evaluation.score}`).join(' · '))
  console.log('    B (frío, armario crudo): ' + real(sb).slice(0, 3).map((h) => `${h.product_name} ${h.evaluation.score}`).join(' · '))
  assert.ok(real(sa).every((h) => h.evaluation.wva.outfit_samples.every((o) => o.titles.length >= 2)), 'outfits simulados con prendas reales')
  log('orden y recomendaciones calculados desde cada perfil sobre catálogos reales')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
