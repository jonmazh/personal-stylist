import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessPhoto } from '@/lib/photos/quality'

/** Imagen sintetica RGBA de 192x256 (vertical). */
function img(fn: (x: number, y: number) => [number, number, number], w = 192, h = 256) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fn(x, y); data.set([r, g, b, 255], (y * w + x) * 4) }
  return { width: w, height: h, data }
}
const checker = (a: number, b: number) => (x: number, y: number): [number, number, number] => { const v = ((x >> 3) + (y >> 3)) % 2 ? a : b; return [v, v, v] }
const body = { vertical: true, colorCritical: false }, face = { vertical: false, colorCritical: true }
const big = { width: 1200, height: 1600 }
const codes = (q: ReturnType<typeof assessPhoto>) => q.issues.map((i) => i.code).sort()

test('una foto nitida, bien expuesta y vertical pasa sin avisos', () => {
  const q = assessPhoto(img(checker(60, 190)), big, body)
  assert.deepEqual(codes(q), []); assert.equal(q.ok, true)
})
test('detecta foto oscura', () => assert.ok(codes(assessPhoto(img(checker(10, 50)), big, body)).includes('dark')))
test('detecta foto sobreexpuesta', () => assert.ok(codes(assessPhoto(img(checker(225, 250)), big, body)).includes('bright')))
test('detecta foto plana (sin contraste)', () => assert.ok(codes(assessPhoto(img(() => [128, 128, 128]), big, body)).includes('flat')))
test('detecta foto desenfocada', () => {
  const q = assessPhoto(img((x) => { const v = 60 + Math.round((130 * x) / 191); return [v, v, v] }), big, body)
  assert.deepEqual(codes(q), ['blurry'])
})
test('exige vertical solo en cuerpo entero', () => {
  assert.ok(codes(assessPhoto(img(checker(60, 190)), { width: 1600, height: 1200 }, body)).includes('orientation'))
  assert.ok(!codes(assessPhoto(img(checker(60, 190)), { width: 1600, height: 1200 }, face)).includes('orientation'))
})
test('detecta resolucion baja', () => assert.ok(codes(assessPhoto(img(checker(60, 190)), { width: 400, height: 520 }, body)).includes('low_res')))
test('la dominante de color solo invalida el rostro (colorimetria)', () => {
  const warm = img((x, y) => (((x >> 3) + (y >> 3)) % 2 ? [200, 120, 90] : [100, 50, 30]))
  assert.ok(codes(assessPhoto(warm, big, face)).includes('cast'))
  assert.ok(!codes(assessPhoto(warm, big, body)).includes('cast'))
})
