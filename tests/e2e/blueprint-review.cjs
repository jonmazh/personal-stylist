// Prueba e2e del expediente, el Blueprint y el chat. Uso: ver FASE1-ESTRUCTURA.md (Pruebas).
// Argumento: carpeta donde mock-ai.mjs guarda la ultima peticion (lastreq.json). SHOTS=1 guarda capturas ahi.
const { chromium } = require('playwright'); const fs = require('fs'); const assert = require('assert'); const zlib = require('zlib')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
const until = async (loc, re, ms = 20000) => { const t = Date.now(); let txt = ''
  while (Date.now() - t < ms) { txt = await loc.innerText().catch(() => ''); if (re.test(txt)) return txt; await new Promise(r => setTimeout(r, 200)) }
  throw new Error(`no aparece ${re} en: ${txt.slice(0, 300)}`) }
// PNG 300x400 de un color, para probar la subida de fotos sin ficheros externos
function png(w, h) {
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
    let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 176; raw[o + 1] = 141; raw[o + 2] = 87 }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

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
  await p.setInputFiles('input[aria-label="Subir foto frontal"]', { name: 'frontal.png', mimeType: 'image/png', buffer: png(300, 400) })
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

  await finding('Proporciones').locator('button', { hasText: 'Confirmar' }).click(); await until(finding('Proporciones'), /Confirmada por ti/i)
  await finding('Identidad estética').locator('input[name=corrected]').fill('Casual sofisticado con base clásica')
  await finding('Identidad estética').locator('button', { hasText: 'Corregir' }).click(); await until(finding('Identidad estética'), /Corregida por ti/i)
  await finding('Colorimetría').locator('button', { hasText: 'Confirmar' }).click(); await until(finding('Colorimetría'), /Confirmada por ti/i)
  assert.match(await p.locator('.quote').innerText(), /Casual sofisticado con base clásica/)
  log('v1: Proporciones y Colorimetría confirmadas, Identidad corregida (y en la cita de portada)')

  await gen()
  assert.match(await finding('Proporciones').innerText(), /Confirmada por ti/i)
  assert.match(await finding('Colorimetría').innerText(), /Confirmada por ti/i)
  const id2 = await finding('Identidad estética').innerText()
  assert.match(id2, /Corregida por ti/i); assert.match(id2, /Casual sofisticado con base clásica/)
  log('v2 (sin cambios de datos): se conservan las 3 revisiones')

  await save('color', async () => { await p.click('.opts label:has-text("Fría")') })
  await gen()
  const col3 = await finding('Colorimetría').innerText()
  assert.doesNotMatch(col3, /Confirmada por ti/i); assert.match(col3, /Ha cambiado desde la v2, donde la habías confirmado/)
  assert.match(await finding('Proporciones').innerText(), /Confirmada por ti/i)
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
  assert.match(rev, /Proporciones:/); assert.match(rev, /Casual sofisticado con base clásica \(corregida por el usuario\)/); assert.doesNotMatch(rev, /Colorimetría/)
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
