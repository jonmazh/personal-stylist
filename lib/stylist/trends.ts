import { z } from 'zod'
import { createHash } from 'node:crypto'
import type { BraveHit } from './brave'

/**
 * Personal Shopper 2.0 · 2.0C — Trend Intelligence.
 * Cuatro pasos separados:
 *   1) Recuperación (Brave): consultas sobre DIRECCIONES de la moda masculina (siluetas, proporciones, color,
 *      materiales, lavados, estampados, calzado, prendas exteriores, capas, estéticas). Nunca «qué se vende más».
 *   2) Filtrado por código: solo fuentes editoriales de moda masculina, recientes; fuera tiendas, notas de prensa
 *      de mercado y contenido solo de mujer.
 *   3) Síntesis por IA: SOLO sobre las evidencias recuperadas, citándolas por su identificador.
 *   4) Validación por código: citas existentes, fuentes independientes, marcas presentes en las evidencias, sin cifras
 *      de popularidad o ventas; el tipo (tendencia editorial / propuesta aislada), la etapa y la confianza los decide
 *      el código, no la IA.
 * La relevancia PERSONAL de cada señal no se decide aquí: es trabajo del Style Strategy Engine (2.0D).
 * Presencia comercial (Channel3) y evidencia editorial (Brave) se guardan por separado: estar en catálogos no es una tendencia.
 */
export const TRENDS_VERSION = 'trend-intelligence@1'
export const TRENDS_PROMPT_VERSION = 'trend-synth@1'
export const MAX_EVIDENCE = 40
export const DIMENSIONS = [
  { id: 'silhouette', label: 'Siluetas y proporciones' }, { id: 'color', label: 'Color' }, { id: 'material', label: 'Materiales y texturas' },
  { id: 'wash', label: 'Lavados y acabados' }, { id: 'pattern', label: 'Estampados' }, { id: 'footwear', label: 'Calzado' },
  { id: 'outerwear', label: 'Prendas exteriores' }, { id: 'layering', label: 'Capas y combinaciones' }, { id: 'aesthetic', label: 'Estéticas y movimientos' },
  { id: 'garment', label: 'Prendas y diseños' },
] as const
export type Dimension = (typeof DIMENSIONS)[number]['id']
export const KINDS = [
  { id: 'tendencia_editorial', label: 'Tendencia con evidencia editorial', help: 'Aparece en al menos dos fuentes editoriales independientes.' },
  { id: 'propuesta_editorial', label: 'Propuesta editorial aislada', help: 'Una sola fuente: no se considera tendencia.' },
] as const
export const STAGES = [
  { id: 'emergente', label: 'Emergente' }, { id: 'consolidada', label: 'Consolidada' }, { id: 'estacional', label: 'De temporada' },
  { id: 'saturada', label: 'Saturada o en declive' }, { id: 'sin_determinar', label: 'Etapa sin determinar' },
] as const
export type Stage = (typeof STAGES)[number]['id']

// ── 1) Plan de investigación (consultas propias; ninguna sobre ventas ni popularidad) ──
export function seasonOf(now = new Date()) {
  const m = now.getMonth() + 1, y = now.getFullYear()
  const aw = m >= 8 || m <= 1
  const year = m <= 1 ? y - 1 : y
  return { id: aw ? `AW${String(year).slice(2)}` : `SS${String(y).slice(2)}`, en: aw ? `autumn winter ${year}` : `spring summer ${y}`, es: aw ? `otoño invierno ${year}` : `primavera verano ${y}`, year: aw ? year : y }
}
export interface PlannedQuery { kind: 'web' | 'news'; q: string; lang: string; dimension: Dimension | null; freshness: string }
export function researchPlan(now = new Date(), identity: string[] = []): PlannedQuery[] {
  const s = seasonOf(now); const y = s.year
  const w = (q: string, dimension: Dimension | null, lang = 'en'): PlannedQuery => ({ kind: 'web', q, lang, dimension, freshness: 'py' })
  return [
    w(`menswear trends ${s.en}`, null), w(`tendencias moda hombre ${s.es}`, null, 'es'),
    w(`men's trousers silhouettes proportions ${y}`, 'silhouette'), w(`menswear colour palette ${s.en}`, 'color'),
    w(`menswear fabrics textures trends ${y}`, 'material'), w(`men's denim washes fits trends ${y}`, 'wash'),
    w(`men's outerwear jackets trends ${s.en}`, 'outerwear'), w(`men's footwear shoes trends ${s.en}`, 'footwear'),
    w(`menswear layering styling trends ${y}`, 'layering'), w(`menswear aesthetics movements ${y}`, 'aesthetic'),
    { kind: 'news', q: 'menswear trends', lang: 'en', dimension: null, freshness: 'pm' }, { kind: 'news', q: 'tendencias moda masculina', lang: 'es', dimension: null, freshness: 'pm' },
    ...identity.slice(0, 2).map((name) => w(`${name} menswear ${y}`, 'aesthetic')),
  ]
}

