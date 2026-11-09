// Prueba e2e de la fase 3A: Outfit Studio (conjuntos manuales con prendas reales, roles, sustitución, filtros, estados)
// y aislamiento entre usuarios, tanto por la aplicación como directamente contra Supabase (RLS).
const { chromium, devices } = require('playwright'); const assert = require('assert'); const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const { until, png, signup } = require('./lib.cjs')
const S = process.argv[2], U = process.env.APP_URL || 'http://127.0.0.1:3100'
const log = (...a) => console.log('✔', ...a)
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const photo = (rgb) => png(600, 800, (x, y) => (((x >> 5) + (y >> 5)) % 2 ? rgb : rgb.map((c) => Math.round(c * 0.7))))

;(async () => {
  const br = await chromium.launch()
  const ctx = await br.newContext({ ...devices['iPhone 13'] })
  const p = await ctx.newPage(); p.setDefaultTimeout(30000)
  const shot = async (name) => { if (process.env.SHOTS) await p.screenshot({ path: `${S}/${name}.png`, fullPage: true }) }
  const go = async (path) => { await p.goto(U + path); await p.waitForLoadState('networkidle') }
  const api = (page) => ({
    post: async (path, data, status = 201) => { const r = await page.request.post(U + path, { data }); assert.equal(r.status(), status, `${path}: ${await r.text()}`); return r.json() },
  })
  const A = api(p)
  const noOverflow = async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sin desbordamiento horizontal')
  await signup(p, U); log('usuario A registrado (iPhone 13)')

  // ── Armario de A: una prenda con foto (por la interfaz) y el resto por la API ──
  await go('/armario/nueva')
  await p.locator('input[aria-label="Elegir fotos de la prenda"]').setInputFiles({ name: 'shirt.png', mimeType: 'image/png', buffer: photo([235, 235, 230]) })
  await p.selectOption('select[name=category]', 'top'); await p.selectOption('select[name=subcategory]', 'shirt')
  await p.fill('input[name=name]', 'Camisa oxford blanca'); await p.selectOption('select[name=primary_color]', 'Blanco')
  await p.click('button:has-text("Guardar en el armario")'); await p.waitForURL(/armario\/[0-9a-f-]{36}\?/)
  const shirt = p.url().split('?')[0].split('/').pop()
  const mk = async (g) => (await A.post('/api/wardrobe/items', { status: 'active', ...g })).id
  const knit = await mk({ name: 'Jersey marino', category: 'top', subcategory: 'knit', primary_color: 'Azul marino' })
  const chino = await mk({ name: 'Chino beige', category: 'bottom', subcategory: 'chinos', primary_color: 'Beige', cut: 'Recto' })
  const jeans = await mk({ name: 'Vaquero oscuro', category: 'bottom', subcategory: 'jeans', primary_color: 'Denim' })
  const loafers = await mk({ name: 'Mocasines marrones', category: 'footwear', subcategory: 'loafers', primary_color: 'Marrón' })
  const coat = await mk({ name: 'Abrigo camel', category: 'outerwear', subcategory: 'coat', primary_color: 'Camel' })
  const old = await mk({ name: 'Polo viejo', category: 'top', subcategory: 'polo', primary_color: 'Rojo' })
  await p.request.patch(`${U}/api/wardrobe/items/${old}`, { data: { wardrobe_status: 'archived' } })
  await A.post('/api/wardrobe/items', { status: 'draft', name: 'Borrador gorra', category: 'accessories', subcategory: 'headwear' })
  log('armario de A: 6 prendas activas (una con foto), una archivada y un borrador')

  // ── Crear un conjunto a mano ──
  await go('/outfits')
  let t = await p.locator('main').innerText()
  assert.match(t, /Aún no tienes conjuntos/i); assert.match(t, /Pedírselo al estilista en tus palabras\s*Pendiente/i)
  await p.click('text=Crear conjunto'); await p.waitForURL(/outfits\/nuevo/)
  const picker = await p.locator('.opicker').innerText()
  assert.match(picker, /Camisa oxford blanca/i); assert.doesNotMatch(picker, /Polo viejo/i, 'las archivadas no se ofrecen'); assert.doesNotMatch(picker, /Borrador gorra/i, 'los borradores no se ofrecen')
  assert.match(await p.locator('.pcard:has-text("Camisa oxford blanca") img').getAttribute('src'), /wardrobe-thumbnails\/.*token=/i, 'foto real firmada del armario')
  for (const n of ['Camisa oxford blanca', 'Chino beige', 'Mocasines marrones', 'Vaquero oscuro']) await p.click(`button[aria-label="Añadir ${n}"]`)
  assert.equal(await p.locator('button[aria-label="Añadir Chino beige"]').isDisabled(), true, 'una prenda no se repite')
  assert.match(await p.locator('.oprob').innerText(), /No se puede guardar: Solo cabe una prenda como parte inferior \(hay 2\)/i)
  await p.fill('.obuilder input[placeholder="Elegancia relajada"]', 'Oficina sencilla')
  await p.click('button:has-text("Guardar conjunto")')
  await until(p.locator('.obuilder [role=alert]'), /Solo cabe una prenda como parte inferior/)
  await p.locator('.oitems li:has-text("Vaquero oscuro") button:has-text("Quitar")').click()
  assert.equal(await p.locator('.oitems li:has-text("Camisa oxford blanca") select').inputValue(), 'top_base')
  assert.deepEqual(await p.locator('.oitems li:has-text("Mocasines marrones") select option').allInnerTexts(), ['Calzado'], 'un zapato solo puede ser calzado')
  await p.selectOption('.obuilder select:near(:text("Ocasión"))', 'oficina'); await p.selectOption('.obuilder select:near(:text("Formalidad"))', '3')
  await p.locator('.obuilder .opts label:has-text("Otoño")').click(); await p.fill('.obuilder input[placeholder="verano, viaje"]', 'Trabajo, Básico')
  await noOverflow(); await shot('outfit-builder')
  await p.click('button:has-text("Guardar conjunto")'); await p.waitForURL(/outfits\/[0-9a-f-]{36}\?saved=1/); await p.waitForLoadState('networkidle')
  const o1 = p.url().split('?')[0].split('/').pop()
  t = await p.locator('main').innerText()
  assert.match(t, /Oficina sencilla/i); assert.match(t, /Guardado/i); assert.match(t, /Formalidad 3\/5 · Otoño · #trabajo #básico/i)
  assert.match(t, /Base superior\s*Camisa oxford blanca[\s\S]*Parte inferior\s*Chino beige[\s\S]*Calzado\s*Mocasines marrones/i)
  assert.match(await p.locator('.collage img').first().getAttribute('src'), /wardrobe-originals\/.*token=/i, 'la ficha usa la foto original firmada, sin copiarla')
  await noOverflow(); await shot('outfit-ficha')
  log('conjunto creado a mano: solo prendas activas propias, roles válidos, errores bloquean el guardado, fotos reales firmadas')

  // ── Editar: sustituir, cambiar función, añadir capa y quitar ──
  await p.click('text=Editar o sustituir prendas'); await p.waitForURL(/editar/)
  await p.locator('.oitems li:has-text("Chino beige") button:has-text("Sustituir")').click()
  const rep = await p.locator('.opicker').innerText()
  assert.match(rep, /Sustituir «Chino beige» \(parte inferior\)/i); assert.match(rep, /Vaquero oscuro/i); assert.doesNotMatch(rep, /Camisa oxford blanca|Mocasines/i, 'solo prendas que pueden ocupar esa función')
  await p.click('button[aria-label="Elegir Vaquero oscuro"]')
  assert.equal(await p.locator('.oitems li:nth-child(2)').innerText().then((x) => /Vaquero oscuro/.test(x)), true, 'conserva la posición')
  await p.click('button:has-text("Añadir prenda")'); await p.click('button[aria-label="Añadir Jersey marino"]'); await p.click('.opicker button:has-text("Hecho")')
  assert.equal(await p.locator('.oitems li:has-text("Jersey marino") select').inputValue(), 'mid_layer', 'la base ya está ocupada: va como capa intermedia')
  await p.locator('.oitems li:has-text("Mocasines marrones") button:has-text("Quitar")').click()
  await p.click('button:has-text("Guardar conjunto")'); await p.waitForURL(/saved=1&warn=/); await p.waitForLoadState('networkidle')
  t = await p.locator('main').innerText()
  assert.match(t, /Falta el calzado/i); assert.match(t, /Capa intermedia\s*Jersey marino/i); assert.match(t, /Vaquero oscuro[\s\S]*Sustituye a: Chino beige/i)
  log('editar: sustituir conserva función y posición (y deja constancia), capa intermedia, quitar prenda con aviso')

  // ── Segundo conjunto (borrador) por la API y filtros ──
  const o2 = (await A.post('/api/outfits', { name: 'Cena de otoño', occasion: 'cena_amigos', formality_level: 3, seasons: ['otono', 'invierno'], tags: ['noche'], items: [{ garment_id: knit, role: 'top_base' }, { garment_id: chino, role: 'bottom' }, { garment_id: loafers, role: 'footwear' }, { garment_id: coat, role: 'outer_layer' }] })).id
  await go('/outfits'); assert.equal(await p.locator('.ocard').count(), 2)
  await go('/outfits?occasion=cena_amigos'); assert.equal(await p.locator('.ocard').count(), 1); assert.match(await p.locator('.ogrid').innerText(), /Cena de otoño/i)
  await go('/outfits?tag=noche'); assert.equal(await p.locator('.ocard').count(), 1)
  await go('/outfits?season=invierno'); assert.equal(await p.locator('.ocard').count(), 1)
  await go('/outfits?formality=3'); assert.equal(await p.locator('.ocard').count(), 2)
  await go('/outfits?status=draft'); assert.match(await p.locator('.ogrid').innerText(), /Cena de otoño/i)
  await go('/outfits?q=vaquero'); assert.equal(await p.locator('.ocard').count(), 1, 'busca también por prenda')
  await go('/outfits'); await p.locator('.ocard:has-text("Cena de otoño") .fav button').click(); await until(p.locator('.ocard:has-text("Cena de otoño") .fav button'), /★/)
  await go('/outfits?favorite=1'); assert.equal(await p.locator('.ocard').count(), 1)
  await noOverflow(); await shot('outfits-lista')
  log('filtros por ocasión, etiqueta, temporada, formalidad, estado, búsqueda y favoritos')

  // ── Estados y trazabilidad ──
  await go(`/outfits/${o2}`); await p.click('button:has-text("Guardar (dejar de ser borrador)")'); await p.waitForURL(/status=saved/)
  await p.click('main button:has-text("Archivar")'); await p.waitForURL(/status=archived/)
  await go('/outfits'); assert.equal(await p.locator('.ocard').count(), 1)
  await go('/outfits?status=archived'); assert.match(await p.locator('.ogrid').innerText(), /Cena de otoño/i)
  await go(`/outfits/${o2}`); await p.click('button:has-text("Recuperar")'); await p.waitForURL(/status=saved/)
  await go(`/armario/${chino}`); assert.match(await p.locator('main').innerText(), /Aparece en el conjunto: Cena de otoño \(parte inferior\)/i)
  // prenda archivada y prenda eliminada del armario: el conjunto se conserva
  await p.request.patch(`${U}/api/wardrobe/items/${coat}`, { data: { wardrobe_status: 'archived' } })
  assert.equal((await p.request.delete(`${U}/api/wardrobe/items/${loafers}?mode=permanent`)).status(), 200)
  await go(`/outfits/${o2}`); t = await p.locator('main').innerText()
  assert.match(t, /Abrigo camel[\s\S]*Archivada en tu armario/i); assert.match(t, /Mocasines marrones[\s\S]*Ya no está en tu armario/i)
  assert.match(t, /Alguna prenda ya no está en tu armario/i)
  log('guardar, archivar y recuperar; la prenda muestra sus conjuntos; prenda archivada o eliminada: el conjunto se conserva con su instantánea')

  // ── API: no se inventan prendas ni se añaden no activas ──
  await A.post('/api/outfits', { name: 'X', items: [{ garment_id: '00000000-0000-4000-8000-000000000000', role: 'top_base' }] }, 400)
  await A.post('/api/outfits', { name: 'X', items: [{ garment_id: old, role: 'top_base' }] }, 400)
  await A.post(`/api/outfits/${o1}/items`, { garment_id: coat }, 400)
  const rep2 = await A.post(`/api/outfits/${o1}/replace-item`, { item_id: (await (await p.request.get(`${U}/api/outfits/${o1}`)).json()).items.find((i) => i.role === 'bottom').id, garment_id: chino }, 200)
  assert.equal(rep2.outfit.items.find((i) => i.role === 'bottom').garment_id, chino)
  log('API: prenda inexistente, archivada o no activa rechazadas; replace-item conserva la función')

  // ── Usuario B: aislamiento ──
  const ctxB = await br.newContext(); const b = await ctxB.newPage(); b.setDefaultTimeout(30000)
  const emailB = await signup(b, U); const B = api(b)
  const gB = (await B.post('/api/wardrobe/items', { status: 'active', name: 'Camiseta de B', category: 'top', subcategory: 'tee', primary_color: 'Negro' })).id
  const oB = (await B.post('/api/outfits', { name: 'De B', items: [{ garment_id: gB, role: 'top_base' }] })).id
  assert.equal((await b.request.get(`${U}/api/outfits/${o1}`)).status(), 404, 'B no ve los conjuntos de A')
  assert.equal((await b.request.patch(`${U}/api/outfits/${o1}`, { data: { name: 'hack' } })).status(), 404)
  assert.equal((await b.request.delete(`${U}/api/outfits/${o1}?mode=permanent`)).status(), 404)
  assert.equal((await (await b.request.get(`${U}/api/outfits?status=all`)).json()).length, 1)
  await B.post(`/api/outfits/${oB}/items`, { garment_id: shirt }, 404)
  await B.post('/api/outfits', { name: 'Robo', items: [{ garment_id: shirt, role: 'top_base' }] }, 400)
  await b.goto(`${U}/outfits/${o1}`); assert.match(await b.locator('body').innerText(), /404|no encontrad|could not be found/i)
  await A.post(`/api/outfits/${o1}/items`, { garment_id: gB }, 404)
  log('app: B no puede ver, editar ni borrar conjuntos de A, ni usar prendas de A (y viceversa)')

  // ── RLS directo contra Supabase (sin pasar por la app) ──
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  const { error: le } = await sb.auth.signInWithPassword({ email: emailB, password: 'password123' }); assert.ok(!le, le?.message)
  assert.equal((await sb.from('outfits').select('id').eq('id', o1)).data.length, 0, 'RLS: B no lee outfits de A')
  assert.equal((await sb.from('outfit_items').select('id').eq('outfit_id', o1)).data.length, 0, 'RLS: B no lee prendas de conjuntos de A')
  const e1 = await sb.from('outfit_items').insert({ outfit_id: oB, garment_id: shirt, item_role: 'third_layer', attribute_snapshot: { title: 'x' } })
  assert.ok(e1.error && /row-level security/i.test(e1.error.message), `RLS: prenda ajena en conjunto propio → ${e1.error?.message}`)
  const e2 = await sb.from('outfit_items').insert({ outfit_id: o1, garment_id: gB, item_role: 'third_layer', attribute_snapshot: { title: 'x' } })
  assert.ok(e2.error && /row-level security/i.test(e2.error.message), 'RLS: prenda propia en conjunto ajeno')
  const e3 = await sb.from('outfits').update({ name: 'hack' }).eq('id', o1).select('id'); assert.equal(e3.data?.length ?? 0, 0, 'RLS: no actualiza ajenos')
  const e4 = await sb.from('outfits').insert({ user_id: '00000000-0000-4000-8000-000000000000', name: 'suplantación' })
  assert.ok(e4.error, 'RLS: no crea conjuntos a nombre de otro')
  log('RLS directo: B no lee, no modifica ni mezcla conjuntos o prendas de A')


  // ── Eliminar conjunto: las prendas siguen ──
  await go(`/outfits/${o2}`); await p.click('summary:has-text("Eliminar definitivamente")'); await p.check('input[name=confirm]'); await p.click('button:has-text("Eliminar conjunto")'); await p.waitForURL(/deleted=1/)
  assert.equal((await p.request.get(`${U}/api/wardrobe/items/${knit}`)).status(), 200, 'la prenda sigue en el armario')
  log('eliminar un conjunto no toca las prendas')
  await br.close()
})().catch((e) => { console.error('✘', e); process.exit(1) })
