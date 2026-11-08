import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TemperatureSchema, type TemperatureAI } from '@/lib/ai/schemas'
import { colorFit, finalizeTemperature, temperatureLabel, temperatureState } from '@/lib/color/temperature'
import { assessPhoto } from '@/lib/photos/quality'
import { buildFindings } from '@/lib/profile/blueprint'
import { describeArea } from '@/lib/profile/summary'
import { sampleBundle } from './helpers'

const AI = (o: Partial<TemperatureAI> = {}): TemperatureAI => ({
  image_quality: { suitable: true, issues: [] }, temperature: 'neutra', secondary_tendency: 'calida', confidence: 'alta',
  observations: ['Matices ligeramente dorados'], explanation: 'Se aprecian matices dorados sin predominancia clara.', limitations: ['La luz influye en el color aparente'], ...o,
})
const OK = { issues: [] }
const ana = (o: Record<string, unknown>) => ({ id: 'a1', created_at: '2026-11-08T10:00:00Z', temperature: 'Neutra', secondary_tendency: 'Cálida', confidence: 'media', image_quality: { suitable: true, issues: [] }, ...o })

// ── Contrato y reglas de la aplicacion ──
test('contrato: el esquema Zod acepta la propuesta y rechaza categorias inventadas', () => {
  assert.ok(TemperatureSchema.safeParse(AI()).success)
  assert.equal(TemperatureSchema.safeParse({ ...AI(), temperature: 'templada' }).success, false)
  assert.equal(TemperatureSchema.safeParse({ ...AI(), confidence: '87%' }).success, false)
  assert.equal(TemperatureSchema.parse({ ...AI(), secondary_tendency: undefined }).secondary_tendency, null)
})

test('foto no apta: no hay conclusion, aunque la IA proponga una', () => {
  const r = finalizeTemperature(AI({ image_quality: { suitable: false, issues: ['Sombras fuertes en la mejilla'] }, temperature: 'calida' }), OK)
  assert.equal(r.suitable, false); assert.equal(r.temperature, null); assert.equal(r.confidence, 'baja'); assert.deepEqual(r.issues, ['Sombras fuertes en la mejilla'])
})

test('indeterminada: «sin informacion suficiente», nunca una categoria forzada', () => {
  const r = finalizeTemperature(AI({ temperature: 'indeterminada', confidence: 'media' }), OK)
  assert.equal(r.temperature, null); assert.equal(r.secondary, null); assert.equal(r.confidence, 'baja')
  assert.equal(temperatureLabel(r.temperature, r.secondary), 'Sin información suficiente')
})

test('tope de confianza segun la calidad real de la captura', () => {
  assert.equal(finalizeTemperature(AI(), OK).confidence, 'alta')                                              // foto limpia
  const noClient = finalizeTemperature(AI(), null); assert.equal(noClient.confidence, 'media'); assert.equal(noClient.capped, true) // sin control previo
  assert.equal(finalizeTemperature(AI(), { issues: [{ code: 'low_res', message: 'x' }] }).confidence, 'media')
  assert.equal(finalizeTemperature(AI({ image_quality: { suitable: true, issues: ['Luz algo cálida'] } }), OK).confidence, 'media')
  for (const code of ['dark', 'bright', 'blurry', 'cast', 'shadow', 'filter']) assert.equal(finalizeTemperature(AI(), { issues: [{ code, message: code }] }).confidence, 'baja', code)
  const low = finalizeTemperature(AI({ confidence: 'baja' }), OK); assert.equal(low.capped, false)
})

test('tendencia secundaria solo si difiere de la principal', () => {
  const r = finalizeTemperature(AI(), OK)
  assert.equal(r.temperature, 'Neutra'); assert.equal(r.secondary, 'Cálida')
  assert.equal(temperatureLabel(r.temperature, r.secondary), 'Neutra con tendencia cálida')
  assert.equal(finalizeTemperature(AI({ temperature: 'calida', secondary_tendency: 'calida' }), OK).secondary, null)
  assert.equal(temperatureLabel('Fría', null), 'Fría')
})

