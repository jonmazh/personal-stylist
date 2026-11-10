import { test } from 'node:test'
import assert from 'node:assert/strict'
import { braveConfig, BraveError, BraveMeter, braveSearch, type BraveHit } from '@/lib/stylist/brave'
import { filterEvidence, researchPlan, seasonOf, SynthSchema, synthPrompt, TREND_ANALYST, validateSignals } from '@/lib/stylist/trends'

/** Datos SINTÉTICOS: por las condiciones de Brave no se guardan resultados reales, ni siquiera como datos de prueba. */
const NOW = new Date('2026-11-10T12:00:00Z')
const ago = (d: number) => new Date(NOW.getTime() - d * 864e5).toISOString()
const H = (host: string, path: string, title: string, snippet: string, days: number | null, x: Partial<BraveHit> = {}): BraveHit => ({ kind: 'web', title, url: `https://${host}/${path}`, host, outlet: host, snippet, extra: [], published: days == null ? null : ago(days), query: 'q1', ...x })

test('plan de investigación: direcciones estéticas por dimensión, nunca ventas ni popularidad', () => {
  const plan = researchPlan(NOW, ['Clean streetwear'])
  assert.ok(plan.length >= 12 && plan.length <= 14)
  assert.ok(plan.every((q) => !/best.?sell|más vendid|sales|ventas|popular|viral/i.test(q.q)))
  for (const dim of ['silhouette', 'color', 'material', 'wash', 'outerwear', 'footwear', 'layering', 'aesthetic']) assert.ok(plan.some((q) => q.dimension === dim), dim)
  assert.ok(plan.some((q) => /tendencias moda hombre otoño invierno 2026/.test(q.q) && q.lang === 'es'))
  assert.ok(plan.some((q) => q.q === 'Clean streetwear menswear 2026'))
  assert.equal(seasonOf(NOW).id, 'AW26'); assert.equal(seasonOf(new Date('2026-04-01')).id, 'SS26'); assert.equal(seasonOf(new Date('2027-01-10')).id, 'AW26')
})

test('filtrado por código: fuera tiendas, notas de prensa, contenido solo de mujer, antiguos y duplicados', () => {
  const hits = [
    H('menswear-weekly.example', 'a', "Men's trousers go wide", 'Wide trousers for men.', 10),
    H('menswear-weekly.example', 'a?utm=1', "Men's trousers go wide", 'Duplicado.', 10),
    H('shop.example', 'products/x', "Men's wide trousers", 'Buy now.', 2),
    H('www.zara.com', 'es/pantalon.html', 'Pantalón amplio hombre', 'Comprar.', 2),
    H('openpr.com', 'news/1', 'Menswear market to reach USD 800 billion', 'Market report.', 2),
    H('women-style.example', 'b', 'Tights for her this winter', 'Women love tights.', 3),
    H('old.example', 'c', "Men's style in 2023", 'Old men fashion.', 900),
    H('gq.com', 'd', 'The pants you should be wearing', 'Relaxed pleated trousers.', 20),
  ]
  const { evidence, discarded } = filterEvidence(hits, NOW)
  assert.deepEqual(evidence.map((e) => e.host), ['menswear-weekly.example', 'gq.com'])
  assert.deepEqual(evidence.map((e) => e.id), ['E1', 'E2'])
  const reasons = Object.fromEntries(discarded.map((d) => [d.host, d.reason]))
  assert.equal(reasons['shop.example'], 'tienda'); assert.equal(reasons['www.zara.com'], 'tienda'); assert.equal(reasons['openpr.com'], 'nota_de_prensa')
  assert.equal(reasons['women-style.example'], 'no_masculino'); assert.equal(reasons['old.example'], 'antiguo'); assert.equal(reasons['menswear-weekly.example'], 'duplicado')
  // Reparto entre consultas: ninguna acapara las evidencias
  const many = [...Array.from({ length: 30 }, (_, i) => H(`a${i}.example`, `${i}`, "men's x", 'men', 5, { query: 'A' })), ...Array.from({ length: 30 }, (_, i) => H(`b${i}.example`, `${i}`, "men's y", 'men', 5, { query: 'B' }))]
  const ev = filterEvidence(many, NOW).evidence
  assert.equal(ev.length, 40); assert.equal(ev.filter((e) => e.query === 'A').length, 20)
})

