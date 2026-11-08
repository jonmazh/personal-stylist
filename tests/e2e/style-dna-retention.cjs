// Prueba e2e de la identidad estetica (BIS 1) y de la conservacion de fotos:
// descubrimiento rapido, catalogo y ficha de estilo, identidad hibrida, referencias propias, diagnostico, chat y borrado de fotos.
const { chromium } = require('playwright'); const fs = require('fs'); const assert = require('assert')
const { until, goodPhoto, signup } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)

;(async () => {
  const br = await chromium.launch(); const p = await br.newPage({ viewport: { width: 1200, height: 900 } })
  p.setDefaultTimeout(30000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  await signup(p, U); log('registro y login')
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }

  // ── Descubrimiento rapido (capitulo 04) ──
  await go('/profile/estilo')
  assert.match(await p.locator('main').innerText(), /Aún no la tienes/)
  assert.equal(await p.locator('.refcard').count(), 12)
  const card = (desc) => p.locator('.refcard', { hasText: desc })
  const rate = async (desc, label) => { await card(desc).locator(`.refopts button:text-is("${label}")`).click(); await until(card(desc).locator('button[aria-pressed=true]'), new RegExp(label.replace(/[()]/g, '.'))) }
  await rate('Sudadera gris, vaquero recto azul', 'Me encanta')
  await rate('Sudadera negra amplia', 'Me representa')
  await rate('Camiseta blanca, chino crudo', 'Me gusta')
  await rate('Polo de punto camel', 'Me gusta, pero no me lo pondría')
  await rate('Cazadora de cuero marrón', 'No me gusta')
  await rate('Sudadera cruda amplia', 'Me gusta algún elemento, pero no el conjunto')
  await card('Sudadera cruda amplia').locator('.refels button:text-is("Gorro")').click()
  await until(card('Sudadera cruda amplia').locator('.refels button[aria-pressed=true]'), /Gorro/)
  await until(p.locator('main'), /6 de 12 valorados/)
  await p.waitForTimeout(800); await go('/profile/estilo')
  assert.equal(await card('Sudadera cruda amplia').locator('.refels button[aria-pressed=true]').innerText(), 'Gorro') // persistido con el elemento
  assert.match(await p.locator('.note').first().innerText(), /Propuesta a partir de tus valoraciones/)
  await shot('cap-estilo'); log('descubrimiento rápido: 12 conjuntos de estilos distintos, 6 valoraciones (incluido «algún elemento») persistidas; propuesta visible')

  // ── Catalogo y ficha ──
  await go('/estilos')
  assert.equal(await p.locator('.stylecard').count(), 30)
  for (const g of ['Urbanos y contemporáneos', 'Minimalistas y modernos', 'Clásicos y sofisticados', 'Alternativos y de inspiración editorial']) assert.match(await p.locator('main').innerText(), new RegExp(g, 'i'))
  await shot('catalogo')
  await p.click('.stylecard:has-text("Clean cani")'); await p.waitForURL(/estilos\/clean-cani/)
  const t = await p.locator('main').innerText()
  for (const re of [/Características/i, /Siluetas habituales/i, /Prendas características/i, /Calzado y complementos/i, /Paleta frecuente/i, /Estilos relacionados/i]) assert.match(t, re)
  assert.equal(await p.locator('.refcard').count(), 2)
  await p.locator('.refcard').nth(1).locator('.refopts button:text-is("Me encanta")').click(); await until(p.locator('main'), /1 de 2 valorados/)
  await until(p.locator('main'), /En la propuesta de tus valoraciones/i)
  await p.selectOption('select[aria-label="Papel en tu identidad"]', 'principal'); await p.click('button:has-text("Añadir a mi identidad")')
  await p.waitForURL(/added=1/); await until(p.locator('main'), /En tu identidad como estilo principal/i)
  assert.equal(await p.locator('button:has-text("Añadir a mi identidad")').count(), 0)
  await shot('ficha'); log('catálogo: 30 estilos en 4 grupos; ficha con rasgos, siluetas, prendas, calzado, paleta, relacionados y galería; añadido como principal')
  await p.click('.chips a:has-text("Modern cani")'); await p.waitForURL(/estilos\/modern-cani/)
  log('navegación entre estilos relacionados')

  // ── Identidad hibrida ──
  await go('/estilos/identidad')
  assert.match(await p.locator('main').innerText(), /Lo que dicen tus valoraciones · inferido/i)
  assert.ok(await p.locator('.bar').count() >= 2)
  const rows = p.locator('.inf-row')
  assert.ok(await rows.count() >= 2) // partia de la propuesta + clean cani
  await p.selectOption('select[aria-label="Añadir un estilo"]', 'urban-vintage'); await p.click('.identity button:has-text("Añadir")')
  await p.click('.identity button:has-text("Repartir a partes iguales")')
  await until(p.locator('.identity'), /Total: 100 %/i)
  await p.locator('.elrow', { hasText: 'Bandolera' }).locator('input[name=liked]').check()
  await p.locator('.elrow', { hasText: 'Pantalón slim' }).locator('input[name=rejected]').check()
  await p.locator('.brands label', { hasText: 'Urban Outfitters' }).locator('input').check()
  await p.click('button:has-text("Guardar mi identidad")'); await p.waitForURL(/saved=1/)
  const idText = await until(p.locator('main'), /Guardado: versión \d+/)
  const version = Number(idText.match(/versión (\d+)/)[1]); assert.ok(version >= 2)
  // los porcentajes son editables y no se fuerzan
  const n = await rows.count()
  await rows.nth(0).locator('input[type=number]').fill('70'); await until(p.locator('.identity'), /Total: (?!100)\d+ %/i)
  await p.click('button:has-text("Guardar mi identidad")'); await p.waitForURL(/saved=1/)
  await until(p.locator('main'), /suman \d+ %/)
  assert.equal(await rows.nth(0).locator('input[type=number]').inputValue(), '70')
  assert.equal(await p.locator('.elrow', { hasText: 'Bandolera' }).locator('input[name=liked]').isChecked(), true)
  assert.equal(await p.locator('.brands label', { hasText: 'Urban Outfitters' }).locator('input').isChecked(), true)
  assert.equal(await rows.count(), n)
  await shot('identidad'); log(`identidad híbrida: ${n} influencias con rol y %, elementos y marcas; versionada (v${version + 1}); % editables y no forzados`)

  // ── Referencias propias ──
  await go('/profile/estilo')
  await p.setInputFiles('input[aria-label="Subir referencia"]', { name: 'ref.png', mimeType: 'image/png', buffer: goodPhoto(600, 800) })
  await until(p.locator('.ownrefs'), /Sin analizar/)
  await p.click('button:has-text("Analizar 1 con IA")'); await until(p.locator('main'), /1 referencia analizada/)
  await until(p.locator('.ownrefs'), /workwear-contemporaneo · amplio · relajado/i)
  const req = JSON.parse(fs.readFileSync(S + '/lastreq.json', 'utf8'))
  assert.match(req.messages[0].content, /NO devuelvas la marca como estilo/); assert.match(req.messages[0].content, /leg-baggy \(Pantalón baggy\)/)
  log('referencias propias: la IA extrae elementos del vocabulario (marca ≠ estilo)')

  // ── Diagnostico y chat ──
  await go('/blueprint'); await p.click('button:has-text("Generar diagnóstico")'); await p.waitForURL(/v=1/)
  const find = (title) => p.locator('.find', { has: p.locator('b', { hasText: new RegExp(`^${title}$`) }) })
  const dir = await until(find('Dirección de estilo'), /como base/)
  assert.match(dir, /Clean cani \(70 %\) como base/); assert.match(dir, /identidad que construiste \(versión \d+\)/); assert.match(dir, /nada de pantalón slim/)
  const dna = await until(find('Style DNA'), /Tus valoraciones apuntan a/)
  assert.match(dna, /Inferido de tus valoraciones · referencias analizadas por la IA/); assert.match(dna, /Admiras sin querer llevarlo: quiet luxury/)
  await shot('bp-dna'); log('diagnóstico: Dirección = identidad declarada; Style DNA = inferido, con admiración separada')
  await go('/stylist'); await p.waitForTimeout(800)
  await p.fill('input', '¿Qué me pongo hoy?'); await p.click('button:has-text("Preguntar")'); await p.waitForSelector('text=Respuesta simulada del estilista')
  const sys = JSON.parse(fs.readFileSync(S + '/lastreq.json', 'utf8')).messages[0].content
  assert.match(sys, /Identidad declarada \(versión \d+\): Clean cani 70 % \(principal\)/); assert.match(sys, /INFERIDO de \d+ valoraciones \(no declarado\)/)
  assert.match(sys, /Marcas de referencia \(inspiración, no estilos\): Urban Outfitters/); assert.match(sys, /HIBRIDA/)
  log('chat: recibe identidad declarada e inferencias por separado')

  // ── Conservacion de fotos ──
  await go('/profile/cuerpo')
  await p.check('input[name=consent]'); await p.click('button:has-text("Aceptar y continuar")'); await until(p.locator('.photos'), /Añadir foto/)
  await p.setInputFiles('input[aria-label="Subir foto frontal"]', { name: 'f.png', mimeType: 'image/png', buffer: goodPhoto() }); await p.waitForSelector('img[alt="Foto frontal"]')
  await p.click('summary:has-text("Borrar todas mis fotos")'); await p.click('button:has-text("Sí, borrar mis 1 fotos")'); await p.waitForURL(/deleted=1/)
  await until(p.locator('main'), /He borrado todas tus fotos/); assert.equal(await p.locator('img[alt="Foto frontal"]').count(), 0)
  await p.check('input[name=delete_after]'); await p.click('button:has-text("Guardar preferencia")'); await p.waitForURL(/retention=delete/)
  await p.setInputFiles('input[aria-label="Subir foto frontal"]', { name: 'f.png', mimeType: 'image/png', buffer: goodPhoto() }); await p.waitForSelector('img[alt="Foto frontal"]')
  await p.click('button:has-text("Analizar fotos con IA")'); await until(p.locator('.btns .msg'), /he borrado las fotos y conservo solo los resultados/)
  await go('/profile/cuerpo'); assert.equal(await p.locator('img[alt="Foto frontal"]').count(), 0)
  assert.match(await p.locator('.observations').innerText(), /Observación frontal/)
  log('fotos: «borrar todas» y «borrar tras el análisis» conservan solo los resultados')

  // ── Movil ──
  const m = await br.newPage({ viewport: { width: 375, height: 800 }, storageState: await p.context().storageState() })
  for (const path of ['/estilos', '/estilos/clean-cani', '/estilos/identidad', '/profile/estilo']) {
    await m.goto(U + path); await m.waitForLoadState('networkidle')
    const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(over <= 0, `${path} se desborda ${over}px en móvil`)
    if (process.env.SHOTS) await m.screenshot({ path: `${S}/movil${path.replace(/\//g, '-')}.png`, fullPage: true })
  }
  log('móvil (375 px): catálogo, ficha, identidad y capítulo sin desbordes')
  await br.close()
})().catch((e) => { console.error('✘', e.message); process.exit(1) })