// ── Estado y precedencia ──
test('estado: pendiente, estimado por la IA, declarado y validado', () => {
  assert.equal(temperatureState({}, []).status, 'pendiente')
  const ai = temperatureState({}, [ana({})])
  assert.deepEqual([ai.status, ai.source, ai.fromUser, ai.value, ai.confidence], ['recopilado', 'ia', false, 'Neutra', 'media'])
  const declared = temperatureState({ temperature: 'Cálida', temperature_source: 'usuario', temperature_status: 'recopilado' }, [])
  assert.deepEqual([declared.status, declared.source, declared.fromUser], ['recopilado', 'usuario', true])
  const unsuitable = temperatureState({}, [ana({ temperature: null, image_quality: { suitable: false, issues: ['oscura'] } })])
  assert.equal(unsuitable.status, 'pendiente'); assert.equal(unsuitable.value, null); assert.ok(unsuitable.latest)
})

test('precedencia: la correccion del usuario manda y una estimacion nueva no la sobrescribe', () => {
  const color = { temperature: 'Cálida', temperature_source: 'usuario', temperature_status: 'validado', temperature_analysis_id: 'a1', temperature_validated_at: '2026-11-08T11:00:00Z' }
  const corrected = temperatureState(color, [ana({ id: 'a1', temperature: 'Neutra' })])
  assert.deepEqual([corrected.value, corrected.status, corrected.source, corrected.aiDiffers], ['Cálida', 'validado', 'usuario', false]) // ya revisada
  const newer = temperatureState(color, [ana({ id: 'a1', temperature: 'Neutra' }), ana({ id: 'a2', created_at: '2026-11-09T10:00:00Z', temperature: 'Fría' })])
  assert.equal(newer.value, 'Cálida'); assert.equal(newer.aiDiffers, true); assert.equal(newer.latest!.id, 'a2')
  const confirmed = temperatureState({ ...color, temperature: 'Neutra', temperature_source: 'ia' }, [ana({ id: 'a1' })])
  assert.deepEqual([confirmed.source, confirmed.secondary], ['ia', 'Cálida'])
})

test('colorFit: orienta sin prohibir', () => {
  assert.equal(colorFit('Cálida', 'Camel', { nearFace: true }).verdict, 'favorece')
  assert.equal(colorFit('Cálida', 'Azul marino', { nearFace: true }).verdict, 'funciona')
  assert.equal(colorFit('Cálida', 'Lila', { nearFace: false }).verdict, 'funciona')
  const liked = colorFit('Cálida', 'Lila', { nearFace: true, liked: true })
  assert.equal(liked.verdict, 'con matices'); assert.match(liked.reason, /te gusta: llévalo lejos de la cara/)
  assert.equal(colorFit(null, 'Lila', { nearFace: true }).verdict, 'sin datos')
})

// ── Integracion con el diagnostico y el chat ──
const withColor = (color: Record<string, unknown>, colorAnalyses: Record<string, unknown>[] = [], validated = false) =>
  sampleBundle({ color: { depth: 'Media', intensity: 'Suave', contrast: 'Medio', ...color }, colorAnalyses, validated: { a1: false, a2: false, a3: validated, a4: false, a5: false, a6: false, a7: false } })
const colorFinding = (b: ReturnType<typeof withColor>) => buildFindings(b).find((f) => f.key === 'colorimetria')!

test('diagnostico: solo estimacion de IA → nunca mas que media y pide validarla', () => {
  const f = colorFinding(withColor({}, [ana({ confidence: 'alta' })]))
  assert.equal(f.confidence, 'media'); assert.equal(f.origin, 'IA · foto de rostro (sin confirmar)')
  assert.match(f.body, /^Subtono neutro con tendencia cálido/i)
  assert.match(f.why, /La IA lo estimó con tu foto de rostro \(confianza alta\)/)
  assert.ok(f.missing.includes('Validar tu temperatura cromática'))
  assert.equal(colorFinding(withColor({}, [ana({ confidence: 'media' })])).confidence, 'baja')
})