const EVID = filterEvidence([
  H('menswear-weekly.example', 'a', "The men's trouser shift: wide and relaxed", 'Wide-leg trousers replace slim fits this autumn winter. Auralee shows loose trousers.', 12),
  H('style-journal.example', 'b', 'Menswear silhouettes for autumn', 'Baggy and wide trousers for men are the key proportion.', 30),
  H('gents-review.example', 'c', "Men's suede jackets are back", 'Suede jackets for men add texture.', 20),
  H('fourth.example', 'd', "Men's wide trousers are everywhere", 'Wide trousers for men have been around all year; some say the baggy look is over and tired.', 200),
  H('fifth.example', 'e', "Men are over baggy trousers", 'The baggy trouser is over, say stylists, and slim is back for men.', 15),
], NOW).evidence

test('validación: citas reales, fuentes independientes, marcas presentes y sin cifras de popularidad', () => {
  const synth = SynthSchema.parse({ signals: [
    { name: 'Pantalón amplio con caída', dimension: 'silhouette', description: 'Pantalones amplios con caída fluida. Las ventas crecieron un 40 % este año.', evidence_ids: ['E1', 'E2', 'E99'], brands: ['Auralee', 'Gucci'], season_mentioned: 'autumn winter', search_query_en: "men's wide leg trousers" },
    { name: 'Ante en chaquetas', dimension: 'material', description: 'Chaquetas de ante como textura.', evidence_ids: ['E3'], brands: [] },
    { name: 'Sin fuentes', dimension: 'garment', description: 'No cita evidencias reales.', evidence_ids: ['E77'] },
    { name: 'Inventada', dimension: 'perfume', description: 'Dimensión fuera de la lista.', evidence_ids: ['E1'] },
    { name: 'Viral en TikTok con 2 millones de vistas', dimension: 'garment', description: 'x x x x x', evidence_ids: ['E1'] },
  ] })
  const { signals, rejected } = validateSignals(synth, EVID, NOW)
  const wide = signals.find((s) => s.name === 'Pantalón amplio con caída')!
  assert.equal(wide.kind, 'tendencia_editorial'); assert.equal(wide.source_count, 2); assert.deepEqual(wide.evidence_ids, ['E1', 'E2'])
  assert.deepEqual(wide.brands, ['Auralee'], 'Gucci no aparece en las fuentes'); assert.doesNotMatch(wide.description, /40 %|ventas/)
  assert.ok(wide.validation.some((v) => /inexistentes/.test(v)) && wide.validation.some((v) => /popularidad/.test(v)) && wide.validation.some((v) => /Gucci/.test(v)))
  assert.equal(wide.stage, 'estacional'); assert.equal(wide.validity, 'Temporada otoño invierno 2026'); assert.equal(wide.confidence, 'media')
  const suede = signals.find((s) => s.name === 'Ante en chaquetas')!
  assert.equal(suede.kind, 'propuesta_editorial', 'una sola fuente no es tendencia'); assert.equal(suede.confidence, 'baja')
  assert.deepEqual(rejected.map((r) => r.name).sort(), ['Inventada', 'Sin fuentes', 'Viral en TikTok con 2 millones de vistas'])
  assert.equal(signals[0].kind, 'tendencia_editorial', 'las tendencias van antes que las propuestas aisladas')
})

