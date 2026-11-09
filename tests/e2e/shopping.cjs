// Prueba e2e de la fase 4A: Shopping Intelligence y Shopping Planner. Detección de necesidades (con la auditoría aprobada/rechazada),
// prioridad explicable, deseo redundante, estados con historial y motivo de descarte, listas, presupuesto, preferencias y aislamiento (app y RLS).
// No hay productos ni tiendas externas: todo funciona sin ellos.
const { chromium, devices } = require('playwright'); const assert = require('assert'); const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const { signup } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

;(async () => {
  const br = await chromium.launch()
  const ctx = await br.newContext({ ...devices['iPhone 13'] })
  const p = await ctx.newPage(); p.setDefaultTimeout(30000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const main = () => p.locator('main').innerText()
  const req = (page) => ({
    get: async (path, status = 200) => { const r = await page.request.get(U + path); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
    post: async (path, data, status = 201) => { const r = await page.request.post(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
    patch: async (path, data, status = 200) => { const r = await page.request.patch(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
    put: async (path, data, status = 200) => { const r = await page.request.put(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
  })
  const A = req(p)
  const pick = (name, value) => p.locator(`.opts label:has(input[name="${name}"][value="${value}"])`).click()
  const noOverflow = async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sin desbordamiento horizontal')
  const emailA = await signup(p, U); log('registro y login (iPhone 13)')

  await go('/compras')
  assert.match(await main(), /No hay necesidades abiertas/i)
  assert.equal(await p.locator('nav a[href="/compras"]').count(), 1, 'Compras en el menú')
  log('sin necesidades: lo dice, no inventa nada; «Compras» en el menú')

  // Perfil y armario (sin calzado; chino casi duplicado)
  const save = async (slug, fill) => { await go(`/profile/${slug}`); await fill(); await p.click('main button:has-text("Guardar")'); await p.waitForURL(/saved=1/) }
  await go('/profile/color'); await p.click('.tempask button:has-text("Cálida")'); await p.waitForURL(/temp=set/)
  await save('vida', async () => { await p.fill('input[name=l_trabajo]', '60'); await p.fill('input[name=l_ocio]', '40'); await pick('work_formality', 'Smart casual'); await pick('climate', 'Cuatro estaciones marcadas') })
  const item = async (g) => (await A.post('/api/wardrobe/items', { status: 'active', ...g })).id
  const chino = await item({ name: 'Chino beige recto', category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', cut: 'Recto', formality_level: 3, occasions: ['trabajo', 'ocio'], seasons: ['primavera', 'otono'] })
  await item({ name: 'Camisa blanca', category: 'top', subcategory: 'shirt', primary_color: 'Blanco', formality_level: 3, occasions: ['trabajo'], seasons: ['primavera', 'verano', 'otono'] })
  const tee = await item({ name: 'Camiseta gris', category: 'top', subcategory: 'tee', primary_color: 'Gris', formality_level: 2, occasions: ['ocio'], seasons: ['verano'], condition: 'desgastado', is_favorite: true })
  await item({ name: 'Polo marino', category: 'top', subcategory: 'polo', primary_color: 'Azul marino', formality_level: 3, occasions: ['trabajo', 'ocio'], seasons: ['primavera', 'verano'] })
  await item({ name: 'Chaqueta marino', category: 'outerwear', subcategory: 'jacket', primary_color: 'Azul marino', formality_level: 3, occasions: ['trabajo', 'ocio'], seasons: ['otono'] })
  await item({ name: 'Vaquero', category: 'bottom', subcategory: 'jeans', primary_color: 'Denim', cut: 'Recto', formality_level: 2, occasions: ['ocio'] })

  // Auditoría: aprobar la necesidad de calzado y rechazar otra → el shopper lo respeta
  const audit = await A.post('/api/wardrobe/audit', {})
  const needs = audit.findings.filter((f) => f.kind === 'need')
  const shoes = needs.find((f) => /calzado/i.test(f.title)); assert.ok(shoes, 'la auditoría ve la falta de calzado')
  const other = needs.find((f) => f !== shoes && !/abrigo/i.test(f.title)); assert.ok(other, `hay otra necesidad para rechazar: ${needs.map((f) => f.title).join(' | ')}`)
  await A.post(`/api/wardrobe/audit/findings/${shoes.id}`, { action: 'accept' }, 200)
  await A.post(`/api/wardrobe/audit/findings/${other.id}`, { action: 'reject' }, 200)
  log(`auditoría: aprobada «${shoes.title}», rechazada «${other.title}»`)

  // ── Detección ──
  await go('/compras'); await p.click('button:has-text("Analizar mi armario")'); await p.waitForURL(/analyzed=\d+/); await p.waitForLoadState('networkidle')
  const created = Number(new URL(p.url()).searchParams.get('analyzed')); assert.ok(created >= 2, `detecta varias: ${created}`)
  let t = await main()
  assert.match(t, /Merece la pena comprar|no necesitas comprar nada/i)
  const list1 = await A.get('/api/shopping/needs')
  const shoeId = list1.find((n) => n.detection_key === 'occ:footwear')?.id; assert.ok(shoeId, 'necesidad de calzado detectada')
  const shoeCard = p.locator(`a.need[href$="${shoeId}"]`); assert.match(await shoeCard.innerText(), /Aprobada en la auditoría/i)
  assert.match(await shoeCard.innerText(), /Necesidad · Detectada/i)
  assert.match(await shoeCard.innerText(), /\+\d+ conjuntos nuevos/i)
  assert.ok(!t.includes(other.title), `no recrea la rechazada en la auditoría: ${other.title}`)
  assert.doesNotMatch(t, /Deseo ·/i, 'el detector nunca crea deseos')
  assert.doesNotMatch(t, /https?:\/\/|€\s*en\s|comprar en/i, 'sin productos ni tiendas')
  await noOverflow(); await shot('shop-detected')
  assert.ok(list1.every((n) => n.latest && n.latest.score === n.priority_score), 'cada necesidad tiene su evaluación')
  for (let i = 1; i < list1.length; i++) assert.ok(({ high: 0, medium: 1, low: 2 })[list1[i - 1].priority] <= ({ high: 0, medium: 1, low: 2 })[list1[i].priority], 'ordenadas por prioridad')
  const replacement = list1.find((n) => n.type === 'replacement')
  assert.ok(replacement && replacement.replaces_garment_id === tee, 'sustitución de la camiseta desgastada')
  log(`detecta ${created} necesidades (calzado con origen auditoría, sustitución de la desgastada), respeta la rechazada, ordenadas, sin deseos ni productos`)

  const again = await A.post('/api/shopping/needs/analyze', {}, 200)
  assert.equal(again.created, 0, 'reanalizar no duplica'); assert.ok(again.reassessed >= created, 'reevalúa las abiertas')
  log('reanalizar no duplica y reevalúa (nueva evaluación versionada)')

  // ── Ficha: desglose explicable ──
  await go(`/compras/necesidades/${shoeId}`); t = await main()
  for (const c of ['Necesidad real del armario', 'Frecuencia de uso esperada', 'Potencial de nuevos outfits', 'Adecuación al perfil', 'Urgencia estacional', 'Confianza de la información']) assert.match(t, new RegExp(c, 'i'), `criterio ${c}`)
  assert.match(t, /Por qué esta prioridad · \d+\/100/i); assert.match(t, /no una recomendación de producto/i)
  assert.match(t, /Conjuntos nuevos\s*\+\d+/i); assert.match(t, /Uso previsto\s*~[\d.]+ al mes/i); assert.match(t, /Coste por uso \(estimado\)/i); assert.match(t, /Redundancia\s*Baja/i)
  await noOverflow(); await shot('shop-need')
  log('ficha: 6 criterios con puntos y razones, conjuntos nuevos, uso previsto, coste por uso y redundancia')

  // Precio → coste por uso; estados; descarte exige motivo
  await A.patch(`/api/shopping/needs/${shoeId}`, { price_max: 90 })
  let n = await A.get(`/api/shopping/needs/${shoeId}`)
  assert.equal(n.type, 'need', 'editar el precio no cambia el tipo'); assert.equal(n.assessments.length, 3, 'editar el precio reevalúa')
  assert.equal(n.assessments[0].cost_per_wear.price, 90); assert.ok(n.assessments[0].cost_per_wear.value > 0 && n.assessments[0].cost_per_wear.value < 90)
  await go(`/compras/necesidades/${shoeId}`); await p.click('button:has-text("Buscando")'); await p.waitForURL(/status=searching/)
  assert.match(await main(), /Estado actualizado: Buscando/i)
  await A.patch(`/api/shopping/needs/${shoeId}`, { status: 'discarded' }, 400)
  log('precio → coste por uso; Detectada → Buscando; descartar sin motivo → 400')

  // Deseo redundante (casi igual al chino que ya tiene)
  const desire = (await A.post('/api/shopping/needs', { title: 'Otro chino beige', type: 'desire', spec: { category: 'bottom', subcategory: 'chinos', colors: ['Beige'], cut: 'Recto', seasons: ['primavera', 'otono'], occasions: ['trabajo', 'ocio'] }, price_max: 50 })).id
  n = await A.get(`/api/shopping/needs/${desire}`)
  assert.equal(n.type, 'desire'); assert.equal(n.origin, 'user'); assert.equal(n.assessments[0].redundancy.level, 'alta')
  assert.ok(n.assessments[0].redundancy.garments.some((g) => g.id === chino), 'señala la prenda parecida')
  assert.equal(n.priority, 'low', 'un deseo redundante queda en prioridad baja')
  await go(`/compras/necesidades/${desire}`); t = await main()
  assert.match(t, /Es un deseo/i); assert.match(t, /Redundancia\s*Alta/i); assert.match(t, /Parecida a: Chino beige recto/i)
  await A.post('/api/shopping/needs', { title: 'x', type: 'replacement', spec: { category: 'top' } }, 400)
  await A.post('/api/shopping/needs', { title: 'x', spec: { category: 'top' }, price_min: 90, price_max: 20 }, 400)
  await A.post('/api/shopping/needs', { title: 'x', spec: { category: 'nada' } }, 400)
  log('deseo redundante: prioridad baja, redundancia alta con la prenda parecida; validaciones (sustitución sin prenda, precios, categoría)')

  // Prioridad fijada por el usuario y descarte con motivo por la interfaz
  await p.selectOption('select[name=user_priority]', 'high'); await p.click('button:has-text("Fijar")'); await p.waitForURL(/saved=1/)
  assert.match(await main(), /Prioridad alta \(fijada por ti\)/i)
  await p.fill('input[name=discard_reason]', 'Prefiero esperar a rebajas'); await p.click('button:has-text("Descartar")'); await p.waitForURL(/status=discarded/)
  t = await main(); assert.match(t, /Descartada: «Prefiero esperar a rebajas»/i)
  assert.match(t, /Prioridad fijada: Alta/i); assert.match(t, /Estado: Detectada → Descartada — «Prefiero esperar a rebajas»/i); assert.match(t, /Creada \(Añadida por ti\)/i)
  log('prioridad manual (manda sobre la calculada) y descarte con motivo; historial completo')

  // Descartar una detectada: no reaparece
  const discardMe = list1.find((n) => n.origin === 'detected' && n.id !== shoeId)
  await A.patch(`/api/shopping/needs/${discardMe.id}`, { status: 'discarded', discard_reason: 'No me hace falta' })
  assert.equal((await A.post('/api/shopping/needs/analyze', {}, 200)).created, 0)
  assert.ok(!(await A.get('/api/shopping/needs')).some((x) => x.id === discardMe.id), 'fuera de las abiertas')
  assert.ok((await A.get('/api/shopping/needs?status=discarded')).some((x) => x.id === discardMe.id), 'en las descartadas')
  log('una detectada descartada no reaparece al reanalizar')

  // ── Listas ──
  await go(`/compras/necesidades/${shoeId}`)
  await p.fill('input[name=name]', 'Otoño'); await p.click('button:has-text("Crear y añadir")'); await p.waitForURL(/list=1/)
  const lists = await A.get('/api/shopping/lists'); assert.equal(lists.length, 1); assert.equal(lists[0].items[0].need_id, shoeId)
  await A.post(`/api/shopping/lists/${lists[0].id}/items`, { need_id: shoeId }, 400)
  await A.post(`/api/shopping/lists/${lists[0].id}/items`, { need_id: replacement.id })
  await go('/compras/plan'); t = await main()
  assert.match(t, /2 necesidades\s*Otoño/i)
  log('listas: crear desde la ficha, añadir, sin duplicados')

  // ── Presupuesto: no obliga a gastar ──
  await A.put('/api/shopping/budgets', { period: 'season', amount: 0.5, currency: 'eur' }, 400)
  await go('/compras/plan')
  await p.selectOption('select[name=period]', 'monthly'); await p.fill('input[name=amount]', '100'); await p.click('button:has-text("Guardar presupuesto")'); await p.waitForURL(/budget=1/)
  t = await main(); assert.match(t, /100\.00 EUR disponibles de 100\.00 \(mensual/i)
  await A.patch(`/api/shopping/needs/${shoeId}`, { status: 'approved' })
  await go('/compras/plan'); t = await main()
  assert.match(t, /10\.00 EUR disponibles de 100\.00/i); assert.match(t, /Comprometido: 90\.00 \(1 aprobada/i)
  await A.put('/api/shopping/budgets', { period: 'quarterly', amount: 300 })
  const budgets = await A.get('/api/shopping/budgets'); assert.equal(budgets.period, 'quarterly')
  log('presupuesto mensual → aprobar resta lo comprometido; cambiar a trimestral deja uno solo activo')

  // ── Preferencias ──
  await A.put('/api/shopping/preferences', { preferred_retailers: ['cos'], excluded_retailers: ['cos'] }, 400)
  await A.put('/api/shopping/preferences', { preferred_retailers: ['tienda-falsa'] }, 400)
  await go('/compras/plan')
  await p.locator('fieldset:has(legend:has-text("Tiendas preferidas")) label:has-text("COS") input').check()
  await p.locator('fieldset:has(legend:has-text("Tiendas que no quieres")) label:has-text("Zara") input').check()
  await p.fill('input[name=min_priority_to_suggest]', '95'); await p.fill('input[name=w_need]', '60')
  await p.click('button:has-text("Guardar preferencias")'); await p.waitForURL(/prefs=1/)
  const prefs = await A.get('/api/shopping/preferences')
  assert.deepEqual(prefs.preferred_retailers, ['cos']); assert.deepEqual(prefs.excluded_retailers, ['zara'])
  assert.equal(Math.round(Object.values(prefs.priority_weights).reduce((s, x) => s + x, 0)), 100, 'pesos normalizados a 100')
  assert.ok(prefs.priority_weights.need > 30, 'subir el peso de necesidad real se respeta')
  const re = await A.post(`/api/shopping/needs/${replacement.id}/assess`, {}, 200)
  assert.equal(re.weights.need, prefs.priority_weights.need, 'la evaluación usa tus pesos')
  // Umbral 95: nada lo supera salvo lo fijado por ti → «no hace falta comprar»
  await A.patch(`/api/shopping/needs/${desire}`, { user_priority: null })
  const plan = await A.get('/api/shopping/planner')
  assert.ok(plan.worth.every((x) => x.user_priority && x.user_priority !== 'low'), 'con umbral 95 solo queda lo fijado por ti')
  await go('/compras'); t = await main()
  if (!(await A.get('/api/shopping/needs')).some((x) => x.user_priority === 'high' && x.type !== 'desire')) assert.match(t, /Ahora mismo no necesitas comprar nada/i)
  await noOverflow(); await shot('shop-plan')
  log('preferencias: tiendas preferidas/excluidas (validadas), pesos normalizados y aplicados, umbral para proponer compra')

  // ── Aislamiento ──
  const ctxB = await br.newContext(); const b = await ctxB.newPage(); b.setDefaultTimeout(30000)
  const emailB = await signup(b, U); const B = req(b)
  await B.get(`/api/shopping/needs/${shoeId}`, 404)
  assert.equal((await B.get('/api/shopping/needs?status=all')).length, 0); assert.equal((await B.get('/api/shopping/lists')).length, 0)
  assert.equal(await B.get('/api/shopping/budgets'), null)
  await B.patch(`/api/shopping/needs/${shoeId}`, { status: 'discarded', discard_reason: 'hack' }, 404)
  await B.post(`/api/shopping/lists/${lists[0].id}/items`, { need_id: shoeId }, 404)
  await B.post('/api/shopping/needs', { title: 'Sustituir', type: 'replacement', replaces_garment_id: chino, spec: { category: 'bottom' } }, 400)
  const listB = (await B.post('/api/shopping/lists', { name: 'De B' })).id
  log('app: B no ve, edita ni usa necesidades, listas, presupuestos ni prendas de A')

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  const { data: au, error: le } = await sb.auth.signInWithPassword({ email: emailB, password: 'password123' }); assert.ok(!le, le?.message)
  for (const tb of ['shopping_needs', 'shopping_need_assessments', 'shopping_need_events', 'shopping_lists', 'shopping_list_items', 'shopping_budgets', 'shopping_preferences'])
    assert.equal((await sb.from(tb).select('*')).data.length, tb === 'shopping_lists' ? 1 : 0, `RLS: B solo ve lo suyo en ${tb}`)
  const uidB = au.user.id
  const e1 = await sb.from('shopping_list_items').insert({ user_id: uidB, list_id: listB, need_id: shoeId }); assert.ok(e1.error && /row-level security/i.test(e1.error.message), `RLS: necesidad ajena en lista propia → ${e1.error?.message}`)
  const e2 = await sb.from('shopping_needs').insert({ user_id: uidB, title: 'x', spec: { category: 'bottom' }, replaces_garment_id: chino }); assert.ok(e2.error && /row-level security/i.test(e2.error.message), 'RLS: sustituir prenda ajena')
  const e3 = await sb.from('shopping_need_assessments').insert({ user_id: uidB, need_id: shoeId, engine_version: 'x', score: 1, level: 'low' }); assert.ok(e3.error, 'RLS: evaluación en necesidad ajena')
  const e4 = await sb.from('shopping_needs').update({ title: 'hack' }).eq('id', shoeId).select('id'); assert.equal(e4.data?.length ?? 0, 0, 'RLS: no actualiza ajenas')
  const e5 = await sb.from('shopping_budgets').insert({ user_id: '00000000-0000-4000-8000-000000000000', period: 'monthly', amount: 1 }); assert.ok(e5.error, 'RLS: no crea presupuestos a nombre de otro')
  log('RLS directo: B no lee, modifica ni mezcla datos de compras de A')
  assert.ok(emailA)
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
