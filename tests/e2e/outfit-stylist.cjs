// Prueba e2e de la fase 3C: estilista con IA en Outfit Studio (petición en lenguaje natural, propuestas elegidas y
// explicadas por la IA entre candidatas del motor, conversación con cambios validados, guardar, regenerar, aislamiento).
const { chromium, devices } = require('playwright'); const assert = require('assert'); const fs = require('fs')
const { until, signup } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
const lastReq = () => JSON.parse(fs.readFileSync(`${S}/lastreq.json`, 'utf8'))

;(async () => {
  const br = await chromium.launch()
  const ctx = await br.newContext({ ...devices['iPhone 13'] })
  const p = await ctx.newPage(); p.setDefaultTimeout(45000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const post = async (page, path, data, status = 201) => { const r = await page.request.post(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() }
  const noOverflow = async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sin desbordamiento horizontal')
  const say = async (text) => { const n = await p.locator('.msg.assistant').count(); await p.fill('.chatform textarea', text); await p.click('.chatform button:has-text("Enviar")'); await p.waitForURL(/m=\d+/); await p.waitForLoadState('networkidle'); for (let i = 0; i < 50 && (await p.locator('.msg.assistant').count()) <= n; i++) await p.waitForTimeout(200); return p.locator('.msg.assistant').last() }
  await signup(p, U); log('registro y login (iPhone 13)')
  await go('/profile/color'); await p.click('.tempask button:has-text("Cálida")'); await p.waitForURL(/temp=set/)

  const all = ['primavera', 'verano', 'otono', 'invierno']
  const ids = {}
  for (const [k, g] of Object.entries({
    shirt: { name: 'Camisa oxford blanca', category: 'top', subcategory: 'shirt', primary_color: 'Blanco', formality_level: 3 },
    polo: { name: 'Polo marino', category: 'top', subcategory: 'polo', primary_color: 'Azul marino', formality_level: 3 },
    knit: { name: 'Jersey camel', category: 'top', subcategory: 'knit', primary_color: 'Camel', formality_level: 3, seasons: ['otono', 'invierno'] },
    chino: { name: 'Chino beige', category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', formality_level: 3, cut: 'Recto' },
    trousers: { name: 'Pantalón gris', category: 'bottom', subcategory: 'trousers', primary_color: 'Gris', formality_level: 4, cut: 'Recto' },
    loafers: { name: 'Mocasines', category: 'footwear', subcategory: 'loafers', primary_color: 'Marrón', formality_level: 4 },
    sneakers: { name: 'Zapatillas blancas', category: 'footwear', subcategory: 'sneakers', primary_color: 'Blanco', formality_level: 2 },
    boots: { name: 'Botas', category: 'footwear', subcategory: 'boots', primary_color: 'Marrón', formality_level: 3 },
    blazer: { name: 'Blazer marino', category: 'tailoring', subcategory: 'blazer', primary_color: 'Azul marino', formality_level: 4 },
    coat: { name: 'Abrigo camel', category: 'outerwear', subcategory: 'coat', primary_color: 'Camel', formality_level: 4, seasons: ['otono', 'invierno'] },
    parka: { name: 'Parka verde', category: 'outerwear', subcategory: 'parka', primary_color: 'Verde bosque', formality_level: 2, seasons: ['otono', 'invierno'] },
  })) ids[k] = (await post(p, '/api/wardrobe/items', { status: 'active', pattern: 'Liso', silhouette: 'Regular', seasons: all, ...g })).id
  log('armario de 11 prendas reales')

  // ── Petición en lenguaje natural (el ejemplo de la especificación) ──
  await go('/outfits')
  assert.match(await p.locator('.askbox').innerText(), /¿Qué necesitas hoy\?/i)
  await p.fill('.askbox textarea', 'Mañana tengo una cena con unos compañeros de trabajo. Es en un restaurante bastante elegante, pero no quiero ir demasiado formal. Va a hacer frío y prefiero no llevar americana.')
  await p.click('.askbox button:has-text("Generar propuestas")'); await p.waitForURL(/outfits\/estilista\/[0-9a-f-]{36}/); await p.waitForLoadState('networkidle')
  const sid = p.url().split('?')[0].split('/').pop()
  let t = await p.locator('main').innerText()
  assert.match(t, /Lo que he entendido: Cena con amigos · Smart casual · Noche · Frío · Sin chaqueta ni americana/i)
  assert.match(t, /He elegido estas opciones pensando en una cena cuidada/); assert.match(t, /Te propongo 3 conjuntos con tu ropa/)
  await p.locator('summary:has-text("Cómo he interpretado tu petición")').first().click()
  t = await p.locator('main').innerText()
  assert.match(t, /Restaurante bastante elegante → smart casual/); assert.match(t, /Validación: La IA citó una candidata inexistente \(C9\)/); assert.match(t, /Descartado: Intención: «gotico» no es un valor válido/); assert.match(t, /Descartado: Prenda excluida: una prenda que no está en tu armario/)
  const cards = p.locator('.msg.assistant').first().locator('.prop-card')
  assert.equal(await cards.count(), 3)
  const heads = await cards.locator('h3').allInnerTexts()
  assert.deepEqual(heads.map((h) => h.toLowerCase()), ['minimalismo cálido', 'noche sin corbata', 'casual con carácter'], 'nombres de la IA; la candidata inexistente C9 se descarta')
  for (const c of await cards.allInnerTexts()) { assert.match(c, /Abrigo\s*(Abrigo camel|Parka verde)/i, 'con frío, abrigo'); assert.doesNotMatch(c, /Tercera pieza|Blazer marino/i, 'sin americana'); assert.match(c, /El estilista/i) }
  assert.match((await cards.first().innerText()), /^P1 · /i)
  const sel = lastReq(); assert.match(sel.messages[0].content, /Eres Personal Stylist, un estilista masculino profesional/); assert.match(sel.messages[1].content, /No cambies ni añadas prendas/)
  await noOverflow(); await shot('stylist-propuestas')
  log('lenguaje natural → contexto interpretado (con supuestos y descartes), 3 propuestas elegidas y explicadas por la IA entre candidatas del motor; restricciones respetadas')

  // ── Conversación: cambiar los zapatos de la segunda ──
  const p2Before = await cards.nth(1).innerText()
  const shoeBefore = (p2Before.match(/Calzado\s*(\S[^\n]*)/i) ?? [])[1]
  let last = await say('Me gusta el segundo, pero no me convencen los zapatos.')
  t = await last.innerText()
  assert.match(t, /Mantendría el pantalón y la parte superior/); assert.match(t, /Según el motor: compatibilidad \d+ → \d+ \([+-]?\d+\)/)
  const v2 = await last.locator('.prop-card').innerText()
  assert.match(v2, /^P2 · .*versión modificada/i)
  const shoeAfter = (v2.match(/Calzado\s*(\S[^\n]*)/i) ?? [])[1]
  assert.ok(shoeAfter && shoeAfter !== shoeBefore, `cambia el calzado (${shoeBefore} → ${shoeAfter})`)
  assert.equal(v2.replace(/Calzado[\s\S]*?\n/i, '').includes('Abrigo'), true, 'conserva el resto')
  assert.match(await p.locator('.msg.assistant').first().locator('.prop-card').nth(1).innerText(), /Versión anterior/i)
  const chat = lastReq(); assert.match(chat.messages[0].content, /AHORA ESTAS EN CONVERSACION/); assert.match(chat.messages[1].content, /PROPUESTAS ACTUALES:[\s\S]*P2 «Noche sin corbata»/); assert.match(chat.messages[1].content, /CONVERSACION RECIENTE:[\s\S]*Usuario: Mañana tengo una cena/)
  last = await say('¿Y con las zapatillas blancas?')
  assert.match(await last.innerText(), /cambia el carácter del look: más relajado/); assert.match(await last.locator('.prop-card').innerText(), /Calzado\s*Zapatillas blancas/i)
  log('conversación: «no me convencen los zapatos» y «¿y con las zapatillas blancas?» crean versiones nuevas de la P2, repuntuadas por el motor, sin perder el contexto')

  // ── Validación: prenda inventada ──
  const nCards = await p.locator('.prop-card').count()
  last = await say('Ponle a la P1 unas botas de cowboy.')
  assert.match(await last.innerText(), /No he podido aplicar ese cambio: La prenda propuesta no está en tu armario disponible/)
  assert.equal(await p.locator('.prop-card').count(), nCards, 'no se crea ninguna propuesta')
  log('la IA no puede introducir prendas que no tienes: el cambio se rechaza y se explica')

  // ── Guardar la P2 vigente ──
  last = await say('Guarda la P2, me la pongo.')
  assert.match(await last.innerText(), /Guardado en tus conjuntos/)
  await last.locator('a:has-text("Ver el conjunto guardado")').click(); await p.waitForURL(/outfits\/[0-9a-f-]{36}$/); await p.waitForLoadState('networkidle')
  t = await p.locator('main').innerText(); assert.match(t, /propuesto por el motor/i); assert.match(t, /Zapatillas blancas/)
  log('guardar desde la conversación: el conjunto guardado es la versión vigente (con las zapatillas)')

  // ── Regenerar con otras condiciones ──
  await go(`/outfits/estilista/${sid}`)
  last = await say('¿Y si al final hay lluvia?')
  assert.match(await last.innerText(), /Con lluvia lo replanteo con abrigo/); assert.ok((await last.locator('.prop-card').count()) >= 1)
  assert.match(await p.locator('main').innerText(), /Lo que he entendido: [^\n]*Lluvia/i)
  await shot('stylist-conversacion'); await noOverflow()
  log('regenerar: cambia el contexto (lluvia) y vuelve a proponer')

  // ── Perfil de gustos: lo que dices que no te gusta se guarda en tu perfil ──
  last = await say('No me gustan las zapatillas blancas, ni los pantalones pitillo, y el rosa tampoco.')
  t = await last.innerText()
  assert.match(t, /He anotado en tu perfil de gustos: «Zapatillas blancas» \(no te la volveré a proponer\); rechazas pantalón slim; evitas el rosa\./)
  assert.match(t, /Anotado en tu perfil de gustos/i)
  await go('/outfits/aprendizaje'); t = await p.locator('main').innerText()
  assert.match(t, /Confirmado por ti[\s\S]*No te gusta «Zapatillas blancas»[\s\S]*Se lo dijiste al estilista: «No me gustan las zapatillas blancas/i)
  await go('/estilos/identidad'); assert.equal(await p.locator('input[name=rejected][value="leg-slim"]').isChecked(), true, 'rasgo rechazado en la identidad estética')
  await go('/profile/color'); assert.equal(await p.locator('input[name=avoids][value="Rosa"]').isChecked(), true, 'color en «colores que evitas»')
  const g3 = await post(p, '/api/outfits/generate', { occasion: 'dia_a_dia', number_of_outfits: 3 })
  assert.ok(g3.stats.excluded.some((e) => e.garment === 'Zapatillas blancas' && /confirmaste que no te convence/.test(e.reason)), 'el motor deja de proponerla')
  // Gustos en positivo: rasgo, color y corte preferido (lo que gusta sale de rechazados y al revés)
  await go(`/outfits/estilista/${sid}`); last = await say('Me gustan los pantalones anchos y el verde bosque.')
  assert.match(await last.innerText(), /He anotado en tu perfil de gustos: te gustan: pantalón amplio \(wide leg\); te gusta el verde bosque; corte preferido en pantalones: amplio\./)
  await go('/profile/prendas'); assert.equal(await p.locator('input[name=p_pantalones][value="Amplio"]').isChecked(), true, 'corte preferido de pantalón: amplio')
  await go('/estilos/identidad'); assert.equal(await p.locator('input[name=liked][value="leg-wide"]').isChecked(), true, 'rasgo preferido en la identidad estética')
  await go('/profile/color'); assert.equal(await p.locator('input[name=likes][value="Verde bosque"]').isChecked(), true)
  // Chat libre «Estilista» (fase 1): solo extrae cuando hay un gusto o un rechazo
  await go('/stylist')
  await p.fill('.chat input', '¿Qué pantalón me conviene para el trabajo?'); await p.click('.chat button:has-text("Preguntar")')
  await until(p.locator('.chat .note-s').last(), /Respuesta simulada/)
  assert.doesNotMatch(await p.locator('.chat .note-s').last().innerText(), /perfil de gustos/)
  await p.fill('.chat input', 'Odio el color mostaza, no me lo propongas nunca'); await p.click('.chat button:has-text("Preguntar")')
  await until(p.locator('.chat .note-s').last(), /He anotado en tu perfil de gustos: evitas el mostaza/)
  await go('/profile/color'); assert.equal(await p.locator('input[name=avoids][value="Mostaza"]').isChecked(), true)
  await go('/stylist')
  await p.fill('.chat input', 'Me encantan los mocasines'); await p.click('.chat button:has-text("Preguntar")')
  await until(p.locator('.chat .note-s').last(), /te gusta «Mocasines» \(la tendré más en cuenta\)/)
  await p.fill('.chat input', 'He cambiado de idea: ahora me gusta el rosa'); await p.click('.chat button:has-text("Preguntar")')
  await until(p.locator('.chat .note-s').last(), /te gusta el rosa/)
  await go('/profile/color')
  assert.equal(await p.locator('input[name=likes][value="Rosa"]').isChecked(), true); assert.equal(await p.locator('input[name=avoids][value="Rosa"]').isChecked(), false, 'gustar algo lo quita de «evitas»')
  await go('/outfits/aprendizaje'); assert.match(await p.locator('main').innerText(), /Confirmado por ti[\s\S]*Te gusta «Mocasines»/i)
  await shot('stylist-gustos'); log('perfil de gustos: lo que dices que te gusta o no te gusta (prenda, rasgo, color, corte) se anota en tu perfil desde las dos conversaciones; gustar quita de rechazados; el motor lo respeta')

  // ── API y aislamiento ──
  const api = await post(p, '/api/stylist/sessions', { message: 'Tengo una reunión de trabajo', filters: { number_of_outfits: 2 } })
  assert.equal(api.request.occasion, 'reunion_trabajo'); assert.equal(api.request.number_of_outfits, 2)
  const r2 = await post(p, `/api/stylist/sessions/${api.id}/messages`, { message: '¿Cuál me recomiendas?' })
  assert.equal(r2.last.role, 'assistant'); assert.equal(r2.last.payload.action, 'answer')
  assert.ok((await (await p.request.get(`${U}/api/stylist/sessions`)).json()).length >= 2)
  const ctxB = await br.newContext(); const b = await ctxB.newPage(); await signup(b, U)
  assert.equal((await b.request.get(`${U}/api/stylist/sessions/${sid}`)).status(), 404)
  assert.equal((await b.request.post(`${U}/api/stylist/sessions/${sid}/messages`, { data: { message: 'hola' } })).status(), 404)
  log('API de sesiones y mensajes; B no puede leer ni escribir en las conversaciones de A')

  await go('/estado'); t = await p.locator('main').innerText()
  for (const re of [/Estilista: interpretar la petición\s*\d+/i, /Estilista: elegir y explicar propuestas\s*\d+/i, /Estilista: conversación\s*\d+/i, /Perfil de gustos: extraer de la conversación\s*3\b/i, /Perfil de gustos: anotaciones \(sin IA\)\s*5\b/i]) assert.match(t, re)
  log('consumo de IA del estilista en /estado')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