test('diagnostico: validada por el usuario → confianza alta y manda sobre la IA', () => {
  const confirmed = colorFinding(withColor({ temperature: 'Neutra', temperature_source: 'ia', temperature_status: 'validado', temperature_analysis_id: 'a1' }, [ana({})]))
  assert.equal(confirmed.confidence, 'alta'); assert.equal(confirmed.origin, 'Validado por ti · estimado por la IA')
  const corrected = buildFindings(withColor({ temperature: 'Cálida', temperature_source: 'usuario', temperature_status: 'validado', temperature_analysis_id: 'a1' },
    [ana({ id: 'a1' }), ana({ id: 'a2', created_at: '2026-11-09T10:00:00Z', temperature: 'Fría', secondary_tendency: null })]))
  const c = corrected.find((f) => f.key === 'colorimetria')!
  assert.match(c.body, /^Subtono cálido/); assert.match(c.why, /corrigiendo la estimación de la IA/); assert.match(c.why, /La última estimación de la IA \(fría\) es distinta: manda tu dato/)
  const pal = corrected.find((f) => f.key === 'paleta')!
  assert.ok((pal.details as { groups: { cara: string[] } }).groups.cara.includes('Camel')) // paleta calida, no la de la IA
  assert.match(pal.action, /La temperatura orienta, no prohíbe/)
})

test('diagnostico: la temperatura no cambia intensidad, profundidad ni contraste', () => {
  const f = colorFinding(withColor({ temperature: 'Fría', temperature_status: 'validado', temperature_source: 'usuario' }))
  assert.match(f.body, /Subtono frío, contraste medio, profundidad media, intensidad suave\./)
})

test('chat: distingue temperatura validada de estimacion sin confirmar', () => {
  assert.match(describeArea('a3', withColor({}, [ana({})]))[0], /ESTIMADA POR LA IA \(sin confirmar\): Neutra con tendencia cálida, confianza media/)
  assert.match(describeArea('a3', withColor({ temperature: 'Cálida', temperature_status: 'validado', temperature_source: 'usuario' }))[0], /Temperatura cromática: Cálida \(validada por el usuario\)/)
})

// ── Control de calidad facial ──
function img(fn: (x: number, y: number) => [number, number, number], w = 200, h = 240) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...fn(x, y), 255], (y * w + x) * 4)
  return { width: w, height: h, data }
}
const skin = (k = 1) => (x: number, y: number): [number, number, number] => { const v = ((x >> 3) + (y >> 3)) % 2 ? 1 : 0.8; return [Math.round(205 * v * k), Math.round(160 * v * k), Math.round(135 * v * k)] }
const face = { vertical: false, colorCritical: true, face: true }
const codes = (q: ReturnType<typeof assessPhoto>) => q.issues.map((i) => i.code)

test('calidad facial: detecta sombras fuertes en un lado y filtros', () => {
  assert.deepEqual(codes(assessPhoto(img(skin()), { width: 1200, height: 1440 }, face)), [])
  assert.ok(codes(assessPhoto(img((x, y) => skin(x < 100 ? 0.35 : 1)(x, y)), { width: 1200, height: 1440 }, face)).includes('shadow'))
  assert.ok(codes(assessPhoto(img((x, y) => (((x >> 3) + (y >> 3)) % 2 ? [250, 40, 20] : [200, 20, 10])), { width: 1200, height: 1440 }, face)).includes('filter'))
  assert.ok(codes(assessPhoto(img((x, y) => { const v = ((x >> 3) + (y >> 3)) % 2 ? 170 : 120; return [v, v, v] }), { width: 1200, height: 1440 }, face)).includes('filter'))
})
