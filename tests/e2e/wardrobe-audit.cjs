// Prueba e2e de la fase 2D: auditoria del armario (estados, duplicados con recomendacion, huecos por categoria y ocasion,
// necesidades prioritarias, aprobacion/rechazo con efecto y memoria entre versiones).
const { chromium, devices } = require('playwright'); const assert = require('assert')
const { until, signup } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)

;(async () => {
  const br = await chromium.launch()
  const ctx = await br.newContext({ ...devices['iPhone 13'] })
  const p = await ctx.newPage(); p.setDefaultTimeout(30000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const pick = (name, value) => p.locator(`.opts label:has(input[name="${name}"][value="${value}"])`).click()
  const create = async (g, status = 'active') => { const r = await p.request.post(`${U}/api/wardrobe/items`, { data: { status, ...g } }); assert.equal(r.status(), 201, await r.text()); return (await r.json()).id }
  const finding = (re) => p.locator('.afind', { has: p.locator('b', { hasText: re }) }).first()
  const noOverflow = async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sin desbordamiento horizontal')
  await signup(p, U); log('registro y login (iPhone 13)')

  await go('/armario/auditoria')
  assert.match(await p.locator('main').innerText(), /Necesitas al menos 5 prendas/i); assert.equal(await p.locator('button:has-text("Generar la primera auditoría")').isDisabled(), true)
  log('sin prendas suficientes no se genera')

  const save = async (slug, fill) => { await go(`/profile/${slug}`); await fill(); await p.click('main button:has-text("Guardar")'); await p.waitForURL(/saved=1/) }
  await go('/profile/color'); await p.click('.tempask button:has-text("Cálida")'); await p.waitForURL(/temp=set/)
  await save('vida', async () => { await p.fill('input[name=l_trabajo]', '60'); await p.fill('input[name=l_ocio]', '40'); await pick('work_formality', 'Smart casual'); await pick('climate', 'Cuatro estaciones marcadas') })
  await save('prendas', async () => { await pick('p_pantalones', 'Recto') })

  const slim = await create({ name: 'Chino beige slim', category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', cut: 'Slim', formality_level: 3, occasions: ['trabajo', 'ocio'], apparent_material: 'Sarga de algodón', seasons: ['primavera', 'otono'] })
  const straight = await create({ name: 'Chino beige recto', category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', cut: 'Recto', formality_level: 3, occasions: ['trabajo', 'ocio'], apparent_material: 'Algodón', seasons: ['primavera', 'otono'], is_favorite: true })
  await create({ name: 'Camisa blanca', category: 'top', subcategory: 'shirt', primary_color: 'Blanco', formality_level: 3, occasions: ['trabajo'], seasons: ['primavera', 'verano'] })
  await create({ name: 'Camiseta gris', category: 'top', subcategory: 'tee', primary_color: 'Gris', formality_level: 2, occasions: ['ocio'], seasons: ['verano'], condition: 'desgastado' })
  await create({ name: 'Chaqueta marino', category: 'outerwear', subcategory: 'jacket', primary_color: 'Azul marino', formality_level: 3, occasions: ['trabajo', 'ocio'], seasons: ['otono'] })
  await create({ name: 'Vaquero', category: 'bottom', subcategory: 'jeans', primary_color: 'Denim', cut: 'Recto', formality_level: 2, occasions: ['ocio'] })
  await create({ name: 'Borrador sin tipo', category: null }, 'draft')

  // ── v1 ──
  await go('/armario'); await p.click('text=Auditoría del armario'); await p.waitForURL(/auditoria/)
  await p.click('button:has-text("Generar la primera auditoría")'); await p.waitForURL(/generated=1/); await p.waitForLoadState('networkidle')
  let t = await p.locator('main').innerText()
  assert.match(t, /Versión 1/i); assert.match(t, /6\s*Sin decidir/i)
  assert.match(t, /Calzado\s*Sin prendas/i); assert.match(t, /Parte inferior\s*Bien cubierta/i); assert.match(t, /Prendas exteriores\s*Falta variedad/i)
  assert.match(t, /Trabajo\s*60 %\s*·\s*Falta calzado/i)
  assert.match(t, /Necesidades prioritarias · \d[\s\S]*1\. Calzado versátil para smart casual/i)
  assert.match(t, /Para trabajo \(60 % de tu semana\) no tienes nada adecuado en calzado \(formalidad de tu trabajo: smart casual\)/i)
  assert.match(t, /Abrigo o chaqueta para invierno en camel/i)
  assert.match(t, /Posible duplicado: «Chino beige recto», «Chino beige slim»|Posible duplicado: «Chino beige slim», «Chino beige recto»/i)
  assert.match(t, /tiene corte slim y «Chino beige recto» recto|corte recto y «Chino beige slim» slim/i)
  assert.match(t, /Recomendaría conservar «Chino beige recto» porque encaja mejor con tu perfil actual/i)
  assert.match(t, /Desgastado: «Camiseta gris»/i); assert.match(t, /Por revisar: «Borrador sin tipo»[\s\S]*Es un borrador/i)
  assert.match(t, /Frecuencia de uso\s*Pendiente: la frecuencia de uso saldrá del registro de outfits/i)
  await noOverflow(); await shot('audit-v1')
  log('v1: estados, diagnóstico por categoría y ocasión, necesidades concretas, duplicado con diferencias y recomendación, conservación, borrador')

  // ── Aprobar y rechazar ──
  await finding(/Posible duplicado/).locator('button:has-text("Aprobar: conservar «Chino beige recto»")').click(); await p.waitForURL(/accept=1&applied=keep/); await p.waitForLoadState('networkidle')
  assert.match(await p.locator('main').innerText(), /decisión «Conservar» registrada en la prenda/i)
  assert.match(await finding(/Posible duplicado/).innerText(), /Aprobada/i)
  await finding(/Calzado versátil/).locator('button:has-text("Añadir a mis necesidades")').click(); await p.waitForURL(/accept=1/); await p.waitForLoadState('networkidle')
  await finding(/Prenda superior en/).locator('button:has-text("Rechazar")').click(); await p.waitForURL(/reject=1/); await p.waitForLoadState('networkidle')
  assert.match(await finding(/Prenda superior en/).innerText(), /Rechazada/i)
  await go(`/armario/${straight}?tab=compatibilidad`); t = await p.locator('main').innerText()
  assert.match(t, /decisión: conservar/i); assert.match(t, /Auditoría v1: Posible duplicado/i)
  await go(`/armario/${slim}`); assert.doesNotMatch(await p.locator('main').innerText(), /decisión:/i, 'la otra prenda no se toca')
  log('aprobar el duplicado registra «Conservar» en la recomendada (la otra no se toca); necesidad aprobada; otra rechazada')

  // ── v2: memoria ──
  await go('/armario/auditoria'); await p.click('button:has-text("Generar nueva auditoría")'); await p.waitForURL(/generated=2/); await p.waitForLoadState('networkidle')
  t = await p.locator('main').innerText()
  assert.match(t, /Desde la v1: \+0 prendas · duplicados 1 → 1/i)
  assert.match(await finding(/Prenda superior en/).innerText(), /Rechazada en una auditoría anterior/i)
  assert.match(await finding(/Calzado versátil/).innerText(), /Aprobada en una auditoría anterior/i)
  assert.match(await finding(/Posible duplicado/).innerText(), /Aprobada en una auditoría anterior/i)
  assert.match(t, /1\s*Conservar/i)
  log('v2: recuerda lo aprobado y lo rechazado; comparación con la versión anterior')

  // ── v3: el hueco se cubre ──
  await create({ name: 'Mocasines marrones', category: 'footwear', subcategory: 'loafers', primary_color: 'Marrón', formality_level: 3, occasions: ['trabajo', 'ocio'], seasons: ['primavera', 'otono', 'invierno'] })
  await go('/armario/auditoria'); await p.click('button:has-text("Generar nueva auditoría")'); await p.waitForURL(/generated=3/); await p.waitForLoadState('networkidle')
  t = await p.locator('main').innerText()
  assert.doesNotMatch(t, /Calzado versátil para smart casual/i); assert.match(t, /Trabajo\s*60 %\s*·\s*Cubierta/i); assert.match(t, /Desde la v2: \+1 prendas/i)
  assert.match(t, /Auditorías anteriores[\s\S]*Versión 3[\s\S]*Versión 2[\s\S]*Versión 1/i)
  await go('/armario/auditoria?v=1'); assert.match(await p.locator('main').innerText(), /Versión 1[^\n]*versión anterior/i)
  await shot('audit-v3'); log('v3: al añadir calzado desaparece el hueco y el trabajo queda cubierto; versiones consultables')

  // ── API ──
  const a = await (await p.request.get(`${U}/api/wardrobe/audit`)).json()
  assert.equal(a.audit.version, 3); assert.ok(a.findings.length > 0); assert.ok(a.audit.summary.categories.length === 4)
  assert.equal((await p.request.post(`${U}/api/wardrobe/audit/findings/${a.findings[0].id}`, { data: { action: 'borrar' } })).status(), 400)
  const r = await p.request.post(`${U}/api/wardrobe/audit/findings/${a.findings[0].id}`, { data: { action: 'reject' } }); assert.equal(r.status(), 200); assert.equal((await r.json()).status, 'rejected')
  await go('/estado'); assert.match(await p.locator('main').innerText(), /Auditoría del armario \(reglas, sin IA\)\s*3/i)
  log('API GET/POST audit y aprobación de hallazgos; auditorías en el consumo (sin coste de IA)')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
