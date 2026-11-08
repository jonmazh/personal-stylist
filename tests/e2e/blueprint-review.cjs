const { chromium } = require('playwright'); const fs = require('fs'); const assert = require('assert')
// Uso: ver FASE1-ESTRUCTURA.md (Pruebas). Argumento: carpeta donde mock-ai.mjs guarda la ultima peticion (lastreq.json).
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
const until = async (loc, re, ms = 20000) => { const t = Date.now(); let txt = ''
  while (Date.now() - t < ms) { txt = await loc.innerText().catch(() => ''); if (re.test(txt)) return txt; await new Promise(r => setTimeout(r, 200)) }
  throw new Error(`no aparece ${re} en: ${txt}`) }
;(async () => {
  const br = await chromium.launch(); const p = await br.newPage()
  p.setDefaultTimeout(30000)
  const email = `e2e${Date.now()}@test.local`
  await p.goto(U + '/login'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', 'password123')
  await p.click('text=Crear cuenta'); await p.waitForURL(/login\?info/)
  await p.fill('input[name=email]', email); await p.fill('input[name=password]', 'password123'); await p.click('text=Entrar')
  await p.waitForURL(/profile/); log('registro y login')

  const area = (name) => p.locator('details', { has: p.locator('summary', { hasText: name }) }).first()
  const open = async (name) => { const d = area(name); if (!(await d.evaluate((e) => e.open))) await d.locator('summary').click(); return d }
  const save = async (name, fill) => { const d = await open(name); await fill(d); await d.locator('button', { hasText: 'Guardar' }).click(); await until(area(name).locator('summary'), /Recopilada|Validada/) ; await p.waitForTimeout(500) }

  await save('Estudio antropométrico', async (d) => { for (const [k, v] of [['pecho', 104], ['hombros', 47], ['cintura', 84], ['cadera', 98], ['torso', 62], ['entrepierna', 81]]) await d.locator(`input[name=${k}]`).fill(String(v)) })
  await (await open('Estudio antropométrico')).locator('button', { hasText: 'Validar esta área' }).click(); await until(area('Estudio antropométrico').locator('summary'), /Validada/)
  await save('Estudio cromático', async (d) => { await d.locator('label:has-text("Cálida") input').check() })
  await save('Identidad estética', async (d) => { await d.locator('label:has-text("Casual sofisticado") input').check() })
  log('datos guardados y área antropométrica validada')

  let ver = 0
  const gen = async () => { ver++; await p.click('text=Generar diagnóstico'); await p.waitForURL(new RegExp('v=' + ver + '#')); await until(p.locator('.card'), new RegExp('Versión ' + ver)) }
  const finding = (t) => p.locator('.find', { has: p.locator('b', { hasText: new RegExp('^' + t + '$') }) }).first()
  await gen(); assert.match(p.url(), /v=1/); log('Blueprint v1 generado')

  await finding('Proporciones').locator('button', { hasText: 'Confirmar' }).click(); await until(finding('Proporciones'), /Confirmada por ti/)
  await finding('Identidad estética').locator('input[name=corrected]').fill('Casual sofisticado con base clásica')
  await finding('Identidad estética').locator('button', { hasText: 'Corregir' }).click(); await until(finding('Identidad estética'), /Corregida por ti/)
  await finding('Colorimetría').locator('button', { hasText: 'Confirmar' }).click(); await until(finding('Colorimetría'), /Confirmada por ti/)
  assert.match(await finding('Proporciones').innerText(), /Confirmada por ti/)
  log('v1: Proporciones y Colorimetría confirmadas, Identidad corregida')

  await gen(); assert.match(p.url(), /v=2/)
  assert.match(await finding('Proporciones').innerText(), /Confirmada por ti/)
  assert.match(await finding('Colorimetría').innerText(), /Confirmada por ti/)
  const id2 = await finding('Identidad estética').innerText()
  assert.match(id2, /Corregida por ti/); assert.match(id2, /Casual sofisticado con base clásica/)
  log('v2 (sin cambios de datos): se conservan las 3 revisiones')
  await p.screenshot({ path: S + '/v2.png', fullPage: true })

  await save('Estudio cromático', async (d) => { await d.locator('label:has-text("Fría") input').check() })
  await gen(); assert.match(p.url(), /v=3/)
  const col3 = await finding('Colorimetría').innerText()
  assert.doesNotMatch(col3, /Confirmada por ti/); assert.match(col3, /Ha cambiado desde la v2, donde la habías confirmado/)
  assert.match(await finding('Proporciones').innerText(), /Confirmada por ti/)
  await finding('Colorimetría').screenshot({ path: S + '/v3-colorimetria.png' }); await finding('Proporciones').screenshot({ path: S + '/v3-proporciones.png' })
  log('v3 (cambia el subtono): Colorimetría vuelve a pendiente con aviso; Proporciones sigue confirmada')

  await p.goto(U + '/profile?v=1#blueprint')
  assert.match(await finding('Colorimetría').innerText(), /Confirmada por ti/)
  assert.equal(await finding('Colorimetría').locator('button').count(), 0)
  log('v1 sigue intacta y en solo lectura')

  await p.goto(U + '/stylist'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500); await p.fill('input', '¿Qué pantalón me conviene?'); await p.click('text=Preguntar')
  await p.waitForSelector('text=Respuesta simulada del estilista')
  const req = JSON.parse(fs.readFileSync(S + '/lastreq.json', 'utf8')); const sys = req.messages[0].content
  fs.writeFileSync(S + '/chat-context.txt', sys)
  const sect = (h) => sys.split('\n\n' + h)[1].split(/\n\n[A-ZÁÉÍÓÚ ]{6,}/)[0]
  assert.match(sect('PERFIL VALIDADO POR EL USUARIO'), /Pecho: 104 cm/)
  const rev = sect('CONCLUSIONES CONFIRMADAS O CORREGIDAS POR EL USUARIO')
  assert.match(rev, /Proporciones:/); assert.match(rev, /Casual sofisticado con base clásica \(corregida por el usuario\)/); assert.doesNotMatch(rev, /Colorimetría/)
  assert.match(sect('DATOS DECLARADOS SIN VALIDAR'), /Temperatura: Fría/)
  assert.match(sect('CONCLUSIONES PROVISIONALES'), /Colorimetría/)
  log('chat: recibe medidas validadas, revisiones conservadas tras regenerar y lo provisional aparte')
  await br.close()
})().catch((e) => { console.error('✘', e.message); process.exit(1) })
