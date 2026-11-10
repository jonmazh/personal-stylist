import { createHash } from 'node:crypto'
import { WardrobeError, type Sb } from '@/lib/wardrobe/service'
import { loadBundle } from '@/lib/profile/data'
import { styleProfileOf } from '@/lib/style/dna'
import { styleName } from '@/lib/style/catalog'
import { configError, MODEL_CHAT } from '@/lib/ai/client'
import { generateStructured, newUsage } from '@/lib/ai/structured'
import { c3request, channel3Config, Channel3Meter } from '@/lib/shopping/catalog/channel3'
import { braveConfig, BraveMeter, braveSearch, type BraveHit } from './brave'
import { filterEvidence, researchPlan, seasonOf, SynthSchema, synthPrompt, TREND_ANALYST, TRENDS_VERSION, validateSignals, type Evidence, type TrendSignal } from './trends'

/**
 * Investigación de tendencias (2.0C). Dos niveles:
 *  - Brave + Channel3: evidencia editorial (Brave) sintetizada por IA y validada por código, más presencia comercial
 *    en España (Channel3) como dato aparte.
 *  - Solo Channel3: sin investigación editorial; solo presencia comercial de las hipótesis del armario. No se llama
 *    «tendencia» a nada que solo aparezca en catálogos.
 * Semanal: se reutiliza la última investigación de los últimos 7 días (misma temporada e identidad) salvo que la pidas.
 * Presupuesto de Channel3: como mucho TREND_C3_MAX créditos por investigación (de los ~25 de una estrategia completa).
 */
export const TREND_TTL_DAYS = 7
export const TREND_C3_MAX = 6
type Row = Record<string, any>
const dbErr = (m: string) => new WardrobeError(/schema cache|does not exist/i.test(m) ? 'Ejecuta la migración 0022 en Supabase.' : m, 500)

/** Presencia comercial en España (Channel3): cuántos productos, marcas y tiendas. Es un dato de mercado, no una tendencia. */
async function presence(query: string, meter: Channel3Meter, filters: Record<string, unknown> = {}) {
  const cfg = channel3Config()
  const raw = await c3request(cfg, 'search', 'v1/search', { method: 'POST', body: { query, limit: 30, filters: { gender: 'male', age: ['adult'], ...filters }, config: { country: cfg.country, language: cfg.language, currency: cfg.currency } } }, { meter }) as { products?: Row[] }
  const ps = raw.products ?? []
  const brands = [...new Set(ps.flatMap((p) => (p.brands ?? []).map((b: Row) => b.name)).filter(Boolean))]
  const shops = [...new Set(ps.flatMap((p) => (p.offers ?? []).map((o: Row) => o.domain)).filter(Boolean))]
  return { query, products: ps.length, brands: brands.length, websites: shops.length, sample_brands: brands.slice(0, 6), checked_at: new Date().toISOString(), note: 'Presencia comercial en España según Channel3 (hasta 30 resultados): no prueba que sea tendencia.' }
}
const FIT_C3: Record<string, string[]> = { Wide: ['Wide'], Recto: ['Straight leg'], Slim: ['Slim'], Amplia: ['Relaxed'], Tapered: ['Tapered leg'] }
const CUT_ES: Record<string, string> = { Wide: 'pantalón amplio', Recto: 'pantalón recto', Slim: 'pantalón slim', Amplia: 'pantalón holgado', Tapered: 'pantalón tapered' }

