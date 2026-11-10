import { WardrobeError, type Sb } from '@/lib/wardrobe/service'
import { prepareEngine } from '@/lib/outfits/generate-service'
import { buildStrategy, strategyFingerprint, STRATEGY_VERSION } from './strategy'
import { latestTrends } from './trend-service'
import { analyzeWardrobe, wardrobeFingerprint, WARDROBE_ANALYSIS_VERSION, type WardrobeAnalysis } from './wardrobe'

/**
 * Diagnóstico estratégico del armario (2.0B): se calcula con tus datos reales y se guarda versionado. Mientras no cambie
 * su huella (prendas, identidad, colorimetría, medidas, ajuste, estilo de vida, objetivos, Fit Assessments y registro
 * de uso) se reutiliza el último; si cambia algo, se recalcula.
 */
const dbErr = (m: string) => new WardrobeError(/schema cache|does not exist/i.test(m) ? 'Ejecuta las migraciones 0021 a 0023 en Supabase.' : m, 500)
export async function wardrobeAnalysis(sb: Sb, uid: string, opts: { force?: boolean; prep?: Awaited<ReturnType<typeof prepareEngine>> } = {}) {
  const [prep, { data: wears }] = await Promise.all([opts.prep ?? prepareEngine(sb, uid), sb.from('outfit_wear_events').select('worn_on, garment_ids').limit(2000)])
  const fitScores = Object.fromEntries([...prep.evals].map(([id, e]) => [id, e.fit.score]))
  const fingerprint = wardrobeFingerprint(prep.garments, prep.bundle, (wears ?? []).length, fitScores)
  if (!opts.force) {
    const { data: last, error } = await sb.from('wardrobe_analyses').select('*').eq('fingerprint', fingerprint).eq('version', WARDROBE_ANALYSIS_VERSION).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw dbErr(error.message)
    if (last) return { id: last.id as string, created_at: last.created_at as string, fingerprint, cached: true, analysis: last.result as WardrobeAnalysis }
  }
  const t0 = Date.now()
  const analysis = analyzeWardrobe({ garments: prep.garments, evals: prep.evals, bundle: prep.bundle, signals: prep.signals, wears: (wears ?? []) as never })
  const ms = Date.now() - t0
  const { data: row, error } = await sb.from('wardrobe_analyses').insert({ user_id: uid, version: WARDROBE_ANALYSIS_VERSION, fingerprint, result: analysis, ms }).select('id, created_at').single()
  if (error) throw dbErr(error.message)
  return { id: row.id as string, created_at: row.created_at as string, fingerprint, cached: false, analysis }
}

/**
 * Estrategia de estilo (2.0D): diagnóstico del armario + última investigación de tendencias + perfil → oportunidades.
 * Se reutiliza mientras no cambien el diagnóstico, la investigación, la identidad, los objetivos ni la colorimetría.
 */
export async function styleStrategy(sb: Sb, uid: string, opts: { force?: boolean } = {}) {
  const prep = await prepareEngine(sb, uid)
  const wa = await wardrobeAnalysis(sb, uid, { prep })
  const trends = await latestTrends(sb).catch(() => null)
  const fingerprint = strategyFingerprint(wa.fingerprint, trends?.research.id ?? null, prep.bundle)
  if (!opts.force) {
    const { data: last } = await sb.from('style_strategies').select('*').eq('fingerprint', fingerprint).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (last) return { strategy: last, opportunities: await opportunitiesOf(sb, last.id), wardrobe: wa, trends, cached: true }
  }
  const s = buildStrategy({ analysis: wa.analysis, signals: trends?.signals ?? [], bundle: prep.bundle, garments: prep.garments, evals: prep.evals })
  const { data: row, error } = await sb.from('style_strategies').insert({
    user_id: uid, version: STRATEGY_VERSION, fingerprint, wardrobe_analysis_id: wa.id, trend_research_id: trends?.research.id ?? null, direction: s.direction,
    experimentation: s.experimentation, no_purchase_needed: s.no_purchase_needed, rejected: s.rejected, meta: { market_level: s.market_level, opportunities: s.opportunities.length },
  }).select('*').single()
  if (error) throw dbErr(error.message)
  if (s.opportunities.length) {
    const { error: e2 } = await sb.from('style_opportunities').insert(s.opportunities.map((o, i) => {
      const { key, title, mode, purchase, priority, confidence, scores, ...detail } = o
      return { user_id: uid, strategy_id: row.id, key, rank: i + 1, title, mode, purchase, priority, confidence, scores, detail }
    }))
    if (e2) throw dbErr(e2.message)
  }
  return { strategy: row, opportunities: await opportunitiesOf(sb, row.id), wardrobe: wa, trends, cached: false }
}
async function opportunitiesOf(sb: Sb, strategyId: string) {
  const { data } = await sb.from('style_opportunities').select('*').eq('strategy_id', strategyId).order('rank')
  return (data ?? []).map((o) => ({ ...o, ...o.detail }))
}
export async function setOpportunityStatus(sb: Sb, id: string, status: string) {
  if (!['propuesta', 'me_interesa', 'descartada'].includes(status)) throw new WardrobeError('Estado no válido')
  const { data } = await sb.from('style_opportunities').update({ status }).eq('id', id).select('id')
  if (!data?.length) throw new WardrobeError('Oportunidad no encontrada', 404)
}
