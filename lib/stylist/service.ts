import { WardrobeError, type Sb } from '@/lib/wardrobe/service'
import { prepareEngine } from '@/lib/outfits/generate-service'
import { analyzeWardrobe, wardrobeFingerprint, WARDROBE_ANALYSIS_VERSION, type WardrobeAnalysis } from './wardrobe'

/**
 * Diagnóstico estratégico del armario (2.0B): se calcula con tus datos reales y se guarda versionado. Mientras no cambie
 * su huella (prendas, identidad, colorimetría, medidas, ajuste, estilo de vida, objetivos, Fit Assessments y registro
 * de uso) se reutiliza el último; si cambia algo, se recalcula.
 */
const dbErr = (m: string) => new WardrobeError(/schema cache|does not exist/i.test(m) ? 'Ejecuta la migración 0021 en Supabase.' : m, 500)
export async function wardrobeAnalysis(sb: Sb, uid: string, opts: { force?: boolean } = {}) {
  const [prep, { data: wears }] = await Promise.all([prepareEngine(sb, uid), sb.from('outfit_wear_events').select('worn_on, garment_ids').limit(2000)])
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