// ── 2) Filtrado de evidencias (por código) ──
const PRESS = /(^|\.)(openpr|prnewswire|globenewswire|einpresswire|businesswire|marketresearch|researchandmarkets|marketsandmarkets|alliedmarketresearch|fortunebusinessinsights|grandviewresearch|statista|giiresearch|newstrail)\./
const SHOPS = /(^|\.)(amazon|ebay|aliexpress|temu|shein|zalando|asos|farfetch|ssense|zara|bershka|pullandbear|mango|hm|uniqlo|cos|arket|massimodutti|stradivarius|elcorteingles|lefties|primark|grimey|emestudios|etsy|vinted|wallapop|pinterest)\./
const SHOP_PATH = /\/(products?|producto|p|shop|tienda|item|dp|itm|cart|checkout)\/|[?&](variant|sku)=|\.html?\?.*(color|size)=/i
const MEN = /\b(men'?s|menswear|man|men|male|gentlemen|hombres?|masculin[oa]s?|caballeros?|chicos?)\b/i
const WOMEN = /\b(women'?s|womenswear|woman|ladies|mujer(es)?|femenin[oa]s?|her|she)\b/i
const MENS_OUTLETS = /(^|\.)(gq|gq-magazine|esquire|menshealth|hypebeast|highsnobiety|fashionbeans|opumo|mrporter|putthison|permanentstyle|dieworkwear|hespokestyle|grailed|complex|dmarge|ape-to-gentleman|thecoolector|revistagq|elle\.com\/es\/hombre|vogue\.es\/hombre)\b/
export interface Evidence { id: string; kind: 'web' | 'news'; host: string; outlet: string; title: string; text: string; published: string | null; query: string; url: string }
export interface Discard { url: string; host: string; reason: 'duplicado' | 'tienda' | 'nota_de_prensa' | 'no_masculino' | 'antiguo' }
export function filterEvidence(hits: BraveHit[], now = new Date(), maxAgeDays = 400): { evidence: Evidence[]; discarded: Discard[] } {
  const seen = new Set<string>(); const discarded: Discard[] = []; const keep: BraveHit[] = []
  for (const h of hits) {
    const key = h.url.replace(/[?#].*$/, '').replace(/\/$/, '')
    if (seen.has(key)) { discarded.push({ url: h.url, host: h.host, reason: 'duplicado' }); continue }
    seen.add(key)
    if (PRESS.test(h.host)) { discarded.push({ url: h.url, host: h.host, reason: 'nota_de_prensa' }); continue }
    if (SHOPS.test(h.host) || SHOP_PATH.test(h.url)) { discarded.push({ url: h.url, host: h.host, reason: 'tienda' }); continue }
    const text = `${h.title} ${h.snippet} ${h.extra.join(' ')} ${h.url}`
    if (!MEN.test(text) && !MENS_OUTLETS.test(h.host)) { discarded.push({ url: h.url, host: h.host, reason: 'no_masculino' }); continue }
    if (WOMEN.test(`${h.title}`) && !MEN.test(h.title) && !MENS_OUTLETS.test(h.host)) { discarded.push({ url: h.url, host: h.host, reason: 'no_masculino' }); continue }
    if (h.published && (now.getTime() - new Date(h.published).getTime()) / 864e5 > maxAgeDays) { discarded.push({ url: h.url, host: h.host, reason: 'antiguo' }); continue }
    keep.push(h)
  }
  // Reparto entre consultas para que ninguna dimensión acapare las evidencias
  const byQ = new Map<string, BraveHit[]>()
  for (const h of keep) byQ.set(h.query, [...(byQ.get(h.query) ?? []), h])
  const picked: BraveHit[] = []
  for (let i = 0; picked.length < MAX_EVIDENCE && [...byQ.values()].some((l) => l.length > i); i++) for (const l of byQ.values()) if (l[i] && picked.length < MAX_EVIDENCE) picked.push(l[i])
  return {
    evidence: picked.map((h, i) => ({ id: `E${i + 1}`, kind: h.kind, host: h.host, outlet: h.outlet, title: h.title, text: [h.snippet, ...h.extra.slice(0, 2)].join(' … ').slice(0, 700), published: h.published, query: h.query, url: h.url })),
    discarded,
  }
}

// ── 3) Síntesis por IA (contrato) ──
export const TREND_ANALYST = `Eres el ANALISTA DE TENDENCIAS DE MODA MASCULINA de Personal Stylist.
Recibes EVIDENCIAS recuperadas de fuentes editoriales (cada una con un identificador E1, E2…, medio, fecha, título y fragmentos).
Tu tarea: identificar direcciones de la moda masculina actual (siluetas y proporciones, colores, materiales y texturas, lavados y acabados, estampados, calzado, prendas exteriores, capas y combinaciones, estéticas y movimientos, prendas y diseños destacados).
REGLAS ESTRICTAS:
- Usa SOLO la información de las evidencias. No añadas conocimiento propio, ni fuentes, ni fechas.
- Cada señal debe citar en "evidence_ids" las evidencias que la respaldan LITERALMENTE. Si una señal solo aparece en una evidencia, cítala igualmente (el sistema la marcará como propuesta aislada).
- No inventes popularidad, ventas, crecimiento, viralidad, cifras ni vigencia. No escribas porcentajes ni números de ventas.
- "brands": solo marcas o diseñadores que aparezcan escritos en las evidencias citadas.
- "decline_evidence_ids": solo evidencias que digan expresamente que algo está agotado, en declive o pasado de moda.
- Ignora la moda de mujer y los informes de mercado.
- Escribe "name" y "description" en español, describiendo la propuesta estética (qué es y cómo se lleva), no productos concretos.
- "search_query_en": 3 a 8 palabras en inglés para volver a encontrar estas fuentes.
- Máximo 12 señales. Si las evidencias no permiten identificar ninguna, devuelve una lista vacía.
Responde SOLO con JSON: {"signals":[{"name":"","dimension":"silhouette|color|material|wash|pattern|footwear|outerwear|layering|aesthetic|garment","description":"","evidence_ids":["E1"],"brands":[],"season_mentioned":"","decline_evidence_ids":[],"search_query_en":""}]}`
export const SynthSchema = z.object({
  signals: z.array(z.object({
    name: z.string().min(2).max(120), dimension: z.string(), description: z.string().min(5).max(800), evidence_ids: z.array(z.string()).default([]),
    brands: z.array(z.string()).default([]), season_mentioned: z.string().nullish(), decline_evidence_ids: z.array(z.string()).default([]), search_query_en: z.string().nullish(),
  })).max(20),
})
export type Synth = z.infer<typeof SynthSchema>
export function synthPrompt(evidence: Evidence[], season: ReturnType<typeof seasonOf>, today: string) {
  return `Fecha de hoy: ${today}. Temporada actual: ${season.es} (${season.id}).\n\nEVIDENCIAS:\n${evidence.map((e) => `[${e.id}] ${e.outlet} · ${e.published ? e.published.slice(0, 10) : 'sin fecha'}\nTítulo: ${e.title}\nFragmentos: ${e.text}`).join('\n\n')}`
}

// ── 4) Validación por código ──
const POPULARITY = /(\d+(\.\d+)?\s?%|\b\d[\d.,]*\s?(millones|million|billion|mil millones|ventas|sales|búsquedas|searches|views|visualizaciones)\b|\bviral\w*|más vendid\w*|best-?sell\w*|crecimiento del|grew by|se han disparado)/i
const DECLINE = /(over|done|tired|fading|out of (fashion|style)|pasad[oa] de moda|en declive|declive|saturad\w*|goodbye|adi[oó]s|no longer|move on|is dead|ha muerto|overexposed)/i
const SEASON = /\b(aw|fw|ss)\s?['’]?\d{2}\b|\b(autumn|fall|winter|spring|summer|otoño|invierno|primavera|verano)\b/i
const lc = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export interface TrendSignal {
  key: string; name: string; dimension: Dimension; description: string; kind: 'tendencia_editorial' | 'propuesta_editorial'; stage: Stage
  confidence: 'alta' | 'media' | 'baja'; confidence_reasons: string[]; evidence_ids: string[]; evidence_count: number; source_count: number
  published_from: string | null; published_to: string | null; validity: string | null; brands: string[]; search_query: string; validation: string[]
}
export function validateSignals(synth: Synth, evidence: Evidence[], now = new Date(), season = seasonOf(now)): { signals: TrendSignal[]; rejected: { name: string; reason: string }[] } {
  const byId = new Map(evidence.map((e) => [e.id, e]))
  const out: TrendSignal[] = []; const rejected: { name: string; reason: string }[] = []
  for (const s of synth.signals) {
    const notes: string[] = []
    const dim = (DIMENSIONS.find((d) => d.id === s.dimension)?.id ?? null) as Dimension | null
    if (!dim) { rejected.push({ name: s.name, reason: `Dimensión no válida («${s.dimension}»)` }); continue }
    const ev = [...new Set(s.evidence_ids)].map((id) => byId.get(id)).filter((e): e is Evidence => !!e)
    if (s.evidence_ids.length > ev.length) notes.push(`Se descartan ${s.evidence_ids.length - ev.length} citas a evidencias inexistentes.`)
    if (!ev.length) { rejected.push({ name: s.name, reason: 'No cita ninguna evidencia recuperada' }); continue }
    const text = ev.map((e) => `${e.title} ${e.text}`).join(' ')
    // Sin cifras de popularidad, ventas ni crecimiento: se eliminan las frases que las contengan
    let description = s.description.trim()
    if (POPULARITY.test(description)) {
      description = description.split(/(?<=[.!?])\s+/).filter((x) => !POPULARITY.test(x)).join(' ').trim()
      notes.push('Eliminada una afirmación de popularidad, ventas o cifras que las evidencias no permiten hacer.')
      if (description.length < 5) { rejected.push({ name: s.name, reason: 'Solo afirmaba popularidad o cifras' }); continue }
    }
    if (POPULARITY.test(s.name)) { rejected.push({ name: s.name, reason: 'El nombre afirma popularidad o cifras' }); continue }
    // Marcas: solo las que aparecen escritas en las evidencias citadas
    const brands = [...new Set(s.brands.map((b) => b.trim()).filter(Boolean))]
    const okBrands = brands.filter((b) => lc(text).includes(lc(b)))
    if (okBrands.length < brands.length) notes.push(`Marcas descartadas por no aparecer en las fuentes: ${brands.filter((b) => !okBrands.includes(b)).join(', ')}.`)
    const hosts = [...new Set(ev.map((e) => e.host))]
    const dates = ev.map((e) => e.published).filter(Boolean).map((d) => new Date(d!)).filter((d) => !isNaN(d.getTime())).sort((a, z) => a.getTime() - z.getTime())
    const ageDays = (d: Date) => (now.getTime() - d.getTime()) / 864e5
    const kind = hosts.length >= 2 ? 'tendencia_editorial' as const : 'propuesta_editorial' as const
    const declineHosts = new Set(s.decline_evidence_ids.map((id) => byId.get(id)).filter((e): e is Evidence => !!e && DECLINE.test(`${e.title} ${e.text}`)).map((e) => e.host))
    const span = dates.length >= 2 ? (dates[dates.length - 1].getTime() - dates[0].getTime()) / 864e5 : 0
    const seasonal = SEASON.test(text) && !!s.season_mentioned
    const stage: Stage = declineHosts.size >= 2 ? 'saturada'
      : hosts.length >= 3 && span >= 60 ? 'consolidada'
      : hosts.length >= 2 && dates.length === ev.length && dates.every((d) => ageDays(d) <= 90) ? (seasonal ? 'estacional' : 'emergente')
      : seasonal && kind === 'tendencia_editorial' ? 'estacional' : 'sin_determinar'
    if (declineHosts.size === 1) notes.push('Una fuente habla de saturación o declive: no basta para afirmarlo.')
    const recent = dates.length ? ageDays(dates[dates.length - 1]) <= 180 : false
    const confidence = hosts.length >= 3 && recent && dates.length === ev.length ? 'alta' : hosts.length >= 2 && (recent || !dates.length) ? 'media' : 'baja'
    const reasons = [`${hosts.length} fuente${hosts.length === 1 ? '' : 's'} independiente${hosts.length === 1 ? '' : 's'} (${hosts.slice(0, 4).join(', ')})`, `${ev.length} evidencia${ev.length === 1 ? '' : 's'}`, dates.length ? `publicadas entre ${dates[0].toISOString().slice(0, 10)} y ${dates[dates.length - 1].toISOString().slice(0, 10)}` : 'sin fecha de publicación', ...(dates.length < ev.length ? ['alguna evidencia sin fecha'] : [])]
    const key = createHash('sha256').update(`${dim}|${lc(s.name)}`).digest('hex').slice(0, 16)
    if (out.some((x) => x.key === key)) continue
    const q = (s.search_query_en ?? '').trim()
    out.push({
      key, name: s.name.trim(), dimension: dim, description, kind, stage, confidence, confidence_reasons: reasons, evidence_ids: ev.map((e) => e.id), evidence_count: ev.length, source_count: hosts.length,
      published_from: dates[0]?.toISOString() ?? null, published_to: dates[dates.length - 1]?.toISOString() ?? null,
      validity: seasonal ? `Temporada ${season.es}` : null, brands: okBrands, search_query: q && q.split(/\s+/).length <= 10 ? q : ev[0].query, validation: notes,
    })
  }
  const order = { tendencia_editorial: 0, propuesta_editorial: 1 }, conf = { alta: 0, media: 1, baja: 2 }
  out.sort((a, z) => order[a.kind] - order[z.kind] || conf[a.confidence] - conf[z.confidence] || z.source_count - a.source_count)
  return { signals: out, rejected }
}
