// Prueba e2e de la fase 2B: Garment AI (alta asistida, propuesta con confianza, revision aceptar/corregir/descartar,
// trazabilidad, deduplicacion por fotos, sin reanalisis al editar, reanalisis forzado y consumo de IA).
const { chromium, devices } = require('playwright'); const fs = require('fs'); const assert = require('assert')
const { until, png, signup } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
const photo = (rgb, k = 0) => png(600, 800, (x, y) => (((x >> 5) + (y >> 5) + k) % 2 ? rgb : rgb.map((c) => Math.round(c * 0.7))))
const lastReq = () => JSON.parse(fs.readFileSync(process.env.LASTREQ || `${S}/lastreq.json`, 'utf8'))

;(async () => {
  const br = await chromium.launch()
  const ctx = await br.newContext({ ...devices['iPhone 13'] })
  const p = await ctx.newPage(); p.setDefaultTimeout(30000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const reqStamp = () => fs.existsSync(process.env.LASTREQ || `${S}/lastreq.json`) ? fs.statSync(process.env.LASTREQ || `${S}/lastreq.json`).mtimeMs : 0
  await signup(p, U); log('registro y login (iPhone 13)')

  // ── Alta asistida: solo fotos, sin categoria ──
  await go('/armario/nueva')
  assert.equal(await p.locator('select[name=category]').inputValue(), '', 'la categoría puede quedar para la IA')
  await p.click('button:has-text("Guardar y analizar con IA")')
  await until(p.locator('main'), /añade al menos una foto de la prenda/i); log('sin fotos no se lanza el análisis')
  await p.locator('input[aria-label="Elegir fotos de la prenda"]').setInputFiles([
    { name: 'front.png', mimeType: 'image/png', buffer: photo([128, 128, 126]) },
    { name: 'back.png', mimeType: 'image/png', buffer: photo([128, 128, 126], 1) },
  ])
  await p.click('button:has-text("Guardar en el armario")')
  await until(p.locator('main'), /Indica la categoría/); log('sin categoría no entra al armario activo')
  await p.click('button:has-text("Guardar y analizar con IA")')
  await p.waitForURL(/tab=analisis/, { timeout: 60000 }); await p.waitForLoadState('networkidle')
  const gid = p.url().split('?')[0].split('/').pop()
  const req = lastReq()
  assert.match(req.messages[0].content, /Garment Analyst/)
  const userMsg = req.messages[1].content
  assert.equal(userMsg.filter((c) => c.type === 'image_url').length, 2, 'se envían las dos fotos')
  assert.match(userMsg[0].text, /NO hay foto de etiqueta/); assert.match(userMsg[0].text, /no ha indicado el tipo de prenda/)
  let t = await p.locator('main').innerText()
  assert.match(t, /Borrador/i); assert.match(t, /Revisa lo que propone la IA/)
  for (const re of [/Categoría\s*Parte inferior/i, /Tipo\s*Pantalón/i, /Color principal\s*Gris/i, /Silueta\s*Regular\s*Confianza baja/i, /Tiro\s*Medio/i, /Estimación visual: no es la composición/]) assert.match(t, re)
  assert.doesNotMatch(t, /98 % lana/, 'sin etiqueta no se propone composición'); assert.doesNotMatch(t, /Marca Leída/)
  assert.match(t, /Lo que se ve[\s\S]*raya marcada/i); assert.match(t, /Lo que deduce \(no verificado\)/i)
  assert.match(t, /Fotos que ayudarían: etiqueta/i)
  // preseleccion: alta/media aceptar, baja descartar
  assert.equal(await p.locator('input[name="d_category"][value=accept]').isChecked(), true)
  assert.equal(await p.locator('input[name="d_silhouette"][value=reject]').isChecked(), true)
  await p.click('summary:has-text("Descartado automáticamente")')
  const disc = await p.locator('details:has(summary:has-text("Descartado"))').innerText()
  assert.match(disc, /Composición: sin foto de etiqueta/); assert.match(disc, /shoulder/); assert.match(disc, /Campana/); assert.match(disc, /Fucsia neón/)
  await shot('ai-propuesta'); log('propuesta con confianza por campo, observaciones ≠ inferencias, descartes y fotos que faltan; nada de etiqueta sin etiqueta')

  // ── Revision: aceptar, corregir y descartar ──
  await p.check('input[name="d_primary_color"][value=correct]'); await p.selectOption('select[name="v_primary_color"]', 'Antracita')
  await p.check('input[name="d_pattern"][value=reject]')
  assert.equal(await p.locator('input[name=activate]').isChecked(), true)
  await p.click('button:has-text("Confirmar revisión")'); await p.waitForURL(/reviewed=/); await p.waitForLoadState('networkidle')
  t = await p.locator('main').innerText()
  assert.match(t, /Revisión guardada: \d+ aceptados, 1 corregidos, \d+ descartados/)
  assert.match(t, /Aceptado en parte/)
  await go(`/armario/${gid}?tab=resumen`); t = await p.locator('main').innerText()
  assert.match(t, /Pantalón de vestir antracita/i); assert.match(t, /En el armario/i)
  assert.match(t, /Estampado\s*—/, 'el estampado descartado no se escribe'); assert.match(t, /Corte · silueta\s*Recto$/m, 'la silueta de baja confianza no se escribe sola')
  assert.match(t, /Composición\s*Sin confirmar/)
  await go(`/armario/${gid}?tab=historial`); t = await p.locator('main').innerText()
  assert.match(t, /Analizada con IA[^\n]*por la IA/i); assert.match(t, /Propuesta de la IA revisada/i)
  assert.match(t, /Categoría \(IA, aceptado por ti\)/); assert.match(t, /Color principal \(tú\)/)
  await shot('ai-historial'); log('aceptado → origen IA confirmado; corregido → tuyo; descartado no toca la ficha; borrador pasa al armario')

  // ── Sin reanalisis al editar a mano; deduplicacion; reanalisis forzado ──
  const before = reqStamp()
  await go(`/armario/${gid}?tab=caracteristicas`)
  await p.locator('.opts label:has(input[name="pattern"][value="Rayas"])').click()
  await p.click('button:has-text("Guardar cambios")'); await p.waitForURL(/saved=1/)
  assert.equal(reqStamp(), before, 'editar no llama a la IA')
  await go(`/armario/${gid}?tab=analisis`)
  await p.click('button:has-text("Analizar de nuevo")'); await p.waitForURL(/cached=1/); await p.waitForLoadState('networkidle')
  assert.equal(reqStamp(), before, 'mismas fotos → no se repite la llamada')
  await until(p.locator('main'), /ya se habían analizado/)
  await p.click('button:has-text("Repetir análisis (nueva llamada)")'); await p.waitForURL(/analyzed=1/); await p.waitForLoadState('networkidle')
  assert.ok(reqStamp() > before, 'forzar sí llama a la IA')
  t = await p.locator('main').innerText()
  assert.match(t, /Ahora: Antracita \(puesto por ti\)/); assert.equal(await p.locator('input[name="d_primary_color"][value=reject]').isChecked(), true, 'no pisa por defecto un dato tuyo')
  assert.match(t, /Estampado\s*Liso[\s\S]*Ahora: Rayas \(puesto por ti\)/i)
  assert.match(t, /Historial de análisis[\s\S]*Pendiente de revisar[\s\S]*Aceptado en parte/i)
  assert.match(t, /garment-analyst@1 \/ garment-analysis@1/); assert.match(t, /1500 tokens/)
  log('editar a mano no reanaliza; mismas fotos → análisis reutilizado; forzar crea una versión nueva sin pisar tus datos')

  // ── Con foto de etiqueta: composicion y marca leidas, origen etiqueta ──
  await go(`/armario/${gid}?tab=resumen`)
  await p.locator('.addphotos input[aria-label="Elegir fotos de la prenda"]').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: photo([240, 240, 235]) })
  await p.locator('.addphotos .staged select').last().selectOption('label')
  await p.click('.addphotos button:has-text("Subir")'); await p.waitForLoadState('networkidle')
  for (let i = 0; i < 100 && (await p.locator('.wimgs figure').count()) < 3; i++) { await p.waitForTimeout(300); if (i % 10 === 9) await go(`/armario/${gid}?tab=resumen`) }
  assert.deepEqual(await p.locator('.wimgs select').evaluateAll((s) => s.map((x) => x.value)), ['front', 'back', 'label'])
  await go(`/armario/${gid}?tab=analisis`)
  assert.match(await p.locator('main').innerText(), /Pendiente de revisar/)
  await p.click('button:has-text("Repetir análisis (nueva llamada)")'); await p.waitForURL(/analyzed=1/); await p.waitForLoadState('networkidle')
  assert.match(lastReq().messages[1].content[0].text, /Hay foto de etiqueta/)
  t = await p.locator('main').innerText()
  assert.match(t, /Composición \(etiqueta\)\s*98 % lana, 2 % elastano/i); assert.match(t, /Leída en la etiqueta fotografiada/); assert.match(t, /Marca Leída/)
  assert.match(t, /Sustituido por otro análisis/)
  await p.check('input[name="d_confirmed_composition"][value=accept]')
  await p.click('button:has-text("Confirmar revisión")'); await p.waitForURL(/reviewed=/)
  await go(`/armario/${gid}?tab=resumen`)
  assert.match(await p.locator('main').innerText(), /98 % lana, 2 % elastano · confirmada \(etiqueta\)/)
  await shot('ai-etiqueta'); log('con foto de etiqueta: composición confirmada con origen «etiqueta»; la propuesta sin revisar queda sustituida')

  // ── API REST y panel ──
  const api = await p.request.post(`${U}/api/wardrobe/items/${gid}/analyze`); assert.equal(api.status(), 201)
  assert.equal((await api.json()).cached, true)
  const bad = await p.request.post(`${U}/api/wardrobe/items/${gid}/confirm`, { data: { analysis_id: 'x' } }); assert.equal(bad.status(), 400)
  await go('/armario'); t = await p.locator('.stats').innerText()
  assert.match(t, /1\s*Analizadas con IA/i)
  await go('/estado'); t = await p.locator('main').innerText()
  assert.match(t, /Consumo de IA/); assert.match(t, /Análisis de prendas\s*\d+\s*\d+/)
  await shot('ai-estado'); log('API analyze (reutiliza) y confirm (valida); contador «Analizadas» y consumo de IA en /estado')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
