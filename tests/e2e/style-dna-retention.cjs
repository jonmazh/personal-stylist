// Prueba e2e de los pendientes del punto 4: descubrimiento visual (Style DNA), referencias propias y borrado de fotos.
const { chromium } = require('playwright'); const fs = require('fs'); const assert = require('assert')
const { until, goodPhoto, signup } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)

;(async () => {
  const br = await chromium.launch(); const p = await br.newPage({ viewport: { width: 1200, height: 900 } })
  p.setDefaultTimeout(30000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  await signup(p, U); log('registro y login')

  // ── Descubrimiento visual ──
  await p.goto(U + '/profile/estilo'); await p.waitForLoadState('networkidle')
  assert.equal(await p.locator('.refcard').count(), 16)
  assert.equal(await p.locator('.refcard svg[role=img]').count(), 16)
  assert.doesNotMatch(await p.locator('.refgrid').innerText(), /Clásico contemporáneo/) // el estilo no se revela antes de valorar
  const card = (desc) => p.locator('.refcard', { hasText: desc })
  const rate = async (desc, label) => { await card(desc).locator(`button:text-is("${label}")`).click(); await until(card(desc), /./) }
  const plan = [['Americana azul marino, camisa blanca', 'Me encanta'], ['Abrigo camel', 'Me encanta'], ['Jersey azul marino sobre camisa oxford', 'Me gusta'],
    ['Jersey camel sobre camisa blanca', 'Me gusta'], ['Americana azul marino, camisa azul claro', 'Me gustaría conseguir algo parecido'],
    ['Sudadera negra amplia', 'No me lo pondría'], ['Bomber verde bosque', 'No me lo pondría'], ['Polo de punto oliva', 'Me gusta, pero no para mí']]
  for (const [d, l] of plan) await rate(d, l)
  await until(p.locator('main'), /8 de 16 valorados/)
  assert.match(await card('Americana azul marino, camisa blanca').innerText(), /Clásico contemporáneo/i) // se revela tras valorar
  assert.equal(await card('Abrigo camel').locator('button[aria-pressed=true]').innerText(), 'Me encanta')
  // quitar y volver a poner una valoracion
  await card('Polo de punto oliva').locator('button:text-is("Me gusta, pero no para mí")').click(); await until(p.locator('main'), /7 de 16 valorados/)
  await card('Polo de punto oliva').locator('button:text-is("Me gusta, pero no para mí")').click(); await until(p.locator('main'), /8 de 16 valorados/)
  await p.waitForTimeout(800); await p.reload(); await p.waitForLoadState('networkidle')
  await until(p.locator('main'), /8 de 16 valorados/) // persistido
  assert.match(await p.locator('.note').first().innerText(), /te atraen clásico contemporáneo/i)
  await shot('descubrimiento'); log('descubrimiento visual: 16 conjuntos ilustrados, valoraciones persistidas y Style DNA visible')

  // ── Referencias propias ──
  await p.fill('input[placeholder^="https://pinterest"]', 'https://pinterest.com/pin/123'); await p.fill('input[placeholder="La caída del pantalón"]', 'Las capas')
  await p.setInputFiles('input[aria-label="Subir referencia"]', { name: 'ref.png', mimeType: 'image/png', buffer: goodPhoto(600, 800) })
  await until(p.locator('.ownrefs'), /Sin analizar/)
  assert.match(await p.locator('.ownrefs').innerText(), /«Las capas»/)
  await p.click('button:has-text("Analizar 1 con IA")')
  await until(p.locator('main'), /1 referencia analizada/)
  await until(p.locator('.ownrefs'), /Workwear · amplio · relajado · formalidad 2\/5\. Capas de algodón grueso/)
  await p.locator('.ownrefs select').selectOption('love'); await p.locator('.ownrefs button:has-text("Guardar")').click(); await p.waitForURL(/estilo/)
  await until(p.locator('.ownrefs'), /./); assert.equal(await p.locator('.ownrefs select').inputValue(), 'love')
  const req = JSON.parse(fs.readFileSync(S + '/lastreq.json', 'utf8'))
  assert.match(req.messages[0].content, /No describas a las personas/)
  await shot('referencias'); log('referencias propias: subida privada, análisis IA (etiquetas normalizadas) y valoración')

  // ── Diagnostico con Style DNA ──
  await p.goto(U + '/blueprint'); await p.click('button:has-text("Generar diagnóstico")'); await p.waitForURL(/v=1/)
  const dna = p.locator('.find', { has: p.locator('b', { hasText: /^Style DNA$/ }) })
  const t = await until(dna, /De 9 referencias que has valorado \(1 tuyas\)/)
  assert.match(t, /Te atraen sobre todo clásico contemporáneo/); assert.match(t, /Aspiras a old money/); assert.match(t, /Dejaría fuera/)
  assert.doesNotMatch(t, /Fucsia/i) // color fuera de la paleta descartado
  log('diagnóstico: conclusión «Style DNA» con catálogo + referencia propia')

  // ── Conservacion de fotos ──
  await p.goto(U + '/profile/cuerpo'); await p.waitForLoadState('networkidle')
  await p.check('input[name=consent]'); await p.click('button:has-text("Aceptar y continuar")'); await until(p.locator('.photos'), /Añadir foto/)
  await p.setInputFiles('input[aria-label="Subir foto frontal"]', { name: 'f.png', mimeType: 'image/png', buffer: goodPhoto() }); await p.waitForSelector('img[alt="Foto frontal"]')
  await p.click('summary:has-text("Borrar todas mis fotos")'); await p.click('button:has-text("Sí, borrar mis 1 fotos")'); await p.waitForURL(/deleted=1/)
  await until(p.locator('main'), /He borrado todas tus fotos/); assert.equal(await p.locator('img[alt="Foto frontal"]').count(), 0)
  log('«Borrar todas mis fotos» elimina ficheros y registros')

  await p.check('input[name=delete_after]'); await p.click('button:has-text("Guardar preferencia")'); await p.waitForURL(/retention=delete/)
  await p.setInputFiles('input[aria-label="Subir foto frontal"]', { name: 'f.png', mimeType: 'image/png', buffer: goodPhoto() }); await p.waitForSelector('img[alt="Foto frontal"]')
  await p.click('button:has-text("Analizar fotos con IA")')
  await until(p.locator('.btns .msg'), /he borrado las fotos y conservo solo los resultados/)
  await p.reload(); await p.waitForLoadState('networkidle')
  assert.equal(await p.locator('img[alt="Foto frontal"]').count(), 0)
  assert.match(await p.locator('.observations').innerText(), /Observación frontal/)
  assert.equal(await p.locator('input[name=delete_after]').isChecked(), true)
  await shot('conservacion'); log('modo «borrar tras el análisis»: fotos eliminadas, observaciones conservadas')
  await br.close()
})().catch((e) => { console.error('✘', e.message); process.exit(1) })
