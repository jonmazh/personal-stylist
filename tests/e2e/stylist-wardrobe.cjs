// Personal Shopper 2.0 · 2.0B: diagnóstico estratégico del armario y grado de experimentación.
// Con 10 pantalones rectos (categoría cubierta) e identidad Clean streetwear, el estilista detecta que falta otra silueta;
// el diagnóstico se reutiliza mientras nada cambie y se recalcula al cambiar el armario; aislamiento entre usuarios.
const { chromium, devices } = require('playwright'); const assert = require('assert'); const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const { signup, until } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

;(async () => {
  const br = await chromium.launch()
  const p = await (await br.newContext({ ...devices['iPhone 13'] })).newPage(); p.setDefaultTimeout(60000)
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const main = () => p.locator('main').innerText()
  const pick = (name, value) => p.locator(`.opts label:has(input[name="${name}"][value="${value}"])`).click()
  const api = async (method, path, data, status = 200) => { const r = await p.request[method](U + path, data ? { data } : undefined); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() }
  const save = async (slug, fill) => { await go(`/profile/${slug}`); await fill(); await p.click('main button:has-text("Guardar")'); await p.waitForURL(/saved=1/) }
  const email = await signup(p, U)

  // Perfil: identidad Clean streetwear, medidas (silueta en V), estilo de vida y grado de experimentación
  await go('/estilos/clean-streetwear'); await p.selectOption('select[aria-label="Papel en tu identidad"]', 'principal'); await p.click('button:has-text("Añadir a mi identidad")'); await p.waitForURL(/added=1/)
  await save('cuerpo', async () => { await p.fill('input[name=pecho]', '104'); await p.fill('input[name=cintura]', '82') })
  await save('vida', async () => { await p.fill('input[name=l_trabajo]', '40'); await p.fill('input[name=l_ocio]', '60'); await pick('work_formality', 'Casual'); await pick('climate', 'Cuatro estaciones marcadas') })
  await go('/profile/objetivos'); assert.match(await main(), /¿Cuánto te apetece experimentar con tu estilo\?[\s\S]*Conservador[\s\S]*Abierto[\s\S]*Explorador/)
  await pick('experimentation', 'Abierto'); await p.click('main button:has-text("Guardar")'); await p.waitForURL(/saved=1/)
  await go('/profile/objetivos'); assert.equal(await p.locator('input[name=experimentation][value="Abierto"]').isChecked(), true)
  log('grado de experimentación en Objetivos de imagen (tres niveles), guardado y editable')

  const G = (name, category, subcategory, primary_color, x = {}) => ({ name, category, subcategory, primary_color, formality_level: 2, status: 'active', occasions: ['trabajo', 'ocio'], seasons: ['primavera', 'otono', 'invierno'], silhouette: 'Regular', ...x })
  const items = [
    ...['Gris', 'Negro', 'Azul marino', 'Beige', 'Gris', 'Negro', 'Azul marino', 'Beige', 'Antracita', 'Denim'].map((c, i) => G(`Pantalón ${i + 1}`, 'bottom', i === 9 ? 'jeans' : 'chinos', c, { cut: 'Recto' })),
    G('Camiseta blanca', 'top', 'tee', 'Blanco'), G('Camiseta negra', 'top', 'tee', 'Negro'), G('Sudadera gris', 'top', 'sweatshirt', 'Gris'), G('Camisa azul', 'top', 'shirt', 'Azul marino'),
    G('Jersey marino', 'top', 'knit', 'Azul marino'), G('Zapatilla blanca', 'footwear', 'sneakers', 'Blanco'), G('Mocasín marrón', 'footwear', 'loafers', 'Marrón'),
  ]
  for (const g of items) await api('post', '/api/wardrobe/items', g, 201)

  await go('/compras'); await p.click('.eyebrow a:has-text("Estilista")'); await p.waitForURL(/compras\/estilista/); await p.waitForLoadState('networkidle')
  let t = await main()
  assert.match(t, /Tu armario, visto por un estilista/)
  assert.match(t, /Tu identidad: Clean streetwear 100 %/)
  assert.match(t, /Te falta un pantalón amplio \(wide\)[\s\S]*Tienes 10 pantalones y 10 de 10 son de corte recto: la categoría está cubierta, pero la silueta no varía/)
  assert.match(t, /Hipótesis de estilo: Introducir una silueta amplio \(wide\)/)
  assert.match(t, /Tu silueta \(v\) admite este corte/)
  assert.match(t, /Proporciones repetidas[\s\S]*repiten la misma proporción/)
  assert.match(t, /Grado de experimentación: abierto/)
  assert.doesNotMatch(await p.locator('section', { hasText: 'Oportunidades detectadas en tu armario' }).innerText(), /tendencia/i, 'el diagnóstico no habla de tendencias')
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sin desbordamiento horizontal')
  if (S && process.env.SHOTS) await p.screenshot({ path: `${S}/stylist-wardrobe.png`, fullPage: true })
  log('diagnóstico: con 10 pantalones rectos detecta la silueta que falta (y proporciones repetidas), con evidencias y confianza')

  const r1 = await api('get', '/api/stylist/wardrobe'); assert.equal(r1.cached, true, 'reutilizado: nada ha cambiado')
  await api('post', '/api/wardrobe/items', G('Pantalón amplio crudo', 'bottom', 'trousers', 'Crudo', { cut: 'Wide' }), 201)
  const r2 = await api('get', '/api/stylist/wardrobe')
  assert.equal(r2.cached, false); assert.notEqual(r2.fingerprint, r1.fingerprint)
  assert.ok(!r2.analysis.findings.some((f) => f.key === 'silhouette:leg:Wide'), 'con un pantalón amplio la carencia desaparece')
  const r3 = await api('post', '/api/stylist/wardrobe', { force: true }); assert.equal(r3.cached, false)
  log('caché por huella: se reutiliza mientras nada cambia; al añadir un pantalón amplio se recalcula y la carencia desaparece')

  // Aislamiento: otro usuario no ve el diagnóstico de A
  const b = await (await br.newContext()).newPage()
  const emailB = await signup(b, U)
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  assert.ok(!(await sb.auth.signInWithPassword({ email: emailB, password: 'password123' })).error)
  assert.equal((await sb.from('wardrobe_analyses').select('id')).data.length, 0, 'RLS: B no ve los diagnósticos de A')
  const sa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  assert.ok(!(await sa.auth.signInWithPassword({ email, password: 'password123' })).error)
  assert.ok((await sa.from('wardrobe_analyses').select('id')).data.length >= 3)
  log('RLS: cada usuario solo ve sus diagnósticos')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
