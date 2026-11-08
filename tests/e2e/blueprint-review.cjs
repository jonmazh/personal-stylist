// Prueba e2e del expediente, el Blueprint y el chat. Uso: ver FASE1-ESTRUCTURA.md (Pruebas).
// Argumento: carpeta donde mock-ai.mjs guarda la ultima peticion (lastreq.json). SHOTS=1 guarda capturas ahi.
const { chromium } = require('playwright'); const fs = require('fs'); const assert = require('assert')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
const { until, goodPhoto } = require('./lib.cjs')
;(async () => {
  const br = await chromium.launch(); const p = await br.newPage({ viewport: { width: 1200, height: 900 } })
  p.setDefaultTimeout(30000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  const email = `e2e${Date.now()}@test.local`
  await p.goto(U + '/login'); await shot('login')
  await p.fill('input[name=email]', email); await p.fill('input[name=password]', 'password123')
  await p.click('text=Crear cuenta'); await p.waitForURL(/login\?info/)
  await p.fill('input[name=email]', email); await p.fill('input[name=password]', 'password123'); await p.click('text=Entrar')
  await p.waitForURL(/profile/); log('registro y login')
  assert.match(await p.locator('.chapters').innerText(), /Por empezar/i)

  const chapter = async (slug) => { await p.goto(`${U}/profile/${slug}`); await p.waitForLoadState('networkidle') }
  const save = async (slug, fill) => { await chapter(slug); await fill(); await p.click('button:has-text("Guardar")'); await p.waitForURL(/saved=1/); await until(p.locator('main'), /Guardado/) }

  await save('cuerpo', async () => { for (const [k, v] of [['pecho', 104], ['hombros', 47], ['cintura', 84], ['cadera', 98], ['torso', 62], ['entrepierna', 81]]) await p.fill(`input[name=${k}]`, String(v)) })
  await p.click('button:has-text("Validar este capítulo")'); await p.waitForURL(/validated=1/); await until(p.locator("main"), /Validado por ti/i)
  await p.check('input[name=consent]'); await p.click('button:has-text("Aceptar y continuar")'); await until(p.locator('.photos'), /Añadir foto/)
  await p.setInputFiles('input[aria-label="Subir foto frontal"]', { name: 'frontal.png', mimeType: 'image/png', buffer: goodPhoto() })
  await p.waitForSelector('img[alt="Foto frontal"]'); await p.waitForFunction(() => { const i = document.querySelector('img[alt="Foto frontal"]'); return i && i.complete && i.naturalWidth > 0 })
  await shot('capitulo-cuerpo'); log('capítulo Cuerpo: medidas guardadas, foto privada subida y visible, capítulo validado')
  await save('color', async () => { await p.click('.opts label:has-text("Cálida")') })
  await save('estilo', async () => { await p.click('.opts label:has-text("Casual sofisticado")') })
  await save('vida', async () => { await p.fill('input[name=l_trabajo]', '60') })
  assert.match(await p.locator('main').innerText(), /60 %/)
  await p.goto(U + '/profile'); const idx = await p.locator('.chapters').innerText()
  assert.match(idx, /Estudio antropométrico\s*Validado por ti/i); assert.match(idx, /Estudio cromático\s*En curso/i); assert.match(idx, /Objetivos de imagen\s*Por empezar/i)
  await shot('expediente'); log('expediente: estados en palabras (validado / en curso / por empezar)')

  let ver = 0
  const finding = (t) => p.locator('.find', { has: p.locator('b', { hasText: new RegExp('^' + t + '$') }) }).first()
  const gen = async () => { ver++; await p.goto(U + '/blueprint'); await p.click(ver === 1 ? 'button:has-text("Generar diagnóstico")' : 'button:has-text("Generar nueva versión")')
    await p.waitForURL(new RegExp('blueprint\\?v=' + ver + '$')); await until(p.locator('.cover'), new RegExp('Versión ' + ver, 'i')) }
  await gen(); log('Blueprint v1 generado')
  assert.equal(await p.locator('.swatch').count() > 3, true)

  await finding('Silueta y proporciones').locator('button', { hasText: 'Confirmar' }).click(); await until(finding('Silueta y proporciones'), /Confirmada por ti/i)
  await finding('Dirección de estilo').locator('input[name=corrected]').fill('Casual sofisticado con base clásica')
  await finding('Dirección de estilo').locator('button', { hasText: 'Corregir' }).click(); await until(finding('Dirección de estilo'), /Corregida por ti/i)
  await finding('Colorimetría').locator('button', { hasText: 'Confirmar' }).click(); await until(finding('Colorimetría'), /Confirmada por ti/i)
  assert.match(await p.locator('.quote').innerText(), /Casual sofisticado con base clásica/)
  const sil = await finding('Silueta y proporciones').innerText()
  assert.match(sil, /Por qué/i); assert.match(sil, /Qué haría un estilista/i); assert.match(sil, /Datos usados: Pecho, Cintura/)
  assert.match(await p.locator('main').innerText(), /Lo que sé, lo que supongo y lo que falta/i)
  assert.ok(await p.locator('.swatch-group').count() >= 3)
  log('v1: Silueta y Colorimetría confirmadas, Dirección corregida (y en la cita de portada); Por qué / Qué haría / resumen visibles')

  await gen()
  assert.match(await finding('Silueta y proporciones').innerText(), /Confirmada por ti/i)
  assert.match(await finding('Colorimetría').innerText(), /Confirmada por ti/i)
  const id2 = await finding('Dirección de estilo').innerText()
  assert.match(id2, /Corregida por ti/i); assert.match(id2, /Casual sofisticado con base clásica/)
  log('v2 (sin cambios de datos): se conservan las 3 revisiones')

  await save('color', async () => { await p.click('.opts label:has-text("Fría")') })
  await gen()
  const col3 = await finding('Colorimetría').innerText()
  assert.doesNotMatch(col3, /Confirmada por ti/i); assert.match(col3, /Ha cambiado desde la v2, donde la habías confirmado/)
  assert.match(await finding('Silueta y proporciones').innerText(), /Confirmada por ti/i)
  await shot('blueprint'); log('v3 (cambia el subtono): Colorimetría vuelve a pendiente con aviso; Proporciones sigue confirmada')

  await p.goto(U + '/blueprint?v=1')
  assert.match(await finding('Colorimetría').innerText(), /Confirmada por ti/i)
  assert.equal(await finding('Colorimetría').locator('button').count(), 0)
  log('v1 sigue intacta y en solo lectura')

  await p.goto(U + '/stylist'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1000)
  await p.fill('input', '¿Qué pantalón me conviene?'); await p.click('button:has-text("Preguntar")')
  await p.waitForSelector('text=Respuesta simulada del estilista'); await shot('estilista')
  const sys = JSON.parse(fs.readFileSync(S + '/lastreq.json', 'utf8')).messages[0].content
  fs.writeFileSync(S + '/chat-context.txt', sys)
  const sect = (h) => sys.split('\n\n' + h)[1].split(/\n\n[A-ZÁÉÍÓÚ ]{6,}/)[0]
  assert.match(sect('PERFIL VALIDADO POR EL USUARIO'), /Pecho: 104 cm/)
  const rev = sect('CONCLUSIONES CONFIRMADAS O CORREGIDAS POR EL USUARIO')
  assert.match(rev, /Silueta y proporciones:/); assert.match(rev, /Casual sofisticado con base clásica \(corregida por el usuario\)/); assert.doesNotMatch(rev, /Colorimetría/)
  assert.match(sect('DATOS DECLARADOS SIN VALIDAR'), /Temperatura: Fría/)
  assert.match(sect('CONCLUSIONES PROVISIONALES'), /Colorimetría/)
  log('chat: recibe medidas validadas, revisiones conservadas y lo provisional aparte')

  await p.goto(U + '/estado'); assert.match(await p.locator('main').innerText(), /condiciones comprobadas/)
  log('panel técnico en /estado, fuera del menú')

  // Movil: sin desplazamiento horizontal en ninguna pantalla
  const m = await br.newPage({ viewport: { width: 375, height: 800 }, storageState: await p.context().storageState() })
  for (const path of ['/profile', '/profile/cuerpo', '/profile/estilo', '/blueprint', '/stylist']) {
    await m.goto(U + path); await m.waitForLoadState('networkidle')
    const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(over <= 0, `${path} se desborda ${over}px en movil`)
    if (process.env.SHOTS) await m.screenshot({ path: `${S}/movil${path.replace(/\//g, '-')}.png`, fullPage: true })
  }
  log('móvil (375 px): ninguna pantalla se desborda')
  await br.close()
})().catch((e) => { console.error('✘', e.message); process.exit(1) })
