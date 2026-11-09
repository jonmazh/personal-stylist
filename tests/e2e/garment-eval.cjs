// Prueba e2e de la fase 2C: evaluacion personal (compatibilidad con el perfil, valor estrategico, Fit Assessment con IA
// y autoevaluacion, decisiones) y su reflejo en el panel del armario.
const { chromium, devices } = require('playwright'); const fs = require('fs'); const assert = require('assert')
const { until, png, signup } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
const lastReq = () => JSON.parse(fs.readFileSync(`${S}/lastreq.json`, 'utf8'))
const photo = (rgb) => png(600, 800, (x, y) => (((x >> 5) + (y >> 5)) % 2 ? rgb : rgb.map((c) => Math.round(c * 0.7))))

;(async () => {
  const br = await chromium.launch()
  const ctx = await br.newContext({ ...devices['iPhone 13'] })
  const p = await ctx.newPage(); p.setDefaultTimeout(30000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const pick = (name, value) => p.locator(`.opts label:has(input[name="${name}"][value="${value}"])`).click()
  const create = async (g) => { const r = await p.request.post(`${U}/api/wardrobe/items`, { data: { status: 'active', ...g } }); assert.equal(r.status(), 201, await r.text()); return (await r.json()).id }
  await signup(p, U); log('registro y login (iPhone 13)')

  // ── Sin perfil: todo pendiente, nunca cero ──
  const tid = await create({ name: 'Pantalón marino', category: 'bottom', subcategory: 'trousers', primary_color: 'Azul marino', cut: 'Recto', silhouette: 'Regular', pattern: 'Liso', formality_level: 4, seasons: ['otono', 'invierno', 'primavera'], occasions: ['trabajo', 'citas'], attributes: { pleats: 'Sí' } })
  await go('/armario')
  assert.match(await p.locator('.wcard').innerText(), /Compatibilidad pendiente · Ajuste pendiente/i)
  await go(`/armario/${tid}?tab=compatibilidad`)
  let t = await p.locator('main').innerText()
  assert.match(t, /Compatibilidad\s*Pendiente/i); assert.match(t, /Ajuste real\s*Pendiente/i); assert.match(t, /Valor estratégico\s*Pendiente/i)
  assert.doesNotMatch(t, /\b0,0\b/, 'nunca se muestra un cero por falta de datos')
  assert.match(t, /Falta: Tu temperatura cromática o tus colores preferidos/); assert.match(t, /Propuesta: Revisar/)
  assert.match(t, /se calcula cuando tengas al menos 5 prendas/)
  log('sin perfil: las tres valoraciones «Pendiente» con lo que falta; propuesta «Revisar»')

  // ── Perfil: color, vida, cortes y ajuste preferido ──
  const save = async (slug, fill) => { await go(`/profile/${slug}`); await fill(); await p.click('main button:has-text("Guardar")'); await p.waitForURL(/saved=1/) }
  await go('/profile/color'); await p.click('.tempask button:has-text("Cálida")'); await p.waitForURL(/temp=set/)
  await save('color', async () => { await pick('likes', 'Azul marino'); await pick('avoids', 'Rosa') })
  await save('vida', async () => { await p.fill('input[name=l_trabajo]', '60'); await p.fill('input[name=l_ocio]', '40'); await pick('work_formality', 'Smart casual'); await pick('climate', 'Cuatro estaciones marcadas') })
  await save('prendas', async () => { await pick('p_pantalones', 'Recto') })
  await save('identidad', async () => { await pick('fit_pref', 'Regular') })
  log('perfil: temperatura cálida, colores, semana, formalidad del trabajo, corte preferido y ajuste general')

  // Resto del armario (para el valor estrategico)
  const shirt = await create({ name: 'Camisa blanca', category: 'top', subcategory: 'shirt', primary_color: 'Blanco', silhouette: 'Regular', formality_level: 4, seasons: ['primavera', 'verano'] })
  await create({ name: 'Mocasines', category: 'footwear', subcategory: 'loafers', primary_color: 'Marrón', formality_level: 4 })
  await create({ name: 'Abrigo camel', category: 'outerwear', subcategory: 'coat', primary_color: 'Camel', formality_level: 4 })
  await create({ name: 'Pantalón marino 2', category: 'bottom', subcategory: 'trousers', primary_color: 'Azul marino', cut: 'Recto', formality_level: 4 })
  await create({ name: 'Camiseta negra', category: 'top', subcategory: 'tee', primary_color: 'Negro', formality_level: 1 })

  await go(`/armario/${tid}?tab=compatibilidad`); t = await p.locator('main').innerText()
  assert.match(t, /Compatibilidad\s*\d,\d\s*Provisional/i, 'sin identidad estética la compatibilidad es provisional')
  assert.match(t, /Provisional: calculada con el 72 % de los criterios personales/)
  assert.match(t, /Compatibilidad con tu estilo · peso 25 %\s*Pendiente/i); assert.match(t, /Falta: Tu identidad estética/)
  assert.match(t, /Azul marino armoniza con tu temperatura cálida|Azul marino está en tu paleta/); assert.match(t, /entre los colores que te gusta llevar/)
  assert.match(t, /Es el corte que prefieres en pantalones \(recto\)/); assert.match(t, /Su formalidad \(4\/5\) encaja con tu trabajo \(smart casual\)/)
  assert.match(t, /Valor estratégico\s*\d,\d/i); assert.match(t, /Combina con 3 de tus 5 otras prendas/); assert.match(t, /Se parece mucho a: Pantalón marino 2/)
  assert.match(t, /Veredicto del estilista[\s\S]*Tienes otra prenda muy parecida[\s\S]*solo lo sabremos con una prueba de ajuste/i)
  assert.match(t, /Propuesta: Revisar\.\s*Encaja contigo; para decidir con seguridad, registra cómo te queda/)
  await shot('eval-compat'); log('compatibilidad provisional con justificación por criterio; valor estratégico con combinaciones y duplicado; veredicto prudente')

  // ── Fit Assessment ──
  await go(`/armario/${tid}?tab=ajuste`); t = await p.locator('main').innerText()
  assert.match(t, /necesita fotos tuyas llevándola puesta/); assert.match(t, /Pantalón con pinzas/)
  assert.equal(await p.locator('button:has-text("Evaluar ajuste con IA")').count(), 0)
  const noWorn = await p.request.post(`${U}/api/wardrobe/items/${tid}/fit-review`, { data: { mode: 'ai' } }); assert.equal(noWorn.status(), 400)
  await go(`/armario/${tid}?tab=resumen`)
  await p.locator('.addphotos input[aria-label="Elegir fotos de la prenda"]').setInputFiles({ name: 'worn.png', mimeType: 'image/png', buffer: photo([40, 50, 90]) })
  await p.locator('.addphotos .staged select').last().selectOption('worn')
  await p.click('.addphotos button:has-text("Subir")')
  for (let i = 0; i < 60 && (await p.locator('.wimgs figure').count()) < 1; i++) { await p.waitForTimeout(300); if (i % 10 === 9) await go(`/armario/${tid}?tab=resumen`) }
  await go(`/armario/${tid}?tab=ajuste`)
  await p.click('button:has-text("Evaluar ajuste con IA")'); await p.waitForURL(/assessed=1/); await p.waitForLoadState('networkidle')
  const req = lastReq()
  assert.match(req.messages[0].content, /Fit Assessor/); assert.equal(req.messages[1].content.filter((c) => c.type === 'image_url').length, 1)
  assert.match(req.messages[1].content[0].text, /trouser_length/); assert.doesNotMatch(req.messages[1].content[0].text, /- shoulders/)
  t = await p.locator('main').innerText()
  assert.match(t, /Propuesta de la IA · revisa y confirma/i); assert.match(t, /Ajuste real\s*Pendiente/i, 'la propuesta no cuenta hasta confirmarla')
  assert.equal(await p.locator('select[name=s_trouser_length]').inputValue(), '5'); assert.equal(await p.locator('input[name=f_trouser_length]').isChecked(), true)
  assert.equal(await p.locator('select[name=s_stacking]').inputValue(), '', 'lo que no se ve queda sin puntuar')
  assert.match(t, /La IA no ha podido observarlo/); assert.match(t, /Los pliegues pueden deberse a la postura/)
  await shot('eval-fit-propuesta')
  await p.selectOption('select[name=s_proportions]', '7')
  await p.click('button:has-text("Confirmar evaluación")'); await p.waitForURL(/fit=/); await p.waitForLoadState('networkidle')
  t = await p.locator('main').innerText()
  assert.match(t, /Ajuste real\s*\d,\d\s*Provisional/i); assert.match(t, /Largo del pantalón · arreglable\s*5\/10/i); assert.match(t, /Acumulación en el bajo\s*No observable/i)
  assert.match(t, /Propuesta por la IA con tus fotos y confirmada por ti/)
  log('Fit Assessment: sin fotos puestas no hay IA; propuesta con dimensiones del pantalón, no observable y arreglable; cuenta solo al confirmarla')

  // ── Decision ──
  await go(`/armario/${tid}?tab=compatibilidad`); t = await p.locator('main').innerText()
  assert.match(t, /Propuesta: Modificar\.\s*Un arreglo puede mejorar: largo del pantalón/)
  assert.match(t, /Ajuste real\s*\d,\d/i)
  assert.equal(await p.locator('input[name=decision][value=modify]').isChecked(), true)
  await p.fill('input[name=alteration]', 'Acortar el bajo 2 cm'); await p.fill('input[name=reason]', 'Me encanta el color')
  await p.click('button:has-text("Guardar decisión")'); await p.waitForURL(/decided=1/); await p.waitForLoadState('networkidle')
  t = await p.locator('main').innerText()
  assert.match(t, /Decisión guardada: Modificar/); assert.match(t, /decisión: modificar/i)
  assert.match(t, /Historial de decisiones\s*Modificar[^\n]*propuesta: Modificar[^\n]*compatibilidad \d,\d, ajuste \d,\d, valor \d,\d/i); assert.match(t, /Arreglo: Acortar el bajo 2 cm/)
  await shot('eval-decision'); log('decisión «Modificar» tomada por el usuario, con la propuesta y las puntuaciones del momento')

  // ── Autoevaluacion posterior (tras el arreglo) ──
  await go(`/armario/${tid}?tab=ajuste`)
  await p.click('summary:has-text("Actualizar con tu autoevaluación")')
  await p.selectOption('.fitform select[name=s_trouser_length]', '9'); await p.uncheck('.fitform input[name=f_trouser_length]'); await p.selectOption('.fitform select[name=s_stacking]', '9')
  await p.click('button:has-text("Guardar evaluación")'); await p.waitForURL(/fit=/); await p.waitForLoadState('networkidle')
  t = await p.locator('main').innerText()
  assert.match(t, /Autoevaluación ·/); assert.match(t, /Historial de evaluaciones\s*Vigente[^\n]*autoevaluación[\s\S]*Anterior[^\n]*IA/i)
  await go(`/armario/${tid}?tab=compatibilidad`)
  assert.match(await p.locator('main').innerText(), /Propuesta: Conservar\.\s*Encaja contigo y te queda bien/)
  log('autoevaluación tras el arreglo: sustituye a la anterior (queda en el historial) y la propuesta pasa a «Conservar»')

  // ── Panel del armario ──
  await go('/armario'); t = await p.locator('.wcard:has(b:text-is("Pantalón marino"))').innerText()
  assert.match(t, /Compatibilidad: \d,\d · Ajuste: \d,\d/i); assert.match(t, /Modificar/i)
  await go('/armario?decision=modify'); assert.equal(await p.locator('.wcard').count(), 1)
  await go('/armario?decision=none'); assert.equal(await p.locator('.wcard').count(), 5)
  await go('/armario?sort=compat'); assert.ok((await p.locator('.wcard').count()) === 6)
  await shot('eval-panel'); log('panel: compatibilidad y ajuste en cada tarjeta, decisión visible, filtro por decisión y orden por compatibilidad')

  // ── API ──
  const ev = await (await p.request.get(`${U}/api/wardrobe/items/${tid}/evaluation`)).json()
  assert.ok(ev.compatibility.score > 0 && ev.fit.score > 0 && ev.strategic_value.score > 0); assert.equal(ev.decision, 'modify'); assert.equal(ev.decisions.length, 1)
  assert.equal(ev.compatibility.criteria.length, 5); assert.ok(!('ai_result' in ev.fit_reviews[0]))
  assert.equal((await p.request.post(`${U}/api/wardrobe/items/${tid}/decision`, { data: { decision: 'tirar' } })).status(), 400)
  assert.equal((await p.request.post(`${U}/api/wardrobe/items/${tid}/fit-review`, { data: { dimensions: [{ key: 'shoulders', score: 8 }] } })).status(), 400)
  const ok = await p.request.post(`${U}/api/wardrobe/items/${shirt}/fit-review`, { data: { dimensions: [{ key: 'shoulders', score: 8 }, { key: 'sleeves', score: 7, fixable: true }] } })
  assert.equal(ok.status(), 201); assert.equal((await ok.json()).provisional, true)
  await go('/estado'); assert.match(await p.locator('main').innerText(), /Fit Assessment \(ajuste\)\s*1/)
  log('API: evaluation, decision y fit-review validan; consumo del Fit Assessment en /estado')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
