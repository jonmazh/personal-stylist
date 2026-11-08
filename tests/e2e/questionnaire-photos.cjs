// Prueba e2e del cuestionario (A) y el protocolo fotografico (B). Uso: ver FASE1-ESTRUCTURA.md (Pruebas).
const { chromium } = require('playwright'); const fs = require('fs'); const assert = require('assert')
const { until, goodPhoto, darkPhoto, signup } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)

;(async () => {
  const br = await chromium.launch(); const p = await br.newPage({ viewport: { width: 1200, height: 900 } })
  p.setDefaultTimeout(30000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  await signup(p, U); log('registro y login')
  const go = async (slug) => { await p.goto(`${U}/profile/${slug}`); await p.waitForLoadState('networkidle') }
  const pick = (text) => p.click(`.opts label:text-is("${text}")`)
  // Cada guardado parte de la URL limpia del capitulo (go), asi el cambio a ?saved=1 es inequivoco.
  const save = async () => { await p.click('button:has-text("Guardar")'); await p.waitForURL(/saved=1|error=/); await until(p.locator('main'), /Guardado|No se pudo/) }

  // ── A · Cuestionario ──
  await go('color')
  for (const t of ['Verde', 'Castaño oscuro', 'Clara', 'Verdosas', 'Oro', 'Cálida', 'Medio']) await pick(t)
  await p.locator('fieldset', { hasText: 'Colores que te gusta llevar' }).locator('label:text-is("Camel")').click()
  await p.locator('fieldset', { hasText: 'Colores que evitas' }).locator('label:text-is("Rosa")').click()
  await save(); assert.doesNotMatch(await p.locator('main').innerText(), /No se pudo/)
  await go('color')
  assert.equal(await p.locator('fieldset', { hasText: 'Color de ojos' }).locator('input[value="Verde"]').isChecked(), true)
  assert.equal(await p.locator('fieldset', { hasText: 'Colores que evitas' }).locator('input[value="Rosa"]').isChecked(), true)
  await shot('cap-color'); log('colorimetría: rasgos naturales, pistas de subtono y gustos se guardan y se recuperan')

  await go('vida')
  await p.locator('input[name=l_trabajo]').fill('50'); await p.locator('input[name=l_ocio]').fill('20')
  await until(p.locator('main'), /Total: 70 %/i)
  await pick('Smart casual'); await pick('Cuatro estaciones marcadas')
  await save(); await until(p.locator('.note.warn'), /suma 70 %/)
  await go('vida'); await until(p.locator('main'), /Total: 70 %/i) // lo guardado se recupera
  await p.locator('input[name=l_ocio]').fill('50'); await until(p.locator('main'), /Total: 100 %/i)
  await save(); assert.equal(await p.locator('.note.warn').count(), 0)
  await shot('cap-vida'); log('estilo de vida: total en vivo, aviso si no suma 100 % y contexto (formalidad, clima)')

  await go('objetivos')
  for (const w of ['Limpia', 'Segura', 'Elegante']) await pick(w)
  await p.fill('textarea[name=g2]', 'Una imagen limpia y profesional'); await save()
  await go('prendas')
  await pick('Recto')
  await save()
  await p.click('summary:has-text("Añadir una prenda")'); await p.click('.opts label:text-is("Pantalón")')
  await p.fill('input[name=name]', 'Chino azul'); await p.fill('input[name=m_cintura]', '42'); await p.fill('input[name=m_tiro]', '29'); await p.fill('input[name=notes]', 'talla 42')
  await p.click('button:has-text("Guardar prenda")'); await p.waitForURL(/prendas\?saved=1/)
  assert.match(await p.locator('.refs').innerText(), /Pantalón · Chino azul: cintura 42 cm, tiro 29 cm \(talla 42\)/)
  await shot('cap-prendas'); log('prendas de referencia: se añaden con medidas de prenda')

  // ── B · Protocolo fotografico ──
  await go('cuerpo')
  assert.equal(await p.locator('input[aria-label="Subir foto frontal"]').isDisabled(), true)
  await p.click('summary:has-text("Cómo hacer las fotos")'); assert.match(await p.locator('details.howto').innerText(), /folio blanco/)
  await p.check('input[name=consent]'); await p.click('button:has-text("Aceptar y continuar")'); await p.waitForLoadState('networkidle')
  await until(p.locator('.photos'), /Añadir foto/)
  assert.equal(await p.locator('input[aria-label="Subir foto frontal"]').isDisabled(), false)
  log('consentimiento obligatorio antes de la primera foto; protocolo visible')

  await p.setInputFiles('input[aria-label="Subir foto lateral"]', { name: 'l.png', mimeType: 'image/png', buffer: darkPhoto() })
  const qc = await until(p.locator('.photo-frame[role=alert]'), /Antes de subirla/)
  assert.match(qc, /demasiado oscura/i); assert.match(qc, /vertical/i)
  await shot('foto-aviso')
  await p.click('button:has-text("Subir igualmente")'); await p.waitForSelector('img[alt="Foto lateral"]')
  log('foto oscura y horizontal: avisa antes de subir y deja decidir; se sube igualmente')

  await p.setInputFiles('input[aria-label="Subir foto frontal"]', { name: 'f.png', mimeType: 'image/png', buffer: goodPhoto() })
  await p.waitForSelector('img[alt="Foto frontal"]')
  const caps = await p.locator('.photos').innerText()
  assert.match(caps, /Calidad correcta/); assert.match(caps, /Con avisos:.*demasiado oscura/)
  log('foto correcta: sube directamente y se marca «calidad correcta»')

  await p.click('button:has-text("Analizar fotos con IA")')
  const msg = await until(p.locator('.btns .msg'), /observaci(ón|ones) nuevas?/)
  assert.match(msg, /1 observación nueva/); assert.match(msg, /No he podido usar: lateral/)
  await until(p.locator('.photos'), /La IA no pudo usarla: No se ve el cuerpo entero/)
  const obs = await p.locator('.observations').innerText()
  assert.match(obs, /Observación frontal/); assert.doesNotMatch(obs, /Observación lateral/)
  const req = JSON.parse(fs.readFileSync(S + '/lastreq.json', 'utf8'))
  const prompt = req.messages[0].content, userText = req.messages[1].content[0].text
  assert.match(prompt, /Paso 1 · Calidad/); assert.match(prompt, /rostro: puedes observar contraste entre piel, pelo y ojos/)
  assert.match(userText, /Avisos de calidad de lateral:.*demasiado oscura/)
  assert.equal(req.messages[1].content.filter((c) => c.type === 'image_url').length, 2)
  await shot('cap-cuerpo'); log('análisis: la IA recibe protocolo y avisos; se descartan observaciones de la foto no utilizable')

  // ── El chat recibe las respuestas nuevas ──
  await p.goto(U + '/stylist'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(800)
  await p.fill('input', '¿Qué color de chaqueta?'); await p.click('button:has-text("Preguntar")')
  await p.waitForSelector('text=Respuesta simulada del estilista')
  const sys = JSON.parse(fs.readFileSync(S + '/lastreq.json', 'utf8')).messages[0].content
  for (const re of [/Color de ojos: Verde/, /Las venas de tu muñeca, con luz natural, parecen…: Verdosas/, /Colores que evitas: Rosa/,
    /Reparto del armario: Trabajo 50 %, Ocio 50 %/, /Formalidad de tu trabajo: Smart casual/, /Clima habitual: Cuatro estaciones marcadas/,
    /Hasta tres palabras que quieres que piensen al verte: Limpia, Elegante, Segura/, /Fotos subidas: .*lateral \(no utilizable según la IA\)/, /Prenda de referencia que le queda bien: Pantalón · Chino azul/])
    assert.match(sys, re)
  assert.doesNotMatch(sys, /Presupuesto/) // nunca indicado: no debe aparecer un valor por defecto
  log('chat: recibe colorimetría ampliada, contexto de vida, objetivos y prendas de referencia')
  await br.close()
})().catch((e) => { console.error('✘', e.message); process.exit(1) })
