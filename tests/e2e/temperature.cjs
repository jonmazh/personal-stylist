// Prueba e2e de BIS 2: temperatura cromatica con la foto de rostro (IA simulada con tests/e2e/mock-ai.mjs).
const { chromium } = require('playwright'); const fs = require('fs'); const assert = require('assert')
const { until, facePhoto, signup } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)

;(async () => {
  const br = await chromium.launch(); const p = await br.newPage({ viewport: { width: 1200, height: 900 } })
  p.setDefaultTimeout(30000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  await signup(p, U); log('registro y login')
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const card = p.locator('#temperatura')
  const analyze = async () => { await card.locator('button', { hasText: /Analizar mi temperatura|Solicitar un nuevo análisis/ }).click(); await until(card.locator('.msg'), /Estimación lista|no sirve|No se pudo/) ; await p.waitForTimeout(600) }

  // Otras dimensiones antes del analisis: deben quedar intactas
  await go('/profile/color')
  await p.locator('fieldset', { hasText: 'Intensidad' }).locator('label:text-is("Suave")').click()
  await p.locator('fieldset', { hasText: 'Profundidad' }).locator('label:text-is("Media")').click()
  await p.click('button:has-text("Guardar")'); await p.waitForURL(/saved=1/)

  // 1-3 · Inicio desde el estudio cromatico, instrucciones y consentimiento
  assert.match(await card.innerText(), /Temperatura cromática/); assert.match(await card.innerText(), /Pendiente/i)
  assert.match(await card.innerText(), /no su temperatura física/)
  const how = await card.locator('details.howto').innerText()
  for (const re of [/Rostro visible y centrado/, /Luz natural, uniforme/, /luces amarillas, anaranjadas/, /Sin filtros/, /maquillaje/, /sombras fuertes/]) assert.match(how, re)
  await card.locator('input[name=consent]').check(); await card.locator('button:has-text("Aceptar y continuar")').click(); await p.waitForURL(/profile\/color/)
  await until(card, /Añadir foto/)
  log('inicio en el estudio cromático: instrucciones de captura y consentimiento')

  // 4 · Control de calidad: foto oscura → aviso antes de subir; la IA la rechaza y no concluye
  await card.locator('input[aria-label="Subir foto rostro"]').setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: facePhoto(0.2) })
  await until(card.locator('.photo-frame[role=alert]'), /demasiado oscura/i)
  await card.locator('button:has-text("Subir igualmente")').click(); await card.locator('img[alt="Foto de rostro"]').waitFor()
  assert.match(await card.locator('.qc').innerText(), /Con avisos/)
  await analyze()
  const bad = await card.innerText()
  assert.match(bad, /No he podido estimarla con esta foto/); assert.match(bad, /Iluminación insuficiente/); assert.match(bad, /Pendiente/i)
  assert.doesNotMatch(bad, /Resultado:/)
  await shot('temp-no-apta'); log('foto inadecuada: aviso previo, la IA la rechaza y no hay conclusión (sigue pendiente)')

  // «Volver a subir una fotografia» → foto buena → estimacion
  await card.locator('button:has-text("Quitar foto")').click(); await until(card, /Añadir foto/)
  await card.locator('input[aria-label="Subir foto rostro"]').setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: facePhoto(1) })
  await card.locator('img[alt="Foto de rostro"]').waitFor(); assert.match(await card.locator('.qc').innerText(), /Calidad correcta/)
  await analyze()
  const ok = await card.innerText()
  assert.match(ok, /Resultado: Neutra con tendencia cálida/); assert.match(ok, /Confianza: alta/); assert.match(ok, /matices ligeramente dorados/)
  assert.match(ok, /Limitaciones/i); assert.match(ok, /Estimada por la IA, sin confirmar/i); assert.doesNotMatch(ok, /\d+ ?%/)
  assert.match(ok, /¿Consideras que este resultado representa correctamente tu temperatura cromática\?/)
  await shot('temp-resultado'); log('estimación: «Neutra con tendencia cálida», confianza, explicación y limitaciones, sin porcentajes')

  // Diagnostico con la estimacion sin confirmar: hipotesis, nunca alta
  await go('/blueprint'); await p.click('button:has-text("Generar diagnóstico")'); await p.waitForURL(/v=1/)
  const col = p.locator('.find', { has: p.locator('b', { hasText: /^Colorimetría$/ }) })
  const c1 = await until(col, /Subtono/)
  assert.match(c1, /IA · foto de rostro \(sin confirmar\)/); assert.match(c1, /Confianza media/i); assert.match(c1, /Validar tu temperatura cromática/)
  log('diagnóstico: la estimación sin confirmar entra como hipótesis (confianza media)')

  // 8-9 · Correccion manual: prevalece sobre la IA, incluso tras un nuevo analisis
  await go('/profile/color')
  assert.match(await card.locator('.tempask').innerText(), /Neutra · lo que estimó la IA/i)
  await card.locator('.tempask button:has-text("Cálida")').click(); await p.waitForURL(/temp=corrected/)
  await until(card, /Validada por ti · Cálida · corregida por ti/i)
  await analyze() // «Solicitar un nuevo analisis»: la IA vuelve a decir neutra
  const after = await card.innerText()
  assert.match(after, /Validada por ti · Cálida/i); assert.match(after, /Esta estimación es distinta de tu dato validado \(Cálida\)\. No la aplico salvo que la confirmes/)
  log('corrección: queda validada y una nueva estimación de la IA no la sobrescribe')

  // 10 · Solo cambia la temperatura: intensidad y profundidad intactas
  assert.equal(await p.locator('fieldset', { hasText: 'Intensidad' }).locator('input[value="Suave"]').isChecked(), true)
  assert.equal(await p.locator('fieldset', { hasText: 'Profundidad' }).locator('input[value="Media"]').isChecked(), true)
  log('las demás dimensiones cromáticas no cambian')

  // Confirmacion explicita de la nueva estimacion
  await card.locator('.tempask button:has-text("Neutra")').click(); await p.waitForURL(/temp=confirmed/)
  await until(card, /Validada por ti · Neutra con tendencia cálida · estimación de la IA confirmada/i)
  await shot('temp-confirmada'); log('confirmación: la estimación pasa a dato validado (origen IA)')

  // 11 · Recomendaciones y chat consultan el dato validado
  await go('/blueprint'); await p.click('button:has-text("Generar nueva versión")'); await p.waitForURL(/v=2/)
  const c2 = await until(col, /Subtono/)
  assert.match(c2, /Subtono neutro con tendencia cálido/i); assert.match(c2, /Validado por ti · estimado por la IA/); assert.match(c2, /Confianza alta/i)
  const pal = await p.locator('.find', { has: p.locator('b', { hasText: /^Paleta$/ }) }).innerText()
  assert.match(pal, /La temperatura orienta, no prohíbe/)
  await go('/stylist'); await p.waitForTimeout(800)
  await p.fill('input', '¿Qué color de jersey?'); await p.click('button:has-text("Preguntar")'); await p.waitForSelector('text=Respuesta simulada del estilista')
  const sys = JSON.parse(fs.readFileSync(S + '/lastreq.json', 'utf8')).messages[0].content
  assert.match(sys, /Temperatura cromática: Neutra con tendencia cálida \(validada por el usuario; estimada por la IA y confirmada\)/)
  assert.match(sys, /La temperatura cromatica orienta, no prohibe/)
  log('diagnóstico (confianza alta, paleta no restrictiva) y chat usan el dato validado')

  // 12 · Privacidad: borrar tras el analisis conserva solo el resultado
  await go('/profile/cuerpo'); await p.check('input[name=delete_after]'); await p.click('button:has-text("Guardar preferencia")'); await p.waitForURL(/retention=delete/)
  await go('/profile/color'); await analyze()
  assert.match(await card.locator('.msg').innerText(), /he borrado la foto y conservo solo el resultado/)
  await go('/profile/color')
  assert.equal(await card.locator('img[alt="Foto de rostro"]').count(), 0)
  assert.match(await card.innerText(), /Resultado: Neutra con tendencia cálida/)
  const img = await p.evaluate(() => [...document.images].map((i) => i.src).filter((s) => /profile-private/.test(s)))
  assert.ok(img.every((s) => /token=/.test(s)), 'las imágenes privadas solo con URL firmada')
  log('privacidad: foto borrada tras el análisis, resultado conservado; solo URLs firmadas')

  const m = await br.newPage({ viewport: { width: 375, height: 800 }, storageState: await p.context().storageState() })
  await m.goto(U + '/profile/color'); await m.waitForLoadState('networkidle')
  assert.ok((await m.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'desborde en móvil')
  if (process.env.SHOTS) await m.screenshot({ path: `${S}/movil-temp.png`, fullPage: true })
  log('móvil (375 px) sin desbordes')
  await br.close()
})().catch((e) => { console.error('✘', e.message); process.exit(1) })