export async function trendResearch(sb: Sb, uid: string, opts: { force?: boolean; now?: Date; fetch?: typeof fetch } = {}) {
  const now = opts.now ?? new Date()
  const season = seasonOf(now)
  const bundle = await loadBundle(sb, uid)
  const identity = styleProfileOf(bundle).identity.influences.slice(0, 2).map((i) => styleName(i.style))
  const brave = braveConfig(); const c3 = channel3Config()
  const ai = !configError()
  const mode = brave.key && c3.key ? 'editorial_comercial' : brave.key ? 'editorial' : c3.key ? 'comercial' : 'sin_fuentes'
  const identity_hash = createHash('sha256').update(JSON.stringify({ identity, season: season.id, mode, v: TRENDS_VERSION, storage: brave.storageRights })).digest('hex').slice(0, 16)
  if (!opts.force) {
    const since = new Date(now.getTime() - TREND_TTL_DAYS * 864e5).toISOString()
    const { data: last, error } = await sb.from('trend_researches').select('*').eq('identity_hash', identity_hash).gte('created_at', since).neq('status', 'error').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw dbErr(error.message)
    if (last) return { research: last, signals: await signalsOf(sb, last.id), cached: true }
  }

  const limitations: string[] = []
  const stats: Row = {}
  const bMeter = new BraveMeter(); const cMeter = new Channel3Meter(); const usage = newUsage()
  let evidence: Evidence[] = []; let signals: TrendSignal[] = []; let rejected: { name: string; reason: string }[] = []
  const plan = researchPlan(now, identity)
  let status: 'ok' | 'parcial' | 'error' = 'ok'; let error: string | null = null

  // 1-2) Recuperación y filtrado (Brave; los resultados solo existen en memoria)
  if (brave.key) {
    const hits: BraveHit[] = []
    const failures: string[] = []
    for (let i = 0; i < plan.length; i += 3) {
      await Promise.all(plan.slice(i, i + 3).map(async (q) => {
        try { hits.push(...await braveSearch(brave, q.kind, q.q, { count: 15, freshness: q.freshness, lang: q.lang, country: q.lang === 'es' ? 'ES' : 'ALL' }, { meter: bMeter, fetch: opts.fetch })) }
        catch (e) { failures.push(`${q.q}: ${(e as Error).message}`) }
      }))
    }
    if (failures.length) { status = 'parcial'; limitations.push(`${failures.length} de ${plan.length} consultas a Brave fallaron (${failures[0]}).`) }
    const f = filterEvidence(hits, now)
    evidence = f.evidence
    stats.retrieved = hits.length; stats.evidence = evidence.length; stats.hosts = new Set(evidence.map((e) => e.host)).size
    stats.discarded = f.discarded.reduce((m, d) => ((m[d.reason] = (m[d.reason] ?? 0) + 1), m), {} as Record<string, number>)
    // 3-4) Síntesis por IA y validación por código
    if (evidence.length < 3) { status = 'parcial'; limitations.push('Muy pocas fuentes editoriales válidas: no se puede identificar ninguna tendencia con garantías.') }
    else if (!ai) { status = 'parcial'; limitations.push(`Sin proveedor de IA configurado (${configError()}): las fuentes se han recuperado, pero no se han sintetizado.`) }
    else {
      try {
        const synth = await generateStructured({ kind: 'chat', model: MODEL_CHAT(), schema: SynthSchema, system: TREND_ANALYST, user: synthPrompt(evidence, season, now.toISOString().slice(0, 10)), usage })
        const v = validateSignals(synth, evidence, now, season)
        signals = v.signals; rejected = v.rejected
      } catch (e) { status = 'parcial'; limitations.push(`La síntesis con IA falló: ${(e as Error).message.slice(0, 200)}`) }
    }
  } else limitations.push('Sin Brave Search (BRAVE_SEARCH_API_KEY): no hay investigación editorial, solo presencia comercial. Nada se presenta como tendencia.')

  // Presencia comercial (Channel3), separada y con tope de créditos
  const hypotheses: Row[] = []
  if (c3.key) {
    const budget = () => TREND_C3_MAX - cMeter.summary().credits
    for (const s of signals.filter((x) => x.kind === 'tendencia_editorial' && ['silhouette', 'color', 'material', 'wash', 'footwear', 'outerwear', 'garment', 'pattern'].includes(x.dimension)).slice(0, 4)) {
      if (budget() <= 0) break
      try { (s as Row).presence = await presence(`${s.name} hombre`, cMeter) } catch (e) { limitations.push(`Channel3: ${(e as Error).message}`); break }
    }
    // Hipótesis del armario (2.0B): ¿existe en el mercado español lo que el diagnóstico sugiere? (no es una tendencia)
    const { data: wa } = await sb.from('wardrobe_analyses').select('result').order('created_at', { ascending: false }).limit(1).maybeSingle()
    for (const f of ((wa?.result?.findings ?? []) as Row[]).filter((x) => x.kind === 'silhouette_gap' && String(x.key).startsWith('silhouette:leg:')).slice(0, 2)) {
      if (budget() <= 0) break
      const cut = String(f.key).split(':')[2]
      try { hypotheses.push({ key: f.key, title: f.title, kind: 'hipotesis_estilistica', presence: await presence(`${CUT_ES[cut] ?? 'pantalón'} hombre`, cMeter, FIT_C3[cut] ? { category_ids: ['pants'], attributes: { fit: FIT_C3[cut] } } : {}) }) }
      catch (e) { limitations.push(`Channel3: ${(e as Error).message}`); break }
    }
  } else limitations.push('Sin Channel3: no se mide la presencia comercial en España.')
  if (!brave.storageRights && brave.key) limitations.push('Por las condiciones de Brave (sin derechos de almacenamiento) no se guardan las fuentes: se consultan de nuevo, en vivo, cuando las pides.')
  if (!signals.length && brave.key && status === 'ok') limitations.push('Las evidencias no permiten identificar tendencias con las reglas de validación.')

  stats.signals = signals.length; stats.rejected = rejected; stats.brave = bMeter.summary(); stats.channel3 = cMeter.summary(); stats.ai = usage
  const { data: research, error: e1 } = await sb.from('trend_researches').insert({
    user_id: uid, version: TRENDS_VERSION, season: season.id, mode, status, queries: plan.map((q) => ({ kind: q.kind, q: q.q, dimension: q.dimension })), stats, limitations, hypotheses, identity_hash, error,
    evidence: brave.storageRights ? evidence.map((e) => ({ id: e.id, url: e.url, title: e.title, outlet: e.outlet, published: e.published, snippet: e.text.slice(0, 300) })) : null,
  }).select('*').single()
  if (e1) throw dbErr(e1.message)
  if (signals.length) {
    const { error: e2 } = await sb.from('trend_signals').insert(signals.map((s) => ({
      user_id: uid, research_id: research.id, key: s.key, name: s.name, dimension: s.dimension, description: s.description, kind: s.kind, stage: s.stage, confidence: s.confidence,
      confidence_reasons: s.confidence_reasons, evidence_count: s.evidence_count, source_count: s.source_count, published_from: s.published_from, published_to: s.published_to, validity: s.validity,
      brands: s.brands, presence: (s as Row).presence ?? null, search_query: s.search_query, validation: s.validation,
      evidence: brave.storageRights ? s.evidence_ids.map((id) => evidence.find((e) => e.id === id)).filter(Boolean).map((e) => ({ url: e!.url, title: e!.title, outlet: e!.outlet, published: e!.published })) : null,
    })))
    if (e2) throw dbErr(e2.message)
  }
  await sb.from('ai_runs').insert({ user_id: uid, kind: 'trend_research', model: ai ? MODEL_CHAT() : 'reglas', meta: { research_id: research.id, mode, status, brave: stats.brave, channel3: stats.channel3, ai: usage, signals: signals.length } })
  return { research, signals: await signalsOf(sb, research.id), cached: false }
}
async function signalsOf(sb: Sb, researchId: string) {
  const { data } = await sb.from('trend_signals').select('*').eq('research_id', researchId)
  const order: Record<string, number> = { tendencia_editorial: 0, propuesta_editorial: 1 }, conf: Record<string, number> = { alta: 0, media: 1, baja: 2 }
  return (data ?? []).sort((a, z) => order[a.kind] - order[z.kind] || conf[a.confidence] - conf[z.confidence] || z.source_count - a.source_count)
}
export async function latestTrends(sb: Sb) {
  const { data: research } = await sb.from('trend_researches').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle()
  return research ? { research, signals: await signalsOf(sb, research.id) } : null
}

/** Fuentes de una señal, consultadas EN VIVO en Brave (no se guardan). 1 consulta. */
export async function liveSources(sb: Sb, uid: string, signalId: string) {
  const { data: s } = await sb.from('trend_signals').select('*').eq('id', signalId).maybeSingle()
  if (!s) throw new WardrobeError('Señal no encontrada', 404)
  if (s.evidence) return { signal: s, sources: s.evidence as Row[], live: false }
  const cfg = braveConfig()
  if (!cfg.key) return { signal: s, sources: [], live: false, message: 'Sin Brave Search configurado: no puedo consultar las fuentes.' }
  const meter = new BraveMeter()
  try {
    const hits = await braveSearch(cfg, 'web', s.search_query ?? s.name, { count: 10, freshness: 'py', lang: 'en', country: 'ALL' }, { meter })
    const { evidence } = filterEvidence(hits)
    return { signal: s, sources: evidence.map((e) => ({ url: e.url, title: e.title, outlet: e.outlet, published: e.published, snippet: e.text.slice(0, 240) })), live: true }
  } finally { await sb.from('ai_runs').insert({ user_id: uid, kind: 'trend_sources', model: 'reglas', meta: { signal_id: signalId, brave: meter.summary() } }) }
}
