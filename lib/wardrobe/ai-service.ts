import { configError, MODEL_VISION, providerId } from '@/lib/ai/client'
import { effectiveModel, generateStructured, newUsage } from '@/lib/ai/structured'
import { ANALYSIS_ROLES, GARMENT_ANALYST, GarmentAnalysisSchema, MAX_IMAGES, PROMPT_VERSION, SCHEMA_VERSION, applyDecisions, buildUserPrompt, inputKey, normalizeAnalysis, type Decision, type NormalizedAnalysis } from './analysis'
import { WardrobeError, updateGarment, type Sb } from './service'
import { familyOf } from './taxonomy'

/**
 * Garment AI (fase 2B): analizar y confirmar.
 * - Se analiza una vez por conjunto de fotos (hash): repetir exactamente el mismo analisis no vuelve a llamar a la IA.
 * - Corregir a mano NO dispara un nuevo analisis.
 * - Cada analisis queda versionado (modelo, prompt, esquema) con su consumo en ai_runs.
 */
export async function analyzeGarment(sb: Sb, uid: string, garmentId: string, opts: { force?: boolean } = {}) {
  const cfg = configError()
  if (cfg) throw new WardrobeError(cfg, 503)
  const { data: g } = await sb.from('garments').select('*').eq('id', garmentId).maybeSingle()
  if (!g) throw new WardrobeError('Prenda no encontrada', 404)
  const { data: imgs } = await sb.from('garment_images').select('id, role, storage_path, sha256, position').eq('garment_id', garmentId)
  const chosen = (imgs ?? []).filter((i) => ANALYSIS_ROLES.includes(i.role))
    .sort((a, z) => ANALYSIS_ROLES.indexOf(a.role) - ANALYSIS_ROLES.indexOf(z.role) || a.position - z.position).slice(0, MAX_IMAGES)
  if (!chosen.length) throw new WardrobeError('Añade al menos una foto de la prenda (frontal, posterior, detalle o etiqueta). Las fotos llevándola puesta se usan para el ajuste, no para identificarla.')

  // Pista: solo lo que el usuario ha establecido (no lo que propuso la IA)
  const src = g.field_sources ?? {}
  const hint = { category: src.category?.source === 'usuario' ? g.category : null, subcategory: src.subcategory?.source === 'usuario' ? g.subcategory : null }
  const key = inputKey(chosen.map((i) => i.sha256 ?? i.id), hint.subcategory ?? hint.category)
  if (!opts.force) {
    const { data: prev } = await sb.from('garment_analyses').select('*').eq('garment_id', garmentId).eq('input_key', key).neq('status', 'superseded').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (prev) {
      await sb.from('ai_runs').insert({ user_id: uid, kind: 'garment_analysis', model: prev.model_id, meta: { garment_id: garmentId, analysis_id: prev.id, cached: true } })
      return { analysis: prev, cached: true }
    }
  }

  const parts: { type: 'image_url'; image_url: { url: string; detail: 'high' } }[] = []
  let bytes = 0
  for (const i of chosen) {
    const { data: blob } = await sb.storage.from('wardrobe-originals').download(i.storage_path)
    if (!blob) throw new WardrobeError('No se pudo leer una de las fotos', 500)
    const buf = Buffer.from(await blob.arrayBuffer()); bytes += buf.length
    parts.push({ type: 'image_url', image_url: { url: `data:${blob.type || 'image/jpeg'};base64,${buf.toString('base64')}`, detail: 'high' } })
  }
  const roles = chosen.map((i) => i.role)
  const family = hint.subcategory ? familyOf(hint.subcategory, hint.category ?? g.category) : undefined
  const usage = newUsage()
  const ai = await generateStructured({
    kind: 'vision', model: MODEL_VISION(), schema: GarmentAnalysisSchema, system: GARMENT_ANALYST, usage,
    user: [{ type: 'text', text: buildUserPrompt({ roles, hint, family }) }, ...parts],
  })
  const normalized = normalizeAnalysis(ai, g, { hasLabelPhoto: roles.includes('label') })
  const model = `${providerId()}:${effectiveModel('vision', MODEL_VISION())}`
  // El analisis anterior sin revisar queda sustituido (no se borra: queda el historial)
  await sb.from('garment_analyses').update({ status: 'superseded' }).eq('garment_id', garmentId).eq('status', 'proposed')
  const { data: row, error } = await sb.from('garment_analyses').insert({
    user_id: uid, garment_id: garmentId, model_id: model, prompt_version: PROMPT_VERSION, schema_version: SCHEMA_VERSION,
    image_ids: chosen.map((i) => i.id), image_roles: roles, input_key: key, analysis_result: ai, normalized, overall_confidence: normalized.overall, usage,
  }).select('*').single()
  if (error) throw new WardrobeError(/schema cache|does not exist/i.test(error.message) ? 'Ejecuta la migración 0008 en Supabase.' : error.message, 500)
  await sb.from('garment_events').insert({ user_id: uid, garment_id: garmentId, kind: 'analyzed', source: 'ia', changes: { analysis_id: row.id, fields: normalized.fields.length, overall: normalized.overall } })
  await sb.from('ai_runs').insert({ user_id: uid, kind: 'garment_analysis', model, meta: { garment_id: garmentId, analysis_id: row.id, images: roles, bytes, usage, cached: false } })
  return { analysis: row, cached: false }
}

/** Aplica las decisiones del usuario sobre una propuesta. Solo lo aceptado o corregido llega a la ficha. */
export async function confirmAnalysis(sb: Sb, uid: string, garmentId: string, analysisId: string, decisions: Record<string, Decision>, opts: { activate?: boolean } = {}) {
  const { data: a } = await sb.from('garment_analyses').select('*').eq('id', analysisId).eq('garment_id', garmentId).maybeSingle()
  if (!a) throw new WardrobeError('Análisis no encontrado', 404)
  if (a.status !== 'proposed') throw new WardrobeError('Este análisis ya se revisó o fue sustituido por otro más reciente.', 409)
  const { data: g } = await sb.from('garments').select('*').eq('id', garmentId).maybeSingle()
  if (!g) throw new WardrobeError('Prenda no encontrada', 404)
  const n = a.normalized as NormalizedAnalysis
  const { patch, sources, record, status } = applyDecisions(n, decisions, analysisId, g)
  if (opts.activate) patch.wardrobe_status = 'active'
  const r = Object.keys(patch).length ? await updateGarment(sb, uid, garmentId, patch, { sources }) : { warnings: [] as string[] }
  await sb.from('garment_analyses').update({ status, decisions: record, reviewed_at: new Date().toISOString() }).eq('id', analysisId)
  const count = (k: string) => Object.values(record).filter((x) => x.action === k).length
  await sb.from('garment_events').insert({ user_id: uid, garment_id: garmentId, kind: 'analysis_reviewed', changes: { analysis_id: analysisId, status, accepted: count('accept'), corrected: count('correct'), rejected: count('reject') } })
  return { status, warnings: r.warnings, accepted: count('accept'), corrected: count('correct'), rejected: count('reject') }
}

export async function latestAnalysis(sb: Sb, garmentId: string) {
  const { data } = await sb.from('garment_analyses').select('*').eq('garment_id', garmentId).order('created_at', { ascending: false }).limit(10)
  return data ?? []
}