test('etapas solo con evidencias: consolidada exige 3 fuentes en el tiempo; saturada exige 2 fuentes que lo digan', () => {
  const base = { name: 'Pantalón amplio', dimension: 'silhouette', description: 'Pantalón amplio.', brands: [] }
  const cons = validateSignals(SynthSchema.parse({ signals: [{ ...base, evidence_ids: ['E1', 'E2', 'E4'] }] }), EVID, NOW).signals[0]
  assert.equal(cons.stage, 'consolidada'); assert.equal(cons.source_count, 3)
  const oneDecline = validateSignals(SynthSchema.parse({ signals: [{ ...base, evidence_ids: ['E1', 'E2', 'E5'], decline_evidence_ids: ['E5'] }] }), EVID, NOW).signals[0]
  assert.notEqual(oneDecline.stage, 'saturada'); assert.ok(oneDecline.validation.some((v) => /no basta/.test(v)))
  const sat = validateSignals(SynthSchema.parse({ signals: [{ ...base, evidence_ids: ['E1', 'E4', 'E5'], decline_evidence_ids: ['E4', 'E5'] }] }), EVID, NOW).signals[0]
  assert.equal(sat.stage, 'saturada')
  // Una «declaración de declive» que el texto citado no respalda no cuenta
  const fake = validateSignals(SynthSchema.parse({ signals: [{ ...base, evidence_ids: ['E1', 'E2'], decline_evidence_ids: ['E1', 'E2'] }] }), EVID, NOW).signals[0]
  assert.notEqual(fake.stage, 'saturada')
})

test('prompt: la IA solo trabaja sobre evidencias identificadas y no puede inventar popularidad', () => {
  assert.match(TREND_ANALYST, /Usa SOLO la información de las evidencias/); assert.match(TREND_ANALYST, /No inventes popularidad, ventas, crecimiento/)
  const p = synthPrompt(EVID, seasonOf(NOW), '2026-11-10')
  assert.match(p, /\[E1\] menswear-weekly\.example/); assert.doesNotMatch(p, /https?:\/\//, 'no se envían URL a la IA')
})

test('cliente de Brave: clave en cabecera, validación de respuesta, 401, 429 con reintento y URL base restringida', async () => {
  const cfg = { ...braveConfig({} as NodeJS.ProcessEnv), key: 'k-test' }
  assert.equal(braveConfig({} as NodeJS.ProcessEnv).key, null)
  assert.equal(braveConfig({ SHOPPING_SEARCH_PROVIDER: 'brave', SHOPPING_SEARCH_KEY: 'x' } as unknown as NodeJS.ProcessEnv).key, 'x', 'reutiliza la clave del buscador de productos')
  await assert.rejects(braveSearch({ ...cfg, key: null }, 'web', 'q'), (e: BraveError) => e.code === 'unconfigured')
  const calls: { url: URL; headers: Record<string, string> }[] = []
  let n = 0
  const f = (async (u: URL, init: RequestInit) => {
    calls.push({ url: new URL(String(u)), headers: init.headers as Record<string, string> })
    if (n++ === 0) return new Response('', { status: 429, headers: { 'retry-after': '1' } })
    return new Response(JSON.stringify({ web: { results: [{ title: "Men's <strong>wide</strong> trousers", url: 'https://www.example.com/a', description: 'x &amp; y', page_age: '2026-11-01T00:00:00', extra_snippets: ['e1'] }, { bad: true }] } }), { headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  const meter = new BraveMeter()
  const hits = await braveSearch(cfg, 'web', 'menswear trends', { freshness: 'py', count: 50 }, { fetch: f, meter, sleep: async () => {} })
  assert.deepEqual(hits.map((h) => [h.title, h.host, h.snippet]), [["Men's wide trousers", 'example.com', 'x & y']])
  assert.equal(calls[0].headers['X-Subscription-Token'], 'k-test'); assert.equal(calls[0].url.searchParams.get('count'), '20'); assert.equal(calls[0].url.searchParams.get('freshness'), 'py')
  assert.equal(meter.requests, 2); assert.equal(meter.errors, 1)
  await assert.rejects(braveSearch(cfg, 'web', 'q', {}, { fetch: (async () => new Response('', { status: 401 })) as unknown as typeof fetch }), (e: BraveError) => e.code === 'auth' && !e.message.includes('k-test'))
  await assert.rejects(braveSearch({ ...cfg, baseUrl: 'https://evil.example' }, 'web', 'q', {}, { fetch: f }), (e: BraveError) => e.code === 'unconfigured')
  assert.equal(braveConfig({} as NodeJS.ProcessEnv).storageRights, false, 'sin derechos de almacenamiento por defecto')
})
