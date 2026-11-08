// Utilidades compartidas por las pruebas e2e.
const zlib = require('zlib')

/** Espera a que el texto del localizador cumpla la expresion. */
async function until(loc, re, ms = 20000) {
  const t = Date.now(); let txt = ''
  while (Date.now() - t < ms) { txt = await loc.innerText().catch(() => ''); if (re.test(txt)) return txt; await new Promise((r) => setTimeout(r, 200)) }
  throw new Error(`no aparece ${re} en: ${txt.slice(0, 400)}`)
}

/** PNG generado en memoria: fn(x, y) => [r, g, b]. */
function png(w, h, fn) {
  const table = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0 }
  const crc = (b) => { let x = 0xffffffff; for (const v of b) x = table[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; const [r, g, b] = fn(x, y); raw[o] = r; raw[o + 1] = g; raw[o + 2] = b }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
/** Foto "buena": vertical, nitida y bien expuesta (damero). */
const goodPhoto = (w = 750, h = 1000) => png(w, h, (x, y) => { const v = ((x >> 4) + (y >> 4)) % 2 ? 70 : 185; return [v, v, v] })
/** Foto "mala": oscura y horizontal. */
const darkPhoto = () => png(1000, 750, (x, y) => { const v = ((x >> 4) + (y >> 4)) % 2 ? 15 : 45; return [v, v, v] })

/** Foto de rostro sintetica: fondo blanco neutro arriba y piel (damero suave) abajo. k < 1 la oscurece. */
const facePhoto = (k = 1) => png(600, 720, (x, y) => {
  if (y < 180) return [236, 236, 233].map((v) => Math.round(v * k))
  const v = ((x >> 4) + (y >> 4)) % 2 ? 1 : 0.85
  return [205, 160, 135].map((c) => Math.round(c * v * k))
})

async function signup(p, U) {
  const email = `e2e${Date.now()}${Math.floor(Math.random() * 1e4)}@test.local`
  await p.goto(U + '/login'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', 'password123')
  await p.click('text=Crear cuenta'); await p.waitForURL(/login\?info/)
  await p.fill('input[name=email]', email); await p.fill('input[name=password]', 'password123'); await p.click('text=Entrar')
  await p.waitForURL(/profile/)
  return email
}

module.exports = { until, png, goodPhoto, darkPhoto, facePhoto, signup }
